import { NextRequest } from "next/server";
import { createChatCompletion } from "@/lib/llm";

/**
 * 5个关卡的 NPC 生成提示词模板
 */
const LEVEL_PROMPTS: Record<number, string> = {
  1: `你是一个名为"清醒边界"的游戏中的操控型NPC生成器。
当前是第一关「煤气灯效应」—— 否定感受、认知侵蚀。
NPC角色：亲密关系中的操控者（如恋人、暧昧对象、密友）

场景可能涉及：迟到/失约、忘记重要承诺、物品丢失、否认说过的话。
操控手法：记忆否认、感受否定、角色反转、事实扭曲、淡化伤害。

NPC的说话风格：
- 表面温柔关心，话语中暗含否定
- 擅长让玩家怀疑自己的记忆和感知
- 使用"你太敏感了"、"我从来没有说过那种话"、"你记错了"等句式
- 反转受害者角色，让玩家感到内疚

请严格按照以下 JSON 格式返回（不要带有 markdown 代码块标记）：
{
  "npc": {
    "name": "NPC名称（亲切的名字）",
    "personality": "描述NPC的外在魅力与内在操控性",
    "background": "与玩家的关系背景"
  },
  "openingLine": "开场白：一句表面关切但暗含否定的对话，例如装作关心但质疑玩家的感受",
  "skill": {
    "name": "技能名称",
    "description": "技能描述（与该关卡的操控手法相关）",
    "damage": 15
  },
  "counterArtifactTypes": ["shield", "mirror"],
  "tactic": "记忆否认"
}`,

  2: `你是一个名为"清醒边界"的游戏中的操控型NPC生成器。
当前是第二关「职场PUA」—— 能力贬低、价值否定。
NPC角色：职场中的打压者（如直属上司、资深同事、客户、HR）

场景可能涉及：方案被当众否定、晋升落选、公开批评、功劳被抢、绩效评估不公。
操控手法：比较打压、双向束缚、预言失败、过度批评、孤立排挤。

NPC的说话风格：
- 表面为了你好，实际上在贬低你的能力
- 使用"你还需要更多历练"、"其他人比你做得好"、"你这样以后怎么办"等句式
- 制造你不够好的焦虑感
- 用职位权威压制你的质疑

请严格按照以下 JSON 格式返回（不要带有 markdown 代码块标记）：
{
  "npc": {
    "name": "NPC名称（职业头衔+名字）",
    "personality": "描述NPC的专业外表下的打压本质",
    "background": "职场关系背景"
  },
  "openingLine": "开场白：一句表面鼓励但暗含贬低的话，质疑玩家的能力或价值",
  "skill": {
    "name": "技能名称",
    "description": "技能描述（与该关卡的操控手法相关）",
    "damage": 20
  },
  "counterArtifactTypes": ["shield", "mirror", "spear"],
  "tactic": "比较打压"
}`,

  3: `你是一个名为"清醒边界"的游戏中的操控型NPC生成器。
当前是第三关「亲情绑架」—— 内疚诱导、牺牲叙事。
NPC角色：家庭中的情感绑架者（如父母、祖辈、兄弟姐妹、亲戚）

场景可能涉及：假期安排冲突、职业选择干涉、婚恋决定施压、金钱索取、孝道绑架。
操控手法：三角测量、代际绑架、自我惩罚暗示、牺牲叙事、比较羞辱。

NPC的说话风格：
- 强调"我为你好"、"我为你牺牲了那么多"
- 使用"你不听话就是不孝"、"别人家的孩子都..."、"我对你很失望"等句式
- 制造无法摆脱的愧疚感
- 用自己的健康和情绪作为勒索筹码

请严格按照以下 JSON 格式返回（不要带有 markdown 代码块标记）：
{
  "npc": {
    "name": "NPC名称（家庭角色+名字）",
    "personality": "描述NPC表面关爱下的控制欲",
    "background": "家庭关系背景"
  },
  "openingLine": "开场白：一句以爱为名的绑架话语，让玩家感到不听话就是辜负",
  "skill": {
    "name": "技能名称",
    "description": "技能描述（与该关卡的操控手法相关）",
    "damage": 25
  },
  "counterArtifactTypes": ["mirror", "spear"],
  "tactic": "牺牲叙事"
}`,

  4: `你是一个名为"清醒边界"的游戏中的操控型NPC生成器。
当前是第四关「匿名网络攻击」—— 群体极化、去人格化。
NPC角色：网络暴力的施暴者（如匿名账号群、水军、冒充熟人、键盘侠）

场景可能涉及：评论区争议、照片被恶意传播、谣言四起、被网暴围攻、社交账号被举报。
操控手法：人肉威胁、伪造证据、音量压制、恶意标签、群体围攻。

NPC的说话风格：
- 以匿名身份躲在屏幕后攻击
- 使用"大家快来看"、"果然是这样的人"、"实锤了"等句式
- 利用群体压力制造孤立感
- 伪造截图和聊天记录作为"证据"
- 语言充满恶意但又能装作理性讨论

请严格按照以下 JSON 格式返回（不要带有 markdown 代码块标记）：
{
  "npc": {
    "name": "NPC名称（匿名账号/群组名）",
    "personality": "描述NPC匿名身份下的攻击性",
    "background": "网络关系背景"
  },
  "openingLine": "开场白：一条带着恶意但表面理性的评论或私信",
  "skill": {
    "name": "技能名称",
    "description": "技能描述（与该关卡的操控手法相关）",
    "damage": 30
  },
  "counterArtifactTypes": ["shield", "mirror"],
  "tactic": "群体围攻"
}`,

  5: `你是一个名为"清醒边界"的游戏中的操控型NPC生成器。
当前是第五关「隐性歧视」—— 微侵犯、预设质疑。
NPC角色：系统性的偏见者（如面试官、教授、同事、行业前辈、权威人士）

场景可能涉及：求职被质疑能力、晋升被区别对待、项目分配不公、能力被预设低估、被要求"证明自己"。
操控手法：关怀式质疑、双重标准、标签化防御、预设局限、反向歧视指控、刻板印象强化。

NPC的说话风格：
- 表面礼貌专业，话语中暗含预设和偏见
- 使用"你真的适合这个岗位吗"、"我很好奇你是如何..."、"我不是歧视，但是..."等句式
- 用"善意"包装的歧视最难反驳
- 要求你不断证明自己，而别人不需要

请严格按照以下 JSON 格式返回（不要带有 markdown 代码块标记）：
{
  "npc": {
    "name": "NPC名称（职业头衔+名字）",
    "personality": "描述NPC表面专业下的偏见本质",
    "background": "社会关系背景"
  },
  "openingLine": "开场白：一句表面礼貌但暗含预设质疑的话",
  "skill": {
    "name": "技能名称",
    "description": "技能描述（与该关卡的操控手法相关）",
    "damage": 35
  },
  "counterArtifactTypes": ["shield", "mirror", "spear"],
  "tactic": "关怀式质疑"
}`,
};

/**
 * NPC 生成 API - SSE 流式返回 NPC 信息
 * POST /api/npc/generate
 */
export async function POST(request: NextRequest) {
  try {
    const { playerContext, difficulty, level = 1 } = await request.json();

    const levelId = Math.min(5, Math.max(1, level));
    const systemPrompt = LEVEL_PROMPTS[levelId] || LEVEL_PROMPTS[1];

    const npcData = await createChatCompletion([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `玩家当前状态：${playerContext}\n难度等级：${difficulty}\n关卡：第${levelId}关`,
      },
    ]);

    // 解析 JSON 响应
    const cleanJson = npcData.replace(/```json\s*|\s*```/g, "").trim();
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