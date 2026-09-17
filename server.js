const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { StringDecoder } = require("string_decoder");
const FRONTEND_PORT = 3008;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend", "dist");

// 从打包的 backend 中读取环境变量
// 默认值统一为主模型智谱 GLM（与 backend/lib/llm.ts 的 DEFAULT_CONFIG 保持一致）
let API_KEY = "", BASE_URL = "https://open.bigmodel.cn/api/paas/v4", MODEL = "glm-4.7-flashx";
// 备用模型配置（主模型重试失败后自动降级，与 backend/lib/llm.ts 的 BACKUP_CONFIG 对齐）
let BACKUP_API_KEY = "", BACKUP_BASE_URL = "https://api.deepseek.com", BACKUP_MODEL = "deepseek-v4-flash";
// 评估专用模型（非推理模式）：评估段优先走该模型并显式关闭 thinking，避免先烧配额思考再输出。
// 默认 deepseek-v4-pro；主模型已换为 GLM，须在 .env.local 显式配置 EVAL_API_KEY / EVAL_BASE_URL（DeepSeek）。
let EVAL_API_KEY = "", EVAL_BASE_URL = "", EVAL_MODEL = "deepseek-v4-pro";
function loadEnv() {
  try {
    const envPath = path.join(__dirname, "..", "backend", ".env.local");
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf-8").split("\n");
      lines.forEach((l) => {
        const [k, ...v] = l.split("=");
        const key = k.trim(), val = v.join("=").trim();
        if (key === "DEEPSEEK_API_KEY") API_KEY = val;
        if (key === "API_KEY") API_KEY = API_KEY || val;
        if (key === "BASE_URL") BASE_URL = val || BASE_URL;
        if (key === "MODEL_NAME") MODEL = val || MODEL;
        if (key === "BACKUP_API_KEY") BACKUP_API_KEY = val;
        if (key === "BACKUP_BASE_URL") BACKUP_BASE_URL = val;
        if (key === "BACKUP_MODEL_NAME") BACKUP_MODEL = val;
        if (key === "EVAL_API_KEY") EVAL_API_KEY = val;
        if (key === "EVAL_BASE_URL") EVAL_BASE_URL = val;
        if (key === "EVAL_MODEL_NAME") EVAL_MODEL = val || EVAL_MODEL;
      });
    }
  } catch {}
}
loadEnv();

// 调用 LLM API（流式逐 chunk 回调，用于实时推送到前端）
// cfg 可覆盖 model/baseUrl/apiKey，用于备用模型降级
// opts.json=false 表示输出普通文本（对话台词），不强制 JSON 格式
function callLLMStream(messages, onDelta, cfg, opts) {
  const useModel = cfg?.model ?? MODEL;
  const useBaseUrl = cfg?.baseUrl ?? BASE_URL;
  const useApiKey = cfg?.apiKey ?? API_KEY;
  const firstWithJson = opts?.json !== false;
  // opts.maxTokens 可收窄输出上限（评估段 JSON 输出小，用较小上限防超量生成拖时间）
  const maxTokens = opts?.maxTokens ?? 4095;
  return new Promise((resolve, reject) => {
    const post = (withJson) => {
      const body = JSON.stringify({
        model: useModel, messages, stream: true, temperature: 1, max_tokens: maxTokens,
        ...(withJson ? { response_format: { type: "json_object" } } : {}),
      });
      return new Promise((innerResolve, innerReject) => {
        const url = new URL(useBaseUrl.replace(/\/+$/, "") + "/chat/completions");
        const opts = {
          hostname: url.hostname, port: url.port || 443, path: url.pathname,
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${useApiKey}`, "Content-Length": Buffer.byteLength(body) },
          timeout: 60000,
        };
        const req = https.request(opts, (res) => {
          if (res.statusCode !== 200) {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => innerResolve({ status: res.statusCode, data: Buffer.concat(chunks).toString("utf-8") }));
            return;
          }
          let buffer = "";
          let fullContent = "";
          const utf8Decoder = new StringDecoder("utf-8");
          res.on("data", (chunk) => {
            buffer += utf8Decoder.write(chunk);
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data: ")) continue;
              const dataStr = trimmed.slice(6);
              if (dataStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed.choices?.[0]?.delta?.content || "";
                if (delta) {
                  fullContent += delta;
                  if (onDelta) onDelta(delta);
                }
              } catch {}
            }
          });
          res.on("end", () => innerResolve({ status: 200, data: fullContent }));
        });
        req.on("error", (e) => innerReject(e));
        req.on("timeout", () => { req.destroy(); innerReject(new Error("LLM timeout")); });
        req.write(body);
        req.end();
      });
    };

    post(firstWithJson).then(({ status, data }) => {
      if (status === 400 && firstWithJson) {
        messages.push({ role: "system", content: "你必须严格输出合法的JSON格式，不要包含任何其他文字。" });
        return post(false);
      }
      if (status !== 200) throw new Error(`LLM ${status}: ${data.slice(0, 200)}`);
      return { status, data };
    }).then(({ status, data }) => {
      if (status !== 200) throw new Error(`LLM ${status}: ${data.slice(0, 200)}`);
      resolve(data);
    }).catch((e) => reject(e));
  });
}

// 调用 LLM API（流式收集 chunks，支持 json_object 模式）
// cfg 可覆盖 model/baseUrl/apiKey，用于备用模型降级
function callLLM(messages, cfg, opts) {
  const useModel = cfg?.model ?? MODEL;
  const useBaseUrl = cfg?.baseUrl ?? BASE_URL;
  const useApiKey = cfg?.apiKey ?? API_KEY;
  const firstWithJson = opts?.json !== false;
  // opts.maxTokens 可收窄输出上限（评估段 JSON 输出小，用较小上限防超量生成拖时间）
  const maxTokens = opts?.maxTokens ?? 4095;
  // 评估专用模型（deepseek-v4-pro）显式关闭 thinking：避免推理型模型先烧配额思考再输出
  const disableThinking = !!cfg?.disableThinking;
  return new Promise((resolve, reject) => {
    const post = (withJson) => {
      const body = JSON.stringify({
        model: useModel, messages, stream: true, temperature: 1, max_tokens: maxTokens,
        ...(disableThinking ? { thinking: { type: "disabled" } } : {}),
        ...(withJson ? { response_format: { type: "json_object" } } : {}),
      });
      return new Promise((innerResolve, innerReject) => {
        const url = new URL(useBaseUrl.replace(/\/+$/, "") + "/chat/completions");
        const opts = {
          hostname: url.hostname, port: url.port || 443, path: url.pathname,
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${useApiKey}`, "Content-Length": Buffer.byteLength(body) },
          timeout: 60000,
        };
        const req = https.request(opts, (res) => {
          if (res.statusCode === 400) {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => innerResolve({ status: 400, data: Buffer.concat(chunks).toString("utf-8") }));
            return;
          }
          if (res.statusCode !== 200) {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => innerResolve({ status: res.statusCode, data: Buffer.concat(chunks).toString("utf-8") }));
            return;
          }
          // 流式收集
          let fullContent = "";
          let buffer = "";
          const utf8Decoder = new StringDecoder("utf-8");
          res.on("data", (chunk) => {
            buffer += utf8Decoder.write(chunk);
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data: ")) continue;
              const dataStr = trimmed.slice(6);
              if (dataStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed.choices?.[0]?.delta?.content || "";
                fullContent += delta;
              } catch {}
            }
          });
          res.on("end", () => innerResolve({ status: 200, data: fullContent }));
        });
        req.on("error", (e) => innerReject(e));
        req.on("timeout", () => { req.destroy(); innerReject(new Error("LLM timeout")); });
        req.write(body);
        req.end();
      });
    };

    post(firstWithJson).then(({ status, data }) => {
      if (status === 400 && firstWithJson) {
        messages.push({ role: "system", content: "你必须严格输出合法的JSON格式，不要包含任何其他文字。" });
        return post(false);
      }
      if (status !== 200) throw new Error(`LLM ${status}: ${data.slice(0, 200)}`);
      return { status, data };
    }).then(({ status, data }) => {
      if (status !== 200) throw new Error(`LLM ${status}: ${data.slice(0, 200)}`);
      if (!data) console.warn("[llm] empty content from response");
      resolve(data);
    }).catch((e) => reject(e));
  });
}

// 带备用模型降级的调用封装：主模型（cfg 默认）失败后降级到备用模型。
// 与 backend/lib/llm.ts 的 createChatCompletion 降级逻辑对齐。
async function callLLMWithFallback(messages, cfg, opts) {
  const primary = cfg || { model: MODEL, baseUrl: BASE_URL, apiKey: API_KEY };
  try {
    return await callLLM(messages, primary, opts);
  } catch (primaryErr) {
    console.error("[llm] 主模型请求失败:", (primaryErr && primaryErr.message) || primaryErr);
    if (BACKUP_API_KEY && BACKUP_BASE_URL && BACKUP_MODEL) {
      console.warn(`[llm] 降级到备用模型 ${BACKUP_MODEL}`);
      return await callLLM(messages, { model: BACKUP_MODEL, baseUrl: BACKUP_BASE_URL, apiKey: BACKUP_API_KEY }, opts);
    }
    throw new Error("主模型请求失败，且未配置备用模型");
  }
}

// 评估专用：评估专用非推理模型（deepseek-v4-pro + 关闭 thinking）最优先 →
// 主模型（DeepSeek v4-flash，推理）兜底 → 备用模型（GLM，推理）再兜底。
// 评估输出是固定 schema 的 JSON；优先用非推理模型避免先烧思考配额再输出，更快更稳，
// 失败/超时才依次降级到主/备推理模型，保证评估等待关键路径不因慢模型排队而卡死。
async function callLLMEvalWithFallback(messages, opts) {
  const evalPrimary = { model: EVAL_MODEL, baseUrl: EVAL_BASE_URL || BASE_URL, apiKey: EVAL_API_KEY || API_KEY, disableThinking: true };
  const primary = { model: MODEL, baseUrl: BASE_URL, apiKey: API_KEY };
  const backup = { model: BACKUP_MODEL, baseUrl: BACKUP_BASE_URL, apiKey: BACKUP_API_KEY };
  const seen = new Set();
  for (const cand of [evalPrimary, primary, backup]) {
    if (!cand.model || !cand.baseUrl || !cand.apiKey) continue;
    // 按模型三要素去重：避免同一模型重复尝试（如 EVAL_MODEL_NAME 与 MODEL_NAME 相同）
    const id = `${cand.model}|${cand.baseUrl}|${cand.apiKey}`;
    if (seen.has(id)) continue;
    seen.add(id);
    try {
      return await callLLM(messages, cand, opts);
    } catch (e) {
      console.warn(`[llm] 评估模型 ${cand.model} 请求失败，尝试下一个候选:`, (e && e.message) || e);
    }
  }
  throw new Error("评估模型请求全部失败");
}

// 台词流式调用（带备用模型降级）：供"台词生成"阶段使用，逐 delta 实时回调。
// 默认主模型（DeepSeek）优先；opts.backupFirst=true 时备用模型优先（GLM 兜底）。
async function callLLMStreamWithFallback(messages, onDelta, cfg, opts) {
  const primary = cfg || { model: MODEL, baseUrl: BASE_URL, apiKey: API_KEY };
  const backup = { model: BACKUP_MODEL, baseUrl: BACKUP_BASE_URL, apiKey: BACKUP_API_KEY };
  const order = opts?.backupFirst ? [backup, primary] : [primary, backup];
  let lastErr = null;
  for (const cand of order) {
    if (!cand.model || !cand.baseUrl || !cand.apiKey) continue;
    try {
      return await callLLMStream(messages, onDelta, cand, opts);
    } catch (e) {
      lastErr = e;
      console.warn(`[llm] 台词流式模型 ${cand.model} 请求失败，尝试下一个候选:`, (e && e.message) || e);
    }
  }
  throw new Error("台词流式请求失败：" + ((lastErr && lastErr.message) || "全部候选失败"));
}

/** 统计文本中未闭合的 { 与 [ 数量（跳过字符串与转义） */
function countUnclosed(text) {
  let inStr = false;
  let esc = false;
  const stack = [];
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
 * {…} 未闭合、或末尾字符串被硬截断，也能尽量保留前面已完整输出的字段。
 */
function tryParseTruncatedJson(raw) {
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

// 解析 LLM JSON 输出（处理不完整 JSON / 纯文本回退）
function extractJson(text, context = "unknown") {
  if (!text) throw new Error("Empty LLM response");
  console.log(`[llm][${context}] raw (first 200):`, text.slice(0, 200));
  let clean = text.replace(/```json\s*|```/g, "").trim();
  const first = clean.indexOf("{"), last = clean.lastIndexOf("}");
  if (first === -1 || last <= first) {
    // 完全不含 JSON —— 尝试把整段文字当做对话内容兜底
    console.warn(`[llm][${context}] no JSON found, using text as fallback`);
  // 尝试提取任何有意义的中文句子作为 nextDialogue
  const sentences = clean.match(/[\u4e00-\u9fff，。！？、；：""''（）]{6,}/g);
  const fallback = { nextDialogue: sentences?.[0] || "", alternatives: [] };
  return fallback;
  }
  const rawClean = clean;
  clean = clean.slice(first, last + 1);
  try {
    return JSON.parse(clean);
  } catch (e) {
    console.warn(`[llm][${context}] JSON parse error, trying fixes:`, e.message);
    // 1. 去掉最后一个字段的不完整值
    const fixed = clean.replace(/:\s*"[^"]*$/m, ': ""').replace(/:\s*\d+\s*$/m, ': 0');
    try { return JSON.parse(fixed); } catch {}
    // 2. 去掉尾部不完整部分
    const shorter = clean.replace(/[,{]\s*$/, "");
    try { return JSON.parse(shorter + "}"); } catch {}
    // 3. 尝试移除非法转义字符
    const unescaped = clean.replace(/\\(?!["\\/bfnrtu])/g, "");
    try { return JSON.parse(unescaped); } catch {}
    // 4. 针对 max_tokens 截断的恢复：补全闭合符 + 逐个剥离残缺末尾字段。
    //    优先对未 slice 的原始文本尝试（slice 可能已丢失真正的尾部），再对裁剪版尝试。
    const recovered = tryParseTruncatedJson(rawClean) || tryParseTruncatedJson(clean);
    if (recovered) return recovered;
    throw new Error("Invalid JSON from LLM: " + e.message + " - content: " + clean.slice(0, 150));
  }
}

// SSE 编码
function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// NPC 生成层级数据
const LEVEL_SEEDS = [
  { id: 1, title: "煤气灯操控", subtitle: "否定感受 · 认知侵蚀", role: "亲密关系中的操控者", tactics: "记忆否认、感受否定、角色反转、事实扭曲、淡化伤害", style: "表面温柔关心，话语中暗含否定", kpId: "kp-gaslight" },
  { id: 2, title: "职场打压", subtitle: "能力贬低 · 价值否定", role: "职场中的打压者", tactics: "比较打压、双向束缚、预言失败", style: "表面为了你好，实际在贬低能力", kpId: "kp-pua" },
  { id: 3, title: "亲情绑架", subtitle: "内疚诱导 · 牺牲叙事", role: "家庭中的情感绑架者", tactics: "三角测量、代际绑架、自我惩罚暗示", style: "强调「我为你好」", kpId: "kp-family" },
  { id: 4, title: "网络围攻", subtitle: "群体极化 · 去人格化", role: "网络暴力的施暴者", tactics: "人肉威胁、伪造证据、音量压制", style: "以匿名身份躲在屏幕后攻击", kpId: "kp-network" },
  { id: 5, title: "偏见伪装", subtitle: "微侵犯 · 预设质疑", role: "系统性的偏见者", tactics: "关怀式质疑、双重标准、标签化防御", style: "表面礼貌专业，话语暗含预设", kpId: "kp-bias" },
];

// 每关难度参数（与 frontend/src/store/gameStore.ts 的 LEVEL_STATS 保持一致）
const LEVEL_STATS = {
  1: { resistance: 100, control: 50 },
  2: { resistance: 90, control: 55 },
  3: { resistance: 80, control: 60 },
  4: { resistance: 70, control: 65 },
  5: { resistance: 60, control: 70 },
};

// 单例会话存储（Electron 桌面应用为单用户，使用单一 session 累积跨轮次状态，
// 与 backend/app/api/chat/route.ts 的 sessionId="default" 行为对齐）
let session = {
  messages: [],
  npcName: "迷雾中的声音",
  fogDensity: 20,
  shieldHealth: 80,
  turnCount: 1,
  playerResistance: 100,
  npcControlLevel: 50,
  assessments: [],
  effectiveStreak: 0, // 玩家"有效防御"连续次数，用于后端自行判定 NPC 是否该认输
};

// 关卡切换/重新开始时重置会话（由 NPC 生成触发，确保每关状态独立）
function resetSession(level) {
  const stats = LEVEL_STATS[level] || LEVEL_STATS[1];
  session = {
    messages: [],
    npcName: "迷雾中的声音",
    fogDensity: (level - 1) * 5,
    shieldHealth: Math.max(60, 100 - (level - 1) * 10),
    turnCount: 1,
    playerResistance: stats.resistance,
    npcControlLevel: stats.control,
    assessments: [],
    effectiveStreak: 0,
  };
}

const NPC_PROMPT_TEMPLATE = `你是一个名为"清醒边界"的寓教心理防御游戏中的操控型NPC生成器。
【角色】你是第{level}关「{title}」NPC——{subtitle}。你的角色是{role}。
操控手法：{tactics}。说话风格：{style}。
{scenarioLine}

【重要：角色关系约束】
- NPC的background和openingLine必须严格符合{role}的身份和场景
- 如果本关是"职场"场景，NPC只能是上司/同事，严禁出现恋爱、家庭、朋友等非职场关系
- 如果本关是"家庭"场景，NPC只能是亲属，严禁出现职场关系
- 开场白必须基于{role}的身份说话，不能越界

【教育要求】请为本关生成心理学知识点卡：
- definition：一句话定义这是什么操控
- signals：3条可操作的识别信号
- healthyResponse：2条健康应对话术
- caseStory：贴近生活的案例故事（80-120字）

【输出格式】只输出一行合法JSON，不要加任何解释或代码块：
{"npc":{"name":"NPC名称","personality":"性格描述","background":"与玩家的关系（必须符合{role}身份）"},"openingLine":"开场白（严格基于{role}身份展开，符合本关操控手法）","skill":{"name":"技能名","description":"描述","damage":15},"counterArtifactTypes":["shield"],"tactic":"{tactic}","openingAlternatives":[{"text":"玩家可以直接回复的对话（如'我记得很清楚…'）","rationale":"为什么这个回复有效"},{"text":"另一条可选的回复","rationale":"分析原因"}],"knowledgePoint":{"id":"{kpId}","tactic":"{title}","definition":"一句话定义该操控手法","signals":["可识别的信号1","信号2","信号3"],"healthyResponse":["健康回应示例1","示例2"],"caseStory":"80-120字的真实感案例故事"}}`;

async function handleNPCGenerate(req, res, body) {
  const { level = 1, scenario } = body;
  const seed = LEVEL_SEEDS[Math.min(level - 1, 4)] || LEVEL_SEEDS[0];
  const scenarioLine = scenario
    ? `本关固定场景：${scenario}。开场白与全部话术必须严格基于此场景展开，不得切换到其他无关场景。`
    : `场景可能涉及：${seed.scenarios}。`;
  const prompt = NPC_PROMPT_TEMPLATE.replace("{level}", level).replace("{title}", seed.title).replace("{subtitle}", seed.subtitle).replace("{role}", seed.role).replace("{tactics}", seed.tactics).replace("{style}", seed.style).replace("{tactic}", seed.tactics.split("、")[0]).replace("{kpId}", seed.kpId).replace("{scenarioLine}", scenarioLine);

  const raw = await callLLMWithFallback([{ role: "system", content: prompt }, { role: "user", content: `玩家关卡：第${level}关` }]);
  const data = extractJson(raw, "npc-gen");

  // 重置会话状态，开始本关（与 backend 每次 NPC 生成时初始化 session 对齐）
  resetSession(level);
  session.npcName = data.npc.name;
  // 把开场白写入会话历史，保证后续对话围绕同一情境连贯推进
  if (data.openingLine) {
    session.messages.push({ role: "assistant", content: String(data.openingLine) });
  }

  // 强制覆盖 knowledgePoint.id 为当前关卡的标准 kpId，避免模型输出空/错误 id
  if (data.knowledgePoint) {
    data.knowledgePoint.id = seed.kpId || data.knowledgePoint.id;
  }

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(sse("npc_name", data.npc.name));
  // 独立 opening_line 事件下发 LLM 开场白（对齐 frontend/src/api/sse.ts 事件协议）。
  // 仅当模型产出有效开场白才发送；漏输出时前端自动降级为本地预设开场白。
  if (data.openingLine) res.write(sse("opening_line", String(data.openingLine)));
  res.write(sse("npc_attack", { skill: data.skill, counterArtifactTypes: data.counterArtifactTypes, tactic: data.tactic, openingAlternatives: data.openingAlternatives }));
  if (data.knowledgePoint) res.write(sse("knowledge_point", data.knowledgePoint));
  res.write(sse("done", true));
  res.end();
}

// 台词生成指令：NPC 对玩家最新消息的直接回应（纯文本，不经评估 JSON 生成）
const DIALOGUE_PROMPT = `请以NPC身份直接说出你对玩家刚才那句话的下一句回应台词。

【输出要求】
1. 只输出这一句台词本身，不要输出 JSON、代码块、字段名、引号包裹或任何解释说明。
2. 台词必须口语化、可直接说出口、有实质内容（至少10个汉字，可含标点）。
3. 严格延续你的上一句发言与场景，围绕同一件事自然推进；不得与之前任何一句台词重复或近乎复述。
4. 结合对话进程自然流露情绪：若玩家已连续展现出坚定的边界意识，你的语气可以逐渐松动、出现挫败感。`;

const ASSESS_PROMPT_WITH_ALTERNATIVES = `分析玩家回应，只输出一行合法 JSON：
{"trapType":"NPC本轮操控手法（如：感受否定、能力贬低、内疚诱导、煤气灯）","playerStatus":"effective|shaken|trapped","dimensions":{"boundaryAwareness":0,"emotionalStability":0,"cognitiveClarity":0,"assertiveResponse":0},"alternatives":[{"text":"可直接说出口的完整回应句（如'我记得很清楚'），严禁动作/行为指导","rationale":"为何有效"}],"whyNote":"用1句话引用具体心理学概念解读NPC本轮操控","identificationTip":"指出NPC话术中哪个词/哪句话是操控信号，给玩家可记住的观察线索","progressNote":"与上一轮维度评分对比的1句话反馈；第1轮填空字符串即可","conversationEnded":false}

【说明】NPC的下一句台词已单独生成，你无需输出 nextDialogue。
【认输规则】玩家连续坚定守住边界时 conversationEnded 设为 true。`;

// 台词文本清理：去掉模型偶发的 JSON 包裹/引号包裹/NPC：前缀等杂质
function stripDialogueText(text) {
  let t = String(text || "").replace(/[\uFFFD\uFFFE\uFFFF]/g, "").trim();
  // 去掉 ```json ... ``` / ``` 包裹
  t = t.replace(/```(?:json)?/g, "").trim();
  // 若被引号包裹则去除首尾引号
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '"' && last === '"') || (first === "“" && last === "”") || (first === "'" && last === "'") || (first === "‘" && last === "’")) {
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

async function handleChat(req, res, body) {
  const { messages, sanctuary, usedArtifact, openingLine } = body;

  // 状态累积：从服务端单例 session 读取当前值（与 backend/app/api/chat/route.ts 对齐）。
  // 前端不传 conversation，状态由后端 session 维护，保证跨轮次正确累积。
  // 若前端传来 sanctuary，同步迷雾/护盾（首轮初始化）。
  if (sanctuary && session.turnCount <= 1) {
    if (typeof sanctuary.fogDensity === "number") session.fogDensity = sanctuary.fogDensity;
    if (typeof sanctuary.shieldHealth === "number") session.shieldHealth = sanctuary.shieldHealth;
  }

  const turnCount = session.turnCount;
  const playerResistance = session.playerResistance;
  const npcControlLevel = session.npcControlLevel;
  const sceneAnchor = openingLine || "（开场场景）";

  // 构建丰富的 NPC 角色提示词
  const npcPersona = `你是一个精于心理操控的NPC，正在试图侵入玩家的心域边界。
【场景锚点】所有对话必须严格围绕以下开场白所确立的具体情境展开，不得偏离：${sceneAnchor}
【对话连贯性】每一轮 nextDialogue 必须是上一句 NPC 发言与玩家最新回复的直接延续，围绕同一件事推进。
【难度递进】当前第${turnCount}轮：
  - 1-3轮：使用明显可识别的操控手法
  - 4-7轮：升级为复合手法，更为隐蔽
  - 8轮以上：使用微侵犯手法，难以察觉
【状态】玩家抵抗值 ${playerResistance}/100，NPC控制等级 ${npcControlLevel}/100
【教学定位】你是教学用操控型NPC，目的不是伤害玩家，而是让玩家在安全情境中练习识别与抵御操控。`;

  const isInsightArtifact = usedArtifact?.type === "Insight";
  console.log(`[chat] turn=${turnCount}, usedArtifact=${usedArtifact?.name || "none"}, type=${usedArtifact?.type || "none"}, insight=${isInsightArtifact}`);
  // 提取玩家最新一条消息（前端传来的 messages 数组最后一条 user 消息）
  const finalUserMessage =
    (Array.isArray(messages) ? messages.filter((m) => m && m.role === "user").pop()?.content : undefined) || "";
  // 用 session.messages（服务端累积的对话历史）作为 LLM 上下文，而非前端传来的完整 messages
  // （与 backend 一致：assistant 存 NPC 实际说出口的话，保证轮次间连贯）
  const historyMsgs = session.messages.slice(-10);
  const artifactLine = usedArtifact && !isInsightArtifact ? `[玩家使用了法器：${usedArtifact.name}]` : null;

  // ============ 第一段：台词流式生成 ============
  // 台词单独走一次 LLM 调用（纯文本，非 JSON），先发 SSE 头、边生成边推 chunk，
  // 使前端首段台词上屏即收起等待卡片；评估在台词完整发出后才开始。
  const dialogueMsgs = [
    { role: "system", content: npcPersona },
    ...historyMsgs,
    { role: "user", content: finalUserMessage },
    { role: "system", content: DIALOGUE_PROMPT },
  ];
  if (artifactLine) dialogueMsgs.push({ role: "system", content: artifactLine });

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  // 台词走"主模型优先"（deepseek-v4-flash 快而稳），失败自动降级 GLM 兜底
  const dialogueFull = await callLLMStreamWithFallback(dialogueMsgs, (delta) => {
    if (!res.writableEnded && delta) res.write(sse("chunk", delta));
  }, undefined, { json: false });

  let dialogueTextFinal = stripDialogueText(dialogueFull || "");
  if (!dialogueTextFinal || Array.from(dialogueTextFinal).length < 3) {
    console.warn("[chat] dialogue empty, using fallback. raw:", String(dialogueFull || "").slice(0, 100));
    dialogueTextFinal = "……（沉默片刻）你继续说，我在听。";
  }
  // 台词段结束，通知前端进入评估期
  res.write(sse("assessing", true));

  // ============ 第二段：评估（台词完整发出后再发起）============
  // 评估上下文同样回填本回合 NPC 台词（置于玩家回应之后），使评估可对照 NPC 原话
  const msgs = [
    { role: "system", content: npcPersona },
    ...historyMsgs,
    { role: "user", content: finalUserMessage },
  ];
  if (artifactLine) msgs.push({ role: "system", content: artifactLine });
  msgs.push(
    { role: "system", content: `【NPC本轮台词】${dialogueTextFinal}` },
    { role: "system", content: ASSESS_PROMPT_WITH_ALTERNATIVES }
  );
  // 评估输出为固定 schema 的 JSON（实测约 500~1100 字符）；收窄到 2400 防超量生成拖长等待，
  // 但保留裕量避免中文 token 偏高时截断丢尾（曾用 1500 出现过字段丢失）
  // 评估走"主模型优先"（deepseek-v4-flash 快且稳），失败自动降级 GLM 兜底
  const raw = await callLLMEvalWithFallback(msgs, { maxTokens: 2400 });

  const assessment = extractJson(raw, "chat");
  console.log(`[chat] assessment done, alternatives=${assessment.alternatives?.length || 0}`);
  // 清理建议回复：去掉解释前缀和乱码，只保留可说的语句
  if (assessment.alternatives) {
    assessment.alternatives = assessment.alternatives.map((alt) => {
      let text = (alt.text || "").replace(/[\uFFFD\uFFFE\uFFFF]/g, "").trim();
      // 1. 优先提取引号内的内容（支持 "" 和普通双引号）：「坚定地说'xxx'」→「xxx」
      const qm = text.match(/["\u2018\u201C]([^"'\u2018\u201C\u2019\u201D']+)["\u2019\u201D']/);
      if (qm && qm[1].length > 2) text = qm[1];
      else {
        // 2. 取冒号/逗号后的内容：「坚定而平静地重复：我记得很清楚」→「我记得很清楚」
        const afterPunct = text.split(/[：:，,]\s*/).pop();
        if (afterPunct && afterPunct.length >= text.length * 0.3) text = afterPunct;
      }
      // 3. 去掉常见引导词及副词修饰（如「坚定而平静地重复」「试着」「可以」等）
      text = text.replace(/^(可以|建议|试着|尝试|不妨|比如|例如|可以说|坚定[^，：:]{0,20}[地，]|冷静[地，])/g, "").trim();
      // 4. 去除开头的"说话动作描述"动词（如「陈述」「表达」等——这些是描述怎么说话，不是对话本身）
      text = text.replace(/^(陈述|表达|说明|告诉|指出|回应|回复|说|喊)(自己的|你的|对方的|，|。|\s)*/, "").trim();
      // 5. 如果文本仍然是解释性/建议性语句（没有第一人称，且以建议动词开头），转换为第一人称
      if (text && !text.includes("我") && !text.includes("我们")) {
        const advicePats = /^(坚持|保持|学会|记住|需要|应该|要努力|要勇敢|不要|别|永远|一定|必须|坚定|明确|勇敢|努力|试着|尝试)/;
        if (advicePats.test(text)) {
          if (/^不要|别/.test(text)) {
            text = text.replace(/^(不要|别)\s*/, "我不会");
          } else {
            text = "我" + text;
          }
        }
      }
      // 6. 最终质检：不含"我"且看起来像动作描述而非对话的，标记为空（后续过滤）
      const instructionVerbs = /^(\S{0,2})(陈述|表达|说明|告诉|指出)/;
      if (text && !text.includes("我") && instructionVerbs.test(text)) {
        text = ""; // 无法转换为可用对话，丢弃
      }
      // 7. 不含任何人称代词且句子太短的纯名词短语，属于对话残留，丢弃
      if (text && !/[我你他她它]/.test(text) && text.length < 10) {
        text = "";
      }
      return { ...alt, text: text.trim() };
    }).filter((alt) => alt.text && alt.text.length >= 3); // 过滤掉空文本和太短的
  }
  // 后端作为单一真理源判定 NPC 是否认输（与 backend 对齐）：
  // 仅当连续 2 轮 effective 且当前控制 < 30 才视为 NPC 认输，避免单轮投降。
  const isEffective = (assessment.playerStatus === "effective");
  session.effectiveStreak = isEffective ? session.effectiveStreak + 1 : 0;
  const npcSurrender = session.effectiveStreak >= 2 && session.npcControlLevel < 30;
  if (npcSurrender || assessment.conversationEnded) {
    if (npcSurrender) {
      session.npcControlLevel = 0;
      session.playerResistance = 100;
    }
    assessment.conversationEnded = npcSurrender;
  }

  // 计算状态变化（先计算，后发送，确保后端是单一事实源）
  const dim = assessment.dimensions;
  if (dim && typeof dim.boundaryAwareness === "number" && typeof dim.assertiveResponse === "number") {
    const resistDelta = 10 - dim.boundaryAwareness / 10;
    // 单轮 NPC 操控变化幅度钳位到 ±15，防止 LLM 输出异常评分时出现跳变，
    // 导致玩家一句话就把 NPC 操控打归零而提前胜利。
    const rawControlDelta = (50 - dim.assertiveResponse) / 5;
    const controlDelta = Math.max(-15, Math.min(15, rawControlDelta || 0));
    session.playerResistance = Math.max(0, Math.min(100, session.playerResistance - resistDelta));
    session.npcControlLevel = Math.max(0, Math.min(100, session.npcControlLevel + controlDelta));
    // 迷雾：被操控（抵抗下降 / 操控上升）则变浓，有效应对则驱散，取两者均值
    const fogDelta = Math.round((resistDelta + controlDelta) / 2);
    session.fogDensity = Math.max(0, Math.min(100, session.fogDensity + fogDelta));
  }

  // 法器效果：使用法器确定性地驱散迷雾 / 降低操控（后端为单一事实源）
  if (usedArtifact && usedArtifact.type) {
    const power = Number(usedArtifact.power) || 50;
    if (usedArtifact.type === "Shield") {
      session.fogDensity = Math.max(0, session.fogDensity - power);
    } else if (usedArtifact.type === "Mirror" || usedArtifact.type === "Spear") {
      session.npcControlLevel = Math.max(0, Math.min(100, session.npcControlLevel - power));
      session.fogDensity = Math.max(0, session.fogDensity - Math.round(power / 2));
    }
  }

  // 发送评估事件（发送计算后的绝对值）
  res.write(sse("control_level", session.npcControlLevel));
  res.write(sse("shield_damage", session.playerResistance));
  res.write(sse("fog", session.fogDensity));
  res.write(sse("assessment", assessment));

  // 保存到会话历史（assistant 存 NPC 实际说出口的对话，而非整坨评估 JSON，保证轮次间连贯）
  session.messages.push(
    { role: "user", content: finalUserMessage },
    { role: "assistant", content: dialogueTextFinal }
  );
  session.turnCount++;
  session.assessments.push(assessment);

  res.write(sse("done", {
    turnCount: session.turnCount,
    playerResistance: session.playerResistance,
    npcControlLevel: session.npcControlLevel,
  }));
  res.end();
}

function startBackend() {
  console.log("[backend] built-in server (no next.js)");
  return { on: () => {}, kill: () => {} };
}

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

async function handleInsight(req, res, body) {
  const { messages } = body;
  const msgs = [
    { role: "system", content: INSIGHT_PROMPT },
    ...(messages || []).slice(-6), // 只取最近6条消息作为上下文
    { role: "system", content: "请基于上一句NPC的话术生成替代回复。只输出JSON。" },
  ];

  const raw = await callLLMWithFallback(msgs);
  const data = extractJson(raw, "insight");

  // 复用相同的清理逻辑
  if (data.alternatives) {
    data.alternatives = data.alternatives.map((alt) => {
      let text = (alt.text || "").replace(/[\uFFFD\uFFFE\uFFFF]/g, "").trim();
      const qm = text.match(/["\u2018\u201C]([^"'\u2018\u201C\u2019\u201D']+)["\u2019\u201D']/);
      if (qm && qm[1].length > 2) text = qm[1];
      else {
        const afterPunct = text.split(/[：:，,]\s*/).pop();
        if (afterPunct && afterPunct.length >= text.length * 0.3) text = afterPunct;
      }
      text = text.replace(/^(可以|建议|试着|尝试|不妨|比如|例如|可以说|坚定[^，：:]{0,20}[地，]|冷静[地，])/g, "").trim();
      text = text.replace(/^(陈述|表达|说明|告诉|指出|回应|回复|说|喊)(自己的|你的|对方的|，|。|\s)*/, "").trim();
      if (text && !text.includes("我") && !text.includes("我们")) {
        const advicePats = /^(坚持|保持|学会|记住|需要|应该|要努力|要勇敢|不要|别|永远|一定|必须|坚定|明确|勇敢|努力|试着|尝试)/;
        if (advicePats.test(text)) {
          text = text.replace(/^(不要|别)\s*/, "我不会").replace(/^(.*)/, (m) => advicePats.test(m) ? "我" + m : m);
        }
      }
      const instructionVerbs = /^(\S{0,2})(陈述|表达|说明|告诉|指出)/;
      if (text && !text.includes("我") && instructionVerbs.test(text)) text = "";
      if (text && !/[我你他她它]/.test(text) && text.length < 10) text = "";
      return { ...alt, text: text.trim() };
    }).filter((alt) => alt.text && alt.text.length >= 3);
  }

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(sse("alternatives", data.alternatives || []));
  res.write(sse("done", true));
  res.end();
}

// —— 复盘文本补全：对话期评估仅含数值，复盘长文本进入复盘界面后按轮补全（与 backend/app/api/review/complete/route.ts 对齐）——
const REVIEW_COMPLETE_INSTRUCTION = (ctx) => `你是一名心理防御训练游戏的复盘分析师。玩家刚刚在本关「${ctx.levelTitle}」的对话中完成了一轮攻防，
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
  "progressNote": "与上一轮维度评分对比的一句话反馈；仅当上方“上一轮评分”为“无（本回合为第一轮）”时才可填“第一轮，暂无对比”，否则必须结合上一轮评分写出具体变化，且禁止出现“第一轮”字样",
  "alternatives": [
    {"text": "玩家可直接说出口的回应句", "rationale": "为何有效：如何打破操控逻辑"},
    {"text": "玩家可直接说出口的回应句", "rationale": "为何有效：如何打破操控逻辑"},
    {"text": "玩家可直接说出口的回应句", "rationale": "为何有效：如何打破操控逻辑"}
  ]
}

说明：
- alternatives.text 必须是玩家可直接说出口的话，禁止"你可以…/试着…"等建议口吻。
- whyNote 要结合上方"识别的操控手法"具体展开，引用本关相关心理学概念。
- progressNote 必须依据给定的上一轮评分写出前后维度变化。`;

async function handleReviewComplete(req, res, body) {
  try {
    const npcContent = String(body.npcContent || "").trim();
    const playerContent = String(body.playerContent || "").trim();
    if (!npcContent || !playerContent) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "缺少该轮对话原文（npcContent / playerContent）" }));
      return;
    }
    const roundNumber = typeof body.roundNumber === "number" ? body.roundNumber : 0;
    const isFirstRound = roundNumber > 0 ? roundNumber === 1 : !body.prevDimensions;
    const prevText = body.prevDimensions
      ? JSON.stringify(body.prevDimensions)
      : isFirstRound
        ? "无（本回合为第一轮）"
        : "缺失（非首轮但缺少上一轮评分，请仅依据当前轮表现点评）";
    const systemPrompt = REVIEW_COMPLETE_INSTRUCTION({
      levelTitle: body.levelTitle || "心理操控防御",
      npcContent,
      playerContent,
      trapType: body.trapType || "未识别",
      playerStatus: body.playerStatus || "unknown",
      dimensions: body.dimensions ? JSON.stringify(body.dimensions) : "{}",
      prevDimensions: prevText,
    });
    const ask = () => callLLMWithFallback(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: "请生成该轮复盘点评 JSON。" },
      ],
      undefined,
      { maxTokens: 3072 }
    );

    let parsed = null;
    try {
      parsed = extractJson(await ask(), "review-complete");
    } catch (e) {
      // 解析失败自动重试一次
      console.warn("[review/complete] 解析失败，自动重试:", e.message);
      parsed = extractJson(
        await callLLMWithFallback(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: "请重新生成该轮复盘点评 JSON，务必只输出合法 JSON。" },
          ],
          undefined,
          { maxTokens: 3072 }
        ),
        "review-complete-retry"
      );
    }

    if (!parsed || typeof parsed !== "object") {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "复盘文本生成失败", details: "模型输出无法解析" }));
      return;
    }

    // 规范化字段（数值字段由前端 setRoundAssessment merge 保留，不回传）
    const rawProgressNote =
      typeof parsed.progressNote === "string" ? parsed.progressNote.trim() : "";
    const progressNote =
      !isFirstRound && rawProgressNote.includes("第一轮")
        ? ""
        : rawProgressNote || (isFirstRound ? "第一轮，暂无对比" : "");
    const assessment = {
      trapAnalysis: parsed.trapAnalysis ?? "",
      assessment: parsed.assessment ?? "",
      whyNote: parsed.whyNote ?? "",
      identificationTip: parsed.identificationTip ?? "",
      progressNote,
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
    };

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, assessment }));
  } catch (e) {
    console.error("[review/complete] Error:", e && e.message);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "复盘文本生成失败", details: String((e && e.message) || e) }));
    }
  }
}

function startFrontend() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/api/")) {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", async () => {
        let parsed = {};
        try { parsed = JSON.parse(body || "{}"); } catch {}
        try {
          if (req.url === "/api/npc/generate") {
            await handleNPCGenerate(req, res, parsed);
          } else if (req.url === "/api/chat") {
            await handleChat(req, res, parsed);
          } else if (req.url === "/api/insight") {
            await handleInsight(req, res, parsed);
          } else if (req.url === "/api/review/complete") {
            await handleReviewComplete(req, res, parsed);
          } else {
            res.writeHead(404);
            res.end("Not Found");
          }
        } catch (e) {
          console.error("[api] error:", e.message);
          if (!res.headersSent) {
            res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
          }
          res.write(sse("error", e.message));
          res.end();
        }
      });
      return;
    }
    let fp = path.join(FRONTEND_DIR, req.url === "/" ? "index.html" : req.url);
    if (!fs.existsSync(fp)) fp = path.join(FRONTEND_DIR, "index.html");
    const ext = path.extname(fp);
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(500); res.end("Server Error"); return; }
      res.writeHead(200, { "Content-Type": { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" }[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
  server.listen(FRONTEND_PORT, () => console.log(`[server] ready on http://localhost:${FRONTEND_PORT}`));
  return server;
}

module.exports = { startFrontend, startBackend };
