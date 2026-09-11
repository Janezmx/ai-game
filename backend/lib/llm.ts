/**
 * LLM API 调用封装 - DeepSeek 兼容 OpenAI 接口
 */
import https from "https";

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** 用 Node https 模块发起请求（避免 fetch 在某些网络环境下连接超时） */
function httpsRequest(
  baseUrl: string,
  bodyStr: string,
  apiKey: string,
  timeout = 120000
): Promise<{
  status: number;
  headers: any;
  body: () => Promise<string>;
  onChunk: (cb: (c: Buffer) => void) => void;
  timing: { ttftMs: number; totalMs: number };
}> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    let ttftMs = 0;
    const url = new URL(baseUrl.replace(/\/+$/, "") + "/chat/completions");
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Length": Buffer.byteLength(bodyStr),
      },
      timeout,
    };
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      const onChunk = (cb: (c: Buffer) => void) => {
        res.on("data", (c: Buffer) => cb(c));
      };
      res.on("data", (c: Buffer) => {
        if (!ttftMs) ttftMs = Date.now() - t0; // 首个数据块 ≈ 首字时间
        chunks.push(c);
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode || 500,
          headers: res.headers,
          body: () => Promise.resolve(Buffer.concat(chunks).toString("utf-8")),
          onChunk,
          timing: { ttftMs, totalMs: Date.now() - t0 },
        });
      });
    });
    req.on("error", (e) => {
      console.warn(`[llm] 网络请求失败: ${(e as any)?.message}`);
      reject(e);
    });
    req.on("timeout", () => {
      console.warn(`[llm] 请求超时（>${timeout}ms）`);
      req.destroy();
      reject(new Error("LLM timeout"));
    });
    req.write(bodyStr);
    req.end();
  });
}

const DEFAULT_CONFIG: LLMConfig = {
  apiKey: process.env.API_KEY || process.env.DEEPSEEK_API_KEY || "",
  baseUrl: process.env.BASE_URL || "https://api.deepseek.com",
  model: process.env.MODEL_NAME || "deepseek-v4-flash",
};

// 备用模型配置：主模型（DeepSeek）重试仍失败后自动降级使用（GLM）
const BACKUP_CONFIG: LLMConfig = {
  apiKey: process.env.BACKUP_API_KEY || "",
  baseUrl: process.env.BACKUP_BASE_URL || "https://open.bigmodel.cn/api/paas/v4",
  model: process.env.BACKUP_MODEL_NAME || "glm-4.7-flashx",
};

/**
 * 调用 LLM API 返回流式响应（ReadableStream）
 */
export async function createChatCompletionStream(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  config: Partial<LLMConfig> = {}
): Promise<ReadableStream> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const bodyStr = JSON.stringify({
    model: mergedConfig.model,
    messages,
    stream: true,
    temperature: 1,
    max_tokens: 3072,
  });

  const res = await httpsRequest(mergedConfig.baseUrl, bodyStr, mergedConfig.apiKey);
  if (res.status !== 200) {
    const errText = await res.body();
    throw new Error(`LLM API Error ${res.status}: ${errText}`);
  }
  console.log(
    `[llm:stream] 模型 ${mergedConfig.model} 成功 status=200 ttft≈${res.timing.ttftMs}ms total≈${res.timing.totalMs}ms`
  );

  // 将 https 流包装为 ReadableStream（供 Next.js 路由消费）
  return new ReadableStream({
    start(controller) {
      res.onChunk((chunk) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      // 流结束时关闭
      res.body().then(() => controller.close()).catch((e) => controller.error(e));
    },
  });
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
 * 非流式调用（用于生成 NPC 初始数据）— 内部用流式读取避免等待完整响应
 */
export async function createChatCompletion(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  config: Partial<LLMConfig> = {}
): Promise<string> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // 用指定配置发一次请求（带 json_object 400 回退 + 失败重试）
  const requestWithConfig = async (cfg: LLMConfig, label: string): Promise<string> => {
    const buildBody = (withJsonMode: boolean) =>
      JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        temperature: 1,
        max_tokens: 3072,
        ...(withJsonMode ? { response_format: { type: "json_object" } } : {}),
      });

    const post = async (withJsonMode: boolean) =>
      httpsRequest(cfg.baseUrl, buildBody(withJsonMode), cfg.apiKey);

    // 带重试：最多尝试 3 次（含 json_object 400 回退）
    const postWithRetry = async (withJsonMode: boolean): Promise<any> => {
      let lastErr: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await post(withJsonMode);
          if (r.status === 200) return { ...r, attemptNo: attempt + 1 };
          if (r.status === 400 && withJsonMode) return { ...r, attemptNo: attempt + 1 }; // 交给外层回退普通模式
          lastErr = new Error(`LLM API Error ${r.status}`);
          console.warn(`[llm:${label}] 返回 ${r.status}，重试 ${attempt + 1}/2`);
        } catch (e) {
          lastErr = e;
          console.warn(`[llm:${label}] 失败/超时，重试 ${attempt + 1}/2:`, (e as any)?.message);
        }
      }
      throw lastErr || new Error("LLM 请求失败");
    };

    let res = await postWithRetry(true);
    if (res.status === 400) {
      res = await postWithRetry(false);
    }
    if (res.status !== 200) {
      const errText = await res.body();
      throw new Error(`LLM API Error ${res.status}: ${errText}`);
    }
    return res.body().then((body: string) => {
      const text = parseStreamText(body);
      console.log(
        `[llm:${label}] 模型 ${cfg.model} 第${res.attemptNo}次尝试成功 status=200 ` +
          `ttft≈${res.timing.ttftMs}ms total≈${res.timing.totalMs}ms output=${text.length}chars`
      );
      return text;
    });
  };

  // 1) 先用主模型（DeepSeek）请求，失败/超时重试 2 次
  try {
    return await requestWithConfig(mergedConfig, "primary");
  } catch (primaryErr) {
    console.error("[llm] 主模型请求失败:", (primaryErr as any)?.message);
  }

  // 2) 主模型彻底失败 → 降级到备用模型（GLM）
  if (BACKUP_CONFIG.apiKey && BACKUP_CONFIG.baseUrl && BACKUP_CONFIG.model) {
    console.warn(`[llm] 降级到备用模型 ${BACKUP_CONFIG.model}`);
    return await requestWithConfig(BACKUP_CONFIG, "backup");
  }

  throw new Error("主模型请求失败，且未配置备用模型");
}

/** 解析 SSE 流文本，提取内容 */
function parseStreamText(text: string): string {
  let fullContent = "";
  const lines = text.split("\n");
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
  return fullContent;
}