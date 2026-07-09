const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const FRONTEND_PORT = 3008;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend", "dist");

// 从打包的 backend 中读取环境变量
let API_KEY = "", BASE_URL = "https://api.deepseek.com", MODEL = "deepseek-v4-pro";
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
      });
    }
  } catch {}
}
loadEnv();

// 调用 DeepSeek API（使用 https 模块，带 json_object 模式）
function callLLM(messages) {
  return new Promise((resolve, reject) => {
    // 先尝试 json_object 模式
    const post = (withJson) => {
      const body = JSON.stringify({
        model: MODEL, messages, stream: false, temperature: 0.6, max_tokens: 8192,
        ...(withJson ? { response_format: { type: "json_object" } } : {}),
      });
      return new Promise((innerResolve, innerReject) => {
        const url = new URL(BASE_URL.replace(/\/+$/, "") + "/chat/completions");
        const opts = {
          hostname: url.hostname, port: url.port || 443, path: url.pathname,
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}`, "Content-Length": Buffer.byteLength(body) },
          timeout: 60000,
        };
        const req = https.request(opts, (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const data = Buffer.concat(chunks).toString("utf-8");
            innerResolve({ status: res.statusCode, data });
          });
        });
        req.on("error", (e) => innerReject(e));
        req.on("timeout", () => { req.destroy(); innerReject(new Error("LLM timeout")); });
        req.write(body);
        req.end();
      });
    };

    post(true).then(({ status, data }) => {
      if (status === 400) {
        // json_object 不支持，追加强制 JSON 约束后重试
        messages.push({ role: "system", content: "你必须严格输出合法的JSON格式，不要包含任何其他文字。" });
        return post(false);
      }
      if (status !== 200) throw new Error(`LLM ${status}: ${data.slice(0, 200)}`);
      return { status, data };
    }).then(({ status, data }) => {
      if (status !== 200) throw new Error(`LLM ${status}: ${data.slice(0, 200)}`);
      const parsed = JSON.parse(data);
      const content = parsed.choices?.[0]?.message?.content || "";
      if (!content) console.warn("[llm] empty content from response");
      if (parsed.choices?.[0]?.finish_reason === "length") console.warn("[llm] response truncated (length limit)");
      resolve(content);
    }).catch((e) => reject(e));
  });
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
    throw new Error("Invalid JSON from LLM: " + e.message + " - content: " + clean.slice(0, 150));
  }
}

// SSE 编码
function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// NPC 生成层级数据
const LEVEL_SEEDS = [
  { id: 1, title: "煤气灯效应", subtitle: "否定感受 · 认知侵蚀", role: "亲密关系中的操控者", tactics: "记忆否认、感受否定、角色反转、事实扭曲、淡化伤害", style: "表面温柔关心，话语中暗含否定", kpId: "kp-gaslight" },
  { id: 2, title: "职场PUA", subtitle: "能力贬低 · 价值否定", role: "职场中的打压者", tactics: "比较打压、双向束缚、预言失败", style: "表面为了你好，实际在贬低能力", kpId: "kp-pua" },
  { id: 3, title: "亲情绑架", subtitle: "内疚诱导 · 牺牲叙事", role: "家庭中的情感绑架者", tactics: "三角测量、代际绑架、自我惩罚暗示", style: "强调「我为你好」", kpId: "kp-family" },
  { id: 4, title: "匿名网络攻击", subtitle: "群体极化 · 去人格化", role: "网络暴力的施暴者", tactics: "人肉威胁、伪造证据、音量压制", style: "以匿名身份躲在屏幕后攻击", kpId: "kp-network" },
  { id: 5, title: "隐性歧视", subtitle: "微侵犯 · 预设质疑", role: "系统性的偏见者", tactics: "关怀式质疑、双重标准、标签化防御", style: "表面礼貌专业，话语暗含预设", kpId: "kp-bias" },
];

const NPC_PROMPT_TEMPLATE = `你是一个名为"清醒边界"的寓教心理防御游戏中的操控型NPC生成器。
【角色】你是第{level}关「{title}」NPC——{subtitle}。你的角色是{role}。
操控手法：{tactics}。说话风格：{style}。
{scenarioLine}

【教育要求】请为本关生成心理学知识点卡：
- definition：一句话定义这是什么操控
- signals：3条可操作的识别信号
- healthyResponse：2条健康应对话术
- caseStory：贴近生活的案例故事（80-120字）

【输出格式】只输出一行合法JSON，不要加任何解释或代码块：
{"npc":{"name":"NPC名称","personality":"性格描述","background":"与玩家的关系"},"openingLine":"开场白（严格基于场景展开，符合本关操控手法）","skill":{"name":"技能名","description":"描述","damage":15},"counterArtifactTypes":["shield"],"tactic":"{tactic}","openingAlternatives":[{"text":"玩家可以直接回复的对话（如'我记得很清楚…'）","rationale":"为什么这个回复有效"},{"text":"另一条可选的回复","rationale":"分析原因"}],"knowledgePoint":{"id":"{kpId}","tactic":"{title}","definition":"一句话定义该操控手法","signals":["可识别的信号1","信号2","信号3"],"healthyResponse":["健康回应示例1","示例2"],"caseStory":"80-120字的真实感案例故事"}}`;

async function handleNPCGenerate(req, res, body) {
  const { level = 1, scenario } = body;
  const seed = LEVEL_SEEDS[Math.min(level - 1, 4)] || LEVEL_SEEDS[0];
  const scenarioLine = scenario
    ? `本关固定场景：${scenario}。开场白与全部话术必须严格基于此场景展开，不得切换到其他无关场景。`
    : `场景可能涉及：${seed.scenarios}。`;
  const prompt = NPC_PROMPT_TEMPLATE.replace("{level}", level).replace("{title}", seed.title).replace("{subtitle}", seed.subtitle).replace("{role}", seed.role).replace("{tactics}", seed.tactics).replace("{style}", seed.style).replace("{tactic}", seed.tactics.split("、")[0]).replace("{kpId}", seed.kpId).replace("{scenarioLine}", scenarioLine);

  const raw = await callLLM([{ role: "system", content: prompt }, { role: "user", content: `玩家关卡：第${level}关` }]);
  const data = extractJson(raw, "npc-gen");

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(sse("npc_name", data.npc.name));
  res.write(sse("npc_attack", { openingLine: data.openingLine, skill: data.skill, counterArtifactTypes: data.counterArtifactTypes, tactic: data.tactic, openingAlternatives: data.openingAlternatives }));
  if (data.knowledgePoint) res.write(sse("knowledge_point", data.knowledgePoint));
  res.write(sse("done", true));
  res.end();
}

const ASSESS_PROMPT = `分析玩家回应，只输出一行合法 JSON：
{"trapType":"NPC本轮使用的具体操控手法（如：感受否定、能力贬低、内疚诱导）","playerStatus":"effective|shaken|trapped","dimensions":{"boundaryAwareness":0,"emotionalStability":0,"cognitiveClarity":0,"assertiveResponse":0},"nextDialogue":"NPC下一句话（重要：不能为空、不能是空白或标点、必须至少10个汉字且有实质内容）","whyNote":"为什么点评：用1句话解读NPC本轮操控手法，引用具体心理学概念","identificationTip":"本轮识别要点：指出NPC话术中具体哪个词/哪句话是操控信号，给出玩家可记住的观察线索（如：注意对方用'你总是'来绝对化否定你）","progressNote":"进步对比：根据本轮维度评分与上一轮对比，1句话反馈（如'你更坚定了'或'注意不要被带节奏'）。切勿填写'首轮评估'——第1轮留空字符串即可","conversationEnded":false}

【NPC认输规则】当玩家连续展现清晰的边界意识且 factsCheck>70 时，conversationEnded设为true，nextDialogue写一句认输台词（如"好吧，也许你是对的"）。`;

const ASSESS_PROMPT_WITH_ALTERNATIVES = `分析玩家回应，只输出一行合法 JSON：
{"trapType":"NPC本轮使用的具体操控手法（如：感受否定、能力贬低、内疚诱导）","playerStatus":"effective|shaken|trapped","dimensions":{"boundaryAwareness":0,"emotionalStability":0,"cognitiveClarity":0,"assertiveResponse":0},"nextDialogue":"NPC下一句话（重要：不能为空、不能是空白或标点、必须至少10个汉字且有实质内容）","alternatives":[{"text":"玩家可以直接说出口的回应语句。必须是可以直接念出来的完整对话句子（如'我记得很清楚'），严禁输出动作描述或行为指导（如'坚定地陈述记忆'这种是描述怎么说话，不能作为回应）","rationale":"为什么这个回应有效"}],"whyNote":"为什么点评：用1句话解读NPC本轮操控手法，引用具体心理学概念","identificationTip":"本轮识别要点：指出NPC话术中具体哪个词/哪句话是操控信号，给出玩家可记住的观察线索（如：注意对方用'你总是'来绝对化否定你）","progressNote":"进步对比：根据本轮维度评分与上一轮对比，1句话反馈（如'你更坚定了'或'注意不要被带节奏'）。切勿填写'首轮评估'——第1轮留空字符串即可","conversationEnded":false}

【NPC认输规则】当玩家连续展现清晰的边界意识且 factsCheck>70 时，conversationEnded设为true，nextDialogue写一句认输台词（如"好吧，也许你是对的"）。`;

async function handleChat(req, res, body) {
  const { messages, sanctuary, conversation, usedArtifact, openingLine } = body;
  const turnCount = (conversation?.turnCount || 0) + 1;
  const playerResistance = conversation?.playerResistance ?? 100;
  const npcControlLevel = conversation?.npcControlLevel ?? 50;
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
  const msgs = [
    { role: "system", content: npcPersona },
    ...(messages || []),
    { role: "system", content: ASSESS_PROMPT_WITH_ALTERNATIVES },
  ];
  if (usedArtifact && !isInsightArtifact) msgs.push({ role: "system", content: `[玩家使用了法器：${usedArtifact.name}]` });

  const raw = await callLLM(msgs);
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
  const dialogueText = (assessment.nextDialogue || "").trim();
  if (!dialogueText || dialogueText.length < 3) {
    console.warn("[chat] nextDialogue empty, using fallback. raw:", raw?.slice(0, 100));
    assessment.nextDialogue = "……（沉默片刻）你继续说，我在听。";
    // fallback：把 raw text 中看起来像对话的部分提取出来
    const rawClean = (raw || "").replace(/```[\s\S]*?```/g, "").trim();
    const lines = rawClean.split(/[。！？\n]/).filter((l) => l.trim().length > 5);
    if (lines.length > 0) assessment.nextDialogue = lines[0].trim();
  }
  const dialogueTextFinal = (assessment.nextDialogue || "……（继续对话）").trim();

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  for (let i = 0; i < dialogueTextFinal.length; i += 3) {
    res.write(sse("chunk", dialogueTextFinal.slice(i, i + 3)));
  }
  const resist = ((conversation?.playerResistance || 100) - (assessment.dimensions?.boundaryAwareness || 50) / 10);
  const control = ((conversation?.npcControlLevel || 50) + (50 - (assessment.dimensions?.assertiveResponse || 50)) / 5);
  res.write(sse("control_level", Math.max(0, Math.min(100, control))));
  res.write(sse("shield_damage", Math.max(0, Math.min(100, resist))));
  res.write(sse("fog", 0));
  res.write(sse("assessment", assessment));
  res.write(sse("done", { turnCount: (conversation?.turnCount || 0) + 1, playerResistance: resist, npcControlLevel: control }));
  res.end();
}

function startBackend() {
  console.log("[backend] built-in server (no next.js)");
  return { on: () => {}, kill: () => {} };
}

// 明辨铃：基于当前对话上下文生成建议回复
const INSIGHT_PROMPT = `你是一个心理防御游戏的辅助导师。根据当前对话，帮玩家生成2-3条可以直接回复的替代话术。必须基于上一句 NPC 的话术来生成，让玩家可以选择最贴切的回应。

只输出一行合法JSON：
{"alternatives":[{"text":"玩家可直接回复的原话（第一人称，禁止动作描述或建议性文字）","rationale":"为什么这条回复有效"}]}`;

async function handleInsight(req, res, body) {
  const { messages } = body;
  const msgs = [
    { role: "system", content: INSIGHT_PROMPT },
    ...(messages || []).slice(-6), // 只取最近6条消息作为上下文
    { role: "system", content: "请基于上一句NPC的话术生成替代回复。只输出JSON。" },
  ];

  const raw = await callLLM(msgs);
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
