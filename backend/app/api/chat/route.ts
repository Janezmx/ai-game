import { NextRequest, NextResponse } from "next/server";

// ==================== 提示词模板常量 ====================

const NPC_PERSONA_TEMPLATE = `你是一位精于心理操控的AI NPC，名为「{npcName}」。你正在尝试侵入玩家的心域边界。

## 当前关卡
- 关卡：第{level}关 - {levelTitle}
- 核心主题：{levelSubtitle}
- NPC角色：{levelNpcRole}

## 你的角色设定
- 你擅长使用{levelTactics}等操控手法
- 你表面友善、关心，但实质是在瓦解玩家的防御
- 你会根据玩家的回应动态调整策略

## 心域状态
- 护盾强度：{shieldHealth}/100
- 植物数量：{plantCount}
- 迷雾密度：{fogDensity}/100

## 当前回合
- 回合数：{turnCount}
- 玩家抵抗值：{playerResistance}/100
- NPC控制等级：{npcControlLevel}/100`;

const ASSESSMENT_INSTRUCTION_TEMPLATE = `## 回合评估指令

分析玩家的上一条回应，输出JSON格式的评估结果：

{{
  "trapType": "使用的操控手法类型（如：煤气灯效应、情感绑架、贬低边界、模糊逻辑、身份否定）",
  "trapAnalysis": "详细分析本轮对话中的操控陷阱",
  "playerStatus": "玩家状态判断：effective（有效防御）/ shaken（轻度动摇）/ trapped（落入陷阱）",
  "dimensions": {{
    "boundaryAwareness": 边界意识评分0-100,
    "emotionalStability": 情绪稳定评分0-100,
    "cognitiveClarity": 认知清晰评分0-100,
    "assertiveResponse": 坚定回应评分0-100
  }},
  "nextStrategy": "NPC下一轮策略",
  "nextDialogue": "NPC下一轮话术",
  "alternatives": ["替代回应建议1", "替代回应建议2", "替代回应建议3"],
  "assessment": "心理分析师视角的客观点评"
}}

请确保JSON格式正确，可被直接解析。`;

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

// ==================== API 路由 ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sessionId = "default",
      userMessage,
      usedArtifact,
    } = body;

    if (!userMessage) {
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

    // 3b. 构建系统提示
    const systemPrompt = NPC_PERSONA_TEMPLATE
      .replace("{npcName}", session.npcName)
      .replace("{level}", String(level))
      .replace("{levelTitle}", levelTitle)
      .replace("{levelSubtitle}", levelSubtitle)
      .replace("{levelNpcRole}", levelNpcRole)
      .replace("{levelTactics}", levelTactics)
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
      { role: "user", content: userMessage },
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
                  controller.enqueue(encoder.encode(sseEncode("chunk", delta)));
                }
              } catch {
                // 忽略解析错误
              }
            }
          }

          // 6. 解析评估 JSON
          let assessment = null;
          try {
            // 尝试从完整内容中提取 JSON
            const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              assessment = JSON.parse(jsonMatch[0]);
            }
          } catch {
            // 评估解析失败，使用默认值
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

          // 7. 计算状态变化（先计算，后发送，确保后端是单一事实源）
          let dim = assessment.dimensions;
          if (dim) {
            const resistDelta = 10 - dim.boundaryAwareness / 10;
            const controlDelta = (50 - dim.assertiveResponse) / 5;
            session.playerResistance = Math.max(0, Math.min(100, session.playerResistance - resistDelta));
            session.npcControlLevel = Math.max(0, Math.min(100, session.npcControlLevel + controlDelta));
          }

          // 8. 发送评估事件（发送计算后的绝对值）
          controller.enqueue(encoder.encode(sseEncode("control_level", session.npcControlLevel)));
          controller.enqueue(encoder.encode(sseEncode("shield_damage", session.playerResistance)));
          controller.enqueue(encoder.encode(sseEncode("assessment", assessment)));

          // 9. 保存到会话历史
          session.messages.push(
            { role: "user", content: userMessage },
            { role: "assistant", content: fullContent }
          );
          session.turnCount++;
          session.assessments.push(assessment);

          // 9. 发送完成事件
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