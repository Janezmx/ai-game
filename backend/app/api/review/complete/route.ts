import { NextRequest, NextResponse } from "next/server";
import { createChatCompletion } from "@/lib/llm";

/**
 * 复盘文本补全接口
 * POST /api/review/complete
 *
 * 对话阶段评估只产出轻量数值 JSON（trapType/playerStatus/dimensions），
 * 复盘长文本（trapAnalysis/alternatives/whyNote/identificationTip/progressNote/assessment）
 * 由玩家进入复盘界面后，前端携带该轮对话原文按需请求本接口生成。
 *
 * body: {
 *   npcContent: string;      // 该轮 NPC 台词
 *   playerContent: string;   // 玩家回应
 *   trapType?: string;       // 该轮已识别手法（回显上下文）
 *   playerStatus?: string;   // 该轮状态判定
 *   dimensions?: DimensionScores;
 *   prevDimensions?: DimensionScores | null; // 上一轮评分（progressNote 对比用）
 *   levelTitle?: string;     // 关卡主题，科普引用
 * }
 */

interface CompleteRequestBody {
  npcContent?: string;
  playerContent?: string;
  trapType?: string;
  playerStatus?: string;
  dimensions?: Record<string, number>;
  prevDimensions?: Record<string, number> | null;
  roundNumber?: number; // 1-based 轮序号，用于判断是否首轮
  levelTitle?: string;
  /** 本轮实时评估是否走了兜底（dimensions 为补的假值）：是则禁止生成任何分数对比文案 */
  degraded?: boolean;
}

const REVIEW_COMPLETE_INSTRUCTION = (ctx: {
  levelTitle: string;
  npcContent: string;
  playerContent: string;
  trapType: string;
  playerStatus: string;
  dimensions: string;
  prevDimensions: string;
}) => `你是一名心理防御训练游戏的复盘分析师。玩家刚刚在本关「${ctx.levelTitle}」的对话中完成了一轮攻防，
你需要为该轮生成结构化复盘点评文本，用于玩家进入复盘界面后逐轮回顾。

【本回合对话实录】
NPC 台词（操控方）：${ctx.npcContent}
玩家回应：${ctx.playerContent}

【该轮实时结算结果】
识别的操控手法：${ctx.trapType}
玩家状态判定：${ctx.playerStatus}
四维评分：${ctx.dimensions}
上一轮评分：${ctx.prevDimensions}

请只输出一个合法 JSON 对象（禁止任何 JSON 之外的文字/代码块/首尾解释，首字符 {、尾字符 }）：
{
  "trapAnalysis": "一句话点破本轮对话中的操控陷阱",
  "assessment": "心理分析师整体点评：评价玩家本轮回应的识别与防御表现（1-2句）",
  "whyNote": "用1-2句话科普该操控为何有效：引用具体心理学概念（如认知失调、习得性无助、投射认同、煤气灯效应阶段），解释它为什么能让人动摇",
  "identificationTip": "给出具体可操作的观察线索：玩家从哪句话/哪个词能识别出这是操控",
  "progressNote": "进步对比反馈（1句）。若上方“上一轮评分”是“无（本回合为第一轮）”，必须原样输出“第一轮，暂无对比”，整句不得出现“相比”“上一轮”“提升”“退步”等比较措辞；否则基于上一轮评分写出具体维度变化（须含数字）",
  "alternatives": [
    {"text": "玩家可直接说出口的回应句", "rationale": "为何有效：如何打破操控逻辑"},
    {"text": "玩家可直接说出口的回应句", "rationale": "为何有效：如何打破操控逻辑"},
    {"text": "玩家可直接说出口的回应句", "rationale": "为何有效：如何打破操控逻辑"}
  ]
}

说明：
- 【强制全中文】所有文本字段（progressNote、assessment、trapAnalysis、whyNote、identificationTip，以及 alternatives 的 text/rationale）一律使用简体中文，严禁输出任何英文单词或 JSON 字段名（如 boundaryAwareness、assertiveResponse）；提及四维评分一律用中文名：边界意识、情绪稳定、认知清晰、坚定回应。
- alternatives.text 必须是玩家可直接说出口的话，禁止"你可以…/试着…"等建议口吻。
- whyNote 要结合上方"识别的操控手法"具体展开，引用本关相关心理学概念。
- progressNote 分两种情况：上一轮评分为“无（本回合为第一轮）”时只能输出“第一轮，暂无对比”，严禁编造对比内容；否则必须写出带数字的具体维度变化，且不得出现“第一轮”字样。`;

/** 四维评分对象 -> 中文描述串（以中文名注入，避免模型在面向玩家的文本里引用英文字段名） */
const DIM_CN_NAMES: Record<string, string> = {
  boundaryAwareness: "边界意识",
  emotionalStability: "情绪稳定",
  cognitiveClarity: "认知清晰",
  assertiveResponse: "坚定回应",
};
function dimsToChineseText(dims?: Record<string, number> | null): string {
  if (!dims) return "无";
  const parts = Object.entries(dims)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => `${DIM_CN_NAMES[k] ?? k} ${Math.round(v)}/100`);
  return parts.length ? parts.join("、") : "无";
}

/** 鲁棒提取最外层 JSON 对象并解析 */
function parseJsonRobust(raw: string): any | null {
  if (!raw) return null;
  const candidates: string[] = [];
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) {
    candidates.push(raw.replace(/```json\s*|```/g, "").slice(first, last + 1));
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {}
  }
  // 截断兜底：剥离末尾不完整字段
  const fixed = candidates[0]?.replace(/:\s*"[^"]*$/m, ': ""').replace(/,\s*[}\]]\s*$/, "");
  if (fixed) {
    try {
      return JSON.parse(fixed);
    } catch {}
  }
  return null;
}

export async function GET() {
  return NextResponse.json({ ok: true, msg: "review/complete module loaded" });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CompleteRequestBody;
    const npcContent = String(body.npcContent || "").trim();
    const playerContent = String(body.playerContent || "").trim();

    if (!npcContent || !playerContent) {
      return NextResponse.json(
        { error: "缺少该轮对话原文（npcContent / playerContent）" },
        { status: 400 }
      );
    }

    const roundNumber =
      typeof body.roundNumber === "number" ? body.roundNumber : 0;
    const isFirstRound =
      roundNumber > 0 ? roundNumber === 1 : !body.prevDimensions;
    const degraded = body.degraded === true;
    const prevText = degraded
      ? "未获取到有效数据（本轮评分不可用，请勿输出任何数字对比）"
      : body.prevDimensions && Object.keys(body.prevDimensions).length
        ? dimsToChineseText(body.prevDimensions)
        : isFirstRound
          ? "无（本回合为第一轮）"
          : "缺失（非首轮但缺少上一轮评分，请仅依据当前轮表现点评）";

    const systemPrompt = REVIEW_COMPLETE_INSTRUCTION({
      levelTitle: body.levelTitle || "心理操控防御",
      npcContent,
      playerContent,
      trapType: body.trapType || "未识别",
      playerStatus: body.playerStatus || "unknown",
      dimensions: degraded
        ? "未获取到有效数据（本轮评分是系统兜底占位值，不可信、不可引用）"
        : body.dimensions
          ? dimsToChineseText(body.dimensions)
          : "无",
      prevDimensions: prevText,
    }) + (degraded
      ? `\n\n【重要】本轮实时评估未获取到有效数据（评分是兜底占位值，不可信）。progressNote 必须原样输出「本轮评估未获取到有效数据」，严禁出现任何分数或维度对比；其余字段仍依据对话原文正常分析。`
      : "");

    const raw = await createChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: "请生成该轮复盘点评 JSON。" },
    ]);

    let parsed = parseJsonRobust(raw);
    if (!parsed) {
      // 解析失败自动重试一次
      console.warn("[review/complete] 解析失败，自动重试。原输出:", raw.slice(0, 120));
      const raw2 = await createChatCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: "请重新生成该轮复盘点评 JSON，务必只输出合法 JSON。" },
      ]);
      parsed = parseJsonRobust(raw2);
    }

    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json(
        { error: "复盘文本生成失败", details: "模型输出无法解析" },
        { status: 502 }
      );
    }

    // 规范化字段（只保留完整复盘所需的文本，数值字段由前端保留不回传）
    const rawProgressNote =
      typeof parsed.progressNote === "string" ? parsed.progressNote.trim() : "";
    // progressNote 硬兜底：首轮没有可对比的上一轮数据，但模型常无视提示词自行编造
    // “相比上一轮…提升”之类的文案，因此首轮一律不采纳模型文本，强制为固定占位；
    // 非首轮若自称“第一轮”（前后矛盾）或为空，则丢弃不展示。
    let progressNote: string;
    if (degraded) {
      // 本轮评分本身就是兜底假数据：模型若照提示词写出"某维度下降X分"，是拿假分编的，一律不采纳
      progressNote = "本轮评估未获取到有效数据";
    } else if (isFirstRound) {
      progressNote = "第一轮，暂无对比";
    } else if (!rawProgressNote || rawProgressNote.includes("第一轮")) {
      progressNote = "";
    } else {
      progressNote = rawProgressNote;
    }
    const assessment = {
      trapAnalysis: parsed.trapAnalysis ?? "",
      assessment: parsed.assessment ?? "",
      whyNote: parsed.whyNote ?? "",
      identificationTip: parsed.identificationTip ?? "",
      progressNote,
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
    };

    return NextResponse.json({ ok: true, assessment });
  } catch (error) {
    console.error("[review/complete] Error:", error);
    return NextResponse.json(
      { error: "复盘文本生成失败", details: String(error) },
      { status: 500 }
    );
  }
}
