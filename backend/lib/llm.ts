/**
 * LLM API 调用封装 - DeepSeek 兼容 OpenAI 接口
 */

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const DEFAULT_CONFIG: LLMConfig = {
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseUrl: "https://api.deepseek.com",
  model: process.env.MODEL_NAME || "deepseek-v4-flash",
};

/**
 * 调用 LLM API 返回流式响应（ReadableStream）
 */
export async function createChatCompletionStream(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  config: Partial<LLMConfig> = {}
): Promise<ReadableStream> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const response = await fetch(`${mergedConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${mergedConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: mergedConfig.model,
      messages,
      stream: true,
      temperature: 0.8,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API Error ${response.status}: ${errorText}`);
  }

  return response.body!;
}

/**
 * 解析 SSE 流数据，提取文本内容
 */
export function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): ReadableStream<string> {
  return new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") {
                controller.close();
                return;
              }
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || "";
                if (content) {
                  controller.enqueue(content);
                }
              } catch {
                // 跳过无法解析的行
              }
            }
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * 非流式调用（用于生成 NPC 初始数据）
 */
export async function createChatCompletion(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  config: Partial<LLMConfig> = {}
): Promise<string> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const response = await fetch(`${mergedConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${mergedConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: mergedConfig.model,
      messages,
      stream: false,
      temperature: 0.8,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API Error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}