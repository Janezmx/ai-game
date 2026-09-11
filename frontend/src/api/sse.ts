/**
 * SSE 流式 API 调用封装
 * 用于与后端 NPC 生成和对话 API 通信
 *
 * 后端使用标准 SSE 格式：
 *   event: {eventType}
 *   data: {JSON data}
 *
 * 兼容格式（/api/npc/generate）：
 *   data: {"type":"npc_name","data":"..."}
 *
 */

export type SSEEventType =
  // NPC 生成
  | "npc_name" | "npc_identity" | "opening_line" | "npc_attack" | "dialogue_chunk" | "knowledge_point"
  // 对话（assessing: 台词流结束，进入评估阶段）
  | "chunk" | "control_level" | "shield_damage" | "fog" | "assessment" | "assessing"
  // 洞察建议
  | "alternatives"
  // 通用
  | "done" | "error";

export interface SSEEvent {
  type: SSEEventType;
  data: any;
}

/**
 * 发起 SSE 流式请求，逐块回调处理
 * 支持标准 SSE 格式：event/headers + data lines
 * 也支持 data 行内嵌 {type, data} 的简化格式
 */
export async function fetchSSE(
  url: string,
  body: any,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SSE Error ${response.status}: ${errorText}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("event: ")) {
        currentEvent = trimmed.slice(7).trim();
      } else if (trimmed.startsWith("data: ")) {
        const dataStr = trimmed.slice(6).trim();
        if (!dataStr) continue;

        try {
          const parsed = JSON.parse(dataStr);

          // 兼容 data: {"type":"xxx","data":yyy} 内嵌格式
          // 如果 parsed 有 type 和 data 字段，则用它替代 currentEvent
          if (parsed && typeof parsed === "object" && "type" in parsed && "data" in parsed) {
            const embeddedType = parsed.type as SSEEventType;
            const embeddedData = parsed.data;

            onEvent({ type: embeddedType, data: embeddedData });

            if (embeddedType === "done" || embeddedType === "error") {
              return;
            }
          } else {
            // 标准 SSE 格式：用 currentEvent（来自 event: 行）作为事件类型
            const eventType = (currentEvent || "chunk") as SSEEventType;
            onEvent({ type: eventType, data: parsed });

            if (eventType === "done" || eventType === "error") {
              return;
            }
          }
        } catch {
          // data 无法 JSON.parse（如后端未 JSON.stringify 的裸错误文本）。
          // 有事件头（event: xxx）时按原事件类型送达，确保 error/done 不被静默丢弃；
          // 无事件头时视为 chunk。
          const eventType = (currentEvent || "chunk") as SSEEventType;
          onEvent({ type: eventType, data: dataStr });
          if (eventType === "done" || eventType === "error") {
            return;
          }
        }
        currentEvent = ""; // 重置 event 类型
      }
    }
  }
}

/**
 * 生成 NPC 的 SSE 请求
 */
export function generateNPC(
  playerContext: string,
  difficulty: number,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
  level?: number,
  scenario?: string
): Promise<void> {
  return fetchSSE(
    "/api/npc/generate",
    { playerContext, difficulty, level, scenario },
    onEvent,
    signal
  );
}

/**
 * 对话请求的 SSE
 */
export function chatWithNPC(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  playerSanctuary: any,
  onEvent: (event: SSEEvent) => void,
  usedArtifact?: any,
  signal?: AbortSignal,
  levelContext?: {
    level: number;
    levelTitle: string;
    levelSubtitle: string;
    levelNpcRole: string;
    levelTactics: string;
    levelScenario: string;
    levelSignals?: string[];
    openingLine?: string;
    /**
     * NPC 固定身份（由生成阶段确定并下发，防止对话中途"妈妈变姐姐"等身份漂移）。
     * npcRoleIdentity = 具体身份称谓（如"玩家母亲"），npcRelationship = 与玩家的关系描述。
     */
    npcRoleIdentity?: string;
    npcRelationship?: string;
    /** 本关除当前已展开场景外的其余并列子场景，后端将用于禁止 NPC 跑题 */
    peerScenarios?: string[];
    /**
     * 明辨铃：玩家本轮"采纳"的建议。仅当玩家点击建议并（基本）原样发送时上报。
     * 后端据此把该回应视为有意的抵抗行为（评估提示注入），并在最坏情况下保证
     * NPC 操控力下降而非上升（确定性保底）。
     */
    insightChoice?: { text?: string; rationale?: string };
  },
  /**
   * 本局会话 id：每开一局换一个新值，后端据此隔离对话历史。
   * 不传则后端落到默认会话（跨局共用），历史上会导致新局开场白与上一局话题串场。
   */
  sessionId?: string
): Promise<void> {
  return fetchSSE(
    "/api/chat",
    {
      messages,
      sanctuary: playerSanctuary,
      usedArtifact,
      ...(sessionId ? { sessionId } : {}),
      ...(levelContext || {}),
    },
    onEvent,
    signal
  );
}

/** 明辨铃：基于当前对话上下文获取建议回复 */
export function fetchInsight(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  return fetchSSE(
    "/api/insight",
    { messages },
    onEvent,
    signal
  );
}

export interface ReviewCompleteParams {
  npcContent: string;
  playerContent: string;
  trapType?: string;
  playerStatus?: string;
  dimensions?: object;
  prevDimensions?: object | null;
  roundNumber?: number; // 1-based 轮序号
  levelTitle?: string;
  /** 本轮实时评估是否走了兜底：后端据此禁止生成任何分数对比文案 */
  degraded?: boolean;
}

/**
 * 复盘文本补全：根据某一轮的对话原文生成完整复盘点评文本
 * POST /api/review/complete → { ok, assessment }
 */
export async function fetchReviewComplete(
  params: ReviewCompleteParams
): Promise<{ assessment: Record<string, unknown> }> {
  const response = await fetch("/api/review/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`复盘补全失败 ${response.status}: ${errText}`);
  }
  const data = await response.json();
  if (!data?.ok) {
    throw new Error(data?.error || "复盘补全失败");
  }
  return data;
}
