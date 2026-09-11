import type { ReviewReportMeta, SavedReviewReport } from "@aigame/shared";

/**
 * 复盘存档客户端
 *
 * 数据真正落在本机文件（服务端 /api/reviews，生产态由 Electron 自带服务器提供，
 * 开发态由 Next.js 路由提供）。这里额外用 localStorage 做一层"待同步缓冲"：
 * 接口不可用（没起后端、数据目录不可写）时先存本地，保证玩家进度不丢，
 * 也让功能在纯浏览器环境下降级可用。
 */
const BUFFER_KEY = "aigame-reports";
/** 本地服务响应很快，超时只用于兜底"服务端假死"的情况 */
const REQUEST_TIMEOUT = 8000;

type ReportBuffer = Record<string, SavedReviewReport>;

function readBuffer(): ReportBuffer {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ReportBuffer) : {};
  } catch (e) {
    console.warn("[reviews] 本地缓冲解析失败:", (e as Error)?.message);
    return {};
  }
}

function writeBuffer(buffer: ReportBuffer): void {
  try {
    localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
  } catch (e) {
    // 配额写满时不影响游戏流程，仅记录；服务端落盘才是主路径
    console.warn("[reviews] 本地缓冲写入失败:", (e as Error)?.message);
  }
}

function toMeta(report: SavedReviewReport): ReviewReportMeta {
  return {
    id: report.id,
    level: report.level,
    levelTitle: report.levelTitle || "",
    timestamp: report.timestamp,
    victory: !!report.victory,
    avgScore: typeof report.avgScore === "number" ? report.avgScore : 0,
    roundCount: Array.isArray(report.rounds) ? report.rounds.length : 0,
  };
}

function sortByTimeDesc<T extends { timestamp: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => b.timestamp - a.timestamp);
}

/** 带超时的 fetch，避免服务端无响应时界面一直卡在加载态 */
async function request(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 读取全部报告元数据（按时间倒序）；服务端不可用时回退本地缓冲 */
export async function listReports(): Promise<ReviewReportMeta[]> {
  try {
    const res = await request("/api/reviews");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.ok || !Array.isArray(data.reports)) throw new Error("返回体异常");
    return data.reports as ReviewReportMeta[];
  } catch (e) {
    console.warn("[reviews] 读取列表失败，回退本地缓冲:", (e as Error)?.message);
    return sortByTimeDesc(Object.values(readBuffer()).map(toMeta));
  }
}

/** 读取单局完整报告；不存在返回 null */
export async function getReport(id: string): Promise<SavedReviewReport | null> {
  try {
    const res = await request(`/api/reviews?id=${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.ok || !data.report) throw new Error("返回体异常");
    return data.report as SavedReviewReport;
  } catch (e) {
    console.warn("[reviews] 读取复盘失败，回退本地缓冲:", (e as Error)?.message);
    return readBuffer()[id] ?? null;
  }
}

/**
 * 保存（同一 id 走 upsert）
 * 先写本地缓冲再请求服务端，服务端落盘成功后清掉缓冲，因此调用方无需关心成败。
 */
export async function saveReport(
  report: SavedReviewReport
): Promise<{ id: string; persisted: boolean }> {
  const buffer = readBuffer();
  buffer[report.id] = report;
  writeBuffer(buffer);

  try {
    const res = await request("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || "保存失败");

    const latest = readBuffer();
    if (latest[report.id]) {
      delete latest[report.id];
      writeBuffer(latest);
    }
    return { id: (data.id as string) || report.id, persisted: true };
  } catch (e) {
    console.warn("[reviews] 存档落盘失败，暂存本地缓冲:", (e as Error)?.message);
    return { id: report.id, persisted: false };
  }
}

/** 删除单局报告（含本地缓冲）；返回是否确实删除了内容 */
export async function deleteReport(id: string): Promise<boolean> {
  const buffer = readBuffer();
  let removedLocal = false;
  if (buffer[id]) {
    delete buffer[id];
    writeBuffer(buffer);
    removedLocal = true;
  }

  try {
    const res = await request(`/api/reviews?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Boolean(data?.removed) || removedLocal;
  } catch (e) {
    console.warn("[reviews] 删除落盘失败，已清理本地缓冲:", (e as Error)?.message);
    return removedLocal;
  }
}
