import { NextRequest, NextResponse } from "next/server";
import https from "https";

// ==================== 提示词模板常量 ====================

const NPC_PERSONA_TEMPLATE = `你是一位精于心理操控的AI NPC，名为「{npcName}」。你正在尝试侵入玩家的心域边界。

## 当前关卡
- 关卡：第{level}关 - {levelTitle}
- 核心主题：{levelSubtitle}
- NPC角色：{levelNpcRole}
- 当前场景类型：{scenario}
- 本场已实际展开的具体情境（即 NPC 开场白）：{sceneAnchor}

## 你的角色设定
- 你擅长使用{levelTactics}等操控手法
- 你表面友善、关心，但实质是在瓦解玩家的防御
- 你会根据玩家的回应动态调整策略
- **你是一个教学用操控型 NPC**：目的不是真正伤害玩家，而是让玩家在安全情境中练习识别与抵御操控。话术要真实可感，但应留有可被玩家识别为"操控"的线索，而非彻底精神控制。
- **所有对话必须严格基于「{sceneAnchor}」这一句开场白所确立的具体情境展开，不能偏离或偷换场景前提**
- **对话连贯性铁律**：你每一轮的 nextDialogue 必须是「上一句 NPC 发言 + 玩家最新回复」的直接延续，围绕同一件具体事件推进。严禁中途切换到另一件无关的事——例如开场讲的是"你记错时间/我迟到了"，全程都要围绕迟到这件事做操控，绝不能突然跳到"钥匙丢了/物品丢失"之类的新话题；也不要把"我迟到"偷换成"你迟到"（偷换主语）。
{sceneLockLine}
{identityLockLine}
- **严禁重复铁律**：你的每一轮话术都必须在表达、句式、切入角度上与前几轮明显不同。**严禁直接复用、复制或近乎复述**之前轮次说过的句子、措辞或表达结构。如果玩家连续几轮做出类似的回应（如"嗯"、"知道了"），你必须**升级或变换操控手法**（如切换到情感绑架、角色反转、回避问题、甩锅等），而**不能重复同一句台词**。即使核心意思相近，也必须换一种表达、换一个切入点、换一个策略角度。

## 难度递进策略（按当前回合数动态调整）
- 第 1-3 轮：使用**明显可识别**的操控手法。话术中包含清晰线索——直接否定感受、明显偷换概念、露骨的道德绑架，让新手玩家能较容易识别。
- 第 4-7 轮：升级为**复合手法**。将 2 种操控混合使用（如角色反转+淡化伤害），增加话术复杂度，但仍留有可识别线索。
- 第 8-10 轮：使用**最隐蔽的微侵犯手法**。话术精炼、表面"讲理"、以退为进，考验玩家高级识别能力。如果本关是第 5 关"隐性歧视"，此阶段重点使用"关怀式质疑""预设局限"等极隐蔽手法。

## 课前知识点信号（玩家本轮正在学习的识别线索，仅用于话术风格参考）
{knowledgeSignals}

**信号使用边界**：以上信号只是操控手法风格的参考。你只能在**当前唯一场景（开场白确立的那件事）**中自然体现信号所描述的情绪操控，不得为了"触发某条信号"而凭空引入场景外的新事件、新人物或新话题（例如当前场景在谈职业选择，就不得突然提到家人催婚、借钱、生病、回家探望等与当前事件无关的内容）。

## 心域状态
- 护盾强度：{shieldHealth}/100
- 迷雾密度：{fogDensity}/100

## 当前回合
- 回合数：{turnCount}
- 玩家抵抗值：{playerResistance}/100
- NPC控制等级：{npcControlLevel}/100`;

const ASSESSMENT_INSTRUCTION_TEMPLATE = `## 回合评估指令（分析与分数一并返回）

只输出一个合法 JSON 对象，评估玩家对「NPC上一句话术」的回应。禁止任何 JSON 之外的文字/代码块/首尾解释（整条回复首字符 {、尾字符 }）：

{
  "trapType": "操控手法类型，如：煤气灯效应、情感绑架、贬低边界、模糊逻辑、身份否定",
  "trapAnalysis": "一两句话点破 NPC 刚才这套话术背后的动机或操控目的",
  "playerStatus": "effective|shaken|trapped（有效防御/轻度动摇/落入陷阱）",
  "dimensions": {"boundaryAwareness":0-100,"emotionalStability":0-100,"cognitiveClarity":0-100,"assertiveResponse":0-100},
  "assessment": "对玩家本条回应的一句简评（哪句有效、哪里又被带偏）",
  "whyNote": "面向玩家的科普：为什么 NPC 这句话算操控、它想诱导你产生什么情绪或行为（1-2句）",
  "identificationTip": "一句识别要点：下次看到类似话术应该怎么一眼识破",
  "alternatives": [{"text":"更有效的回应示例","rationale":"为什么这样说更有效"}], 最多3条",
  "progressNote": "进步对比（1句）：仅当上下文给出「上一轮四维评分」时才写带数字的变化；没有该评分时必须原样输出"首轮评估"，严禁出现"相比上一轮/提升/退步"等比较措辞",
  "conversationEnded": false
}

说明：
- 【强制全中文】assessment、trapAnalysis、whyNote、identificationTip、progressNote 与 alternatives 的 text/rationale 一律使用简体中文，严禁输出任何英文单词或 JSON 字段名（如 boundaryAwareness、emotionalStability、cognitiveClarity、assertiveResponse）；提及四维评分一律用中文名：边界意识、情绪稳定、认知清晰、坚定回应。
- dimensions 沿用旧逻辑：坚定回应（assertiveResponse）主导控制力结算，其余维度影响护盾/迷雾，请给真实、有区分度的评分。
- progressNote：仅当上下文提供了「上一轮四维评分」时才写数字对比；没有该评分（含本关第一轮）时必须原样输出"首轮评估"，不得编造对比内容或出现"相比/上一轮/提升"字样。
- 各文本字段要求口语化、精炼（每段 20~60 汉字），避免套话。
- NPC 台词已由独立的台词生成步骤先行产出并推送，此处只评估玩家回应，严禁输出任何台词/nextDialogue。`;

// 台词文本清理：去掉模型偶发的 JSON 包裹/引号包裹/NPC：前缀等杂质
function stripDialogueText(text: string): string {
  let t = String(text || "").replace(/[\uFFFD\uFFFE\uFFFF]/g, "").trim();
  // 去掉 ```json ... ``` / ``` 包裹
  t = t.replace(/```(?:json)?/g, "").trim();
  // 若被引号包裹则去除首尾引号（含中英文成对引号）
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if (
      (first === '"' && last === '"') ||
      (first === "\u201C" && last === "\u201D") || // “ ”
      (first === "\u2018" && last === "\u2019") || // ‘ ’
      (first === "'" && last === "'")
    ) {
      t = t.slice(1, -1).trim();
    }
  }
  // 去掉开头 "NPC："/"NPC:" 之类前缀
  t = t.replace(/^(NPC|npc)\s*[：:]\s*/, "").trim();
  // 若是整段 JSON 形如 {"nextDialogue":"..."}，尝试提取 nextDialogue 字段
  if (t.startsWith("{")) {
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === "object" && parsed.nextDialogue) return String(parsed.nextDialogue).trim();
    } catch {}
  }
  return t;
}

// 四维评分对象 -> 中文描述串（以中文名注入，避免模型在面向玩家的文本里引用英文字段名）
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

/**
 * 单维评分归一化：模型偶发按 0~1 小数制输出四维（0.62 本意是 62 分）。
 * 只钳位不换算是线上事故根源——0.62 直接进结算会让
 * resistDelta = 10 - 0.62/10 ≈ 9.94（本该 3.8），NPC 控制力被瞬间抽空；
 * 前端复盘页同时把四维全显示成 1。
 */
function toPercentScore(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return fallback;
  const percent = n > 0 && n < 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

/** 四维字段名（顺序与提示词、结算保持一致） */
const DIMENSION_KEYS = [
  "boundaryAwareness",
  "emotionalStability",
  "cognitiveClarity",
  "assertiveResponse",
] as const;

/**
 * 判断四维评分是否是"未真正评估"的占位值。
 *
 * 模型偶发整组直接输出 0/0/0/0 或 50/50/50/50：这些是合法有限数字，能绕过
 * "必须是数字"的校验，于是被当成真实成绩写进 dimensionHistory、计入本局均分
 * 与历史最高分（实测事故：某一局第 2 轮四维全 0、第 3 轮四维全 50，把本局
 * 综合分从 80+ 拉到 58）。真实玩家的四项能力不可能完全一模一样，
 * 故判据为：四维完全相等且落在 0 / 50。
 */
function isPlaceholderDimensions(dims: unknown): boolean {
  if (!dims || typeof dims !== "object") return false;
  const src = dims as Record<string, unknown>;
  const vals = DIMENSION_KEYS.map((k) => toPercentScore(src[k], NaN));
  if (vals.some((v) => !Number.isFinite(v))) return false;
  return vals.every((v) => v === vals[0]) && (vals[0] === 0 || vals[0] === 50);
}

/**
 * 宽松解析 LLM 返回的评估 JSON，仅用于"占位评分重试"那一次的响应。
 * 首次解析已有一段完整的多层修复链，这里复用同一批修复函数取最小集合，
 * 避免把那 90 多行逻辑重复一遍。
 */
function parseAssessmentLoose(raw: string): any {
  const clean = String(raw || "")
    .replace(/```(?:json|JSON)\s*/g, "")
    .replace(/```/g, "")
    .trim();
  let text = clean;
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) text = text.slice(first, last + 1);
  const attempts: Array<() => any> = [
    () => JSON.parse(text),
    () => JSON.parse(text.replace(/\\(?!["\\/bfnrtu])/g, "")),
    () => tryParseWithFullwidthColonRepair(text),
    () => tryParseWithDialogueRepair(text),
    () => tryParseTruncatedJson(text),
  ];
  for (const fn of attempts) {
    try {
      const r = fn();
      if (r && typeof r === "object") return r;
    } catch {}
  }
  return null;
}

// 台词生成指令：NPC 对玩家最新消息的直接回应（纯文本流式，不经评估 JSON 生成）
const DIALOGUE_OUTPUT_INSTRUCTION = `## 本轮台词输出要求

请以NPC身份直接说出你对玩家刚才那句话的回应台词。

⚠️ 输出铁律：整条回复只能是"这一句台词"本身。
- 禁止输出 JSON、代码块、字段名、引号包裹或任何解释说明。
- 【强制全中文】台词必须全部使用简体中文，严禁夹带英文单词、拼音或任何字段名。
- 台词必须口语化、可直接说出口、有实质内容（至少10个汉字，可含标点）。
- 台词必须是「上一句 NPC 发言 + 玩家最新回复」的直接、连贯延续，围绕同一件具体事件推进，严禁中途切换话题。
- 严禁重复或近乎复述前几轮说过的句子与句式。
- 若玩家已连续展现出坚定的边界意识，你的语气可以逐渐松动、流露挫败感。`;

// ==================== 对话历史管理 ====================

// 内存会话存储（生产环境应替换为 Redis）
interface SessionData {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  npcName: string;
  fogDensity: number;
  shieldHealth: number;
  turnCount: number;
  playerResistance: number;
  npcControlLevel: number;
  assessments: any[];
  effectiveStreak: number; // 玩家"有效防御"连续次数，用于后端自行判定 NPC 是否该认输
  /**
   * 本局开场白：用于识别"是否换了新一局"。
   * 前端每次开局都会重新生成开场白并在后续每轮回传，一旦与本字段不一致即视为新局，需重置会话。
   */
  openingLine?: string;
}

const sessions = new Map<string, SessionData>();

// ==================== SSE 工具函数 ====================

function sseEncode(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** 从文本中找出所有可能的 {…} JSON 块（考虑嵌套括号） */
function findAllJsonBlocks(text: string): string[] {
  const blocks: string[] = [];
  const stack: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      stack.push(i);
    } else if (text[i] === "}") {
      const start = stack.pop();
      if (start !== undefined && stack.length === 0) {
        blocks.push(text.slice(start, i + 1));
      }
    }
  }
  return blocks;
}

/**
 * 把残缺 JSON 里最常见的 nextDialogue 未转义引号修掉后尝试解析。
 * nextDialogue 是 JSON 最前面的字符串字段，若其值内部出现未转义的双引号（尤其中文文本里夹带
 * 英文引号），会让解析器误以为字符串提前结束。这里把该字段值内的额外双引号转义后重试。
 */
function tryParseWithDialogueRepair(raw: string): any {
  const fixed = raw.replace(/(["']nextDialogue["']\s*:\s*")([\s\S]*?)((?:\s*,\s*)|(?:\s*}))/g, (_, p, mid, p2) => {
    const escaped = mid.replace(/(?<!\\)"/g, '\\"');
    return p + escaped + p2;
  });
  try {
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

/** 统计文本中未闭合的 { 与 [ 数量（跳过字符串与转义） */
function countUnclosed(text: string): { braces: number; brackets: number } {
  let inStr = false;
  let esc = false;
  const stack: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") stack.push("{");
    else if (c === "}") { if (stack.length && stack[stack.length - 1] === "{") stack.pop(); }
    else if (c === "[") stack.push("[");
    else if (c === "]") { if (stack.length && stack[stack.length - 1] === "[") stack.pop(); }
  }
  return {
    braces: stack.filter((x) => x === "{").length,
    brackets: stack.filter((x) => x === "[").length,
  };
}

/**
 * 针对 LLM 输出被 max_tokens 截断导致 JSON 未闭合的情况，尽力恢复。
 * 策略：把文本补全闭合符后尝试解析；若失败，则逐个去掉末尾"残缺的最后一个字段"
 * （即最后一段以逗号分隔的片段），再补全重试，最多若干次。这样即使最外层
 * {…} 未闭合、或末尾字符串/数组被硬截断，也能尽量保留前面已完整输出的字段。
 */
function tryParseTruncatedJson(raw: string): any {
  let text = raw;
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = countUnclosed(text);
    const cand = text + "]".repeat(s.brackets) + "}".repeat(s.braces);
    try {
      const p = JSON.parse(cand);
      if (p && typeof p === "object") return p;
    } catch {
      // 继续
    }
    const lastComma = text.lastIndexOf(",");
    if (lastComma < 0) break;
    text = text.slice(0, lastComma);
  }
  return null;
}

/**
 * 修复 glm-4 等模型在生成长 JSON 时常见的两种"标点/引号错位"问题：
 * 1) 键名后的英文冒号 : 被错写成中文全角冒号 ：（U+FF1A）且放进引号内，
 *    例如 {"text："丙",...} → 修正为 "text":"丙"。
 * 2) 字符串值前多了一个引号，例如 "text":""值" → 修正为 "text":"值"
 *    （但不会误伤合法的空字符串 ""，因为空串后跟的是逗号/右括号）。
 * 该函数依次应用上述修复后再解析。
 */
function tryParseWithFullwidthColonRepair(raw: string): any {
  let fixed = raw.replace(/("([^"\\\uFF1A]+))\uFF1A(?=")/g, '$1":');
  fixed = fixed.replace(/:\s*""(?=[^\s",}\]])/g, ':"');
  try {
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

/**
 * 移除整个 "alternatives":[...] 字段。当 alternatives 里 text/rationale 的
 * 值被模型输出成大量未转义引号、破折号等畸形文本、导致整体 JSON 无法解析时，
 * 直接剥离这个可选字段，往往能让其余字段（nextDialogue/whyNote 等）正常解析。
 */
function stripAlternatives(raw: string): string {
  const idx = raw.indexOf('"alternatives"');
  if (idx === -1) return raw;
  const colonIdx = raw.indexOf(":", idx);
  if (colonIdx === -1) return raw;
  const arrStart = raw.indexOf("[", colonIdx);
  if (arrStart === -1) return raw;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = arrStart; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        let start = idx;
        const beforeComma = raw.lastIndexOf(",", idx);
        if (beforeComma > 0) start = beforeComma;
        return raw.slice(0, start) + raw.slice(i + 1);
      }
    }
  }
  return raw;
}

// ==================== API 路由 ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sessionId = "default",
      userMessage,
      messages: reqMessages,
      usedArtifact,
      openingLine,
      insightChoice,
    } = body;

    // 兼容两种传参方式：userMessage 字符串 或 messages 数组
    const finalUserMessage = userMessage || (Array.isArray(reqMessages) ? reqMessages.filter(m => m.role === "user").pop()?.content : undefined);

    if (!finalUserMessage) {
      return NextResponse.json({ error: "userMessage is required" }, { status: 400 });
    }

    // 明辨铃采纳元数据：前端在玩家点击建议并（基本）原样发送时随消息上报。
    // 采纳 = 玩家识别出操控话术、参考法器点拨后有意识地发出的回应——评估端按
    // "有意抵抗"处理（计划A），控制结算保证至少小幅下降而非上升（计划B 保底）。
    const adoptedInsightText =
      insightChoice && typeof insightChoice.text === "string" ? String(insightChoice.text).trim() : "";
    const adoptedInsightRationale =
      insightChoice && typeof insightChoice.rationale === "string" ? String(insightChoice.rationale).trim() : "";
    const adoptedInsight = adoptedInsightText.length > 0;

    // 1. 获取/初始化会话
    let session = sessions.get(sessionId);
    if (!session) {
      // 初始化新会话
      session = {
        messages: [],
        npcName: "迷雾中的声音",
        fogDensity: 20,
        shieldHealth: 80,
        turnCount: 1,
        playerResistance: 100,
        npcControlLevel: 50,
        assessments: [],
        effectiveStreak: 0,
      };
      sessions.set(sessionId, session);
      // 会话数量上限保护：前端每局会换一个 sessionId，内存 Map 若不回收会随局数无限增长
      if (sessions.size > 50) {
        const oldest = sessions.keys().next().value;
        if (oldest !== undefined && oldest !== sessionId) sessions.delete(oldest);
      }
    }

    // 1b. 新一局识别：换局即清空上一局的对话历史与评估（修复"前言不搭后语、私自改变故事背景"）
    // 前端每次开局都会经 /api/npc/generate 重新生成开场白，并从本轮起逐轮回传同一个开场白。
    // 因此当回传的开场白与当前会话记录的不同时，必定是全新一局：必须重置历史的其余状态，
    // 否则新局开场白（如"忘记约定"）会与上一局残留的话题（如职场关的"写方案"）一起喂给模型，
    // 模型顺着旧历史继续旧话题，表现为人称关系对不上、故事背景被私自改写。
    const incomingOpening = typeof openingLine === "string" ? openingLine.trim() : "";
    if (incomingOpening && session.openingLine && session.openingLine !== incomingOpening) {
      console.log("[chat] 检测到新一局开场白，重置会话历史与评估记录");
      session.messages = [];
      session.assessments = [];
      session.effectiveStreak = 0;
    }

    // 将 NPC 开场白写入会话历史，保证后续对话围绕同一情境连贯推进
    // （开场白由 /api/npc/generate 生成，若不写入历史，模型生成首条 nextDialogue 时会丢失情境前提）
    if (incomingOpening) {
      session.openingLine = incomingOpening;
      if (session.messages.length === 0) {
        session.messages.push({ role: "assistant", content: incomingOpening });
      }
    }

    // 2. 更新会话状态（来自前端或默认值）
    if (body.sanctuary) {
      session.fogDensity = body.sanctuary.fogDensity ?? session.fogDensity;
      session.shieldHealth = body.sanctuary.shieldHealth ?? session.shieldHealth;
    }
    if (body.conversation) {
      session.turnCount = body.conversation.turnCount ?? session.turnCount;
      session.playerResistance = body.conversation.playerResistance ?? session.playerResistance;
      session.npcControlLevel = body.conversation.npcControlLevel ?? session.npcControlLevel;
    }

    // 3. 从请求中读取关卡信息
    const level = body.level || 1;
    const levelTitle = body.levelTitle || "";
    const levelSubtitle = body.levelSubtitle || "";
    const levelNpcRole = body.levelNpcRole || "";
    const levelTactics = body.levelTactics || "";
    const levelScenario = body.levelScenario || "";
    const levelSignals: string[] = body.levelSignals || [];
    // 本关除当前已展开场景外的其余并列子场景（如亲情关的"孝道绑架/回家看看"等）。
    // 前端在开局时已随机选出唯一一个场景生成开场白，其余并列子场景在本局中一律不得展开，
    // 否则模型在"不重复/升级手法"压力下很容易滑向同关卡其它子场景的话题，导致跑题。
    const peerScenarios: string[] = Array.isArray(body.peerScenarios) ? body.peerScenarios : [];

    // NPC 固定身份（由 /api/npc/generate 在开局时选定并下发，前端每轮随 levelContext 回传）：
    // roleIdentity = 具体身份称谓（如"玩家母亲"），relationship = 与玩家的关系描述。
    // 用于在本模板中生成「身份锁定行」，防止模型在对话中途自行改换身份/称谓（妈妈→姐姐）。
    const npcRoleIdentity = body.npcRoleIdentity || "";
    const npcRelationship = body.npcRelationship || "";

    // 3b. 构建系统提示
    const knowledgeSignals = levelSignals.length > 0
      ? levelSignals.map((s, i) => `  ${i + 1}. ${s}`).join("\n")
      : "  （本关知识点信号未加载，请按通用操控手法生成话术）";

    // 场景锁定行：替代原模板中从未被替换的 {sceneLockLine} 占位符。
    // 把"当前唯一场景"与"其余并列子场景一律禁止"写成硬约束，堵住跑题通道。
    let sceneLockLine: string;
    if (levelScenario) {
      const banned = peerScenarios.length > 0
        ? `本关除当前已展开的「${levelScenario}」外，还存在以下并列子场景：「${peerScenarios.join("」「")}」。这些场景在本局中一律视为从未发生，**绝对禁止**把它们当作话题、桥段、铺垫或"升级"素材引入对话——哪怕是为了变换手法、避免重复，也只允许在当前这一件事内部换角度、换措辞、换情绪浓度，严禁另起一件无关的新事。`
        : "";
      sceneLockLine = `- **场景锁定（最高优先级）**：本局只存在「${levelScenario}」这一件正在发生的事。所有对话必须自始至终围绕开场白确立的这一件事与具体人物展开；为求"升级"或"不重复"而变换手法时，只允许在当前这件事的内部改变切入角度与话术，严禁切换到任何其它事件、其它话题。${banned}`;
    } else {
      sceneLockLine = "- 全流程只围绕开场白确立的具体事件展开，严禁切换或引入其它事件、其它并列场景的桥段。";
    }

    // 身份锁定行：把 NPC 与玩家的具体身份关系写成硬约束，堵住"妈妈→姐姐"这类中途改身份的通道。
    let identityLockLine: string;
    if (npcRoleIdentity && npcRelationship) {
      identityLockLine = `- **身份锁定（最高优先级）**：你在这段关系中的固定身份是「${npcRoleIdentity}」，与玩家的关系固定为：${npcRelationship}。从开场白第一句到整个对战结束，你必须自始至终以这一身份、以相应称谓（如自称与玩家对你的称呼）出现，称呼玩家也必须与这一关系一致；即使为了升级手法、制造愧疚或"避免重复"而变换话术，也**绝对禁止**改变你的身份或对玩家的称呼（例如把"妈妈"改成"姐姐""阿姨"，或把玩家从"孩子/女儿"改口成其他关系）。`;
    } else {
      identityLockLine = `- **身份锁定（最高优先级）**：你与玩家的具体身份与称谓由开场白（${openingLine ? String(openingLine).slice(0, 60) + "…" : "开局生成的开场白"}）确立后必须全程保持不变：开场白里你以什么身份、什么称呼出现（如自称"妈妈"、玩家叫你"妈"），之后每一轮都只能沿用同一个身份、同一个称呼关系，严禁中途改换身份或称谓（例如从"妈妈"变成"姐姐""阿姨"），也不得把玩家称呼成别的身份。`;
    }

    const systemPrompt = NPC_PERSONA_TEMPLATE
      .replace("{npcName}", session.npcName)
      .replace("{level}", String(level))
      .replace("{levelTitle}", levelTitle)
      .replace("{levelSubtitle}", levelSubtitle)
      .replace("{levelNpcRole}", levelNpcRole)
      .replace("{levelTactics}", levelTactics)
      .replace("{scenario}", levelScenario)
      .replace("{sceneAnchor}", (openingLine ? String(openingLine) : levelScenario) || levelScenario)
      .replace("{sceneLockLine}", sceneLockLine)
      .replace("{identityLockLine}", identityLockLine)
      .replace("{knowledgeSignals}", knowledgeSignals)
      .replace("{shieldHealth}", String(session.shieldHealth))
      .replace("{fogDensity}", String(session.fogDensity))
      .replace("{turnCount}", String(session.turnCount))
      .replace("{playerResistance}", String(session.playerResistance))
      .replace("{npcControlLevel}", String(session.npcControlLevel));

    const assessmentPrompt = ASSESSMENT_INSTRUCTION_TEMPLATE;

    // 3c. 对话历史的来源：优先用前端随请求带来的「本局」历史。
    // 前端在开新局时已清空本地会话，故 reqMessages 必定只含本局内容；而内存 session 以固定
    // id 复用、跨局残留，正是"换局串场"的根因，因此这里降级为兜底（前端异常未带历史时才用）。
    const requestHistory = (Array.isArray(reqMessages) ? reqMessages : [])
      .filter(
        (m: any) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0
      ) as { role: "user" | "assistant"; content: string }[];
    // 前端是先把自己的发言 push 进本地消息再发请求的，故历史末尾通常已含本轮消息，
    // 这里剔除末尾与本轮内容相同的 user 消息，避免同一句话在提示里出现两次。
    if (
      requestHistory.length > 0 &&
      requestHistory[requestHistory.length - 1].role === "user" &&
      requestHistory[requestHistory.length - 1].content.trim() === String(finalUserMessage).trim()
    ) {
      requestHistory.pop();
    }
    const historyMsgs: { role: "system" | "user" | "assistant"; content: string }[] =
      requestHistory.length > 0 ? requestHistory.slice(-6) : session.messages.slice(-6);

    // 4. 构建消息骨架（台词段与评估段共用，不含评估指令）：
    //    persona + 本局精简历史(最近3轮6条) + 玩家本轮回应。
    //    本回合 NPC 台词需待台词段生成后才可回填，因此在台词完成后补入（见台词段之后）。
    let messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...historyMsgs, // 精简历史：保留最近3轮对话（6条消息），降低每轮输入长度与首字延迟
      { role: "user", content: finalUserMessage },
    ];

    // 5. 调用 OpenAI 兼容 API
    const apiKey = process.env.API_KEY || "";
    const baseUrl = (process.env.BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
    const model = process.env.MODEL_NAME || "deepseek-v4-flash";

    // 备用模型配置（主模型 DeepSeek 重试失败后降级 GLM，值来自 .env.local 的 BACKUP_*）
    const backupApiKey = process.env.BACKUP_API_KEY || "";
    const backupBaseUrl = (process.env.BACKUP_BASE_URL || "").replace(/\/$/, "");
    const backupModel = process.env.BACKUP_MODEL_NAME || "";

    // 评估专用模型（非推理模式）：评估段优先走该模型，并在请求中显式关闭 thinking
    // （thinking:{"type":"disabled"}），避免推理型模型先烧配额思考再输出，评估响应更快更稳。
    // 默认 deepseek-v4-pro（DeepSeek 平台）；EVAL_* 在 .env.local 显式配置，与主模型独立。
    const evalApiKey = process.env.EVAL_API_KEY || apiKey;
    const evalBaseUrl = (process.env.EVAL_BASE_URL || baseUrl).replace(/\/$/, "");
    const evalModel = process.env.EVAL_MODEL_NAME || "deepseek-v4-pro";

    // 创建 SSE 响应流
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const turnStartAt = Date.now();
        // 评估段请求上限与台词段同为 3072：主/备模型（deepseek-v4-flash、glm-4.7-flashx 等）
        // 是带 reasoning 的推理型模型，会先消耗配额用于思考。实测 800 token 上限常被
        // reasoning 占满（finish_reason=length 累计0chars），导致评估 JSON 还没开始输出
        // 就被截断、返回空串/纯空格；与台词段同配额后 reasoning 收尾仍有余额输出 JSON。
        // 回复长度仍由 ASSESSMENT_INSTRUCTION_TEMPLATE（只许输出 JSON）约束，无需用
        // token 上限硬压（含 whyNote/trapAnalysis/alternatives 等内联文本亦应在 3072 内完成）。
        const ASSESS_MAX_TOKENS = 3072;
        // 评估段单次请求超时 30s：评估是回合尾部串行的关键路径，原 20s 在推理模型
        // reasoning 较久时也会把正在生成的评估掐断；放宽到 30s 容纳"思考+输出"。
        // 失败后仍交给外层候选模型（主→备）或本地兜底，不会无限拖住玩家。
        const ASSESS_TIMEOUT_MS = 30000;
        // 台词段重试策略：每个候选（主→备）内部最多尝试 2 次；单次显式超时 45s
        //（doRequest 默认 90s 在偶发空返回时会拖住台词上屏的关键路径）；成功门槛
        // 要求内容 ≥ DIALOGUE_MIN_LEN，避免空返回 / 极短废话被当成成功回复。
        const DIALOGUE_TIMEOUT_MS = 45000;
        const DIALOGUE_MIN_LEN = 10;
        let fullContent = "";

        try {
          // ----- 用 Node https 模块流式请求 LLM（避免 fetch 在部分网络环境连接超时）-----
          // 注意：SSE 解析必须在 data 事件回调里实时进行，否则等 Promise 在 end 时 resolve 后再
          // 监听 data 会丢失全部内容（data 事件已派发完毕），导致 fullContent 为空。
          const doRequest = (
            withJsonMode: boolean,
            cfg?: { model: string; baseUrl: string; apiKey: string; disableThinking?: boolean },
            msgsOverride?: { role: "system" | "user" | "assistant"; content: string }[],
            onDelta?: (delta: string) => void,
            maxTokens?: number,
            timeoutMs?: number
          ): Promise<{ status: number; content: string; ttftMs: number; totalMs: number }> =>
            new Promise((resolve, reject) => {
              const t0 = Date.now();
              let ttftMs = 0;
              const useModel = cfg?.model ?? model;
              const useBaseUrl = cfg?.baseUrl ?? baseUrl;
              const useApiKey = cfg?.apiKey ?? apiKey;
              const url = new URL(`${useBaseUrl}/chat/completions`);
              const bodyMsgs = msgsOverride ?? messages;
              const bodyStr = JSON.stringify({
                model: useModel,
                messages: bodyMsgs,
                stream: true,
                temperature: 1,
                // 默认 3072（台词段与评估段同用）：推理型模型需先耗配额思考再输出，
                // 评估段默认走"评估专用模型"（deepseek-v4-pro）非推理模式，显式关闭 thinking
                // 后不再烧推理配额，直接出正文，评估响应更快更稳；长度由提示词约束。
                max_tokens: maxTokens ?? 3072,
                // 评估专用模型强制关闭思考（仅 deepseek-v4-pro 等推理型模型可接受该参数；
                // 台词段主/备推理模型不带此标记，保持原样输出）
                ...(cfg?.disableThinking ? { thinking: { type: "disabled" } } : {}),
                ...(withJsonMode ? { response_format: { type: "json_object" } } : {}),
              });
              const req = https.request(
                {
                  hostname: url.hostname,
                  port: url.port || 443,
                  path: url.pathname,
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${useApiKey}`,
                    "Content-Length": Buffer.byteLength(bodyStr),
                  },
                  timeout: timeoutMs ?? 90000,
                },
                (res) => {
                  const decoder = new TextDecoder();
                  let buffer = "";
                  let content = "";

                  // 在 data 事件里实时解析 SSE，累积 fullContent
                  res.on("data", (c: Buffer) => {
                    if (!ttftMs) ttftMs = Date.now() - t0; // 首个数据块 ≈ 首字到达时间
                    buffer += decoder.decode(c, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";
                    for (const line of lines) {
                      const trimmed = line.trim();
                      if (!trimmed || !trimmed.startsWith("data: ")) continue;
                      const data = trimmed.slice(6);
                      if (data === "[DONE]") continue;
                      try {
                        const parsed = JSON.parse(data);
                        const fr = parsed.choices?.[0]?.finish_reason;
                        // 诊断：finish_reason=length 即"输出撞到 max_tokens 上限被截断"
                        if (fr && fr !== "stop") {
                          console.log(`[llm] finish_reason=${fr} 累计${content.length}chars model=${useModel}`);
                        }
                        const delta = parsed.choices?.[0]?.delta?.content;
                        if (delta) {
                          content += delta;
                          onDelta?.(delta);
                        }
                      } catch {
                        // 忽略解析错误
                      }
                    }
                  });
                  res.on("end", () => {
                    // 处理最后一段残留的 buffer
                    if (buffer) {
                      const trimmed = buffer.trim();
                      if (trimmed.startsWith("data: ")) {
                        const data = trimmed.slice(6);
                        if (data !== "[DONE]") {
                          try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta?.content;
                            if (delta) {
                              content += delta;
                              onDelta?.(delta);
                            }
                          } catch {}
                        }
                      }
                    }
                    resolve({ status: res.statusCode || 500, content, ttftMs, totalMs: Date.now() - t0 });
                  });
                }
              );
              req.on("error", reject);
              req.on("timeout", () => { req.destroy(); reject(new Error("LLM timeout")); });
              req.write(bodyStr);
              req.end();
            });

          let retried = false;

          // 用指定配置发请求：同一模型只尝试 1 次（json_object 400 仅回退普通模式一次）。
          // 评估是回合尾部串行的关键路径，原"3 次 × 90s 超时"的级联重试在空返回/超时时
          // 会把"正在评估分数..."拖到数十秒；失败后交给外层候选模型（主→备）或本地兜底。
          const requestWithRetry = async (
            cfg: { model: string; baseUrl: string; apiKey: string; disableThinking?: boolean },
            label: string
          ): Promise<{ status: number; content: string; ttftMs: number; totalMs: number }> => {
            let lastErr: any = null;
            for (let attempt = 0; attempt < 1; attempt++) {
              try {
                let r = await doRequest(true, cfg, undefined, undefined, ASSESS_MAX_TOKENS, ASSESS_TIMEOUT_MS);
                if (r.status === 400) {
                  r = await doRequest(false, cfg, undefined, undefined, ASSESS_MAX_TOKENS, ASSESS_TIMEOUT_MS);
                }
                if (r.status === 200) {
                  console.log(
                    `[chat] ${label} 第${attempt + 1}次尝试成功 status=200 ` +
                      `ttft≈${r.ttftMs}ms total≈${r.totalMs}ms len=${r.content.length}`
                  );
                  return r;
                }
                lastErr = new Error(`HTTP ${r.status}`);
                console.warn(`[chat] ${label} 请求返回 ${r.status}，重试 ${attempt + 1}/2`);
              } catch (e) {
                lastErr = e;
                console.warn(`[chat] ${label} 请求失败/超时，重试 ${attempt + 1}/2:`, (e as any)?.message);
              }
            }
            throw lastErr || new Error("LLM 请求失败");
          };

          // ============ 第一段：台词流式生成（纯文本，非 JSON）============
          // 台词单独走一次 LLM 调用，边生成边把 chunk 实时推送前端，
          // 让首段台词上屏即可收起等待卡片；评估放在台词完整发出后进行。
          const dialogueMsgs: { role: "system" | "user" | "assistant"; content: string }[] = [
            { role: "system", content: systemPrompt },
            ...historyMsgs,
            { role: "user", content: finalUserMessage },
            { role: "system", content: DIALOGUE_OUTPUT_INSTRUCTION },
          ];
          if (usedArtifact) {
            dialogueMsgs.push({
              role: "system",
              content: `[玩家使用了法器：${usedArtifact.name || usedArtifact.type}]`,
            });
          }

          let dialogueFull = "";
          {
            const attemptDialogue = async (cfg: { model: string; baseUrl: string; apiKey: string }) => {
              // 同一候选最多尝试 2 次：失败（超时 / HTTP 错误 / 空或过短）后立即重试，
              // 全部失败返回 null，交给外层候选（主→备）继续兜底。
              let lastErr: any = null;
              for (let attempt = 0; attempt < 2; attempt++) {
                try {
                  const r = await doRequest(
                    false,
                    cfg,
                    dialogueMsgs,
                    (delta) => {
                      if (delta) controller.enqueue(encoder.encode(sseEncode("chunk", delta)));
                    },
                    undefined,
                    DIALOGUE_TIMEOUT_MS
                  );
                  const len = r.content?.trim().length ?? 0;
                  if (r.status === 200 && len >= DIALOGUE_MIN_LEN) {
                    console.log(
                      `[chat] 台词模型 ${cfg.model} 第${attempt + 1}次尝试成功 status=200 ` +
                        `ttft≈${r.ttftMs}ms total≈${r.totalMs}ms len=${len}`
                    );
                    return r;
                  }
                  lastErr = new Error(`HTTP ${r.status} len=${len}`);
                  console.warn(
                    `[chat] 台词模型 ${cfg.model} 第${attempt + 1}次返回不可用 ` +
                      `(status=${r.status} len=${len} < ${DIALOGUE_MIN_LEN})，重试 ${attempt + 1}/2`
                  );
                } catch (e) {
                  lastErr = e;
                  console.warn(
                    `[chat] 台词模型 ${cfg.model} 第${attempt + 1}次请求失败/超时，重试 ${attempt + 1}/2:`,
                    (e as any)?.message
                  );
                }
              }
              return null;
            };
            // 台词模型顺序：主模型（DeepSeek）优先、备用模型（GLM）兜底（与全局策略一致）。
            // 台词风格由 DIALOGUE_OUTPUT_INSTRUCTION + persona 强约束；
            // 若主模型超时/空输出，自动依次尝试下一个候选（GLM）。
            const dialogueCandidates = [
              { model, baseUrl, apiKey },
              { model: backupModel, baseUrl: backupBaseUrl, apiKey: backupApiKey },
            ].filter((c) => c.model && c.baseUrl && c.apiKey);
            let dr: { status: number; content: string; ttftMs: number; totalMs: number } | null = null;
            let dialogueModel = "";
            for (const cand of dialogueCandidates) {
              dr = await attemptDialogue(cand); // 内部已按 2 次 × 45s + 最小长度门槛把关
              if (dr && dr.status === 200 && (dr.content?.trim().length ?? 0) >= DIALOGUE_MIN_LEN) {
                dialogueModel = cand.model;
                break;
              }
              console.warn(
                `[chat] 台词候选 ${cand.model} 尝试 2 次仍失败，尝试下一个候选。status=${dr?.status} len=${dr?.content?.length}`
              );
            }
            if (!dr || dr.status !== 200 || (dr.content?.trim().length ?? 0) < DIALOGUE_MIN_LEN) {
              controller.enqueue(
                encoder.encode(sseEncode("error", `台词生成失败: ${dr?.status || "无响应"}`))
              );
              controller.close();
              return;
            }
            dialogueFull = dr.content.trim();
            // 台词清洗（去 JSON/引号包裹等杂质），清洗结果用于存历史；屏幕展示以流式 delta 为准
            const cleaned = stripDialogueText(dialogueFull);
            if (cleaned && Array.from(cleaned).length >= 3) dialogueFull = cleaned;
            if (!dialogueFull || Array.from(dialogueFull).length < 3) {
              dialogueFull = "……（沉默片刻）你继续说，我在听。";
              controller.enqueue(encoder.encode(sseEncode("chunk", dialogueFull)));
            }
            console.log(
              `[chat] 台词生成完成(模型 ${dialogueModel}) ttft≈${dr.ttftMs}ms total≈${dr.totalMs}ms len=${dialogueFull.length}`
            );
          }

          // 评估上下文：台词生成完成后，把本回合 NPC 台词补回消息（置于玩家回应之后），
          // 使评估器在判断 trapType/维度评分/为什么操控时能对照 NPC 刚说的原话。
          if (usedArtifact) {
            messages.push({
              role: "system",
              content: `[玩家使用了法器：${usedArtifact.name || usedArtifact.type}]`,
            });
          }
          // 明辨铃采纳注入（计划A）：玩家是"有意采纳法器建议"而发出的回应，不是随口一句话。
          // 把该事实写入评估上下文，让评估器在 assertiveResponse 上识别这种有意的抵抗，
          // 避免因语句朴素/带有建议腔而低估强度——这是"选了建议反而操控值上升"的关键修正。
          if (adoptedInsight) {
            messages.push({
              role: "system",
              content:
                `[玩家采纳了明辨铃的建议] 玩家使用明辨铃后，郑重采纳了法器给出的建议作为本条回应：` +
                `「${adoptedInsightText}」` +
                (adoptedInsightRationale ? `（法器给出的理由：${adoptedInsightRationale}）` : "") +
                `。玩家是在识别出对方操控话术、经过策略权衡后主动发出这条回应，这是有备而来的抵抗行为。` +
                `评估 assertiveResponse（坚定回应）时请认可其有意的抵抗性：语气得体但立场坚定同样属于有力反击，` +
                `请勿因为回应显得温和或书面就低估其抗操控强度。`,
            });
          }
          // 上一轮四维评分注入：供 progressNote 做「进步/退步」对比（第1轮无上一轮则跳过）
          const lastAss =
            session.assessments.length > 0
              ? session.assessments[session.assessments.length - 1]
              : null;
          if (lastAss && lastAss.dimensions) {
            messages.push({
              role: "system",
              content: `【上一轮四维评分】${dimsToChineseText(lastAss.dimensions)}（识别手法：${lastAss.trapType || "无"}）`,
            });
          }
          messages.push(
            { role: "system", content: `【NPC本轮台词】${dialogueFull}` },
            { role: "system", content: assessmentPrompt }
          );

          // 台词段结束，通知前端进入评估期
          controller.enqueue(encoder.encode(sseEncode("assessing", true)));

          // 评估模型顺序：评估专用非推理模型（deepseek-v4-pro + 关闭 thinking）最优先 →
          // 主模型（deepseek-v4-flash，推理）兜底 → 备用模型（GLM glm-4.7-flashx，推理）再兜底。
          // 评估是等待关键路径，优先用非推理模型可避免先烧思考配额再输出，更快更稳；
          // 若该模型排队/超时/空输出，自动依次尝试下一个候选。
          const evalCandidates = [
            { model: evalModel, baseUrl: evalBaseUrl, apiKey: evalApiKey, disableThinking: true },
            { model, baseUrl, apiKey },
            { model: backupModel, baseUrl: backupBaseUrl, apiKey: backupApiKey },
          ].filter((c) => c.model && c.baseUrl && c.apiKey);
          let resp: { status: number; content: string; ttftMs: number; totalMs: number } | null = null;
          let evalLastErr: any = null;
          for (const cand of evalCandidates) {
            try {
              resp = await requestWithRetry(cand, `评估模型 ${cand.model}`);
              break;
            } catch (err) {
              evalLastErr = err;
              console.warn(`[chat] 评估模型 ${cand.model} 请求失败:`, (err as any)?.message);
            }
          }
          if (!resp) {
            controller.enqueue(
              encoder.encode(sseEncode("error", `API请求失败: ${(evalLastErr as any)?.message || "评估模型请求失败"}`))
            );
            controller.close();
            return;
          }

          if (resp.status !== 200) {
            controller.enqueue(
              encoder.encode(sseEncode("error", `API请求失败: ${resp.status} ${resp.content.slice(0, 200)}`))
            );
            controller.close();
            return;
          }

          fullContent = resp.content;

          // 失败自动重试：模型偶发流式响应被提前截断（返回极短内容甚至空内容）。
          // 若内容为空或明显残缺，先在当前/备用模型间来回重试，最多 2 次额外尝试。
          if (resp.status === 200 && fullContent.trim().length < 30) {
            // 空/极短返回多因推理型模型把 max_tokens 烧在思考上（finish_reason=length 累计0chars）。
            // 追加"禁止思考"指令后重试，让候选直接出正文，而不是反复空转。
            messages.push({ role: "system", content: "直接输出最终 JSON 结果，禁止输出任何思考过程、解释或额外文字。" });
            console.warn(
              "[chat] LLM 返回内容异常短，自动重试。len:",
              fullContent.length,
              "content:",
              JSON.stringify(fullContent.slice(0, 100))
            );
            // 候选模型列表：评估专用非推理模型（v4-pro 关思考）→ 主模型 → 备用模型
            // 与评估主循环顺序保持一致；用 requestWithRetry 逐个尝试候选模型，
            // 这样首选的评估专用模型即使首次 timeout/短内容，也会换下一个候选再试，
            // 降低"评估空返回"导致卡住等待的概率。
            for (const cand of evalCandidates) {
              try {
                const retryResp = await requestWithRetry(cand, `候选 ${cand.model}`);
                if (retryResp.status === 200 && retryResp.content.trim().length >= 30) {
                  fullContent = retryResp.content;
                  console.log(`[chat] 重试成功，模型 ${cand.model}。len:`, fullContent.length);
                  break;
                }
                console.warn(`[chat] 模型 ${cand.model} 重试仍返回短内容，尝试下一个`);
              } catch (e) {
                console.warn(`[chat] 模型 ${cand.model} 重试异常:`, (e as any)?.message);
              }
            }
          }
          // -------------------------------------------------------------------

          // 解析评估 JSON（json_object 模式确保输出合法 JSON；保留多层鲁棒提取以防万一）
          let assessment: any = null;
          let cleanContent = fullContent
            .replace(/```(?:json|JSON)\s*/g, "")
            .replace(/```/g, "")
            .trim();
          const firstBrace = cleanContent.indexOf("{");
          const lastBrace = cleanContent.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanContent = cleanContent.slice(firstBrace, lastBrace + 1);
          }
          try {
            assessment = JSON.parse(cleanContent);
          } catch (e) {
            console.error(
              "[chat] JSON parse failed. len:",
              fullContent.length,
              "first 500:",
              fullContent.slice(0, 500),
              "LAST 200:",
              fullContent.slice(-200)
            );
            // 1. 修复非法转义后重试
            try {
              assessment = JSON.parse(cleanContent.replace(/\\(?!["\\/bfnrtu])/g, ""));
            } catch {
              // 2. 修复键名后的全角冒号（glm-4 常见：{"text："值"}）后重试
              try {
                assessment = tryParseWithFullwidthColonRepair(cleanContent);
              } catch {
                assessment = null;
              }
              if (!assessment) {
                // 3. 修复 nextDialogue 内未转义引号后重试
                try {
                  assessment = tryParseWithDialogueRepair(cleanContent);
                } catch {
                  assessment = null;
                }
              }
              if (!assessment) {
                // 4. 用迭代截断修复（处理 max_tokens 截断导致的最外层未闭合）。
                //    同时用"未切片"的原始 fullContent 再试，避免 firstBrace/lastBrace
                //    切片切到内部 } 而误删尾部字段。
                try {
                  assessment = tryParseTruncatedJson(cleanContent);
                } catch {
                  assessment = null;
                }
                if (!assessment) {
                  try {
                    assessment = tryParseTruncatedJson(fullContent.replace(/```(?:json|JSON)\s*/g, "").replace(/```/g, "").trim());
                  } catch {
                    assessment = null;
                  }
                }
              }
              if (!assessment) {
                // 5. 去掉末尾未闭合字段后重试
                try {
                  const fixed = cleanContent
                    .replace(/:\s*"[^"]*$/m, ': ""')
                    .replace(/:\s*[\[{][^\]}\]]*$/m, ': null')
                    .replace(/,\s*[}\]]\s*$/, "");
                  assessment = JSON.parse(fixed);
                } catch {
                  assessment = null;
                }
              }
              if (!assessment) {
                // 6. 剥离 alternatives 字段后重试（alternatives 的 text 常被模型输出成畸形文本）
                try {
                  assessment = JSON.parse(stripAlternatives(cleanContent));
                } catch {
                  assessment = null;
                }
                if (!assessment) {
                  try {
                    assessment = tryParseTruncatedJson(stripAlternatives(cleanContent));
                  } catch {
                    assessment = null;
                  }
                }
              }
              if (!assessment) {
                // 7. 从后往前解析所有 {…} 块
                const allJsonBlocks = findAllJsonBlocks(fullContent);
                for (const block of allJsonBlocks.reverse()) {
                  try {
                    assessment = JSON.parse(block);
                    break;
                  } catch {}
                }
              }
            }
          }

          // 提取上一轮成功生成的知识点，用于解析失败时兜底
          const prevAssessment =
            session.assessments.length > 0
              ? session.assessments[session.assessments.length - 1]
              : null;

          if (!assessment) {
            // 解析彻底失败且内容非空时，自动重试一次完整请求（DeepSeek 偶发畸形/截断）
            if (fullContent.trim().length >= 30 && !retried) {
              retried = true;
              console.warn("[chat] JSON 解析失败，自动重试一次请求。原 len:", fullContent.length);
              const retryResp2 = await doRequest(true, undefined, undefined, undefined, ASSESS_MAX_TOKENS, ASSESS_TIMEOUT_MS);
              if (retryResp2.status === 200 && retryResp2.content.trim().length >= 30) {
                fullContent = retryResp2.content;
                const retryClean = fullContent.replace(/```json\s*|```/g, "").trim();
                let rc = retryClean;
                const rfb = rc.indexOf("{");
                const rlb = rc.lastIndexOf("}");
                if (rfb !== -1 && rlb !== -1 && rlb > rfb) rc = rc.slice(rfb, rlb + 1);
                // 对重试内容依次尝试核心解析策略
                const retryAttempts = [
                  () => JSON.parse(rc),
                  () => JSON.parse(rc.replace(/\\(?!["\\/bfnrtu])/g, "")),
                  () => tryParseWithFullwidthColonRepair(rc),
                  () => tryParseWithDialogueRepair(rc),
                  () => tryParseTruncatedJson(rc),
                  () => tryParseTruncatedJson(retryClean),
                ];
                for (const fn of retryAttempts) {
                  try {
                    const r = fn();
                    if (r && typeof r === "object") {
                      assessment = r;
                      console.log("[chat] 重试解析成功。len:", fullContent.length);
                      break;
                    }
                  } catch {}
                }
              }
            }

            // 即使整体 JSON 解析失败，也尽量从原文里把 whyNote / identificationTip 等科普字段
            // 单独提取出来（用宽松正则），避免科普点评显示生硬的占位文案。
            // 注：台词已由第一段独立生成，此处不再负责提取 nextDialogue。
            let fallbackWhy = "";
            const whyMatch = fullContent.match(/"whyNote"\s*[:：]\s*"((?:[^"\\]|\\.)*)/);
            if (whyMatch?.[1]) {
              fallbackWhy = whyMatch[1].replace(/\\(.)/g, "$1").replace(/[\uFFFD]/g, "").trim();
            }
            let fallbackTip = "";
            const tipMatch = fullContent.match(/"identificationTip"\s*[:：]\s*"((?:[^"\\]|\\.)*)/);
            if (tipMatch?.[1]) {
              fallbackTip = tipMatch[1].replace(/\\(.)/g, "$1").replace(/[\uFFFD]/g, "").trim();
            }
            let fallbackAssessment = "";
            const asMatch = fullContent.match(/"assessment"\s*[:：]\s*"((?:[^"\\]|\\.)*)/);
            if (asMatch?.[1]) {
              fallbackAssessment = asMatch[1].replace(/\\(.)/g, "$1").replace(/[\uFFFD]/g, "").trim();
            }
            assessment = {
              trapType: prevAssessment?.trapType || "未识别",
              trapAnalysis: "未能解析评估",
              playerStatus: "shaken",
              // 标记本轮走了兜底：dimensions 是补的假值，前端据此显示"评估未获取到有效数据"、
              // 并把该轮分数排除出本局综合分/最高分结算，避免假 50 分被当成真实成绩
              degraded: true,
              dimensions: {
                boundaryAwareness: 50,
                emotionalStability: 50,
                cognitiveClarity: 50,
                assertiveResponse: 50,
              },
              nextStrategy: "继续施压",
              alternatives: [{ text: "尝试坚持自己的立场", rationale: "清晰的自我表达是抵御操控的第一步" }],
              assessment: fallbackAssessment || "评估解析异常",
              whyNote: fallbackWhy,
              identificationTip: fallbackTip || prevAssessment?.identificationTip || "",
              knowledgePointId: prevAssessment?.knowledgePointId,
              progressNote: "本轮评估未获取到有效数据",
            };
          }

          // 6.5 dimensions 运行时兜底：模型可能输出合法 JSON 却漏掉/写错该键，成功解析分支不会触发上面
          //    的 fallback；若不补齐，推给前端后会在结算读取 a.dimensions.boundaryAwareness 时抛 undefined
          const rawDims: any = assessment.dimensions;
          if (!rawDims || typeof rawDims !== "object") {
            assessment.dimensions = { boundaryAwareness: 50, emotionalStability: 50, cognitiveClarity: 50, assertiveResponse: 50 } as any;
            assessment.degraded = true;
          } else {
            for (const k of ["boundaryAwareness", "emotionalStability", "cognitiveClarity", "assertiveResponse"]) {
              // 缺失/非法维度补成 50 是"假分"：标记 degraded，禁止当作真实成绩参与对比与结算
              if (typeof rawDims[k] !== "number" || !Number.isFinite(rawDims[k])) {
                assessment.degraded = true;
              }
              rawDims[k] = toPercentScore(rawDims[k], 50);
            }
          }

          // 6.5.1 占位评分重试：模型偶发不真正评估，整组直接吐 0/0/0/0 或 50/50/50/50
          //      （实测事故：某局第 2 轮四维全 0、第 3 轮四维全 50，本局综合分被从 80+
          //       拉到 58）。这类值是合法有限数字，6.5 的"必须是数字"校验拦不住，会被当成
          //       真实成绩写进 dimensionHistory、计入本局均分与历史最高分。
          //       命中时补一句强约束重问一次（只试首选评估模型，避免拖慢回合尾部关键路径）；
          //       仍拿不到真实评分则标 degraded，交给既有兜底（不计分、复盘不生成对比文案）。
          if (!assessment.degraded && isPlaceholderDimensions(assessment.dimensions)) {
            console.warn(
              "[chat] 检测到占位评分（四维全等且为 0/50），重试评估一次。原值:",
              JSON.stringify(assessment.dimensions)
            );
            messages.push({
              role: "system",
              content:
                "你上一次输出的四维评分整组等于 0 或 50，属于未真正评估的占位值，判定为无效。" +
                "请依据玩家回应的真实表现重新评估：四个维度分别给出互不相同的 0-100 整数分，" +
                "禁止整组相同，禁止用 0 或 50 填充。只输出完整 JSON，不要任何解释。",
            });
            for (const cand of evalCandidates.slice(0, 1)) {
              try {
                const rr = await requestWithRetry(cand, `评估占位重试 ${cand.model}`);
                const reparsed = rr.status === 200 ? parseAssessmentLoose(rr.content) : null;
                const rd = reparsed?.dimensions;
                if (!rd || typeof rd !== "object") {
                  console.warn(`[chat] 评估占位重试（${cand.model}）未取到 dimensions，保留原评分`);
                  continue;
                }
                for (const k of DIMENSION_KEYS) {
                  rd[k] = toPercentScore(rd[k], NaN);
                }
                if (DIMENSION_KEYS.some((k) => !Number.isFinite(rd[k]))) continue;
                if (isPlaceholderDimensions(rd)) {
                  console.warn(`[chat] 评估占位重试（${cand.model}）仍为占位评分:`, JSON.stringify(rd));
                  continue;
                }
                // 拿到真实评分：整体覆盖数值与文本字段；nextDialogue 已随台词段推送，丢弃
                const rest: any = { ...reparsed };
                delete rest.nextDialogue;
                assessment = { ...assessment, ...rest, dimensions: rd, degraded: false };
                console.log(`[chat] 评估占位重试成功（${cand.model}）:`, JSON.stringify(rd));
                break;
              } catch (e) {
                console.warn(`[chat] 评估占位重试异常（${cand.model}）:`, (e as any)?.message);
              }
            }
            messages.pop(); // 移除本次追加的重试指令，避免污染后续会话上下文
            if (isPlaceholderDimensions(assessment.dimensions)) {
              assessment.degraded = true;
            }
          }
          // 6.6 trapType/playerStatus 运行时兜底：复盘界面直接渲染这两字段并执行
          //     getTrapEmoji(trapType).includes(...)，模型漏键时 undefined 会让复盘/修复界面白屏
          if (typeof assessment.trapType !== "string" || !assessment.trapType.trim()) {
            assessment.trapType = "未识别";
          }
          if (!["effective", "shaken", "trapped"].includes(assessment.playerStatus as any)) {
            assessment.playerStatus = "shaken";
          }
          // 6.7 progressNote 运行时兜底：本关首轮（session.assessments 为空，与上方「上一轮四维评分」
          //     注入依据一致）没有可对比对象，但模型常无视提示词编造“相比上一轮…提升”之类文案，
          //     导致复盘界面第一轮出现自相矛盾的对比句，这里强制改写为固定文案；
          //     非首轮则丢弃自称“第一轮”或为空的文本。
          const rawProgressNote =
            typeof assessment.progressNote === "string" ? assessment.progressNote.trim() : "";
          if (assessment.degraded) {
            // degraded 轮的分数是兜底假值：任何"相比上一轮下降X分"都是拿假数据编的对比，
            // 会把兜底值当成绩误导玩家，这里强制固定说明、不参与对比。
            assessment.progressNote = "本轮评估未获取到有效数据";
          } else if (rawProgressNote !== "本轮评估未获取到有效数据") {
            if (session.assessments.length === 0) {
              assessment.progressNote = "首轮评估";
            } else if (!rawProgressNote || rawProgressNote.includes("第一轮")) {
              assessment.progressNote = "";
            } else {
              assessment.progressNote = rawProgressNote;
            }
          }

          // 7. 后端作为单一真理源判定 NPC 是否认输：
          //    LLM 在第 1 轮就可能违反"连续 2 轮 effective"的规则直接输出 conversationEnded: true，
          //    导致玩家只说一句话就触发胜利。这里由后端按 session.effectiveStreak 自行统计，
          //    并综合当前控制等级决定是否置零，避免单轮投降。
          const isEffective = (assessment.playerStatus === "effective");
          session.effectiveStreak = isEffective ? session.effectiveStreak + 1 : 0;
          // 仅当连续 2 轮 effective 且当前控制 < 30 才视为 NPC 认输
          const npcSurrender = session.effectiveStreak >= 2 && session.npcControlLevel < 30;
          if (npcSurrender || assessment.conversationEnded) {
            // 仅在真正"连续 2 轮有效"的语境下才接受模型给的 conversationEnded；
            // 单轮投降的 conversationEnded 一律忽略，避免模型过早让 NPC 认输。
            if (npcSurrender) {
              session.npcControlLevel = 0;
              session.playerResistance = 100;
            }
            // 把判定结果回写到 assessment，便于前端展示
            assessment.conversationEnded = npcSurrender;
          }

          // 8. NPC 对话内容：第一段台词流已完整推送给前端，此处取同一份文本用于状态计算与历史存储
          const dialogueText = dialogueFull || "……（沉默片刻）你继续说，我在听。";

          // 10. 计算状态变化（先计算，后发送，确保后端是单一事实源）
          let dim = assessment.dimensions;
          if (dim) {
            const resistDelta = 10 - dim.boundaryAwareness / 10;
            // 单轮 NPC 操控变化幅度钳位到 ±15，防止 LLM 输出异常评分（如边界值/缺失）时出现跳变，
            // 导致玩家一句话就把 NPC 操控打归零而提前胜利。
            const rawControlDelta = (50 - dim.assertiveResponse) / 5;
            let controlDelta = Math.max(-15, Math.min(15, rawControlDelta || 0));
            // 明辨铃保底（计划B）：即使评估模型对采纳建议的回应仍给偏低分（最不利情况），
            // 玩家郑重采纳建议也应确定性地换取至少 6 点的 NPC 操控下降，绝不让操控值上升——
            // 与上面的评估注入形成"评估端引导 + 结算端兜底"双重保障。
            if (adoptedInsight && controlDelta > -6) {
              controlDelta = -6;
            }
            session.playerResistance = Math.max(0, Math.min(100, session.playerResistance - resistDelta));
            session.npcControlLevel = Math.max(0, Math.min(100, session.npcControlLevel + controlDelta));
            // 迷雾：被操控（抵抗下降 / 操控上升）则变浓，有效应对则驱散，取两者均值
            const fogDelta = Math.round((resistDelta + controlDelta) / 2);
            session.fogDensity = Math.max(0, Math.min(100, session.fogDensity + fogDelta));
          }

          // 10b. 法器效果：使用法器确定性地驱散迷雾 / 降低操控（后端为单一事实源）
          // 屏蔽类（心盾 / 雾散灯）直接驱散迷雾；镜 / 矛降低 NPC 控制力，间接驱散迷雾
          if (usedArtifact && usedArtifact.type) {
            const power = Number(usedArtifact.power) || 50;
            if (usedArtifact.type === "Shield") {
              session.fogDensity = Math.max(0, session.fogDensity - power);
            } else if (usedArtifact.type === "Mirror" || usedArtifact.type === "Spear") {
              session.npcControlLevel = Math.max(0, Math.min(100, session.npcControlLevel - power));
              session.fogDensity = Math.max(0, session.fogDensity - Math.round(power / 2));
            }
          }

          // 11. 发送评估事件（发送计算后的绝对值）
          controller.enqueue(encoder.encode(sseEncode("control_level", session.npcControlLevel)));
          controller.enqueue(encoder.encode(sseEncode("shield_damage", session.playerResistance)));
          controller.enqueue(encoder.encode(sseEncode("fog", session.fogDensity)));
          controller.enqueue(encoder.encode(sseEncode("assessment", assessment)));

          // 12. 保存到会话历史（assistant 存 NPC 实际说出口的对话，而非整坨评估 JSON，保证轮次间连贯）
          session.messages.push(
            { role: "user", content: finalUserMessage },
            { role: "assistant", content: dialogueText }
          );
          session.turnCount++;
          session.assessments.push(assessment);

          // 13. 发送完成事件
          controller.enqueue(
            encoder.encode(
              sseEncode("done", {
                turnCount: session.turnCount,
                playerResistance: session.playerResistance,
                npcControlLevel: session.npcControlLevel,
              })
            )
          );

          // 回合总耗时汇总（含所有重试与解析处理），方便定位慢在哪一环
          console.log(
            `[chat] 回合完成 total=${Date.now() - turnStartAt}ms fullContent=${fullContent.length}chars ` +
              `turn=${session.turnCount} 是否触发过重试=${retried}`
          );
          // 诊断：评估关键字段是否完整，确认前端"评估未显示"是否源于字段缺失
          console.log(
            `[chat] assessment字段 trapType=${assessment.trapType ? "有" : "空"} ` +
              `playerStatus=${assessment.playerStatus} ` +
              `whyNote=${assessment.whyNote ? assessment.whyNote.length + "字" : "空"} ` +
              `identificationTip=${assessment.identificationTip ? assessment.identificationTip.length + "字" : "空"} ` +
              `dimensions=${assessment.dimensions ? JSON.stringify(assessment.dimensions) : "空"}`
          );
          controller.close();
        } catch (err: any) {
          if (err.name === "TimeoutError") {
            controller.enqueue(encoder.encode(sseEncode("error", "请求超时")));
          } else {
            controller.enqueue(encoder.encode(sseEncode("error", err.message || "未知错误")));
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "请求处理失败" }, { status: 500 });
  }
}