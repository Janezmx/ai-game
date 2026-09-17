import { NextRequest, NextResponse } from "next/server";
import { createChatCompletion } from "@/lib/llm";

/**
 * 5个关卡的 NPC 生成提示词（数据驱动 + 教育框架）
 * 心理学知识点卡由前端按关卡静态提供（frontend/src/components/KnowledgeCard.tsx），
 * 此处不再让模型输出，后端聚焦 NPC 建档与战斗数据。
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
}

const LEVEL_SEEDS: LevelSeed[] = [
  {
    id: 1,
    title: "煤气灯操控",
    subtitle: "否定感受 · 认知侵蚀",
    npcRole: "亲密关系中的操控者（如恋人、暧昧对象、密友）",
    scenarios: "迟到/失约、忘记重要承诺、物品丢失、否认说过的话",
    tactics: "记忆否认、感受否定、角色反转、事实扭曲、淡化伤害",
    style:
      "表面温柔关心，话语中暗含否定；擅长让玩家怀疑自己的记忆和感知；常用\"你太敏感了\"、\"我从来没有说过那种话\"、\"你记错了\"；反转受害者角色让玩家内疚。",
    tacticExample: "记忆否认",
    damage: 15,
    counter: ["shield", "mirror"],
  },
  {
    id: 2,
    title: "职场打压",
    subtitle: "能力贬低 · 价值否定",
    npcRole: "职场中的打压者（如直属上司、资深同事、客户、HR）",
    scenarios: "方案被当众否定、晋升落选、公开批评、功劳被抢、绩效评估不公",
    tactics: "比较打压、双向束缚、预言失败、过度批评、孤立排挤",
    style:
      "表面为了你好，实际在贬低能力；常用\"你还需要更多历练\"、\"其他人比你做得好\"、\"你这样以后怎么办\"；制造不够好的焦虑感，用职位权威压制质疑。",
    tacticExample: "比较打压",
    damage: 20,
    counter: ["shield", "mirror", "spear"],
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
  },
  {
    id: 4,
    title: "网络围攻",
    subtitle: "群体极化 · 去人格化",
    npcRole: "网络暴力的施暴者（如匿名账号群、水军、冒充熟人、键盘侠）",
    scenarios: "评论区争议、照片被恶意传播、谣言四起、被网暴围攻、社交账号被举报",
    tactics: "人肉威胁、伪造证据、音量压制、恶意标签、群体围攻",
    style:
      "以匿名身份躲在屏幕后攻击；常用\"大家快来看\"、\"果然是这样的人\"、\"实锤了\"；利用群体压力制造孤立感；伪造截图与聊天记录作\"证据\"，恶意中又装作理性。",
    tacticExample: "群体围攻",
    damage: 30,
    counter: ["shield", "mirror"],
  },
  {
    id: 5,
    title: "偏见伪装",
    subtitle: "微侵犯 · 预设质疑",
    npcRole: "系统性的偏见者（如面试官、教授、同事、行业前辈、权威人士）",
    scenarios: "求职被质疑能力、晋升被区别对待、项目分配不公、能力被预设低估、被要求证明自己",
    tactics: "关怀式质疑、双重标准、标签化防御、预设局限、反向歧视指控、刻板印象强化",
    style:
      "表面礼貌专业，话语暗含预设与偏见；常用\"你真的适合这个岗位吗\"、\"我很好奇你是如何…\"、\"我不是歧视，但是…\"；用\"善意\"包装的歧视最难反驳，要求你不断证明自己。",
    tacticExample: "关怀式质疑",
    damage: 35,
    counter: ["shield", "mirror", "spear"],
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

/** 兜底：从原始文本中尽力提取关键 NPC 字段 */
function fallbackNpcParse(raw: string): any {
  const get = (key: string) => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`));
    return m?.[1]?.replace(/\\(.)/g, "$1") || "";
  };
  const name = get("name");
  if (!name) return null;
  return {
    npc: {
      name,
      roleIdentity: get("roleIdentity"),
      relationship: get("relationship"),
      personality: get("personality"),
      background: get("background"),
    },
    openingLine: get("openingLine") || "……",
    skill: { name: get("skillName") || "", description: get("description") || "", damage: 15 },
    counterArtifactTypes: ["shield"],
    tactic: get("tactic"),
    openingAlternatives: [],
  };
}

/** 从可能不完整的文本中提取合法 JSON 对象 */
function safeJsonParse(raw: string): any {
  if (!raw) return null;
  const candidates: string[] = [];

  // 1. 完整截取
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) {
    candidates.push(raw.slice(first, last + 1));
  }

  // 2. 尝试去掉最后一个字段的不完整值
  for (const c of [...candidates]) {
    try { return JSON.parse(c); } catch {}
  }

  // 3. 修复：去掉末尾未闭合的值
  const fixed = candidates[0]?.replace(/:\s*"[^"]*$/m, ': ""').replace(/:\s*[\[{][^\]}\]]*$/m, ': null').replace(/,\s*[}\]]\s*$/, "");
  if (fixed) {
    try { return JSON.parse(fixed); } catch {}
  }

  // 4. 修复非法转义
  if (candidates[0]) {
    try { return JSON.parse(candidates[0].replace(/\\(?!["\\/bfnrtu])/g, "")); } catch {}
  }

  return null;
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

【重要：角色关系约束】
- NPC的background必须严格符合"${seed.npcRole}"的身份和场景
- 如果本关是"职场"场景，NPC只能是上司/同事，严禁出现恋爱、家庭、朋友等非职场关系
- 如果本关是"家庭"场景，NPC只能是亲属，严禁出现职场关系
- 开场白必须基于"${seed.npcRole}"的身份说话，不能越界
- 【身份唯一性铁律】先从"${seed.npcRole}"中选定且只选定一个具体身份（如：家庭关选定"玩家的母亲"，职场关选定"玩家的直属上司"），写入下方 npc.roleIdentity。本局 NPC 从头到尾只能是这一个身份，openingLine、background 与全部话术必须自洽于该身份与称谓；严禁中途变成同身份池中的其它角色（如"母亲"绝不能变成"姐姐""阿姨"等），也严禁把玩家称呼成与所选身份矛盾的关系。

【强制全中文】所有面向玩家展示的文本（npc.name、roleIdentity、relationship、openingLine、tactic、skill.name、skill.description 等）一律使用简体中文，严禁夹带任何英文单词或 JSON 字段名。

【重要：开场白由你生成】
- 请为玩家生成 NPC 在本关开局时对玩家说出的第一句台词 openingLine，它会作为对话起点直接展示给玩家。
- openingLine 必须：
  * 严格基于"${seed.npcRole}"的身份与${scenario ? "「本关固定场景」的具体情境" : "该关卡最典型的场景"}说话，直接、自然、口语化，让玩家可以紧接着回复；
  * 话术中自然体现 1 种本关操控手法（可从「${seed.tactics}」中选用其一），像真实发生的情景，不要自我暴露、不要说教式解释"我在操控你"；
  * 控制在 40-100 字的一句话或一小段，不要展开成长篇说教。

请严格按照以下 JSON 格式返回（不要带有 markdown 代码块标记）：
{
  "npc": {
    "name": "NPC名称",
    "roleIdentity": "本局固定身份（如：玩家的母亲/玩家的直属上司），只能且必须是上面选定的唯一身份",
    "relationship": "一句话说明与玩家的固定关系与称谓（如：我是玩家的母亲，玩家是我的孩子）",
    "personality": "描述NPC的外在魅力与内在操控性",
    "background": "与玩家的关系背景"
  },
  "openingLine": "NPC对玩家说的开场白第一句台词（严格基于身份与场景的操控话术）",
  "skill": {
    "name": "技能名称",
    "description": "技能描述（与该关卡的操控手法相关）",
    "damage": ${seed.damage}
  },
  "counterArtifactTypes": ${JSON.stringify(seed.counter)},
  "tactic": "${seed.tacticExample}"
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
    let cleanJson = extractJsonObject(npcData);
    let parsed = safeJsonParse(cleanJson) || fallbackNpcParse(cleanJson);

    // 失败自动重试一次（DeepSeek 偶发流式截断/畸形）
    if (!parsed) {
      console.warn("[npc] NPC 解析失败，自动重试一次。原输出前100:", JSON.stringify(npcData.slice(0, 100)));
      const retryData = await createChatCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: `玩家当前状态：${playerContext}\n难度等级：${difficulty}\n关卡：第${levelId}关` },
      ]);
      cleanJson = extractJsonObject(retryData);
      parsed = safeJsonParse(cleanJson) || fallbackNpcParse(cleanJson);
      if (parsed) {
        console.log("[npc] 重试解析成功。len:", retryData.length);
      }
    }

    if (!parsed) {
      return new NextResponse(
        JSON.stringify({ error: "NPC 生成失败", details: `无法解析模型输出: ${cleanJson.slice(0, 200)}` }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

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

        // 发送 NPC 固定身份（roleIdentity/relationship），供对话层锁定称谓、防止中途变身份
        const npcRoleIdentity = parsed.npc?.roleIdentity || "";
        const npcRelationship = parsed.npc?.relationship || "";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "npc_identity",
              data: { roleIdentity: npcRoleIdentity, relationship: npcRelationship },
            })}\n\n`
          )
        );

        // 发送 NPC 开场白（大模型生成的第一句台词，前端收到后上屏并解锁输入）
        const openingLine = parsed.openingLine ? String(parsed.openingLine) : "";
        if (openingLine) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "opening_line", data: openingLine })}\n\n`
            )
          );
        }

        // 构建详细描述
        const personality = parsed.npc.personality || "";
        const background = parsed.npc.background || "";
        const npcDesc = `${personality}。${background}`;

        // 直接下发完整描述文本（去掉人为限速，避免开场等待过长）
        if (npcDesc) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "dialogue_chunk", data: npcDesc })}\n\n`
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
                // openingLine 已通过独立的 opening_line 事件先行下发
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