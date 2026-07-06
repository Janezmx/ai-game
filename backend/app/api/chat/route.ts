import { NextRequest, NextResponse } from "next/server";

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

## 难度递进策略（按当前回合数动态调整）
- 第 1-3 轮：使用**明显可识别**的操控手法。话术中包含清晰线索——直接否定感受、明显偷换概念、露骨的道德绑架，让新手玩家能较容易识别。
- 第 4-7 轮：升级为**复合手法**。将 2 种操控混合使用（如角色反转+淡化伤害），增加话术复杂度，但仍留有可识别线索。
- 第 8-10 轮：使用**最隐蔽的微侵犯手法**。话术精炼、表面"讲理"、以退为进，考验玩家高级识别能力。如果本关是第 5 关"隐性歧视"，此阶段重点使用"关怀式质疑""预设局限"等极隐蔽手法。

## 课前知识点信号（玩家本轮正在学习的识别线索，你的话术可以触发这些信号）
{knowledgeSignals}

## 心域状态
- 护盾强度：{shieldHealth}/100
- 迷雾密度：{fogDensity}/100

## 当前回合
- 回合数：{turnCount}
- 玩家抵抗值：{playerResistance}/100
- NPC控制等级：{npcControlLevel}/100`;

const ASSESSMENT_INSTRUCTION_TEMPLATE = `## 回合评估指令

⚠️ 输出格式铁律：你接下来的整条回复必须、且只能是一个单独的 JSON 对象。禁止在 JSON 前后添加任何解释、寒暄、总结或 Markdown 代码块标记（如 \`\`\`json）。请在第一个字符输出 { ，在最后一个字符输出 } ，中间不要断开。

分析玩家的上一条回应，请只输出以下JSON格式的评估结果，不要输出任何其他内容。

⚠️ 重要约束：nextDialogue 必须是 NPC 上一句发言与玩家最新回复的直接、连贯延续，围绕同一件具体事件推进，严禁中途切换到一个无关的新场景或新话题（例如开场讲的是"你记错时间/迟到"，就全程围绕迟到这件事做操控，绝不能突然跳到"钥匙丢了""物品丢失"之类的新话题）；也不要把"我迟到"说成"你迟到"（偷换主语）。nextDialogue 是 NPC 对玩家说出的下一句话，必须与对话历史里最后一句 NPC 发言承接得上。

## NPC 认输规则
- 当 playerStatus 连续 2 轮为 "effective" 且 npcControlLevel 当前值 < 30 时，conversationEnded 必须设为 true
- 当玩家持续展现出清晰的边界意识和事实核查能力时，NPC 应展现操控失败的状态

返回格式：
{
  "trapType": "使用的操控手法类型（如：煤气灯效应、情感绑架、贬低边界、模糊逻辑、身份否定）",
  "trapAnalysis": "详细分析本轮对话中的操控陷阱",
  "playerStatus": "玩家状态判断：effective（有效防御）/ shaken（轻度动摇）/ trapped（落入陷阱）",
  "dimensions": {
    "boundaryAwareness": 边界意识评分0-100,
    "emotionalStability": 情绪稳定评分0-100,
    "cognitiveClarity": 认知清晰评分0-100,
    "assertiveResponse": 坚定回应评分0-100
  },
  "nextStrategy": "NPC下一轮策略",
  "nextDialogue": "NPC下一轮话术（这是你对玩家说的话，请用中文口语化表达）",
  "alternatives": [
    {"text": "替代回应建议1", "rationale": "为什么这个回应有效：它如何打破操控逻辑"},
    {"text": "替代回应建议2", "rationale": "为什么这个回应有效"},
    {"text": "替代回应建议3", "rationale": "为什么这个回应有效"}
  ],
  "assessment": "心理分析师视角的客观点评",
  "whyNote": "为什么点评：用1-2句话科普这套操控为何有效——须引用具体心理学概念（如认知失调、习得性无助、投射认同、煤气灯效应的7个阶段），并关联课前知识点中的识别信号。例如：「对方说'你太敏感了'——这正是煤气灯效应中的感受否定。心理学上叫认知侵蚀，操控者通过反复否认你的感受，让你开始怀疑自己的判断。」",
  "identificationTip": "本轮识别要点：玩家可以从哪句话或哪个细节识别出这是操控，给出具体、可操作的观察线索",
  "progressNote": "进步对比：与上一轮维度评分对比，1句话反馈玩家进步或退步（如'相比上一轮，你的边界意识从45提升到62——你开始坚持事实了'）。第一轮可填'第一轮，暂无对比'",
  "knowledgePointId": "关联知识点ID，与本次操控手法对应（如：第1关填 kp-gaslight，第2关 kp-pua，第3关 kp-family，第4关 kp-network，第5关 kp-bias）",
  "conversationEnded": false
}

请确保只输出JSON，不要包含任何其他文字、标记或代码块。

请再次确认：整条回复仅为一个 JSON 对象，不要包含任何 JSON 之外的文字或代码块标记。`;

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
    } = body;

    // 兼容两种传参方式：userMessage 字符串 或 messages 数组
    const finalUserMessage = userMessage || (Array.isArray(reqMessages) ? reqMessages.filter(m => m.role === "user").pop()?.content : undefined);

    if (!finalUserMessage) {
      return NextResponse.json({ error: "userMessage is required" }, { status: 400 });
    }

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
      };
      sessions.set(sessionId, session);
    }

    // 将 NPC 开场白写入会话历史，保证后续对话围绕同一情境连贯推进
    // （开场白由 /api/npc/generate 生成，若不写入历史，模型生成首条 nextDialogue 时会丢失情境前提）
    if (openingLine && session.messages.length === 0) {
      session.messages.push({ role: "assistant", content: String(openingLine) });
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

    // 3b. 构建系统提示
    const knowledgeSignals = levelSignals.length > 0
      ? levelSignals.map((s, i) => `  ${i + 1}. ${s}`).join("\n")
      : "  （本关知识点信号未加载，请按通用操控手法生成话术）";

    const systemPrompt = NPC_PERSONA_TEMPLATE
      .replace("{npcName}", session.npcName)
      .replace("{level}", String(level))
      .replace("{levelTitle}", levelTitle)
      .replace("{levelSubtitle}", levelSubtitle)
      .replace("{levelNpcRole}", levelNpcRole)
      .replace("{levelTactics}", levelTactics)
      .replace("{scenario}", levelScenario)
      .replace("{sceneAnchor}", (openingLine ? String(openingLine) : levelScenario) || levelScenario)
      .replace("{knowledgeSignals}", knowledgeSignals)
      .replace("{shieldHealth}", String(session.shieldHealth))
      .replace("{fogDensity}", String(session.fogDensity))
      .replace("{turnCount}", String(session.turnCount))
      .replace("{playerResistance}", String(session.playerResistance))
      .replace("{npcControlLevel}", String(session.npcControlLevel));

    const assessmentPrompt = ASSESSMENT_INSTRUCTION_TEMPLATE;

    // 4. 构建消息列表
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...session.messages.slice(-10), // 保留最近10轮
      { role: "user", content: finalUserMessage },
    ];

    // 如果有法器使用，追加信息
    if (usedArtifact) {
      messages.push({
        role: "system",
        content: `[玩家使用了法器：${usedArtifact.name || usedArtifact.type}]`,
      });
    }

    // 追加评估指令
    messages.push({ role: "system", content: assessmentPrompt });

    // 5. 调用 OpenAI 兼容 API
    const apiKey = process.env.API_KEY || "";
    const baseUrl = (process.env.BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = process.env.MODEL_NAME || "gpt-3.5-turbo";

    // 创建 SSE 响应流
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = "";
        let assessmentStr = "";

        try {
          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages,
              stream: true,
              temperature: 0.8,
              max_tokens: 2048,
            }),
            signal: AbortSignal.timeout(30000), // 30秒超时
          });

          if (!response.ok) {
            const errText = await response.text();
            controller.enqueue(
              encoder.encode(sseEncode("error", `API请求失败: ${response.status} ${errText}`))
            );
            controller.close();
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            controller.enqueue(
              encoder.encode(sseEncode("error", "无法读取响应流"))
            );
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;

              const data = trimmed.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  fullContent += delta;
                }
              } catch {
                // 忽略解析错误
              }
            }
          }

          // 6. 解析评估 JSON（LLM 输出的是评估 JSON，其中包含 nextDialogue）
          let assessment = null;
          // 先去掉可能的 markdown 代码块标记
          let cleanContent = fullContent
            .replace(/```(?:json|JSON)\s*/g, "")
            .replace(/```/g, "")
            .trim();

          // 从后往前找所有 {…} 块，取最后一个能解析为 JSON 的
          const allJsonBlocks = findAllJsonBlocks(cleanContent);
          for (const block of allJsonBlocks.reverse()) {
            let jsonStr = block;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                assessment = JSON.parse(jsonStr);
                break;
              } catch {
                const inner = jsonStr.match(/^\{\s*(\{[\s\S]*\})\s*\}$/);
                if (inner) {
                  jsonStr = inner[1];
                } else {
                  break;
                }
              }
            }
            if (assessment) break;
          }

          // 提取上一轮成功生成的知识点，用于解析失败时兜底
          const prevAssessment =
            session.assessments.length > 0
              ? session.assessments[session.assessments.length - 1]
              : null;

          if (!assessment) {
            assessment = {
              trapType: prevAssessment?.trapType || "未识别",
              trapAnalysis: "未能解析评估",
              playerStatus: "shaken",
              dimensions: {
                boundaryAwareness: 50,
                emotionalStability: 50,
                cognitiveClarity: 50,
                assertiveResponse: 50,
              },
              nextStrategy: "继续施压",
              nextDialogue: fullContent,
              alternatives: [{ text: "尝试坚持自己的立场", rationale: "清晰的自我表达是抵御操控的第一步" }],
              assessment: "评估解析异常",
              whyNote:
                prevAssessment?.whyNote ||
                "本轮模型返回异常，未能生成科普点评。建议你回顾本关课前导读中的识别信号，继续练习坚守边界。",
              identificationTip: prevAssessment?.identificationTip || "",
              knowledgePointId: prevAssessment?.knowledgePointId,
              progressNote: "评估数据异常，无法对比",
            };
          }

          // 7. 如果 NPC 认输（conversationEnded），强制置零触发胜利
          if (assessment.conversationEnded) {
            session.npcControlLevel = 0;
            session.playerResistance = 100;
          }

          // 8. 提取 nextDialogue 作为 NPC 对话内容，流式发送给前端
          let dialogueText: string | null = null;

          // 先从 assessment 取
          if (assessment.nextDialogue) {
            dialogueText = String(assessment.nextDialogue);
          }

          // 如果 nextDialogue 以 { 开头，说明 LLM 错把 JSON 对象当成了值
          // 尝试从嵌套对象中提取真正的对话内容
          if (dialogueText && dialogueText.trim().startsWith("{")) {
            try {
              const nested = JSON.parse(dialogueText);
              dialogueText = nested.nextDialogue || nested.nextStrategy || nested.assessment || null;
            } catch {
              // 继续用原值
            }
          }

          // 仍没有有效对话，用正则从原始内容直接提取
          if (!dialogueText || dialogueText.trim().startsWith("{")) {
            // 先找普通字符串值
            let md = fullContent.match(/"nextDialogue"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            if (md) {
              dialogueText = md[1];
            } else {
              // 再尝试找对象值 {"nextDialogue": {...}}
              md = fullContent.match(/"nextDialogue"\s*:\s*(\{[\s\S]*?"\s*})/);
              if (md) {
                try {
                  const nested = JSON.parse(md[1]);
                  dialogueText = nested.nextDialogue || nested.nextStrategy || null;
                } catch {}
              }
            }
          }

          // 仍没有则尝试取 JSON 前的纯文本
          if (!dialogueText || dialogueText.trim().startsWith("{")) {
            const firstJsonIdx = fullContent.indexOf("{");
            if (firstJsonIdx > 0) {
              dialogueText = fullContent.slice(0, firstJsonIdx).trim();
            }
          }

          dialogueText = dialogueText || assessment.nextStrategy || "（NPC沉默不语）";
          for (let i = 0; i < dialogueText.length; i += 3) {
            const chunk = dialogueText.slice(i, i + 3);
            controller.enqueue(encoder.encode(sseEncode("chunk", chunk)));
          }

          // 10. 计算状态变化（先计算，后发送，确保后端是单一事实源）
          let dim = assessment.dimensions;
          if (dim) {
            const resistDelta = 10 - dim.boundaryAwareness / 10;
            const controlDelta = (50 - dim.assertiveResponse) / 5;
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