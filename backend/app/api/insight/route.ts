import { NextRequest } from "next/server";
import { createChatCompletion } from "../../../lib/llm";

// 明辨铃：基于当前对话上下文生成建议回复
// 目标校准：后端结算时 NPC 操控力是否下降取决于评估模型给出的 assertiveResponse（坚定回应分）与
// playerStatus=effective。因此建议必须是真的能"拆穿操控 + 守住边界"的话术，而不是泛泛的安慰或对抗。
const INSIGHT_PROMPT = `你是一个心理防御游戏中的「明辨铃」辅助导师。玩家的目标是识破并抵御 NPC 的心理操控（如煤气灯效应、情感绑架、贬低边界、模糊逻辑、身份否定、转移责任），守住自己的边界，让 NPC 的操控力下降。

任务：先判断 NPC 最新一句台词正在使用哪种操控手法，再为玩家生成 3 条风格不同、且确实能削弱该操控的回复话术，供玩家直接点选发出。

【每条建议必须做到】
1. 能有效反击本轮操控：或直接点破对方话里的逻辑漏洞/偷换概念，或指出对方强加在自己身上的预设，或冷静重申事实与自己的真实感受，或干脆不接对方抛来的"自证/内疚"包袱；
2. 只输出玩家可原样发送的第一人称口语原话，10~40 字为宜；严禁"你可以说/建议/试着/回应说"等引导词，严禁动作或表情描写，严禁第二人称替玩家说话；
3. 语气坚定而克制：不道歉讨好，不歇斯底里攻击，不说教长篇讲道理，不陷入无休止自证。这样的回应才最有效。

【三条必须策略错开】，例如：A. 直接戳破歪曲、重申事实（如"事实不是你说的那样…"）；B. 温和而明确地划出边界、把话题拉回正事；C. 反问其逻辑漏洞或拒绝接受莫须有的指责。

rationale 用一句话说明：这条针对的是什么操控手法、为何能降低 NPC 的操控力。

只输出一行合法 JSON，不要任何额外文字：
{"alternatives":[{"text":"可直接发送的原话","rationale":"为什么这条有效"}]}`;

function sseEncode(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** 从可能不完整的文本中提取合法 JSON 对象（鲁棒：剥 markdown、截最外层 {}、修复常见问题） */
function extractJson(raw: string): any {
  if (!raw) return null;
  let text = raw.replace(/```json\s*|\s*```/g, "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    text = text.slice(first, last + 1);
  }
  const attempts: Array<() => any> = [
    () => JSON.parse(text),
    () => JSON.parse(text.replace(/\\(?!["\\/bfnrtu])/g, "")),
    // 全角冒号修复
    () => JSON.parse(text.replace(/("([^"\\\uFF1A]+))\uFF1A(?=")/g, '$1":')),
    // 值前多余引号修复
    () => JSON.parse(text.replace(/:\s*""(?=[^\s",}\]])/g, ':"')),
  ];
  for (const fn of attempts) {
    try {
      const r = fn();
      if (r && typeof r === "object") return r;
    } catch {}
  }
  return null;
}

/** 建议文本清洗：引号提取、引导词剥离、第一人称转换、质检 */
function cleanAlternativeText(input: string): string {
  const rawText = (input || "").replace(/[\uFFFD\uFFFE\uFFFF]/g, "").trim();
  if (!rawText) return "";
  // 0. 宽松基准：引号内内容优先，否则取冒号/逗号后的建议片段。
  //    严格清洗把文本剔空时回退到这里，避免模型输出风格波动把整条建议误杀成空。
  let loose = "";
  const qm = rawText.match(/["\u2018\u201C]([^"'\u2018\u201C\u2019\u201D']+)["\u2019\u201D']/);
  if (qm && qm[1].length > 2) loose = qm[1].trim();
  else {
    const afterPunct = rawText.split(/[：:，,]\s*/).pop();
    if (afterPunct && afterPunct.length >= rawText.length * 0.3) loose = afterPunct.trim();
  }
  let text = loose || rawText;
  // 1. 剥离引导词
  text = text.replace(/^(可以|建议|试着|尝试|不妨|比如|例如|可以说|坚定[^，：:]{0,20}[地，]|冷静[地，])/g, "").trim();
  text = text.replace(/^(陈述|表达|说明|告诉|指出|回应|回复|说|喊)(自己的|你的|对方的|，|。|\s)*/, "").trim();
  // 2. 第一人称转换
  if (text && !text.includes("我") && !text.includes("我们")) {
    const advicePats = /^(坚持|保持|学会|记住|需要|应该|要努力|要勇敢|不要|别|永远|一定|必须|坚定|明确|勇敢|努力|试着|尝试)/;
    if (advicePats.test(text)) {
      text = text.replace(/^(不要|别)\s*/, "我不会").replace(/^(.*)/, (m) => (advicePats.test(m) ? "我" + m : m));
    }
  }
  // 3. 质检：仍是"动作说明"或太短无主语的丢弃
  const instructionVerbs = /^(\S{0,2})(陈述|表达|说明|告诉|指出)/;
  if (text && !text.includes("我") && instructionVerbs.test(text)) text = "";
  if (text && !/[我你他她它]/.test(text) && text.length < 10) text = "";
  text = text.trim();
  // 4. 回退：清洗后被剔空/太短 → 使用宽松提取片段，确保至少保留一句可发送的原话
  if (text.length < 3 && loose.length >= 3) text = loose;
  return text;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = body.messages || [];

    // 过滤掉空 content / 非法 role 的消息
    const validMessages = messages
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant" || m.role === "system") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0
      )
      .map((m) => ({ role: m.role, content: m.content.trim() }));

    // 将最近对话上下文拼成纯文本，作为单一 user 消息，
    // 彻底规避智谱/DeepSeek 对 messages 数组顺序/role 交替的严格校验(1214)
    const recent = validMessages.slice(-8);
    const contextText = recent
      .map((m) => {
        const who = m.role === "assistant" ? "NPC" : m.role === "user" ? "玩家" : "系统";
        return `${who}：${m.content}`;
      })
      .join("\n");

    const msgs: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: INSIGHT_PROMPT },
      { role: "user", content: `当前对话上下文：\n${contextText}\n\n请基于最后一轮 NPC 的话术生成替代回复。` },
    ];

    // 封装"调用 + 解析 + 清洗"为可重试函数
    const ask = async (extraNote?: string): Promise<Array<{ text: string; rationale: string }>> => {
      try {
        // 显式标注类型：展开 + 追加字面量会让 role 被拓宽为 string，与 createChatCompletion 的联合类型不兼容
        const promptMsgs: { role: "system" | "user" | "assistant"; content: string }[] = extraNote
          ? [...msgs, { role: "user", content: extraNote }]
          : msgs;
        const rawText = await createChatCompletion(promptMsgs);
        // 空响应/解析失败一律归约为空列表，交给外层“自动重试一次”兜底，
        // 避免 LLM 偶发空返回直接把整条 SSE 流程打断成 HTTP 500
        if (!rawText || !rawText.trim()) {
          console.warn("[insight] LLM 返回空内容，视为无可用建议");
          return [];
        }
        const parsed = extractJson(rawText);
        if (!parsed?.alternatives || !Array.isArray(parsed.alternatives)) return [];
        return parsed.alternatives
          .map((alt: any) => {
            const text = cleanAlternativeText(alt?.text);
            const rationale = (alt?.rationale || "").replace(/[\uFFFD\uFFFE\uFFFF]/g, "").trim();
            return { text, rationale };
          })
          .filter((alt: any) => alt.text && alt.text.length >= 3);
      } catch (e: any) {
        console.error("[insight] LLM 调用失败（进入自动重试）:", e?.message || e);
        return [];
      }
    };

    // 第一轮正常生成；清洗后一条可用建议都没有（解析失败或模型风格波动都算）→ 自动重试一次
    let alternatives = await ask();
    if (!alternatives.length) {
      console.warn("[insight] 首轮未得到可用建议，自动重试一次");
      alternatives = await ask(
        "你上一次生成的建议因“带引导词 / 非第一人称”全部被过滤。请重新生成：直接给出 3 条玩家能原样发送的回应，每条必须以“我”为说话人，不要引导词、冒号、引号或祈使句，不要解释。只输出一行合法 JSON：{\"alternatives\":[{\"text\":\"可直接发送的原话\",\"rationale\":\"为什么有效\"}]}"
      );
    }
    if (!alternatives.length) {
      console.error("[insight] 重试后仍无可用建议，向客户端发送 error 事件（不再静默返回空列表）");
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        if (!alternatives.length) {
          // 明确失败：发送 error 事件而不是静默的空 alternatives，让前端给出可见提示
          controller.enqueue(
            encoder.encode(sseEncode("error", "明辨铃暂时没能生成合适的建议，请直接输入你的回应，或稍后再试。"))
          );
        } else {
          controller.enqueue(encoder.encode(sseEncode("alternatives", alternatives)));
          controller.enqueue(encoder.encode(sseEncode("done", true)));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: "明辨铃生成失败", details: String(e?.message || e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
