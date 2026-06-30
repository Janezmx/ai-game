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
  | "npc_name" | "npc_attack" | "dialogue_chunk"
  // 对话
  | "chunk" | "control_level" | "shield_damage" | "plant_status" | "assessment"
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
          // data 可能是纯字符串，当做 chunk 处理
          if (currentEvent === "chunk" || !currentEvent) {
            onEvent({ type: "chunk", data: dataStr });
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
  level?: number
): Promise<void> {
  return fetchSSE(
    "/api/npc/generate",
    { playerContext, difficulty, level },
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
  }
): Promise<void> {
  return fetchSSE(
    "/api/chat",
    {
      messages,
      sanctuary: playerSanctuary,
      usedArtifact,
      ...(levelContext || {}),
    },
    onEvent,
    signal
  );
}
