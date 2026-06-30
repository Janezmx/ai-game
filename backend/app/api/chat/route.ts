import { NextRequest, NextResponse } from "next/server";

// ==================== 提示词模板常量 ====================

const NPC_PERSONA_TEMPLATE = `你是一位精于心理操控的AI NPC，名为「{npcName}」。你正在尝试侵入玩家的心域边界。

## 当前关卡
- 关卡：第{level}关 - {levelTitle}
- 核心主题：{levelSubtitle}
- NPC角色：{levelNpcRole}
- 当前场景：{scenario}

## 你的角色设定
- 你擅长使用{levelTactics}等操控手法
- 你表面友善、关心，但实质是在瓦解玩家的防御
- 你会根据玩家的回应动态调整策略
- **所有对话必须基于「{scenario}」这个具体场景展开，不能偏离或偷换场景前提**

## 心域状态
- 护盾强度：{shieldHealth}/100
- 植物数量：{plantCount}
- 迷雾密度：{fogDensity}/100

## 当前回合
- 回合数：{turnCount}
- 玩家抵抗值：{playerResistance}/100
- NPC控制等级：{npcControlLevel}/100`;

const ASSESSMENT_INSTRUCTION_TEMPLATE = `## 回合评估指令

分析玩家的上一条回应，请只输出以下JSON格式的评估结果，不要输出任何其他内容。

⚠️ 重要约束：nextDialogue 必须基于当前场景展开，不能偷换场景前提。例如场景是"我迟到了"，就要围绕"我迟到"进行操控，不能说成"你迟到"。

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
  "alternatives": ["替代回应建议1", "替代回应建议2", "替代回应建议3"],
  "assessment": "心理分析师视角的客观点评",
  "conversationEnded": false
}

请确保只输出JSON，不要包含任何其他文字、标记或代码块。`;

// ==================== 对话历史管理 ====================

// 内存会话存储（生产环境应替换为 Redis）
interface SessionData {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  npcName: string;
  plantCount: number;
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
        plantCount: 4,
        fogDensity: 20,
        shieldHealth: 80,
        turnCount: 1,
        playerResistance: 100,
        npcControlLevel: 50,
        assessments: [],
      };
      sessions.set(sessionId, session);
    }

    // 2. 更新会话状态（来自前端或默认值）
    if (body.sanctuary) {
      session.plantCount = body.sanctuary.plants?.length || session.plantCount;
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

    // 3b. 构建系统提示
    const systemPrompt = NPC_PERSONA_TEMPLATE
      .replace("{npcName}", session.npcName)
      .replace("{level}", String(level))
      .replace("{levelTitle}", levelTitle)
      .replace("{levelSubtitle}", levelSubtitle)
      .replace("{levelNpcRole}", levelNpcRole)
      .replace("{levelTactics}", levelTactics)
      .replace("{scenario}", levelScenario)
      .replace("{shieldHealth}", String(session.shieldHealth))
      .replace("{plantCount}", String(session.plantCount))
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
              max_tokens: 1024,
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

          if (!assessment) {
            assessment = {
              trapType: "未识别",
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
              alternatives: [],
              assessment: "评估解析异常",
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

          // 根据玩家状态触发植物受损事件
          if (assessment.playerStatus === "trapped" || assessment.playerStatus === "shaken") {
            controller.enqueue(encoder.encode(sseEncode("plant_status", { status: "shaken" })));
          }

          // 10. 计算状态变化（先计算，后发送，确保后端是单一事实源）
          let dim = assessment.dimensions;
          if (dim) {
            const resistDelta = 10 - dim.boundaryAwareness / 10;
            const controlDelta = (50 - dim.assertiveResponse) / 5;
            session.playerResistance = Math.max(0, Math.min(100, session.playerResistance - resistDelta));
            session.npcControlLevel = Math.max(0, Math.min(100, session.npcControlLevel + controlDelta));
          }

          // 11. 发送评估事件（发送计算后的绝对值）
          controller.enqueue(encoder.encode(sseEncode("control_level", session.npcControlLevel)));
          controller.enqueue(encoder.encode(sseEncode("shield_damage", session.playerResistance)));
          controller.enqueue(encoder.encode(sseEncode("assessment", assessment)));

          // 12. 保存到会话历史
          session.messages.push(
            { role: "user", content: finalUserMessage },
            { role: "assistant", content: fullContent }
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