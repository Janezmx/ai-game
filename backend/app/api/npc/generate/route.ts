import { NextRequest } from "next/server";
import { createChatCompletion } from "@/lib/llm";

/**
 * 5个关卡的 NPC 生成提示词（数据驱动 + 教育框架）
 * 每个关卡在生成 NPC 的同时，一并产出「心理学知识点卡」与真实案例小故事，
 * 服务于"让玩家学会识别与抵御操控"的教育目标。
 */
interface LevelSeed {
  id: number;
  title: string;
  subtitle: string;
  npcRole: string;
  scenarios: string;
  tactics: string;
  style: string;
  tacticExample: string;
  damage: number;
  counter: string[];
  kpId: string;
}

const LEVEL_SEEDS: LevelSeed[] = [
  {
    id: 1,
    title: "煤气灯效应",
    subtitle: "否定感受 · 认知侵蚀",
    npcRole: "亲密关系中的操控者（如恋人、暧昧对象、密友）",
    scenarios: "迟到/失约、忘记重要承诺、物品丢失、否认说过的话",
    tactics: "记忆否认、感受否定、角色反转、事实扭曲、淡化伤害",
    style:
      "表面温柔关心，话语中暗含否定；擅长让玩家怀疑自己的记忆和感知；常用\"你太敏感了\"、\"我从来没有说过那种话\"、\"你记错了\"；反转受害者角色让玩家内疚。",
    tacticExample: "记忆否认",
    damage: 15,
    counter: ["shield", "mirror"],
    kpId: "kp-gaslight",
  },
  {
    id: 2,
    title: "职场PUA",
    subtitle: "能力贬低 · 价值否定",
    npcRole: "职场中的打压者（如直属上司、资深同事、客户、HR）",
    scenarios: "方案被当众否定、晋升落选、公开批评、功劳被抢、绩效评估不公",
    tactics: "比较打压、双向束缚、预言失败、过度批评、孤立排挤",
    style:
      "表面为了你好，实际在贬低能力；常用\"你还需要更多历练\"、\"其他人比你做得好\"、\"你这样以后怎么办\"；制造不够好的焦虑感，用职位权威压制质疑。",
    tacticExample: "比较打压",
    damage: 20,
    counter: ["shield", "mirror", "spear"],
    kpId: "kp-pua",
  },
  {
    id: 3,
    title: "亲情绑架",
    subtitle: "内疚诱导 · 牺牲叙事",
    npcRole: "家庭中的情感绑架者（如父母、祖辈、兄弟姐妹、亲戚）",
    scenarios: "假期安排冲突、职业选择干涉、婚恋决定施压、金钱索取、孝道绑架",
    tactics: "三角测量、代际绑架、自我惩罚暗示、牺牲叙事、比较羞辱",
    style:
      "强调\"我为你好\"、\"我为你牺牲了那么多\"；常用\"你不听话就是不孝\"、\"别人家的孩子都…\"、\"我对你很失望\"；用健康与情绪作为勒索筹码制造愧疚。",
    tacticExample: "牺牲叙事",
    damage: 25,
    counter: ["mirror", "spear"],
    kpId: "kp-family",
  },
  {
    id: 4,
    title: "匿名网络攻击",
    subtitle: "群体极化 · 去人格化",
    npcRole: "网络暴力的施暴者（如匿名账号群、水军、冒充熟人、键盘侠）",
    scenarios: "评论区争议、照片被恶意传播、谣言四起、被网暴围攻、社交账号被举报",
    tactics: "人肉威胁、伪造证据、音量压制、恶意标签、群体围攻",
    style:
      "以匿名身份躲在屏幕后攻击；常用\"大家快来看\"、\"果然是这样的人\"、\"实锤了\"；利用群体压力制造孤立感；伪造截图与聊天记录作\"证据\"，恶意中又装作理性。",
    tacticExample: "群体围攻",
    damage: 30,
    counter: ["shield", "mirror"],
    kpId: "kp-network",
  },
  {
    id: 5,
    title: "隐性歧视",
    subtitle: "微侵犯 · 预设质疑",
    npcRole: "系统性的偏见者（如面试官、教授、同事、行业前辈、权威人士）",
    scenarios: "求职被质疑能力、晋升被区别对待、项目分配不公、能力被预设低估、被要求证明自己",
    tactics: "关怀式质疑、双重标准、标签化防御、预设局限、反向歧视指控、刻板印象强化",
    style:
      "表面礼貌专业，话语暗含预设与偏见；常用\"你真的适合这个岗位吗\"、\"我很好奇你是如何…\"、\"我不是歧视，但是…\"；用\"善意\"包装的歧视最难反驳，要求你不断证明自己。",
    tacticExample: "关怀式质疑",
    damage: 35,
    counter: ["shield", "mirror", "spear"],
    kpId: "kp-bias",
  },
];

/**
 * 从模型输出中鲁棒地提取最外层 JSON 对象字符串。
 * 处理：markdown 代码块包裹、前后多余文本/解释、首尾空白。
 */
function extractJsonObject(raw: string): string {
  let text = raw.replace(/```json\s*|\s*```/g, "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    text = text.slice(first, last + 1);
  }
  return text.trim();
}

function buildLevelPrompt(seed: LevelSeed, scenario?: string): string {
  const scenarioLine = scenario
    ? `本关固定场景（开场白与全部话术必须严格基于此场景展开，不得切换到其他无关场景）：${scenario}`
    : `场景可能涉及：${seed.scenarios}`;
  return `你是一个名为"清醒边界"的寓教心理防御游戏中的操控型NPC生成器。
【教育者角色】你生成的 NPC 既要真实体现操控手法，又要服务于"让玩家学会识别与抵御操控"的教育目标——你的任务是制造可被识别的操控情境，而非真正伤害玩家。

当前是第${seed.id}关「${seed.title}」—— ${seed.subtitle}。
NPC角色：${seed.npcRole}
${scenarioLine}
操控手法：${seed.tactics}

NPC的说话风格：
${seed.style}

【教育要求】请为本关生成一张"心理学知识点卡"，帮助玩家认识这种操控手法：
- definition：一句话定义，说明这是什么操控
- signals：3-4 条识别信号（玩家可以从哪些话/行为中认出它）
- healthyResponse：2-3 条健康应对话术示例（坚定、不自我怀疑的表达）
- caseStory：一个贴近生活的真实案例小故事（80-120 字，第一人称或旁观视角均可，语气克制、有代入感）

请严格按照以下 JSON 格式返回（不要带有 markdown 代码块标记）：
{
  "npc": {
    "name": "NPC名称",
    "personality": "描述NPC的外在魅力与内在操控性",
    "background": "与玩家的关系背景"
  },
  "openingLine": "开场白：严格基于上方「本关固定场景」展开的一句符合本关操控手法的话，让玩家有练习识别的机会（不要偏离该场景）",
  "skill": {
    "name": "技能名称",
    "description": "技能描述（与该关卡的操控手法相关）",
    "damage": ${seed.damage}
  },
  "counterArtifactTypes": ${JSON.stringify(seed.counter)},
  "tactic": "${seed.tacticExample}",
  "knowledgePoint": {
    "id": "${seed.kpId}",
    "tactic": "${seed.title}",
    "definition": "一句话定义",
    "signals": ["识别信号1", "识别信号2", "识别信号3"],
    "healthyResponse": ["健康应对话术1", "健康应对话术2"],
    "caseStory": "真实案例小故事"
  }
}`;
}

/**
 * 测试用 GET - 验证模块加载
 */
export async function GET() {
  return new Response(JSON.stringify({ ok: true, msg: "NPC generate module loaded" }), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * NPC 生成 API - SSE 流式返回 NPC 信息
 * POST /api/npc/generate
 */
export async function POST(request: NextRequest) {
  try {
    const { playerContext, difficulty, level = 1, scenario } = await request.json();

    const levelId = Math.min(5, Math.max(1, level));
    const systemPrompt = buildLevelPrompt(LEVEL_SEEDS[levelId - 1] || LEVEL_SEEDS[0], scenario);

    const npcData = await createChatCompletion([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `玩家当前状态：${playerContext}\n难度等级：${difficulty}\n关卡：第${levelId}关`,
      },
    ]);

    // 解析 JSON 响应（鲁棒处理：剥离 markdown、截取最外层 {}）
    const cleanJson = extractJsonObject(npcData);
    const parsed = JSON.parse(cleanJson);

    // 通过 SSE 流式返回 NPC 数据
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // 发送 NPC 名称
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "npc_name", data: parsed.npc.name })}\n\n`
          )
        );

        // 构建详细描述
        const personality = parsed.npc.personality || "";
        const background = parsed.npc.background || "";
        const npcDesc = `${personality}。${background}`;

        // 流式发送描述文本（模拟逐字输出）
        for (let i = 0; i < npcDesc.length; i += 5) {
          const chunk = npcDesc.slice(i, i + 5);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "dialogue_chunk", data: chunk })}\n\n`
            )
          );
          await new Promise((r) => setTimeout(r, 30));
        }

        // 发送本关「心理学知识点卡」（含案例），供准备页/复盘页沉淀
        if (parsed.knowledgePoint) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "knowledge_point",
                data: parsed.knowledgePoint,
              })}\n\n`
            )
          );
        }

        // 发送 NPC 攻击信息
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "npc_attack",
              data: {
                skill: parsed.skill,
                counterArtifactTypes: parsed.counterArtifactTypes,
                openingLine: parsed.openingLine,
                tactic: parsed.tactic,
              },
            })}\n\n`
          )
        );

        // 发送完成信号
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done", data: true })}\n\n`)
        );
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
  } catch (error) {
    console.error("NPC Generation Error:", error);
    return new Response(
      JSON.stringify({ error: "NPC 生成失败", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}