import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

/**
 * 复盘报告存档接口（开发态）
 *
 * 生产态由 electron/server.js 的内置服务器提供同名端点，两端共用同一份存储层
 * （electron/review-store.js，纯 CJS 零依赖）。该模块位于 backend 之外且是运行时
 * 依赖、不参与 Next 打包，因此这里在运行时按相对位置加载，而不是静态 import。
 *
 * GET    /api/reviews          → { ok, reports: ReviewReportMeta[] }
 * GET    /api/reviews?id=<id>  → { ok, report: SavedReviewReport }
 * POST   /api/reviews          → { ok, id }   （body 为完整报告，同 id 走 upsert）
 * DELETE /api/reviews?id=<id>  → { ok, removed }
 */
interface ReviewStore {
  listReports(): unknown[];
  getReport(id: string): unknown | null;
  saveReport(report: unknown): { id: string };
  deleteReport(id: string): boolean;
  resolveReportDir(): string;
}

let cachedStore: ReviewStore | null = null;
let resolveLogged = false;

function loadReviewStore(): ReviewStore {
  if (cachedStore) return cachedStore;
  // 兼容两种启动方式：在 backend 目录内启动（npm run dev:backend），或在仓库根启动
  const candidates = [
    path.join(process.cwd(), "..", "electron", "review-store.js"),
    path.join(process.cwd(), "electron", "review-store.js"),
  ];
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) {
    throw new Error(
      `未找到复盘存储层 review-store.js，已尝试：${candidates.join(" / ")}`
    );
  }
  // 运行时 require：绕开 webpack 对仓库外层模块的静态解析
  const runtimeRequire = eval("require") as NodeRequire;
  cachedStore = runtimeRequire(hit) as ReviewStore;
  return cachedStore;
}

function dataDir(store: ReviewStore): string {
  const dir = store.resolveReportDir();
  if (!resolveLogged) {
    resolveLogged = true;
    console.log(`[reviews] 复盘存档目录: ${dir}`);
  }
  return dir;
}

function fail(message: string, error: unknown, status = 500) {
  console.error(`[reviews] ${message}:`, (error as Error)?.message || error);
  return NextResponse.json(
    { error: message, details: String((error as Error)?.message || error) },
    { status }
  );
}

export async function GET(request: NextRequest) {
  try {
    const store = loadReviewStore();
    dataDir(store);
    const id = request.nextUrl.searchParams.get("id");
    if (id) {
      const report = store.getReport(id);
      if (!report) {
        return NextResponse.json({ error: "复盘报告不存在" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, report });
    }
    return NextResponse.json({ ok: true, reports: store.listReports() });
  } catch (error) {
    return fail("读取复盘存档失败", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const store = loadReviewStore();
    dataDir(store);
    const body = await request.json();
    const { id } = store.saveReport(body);
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    // 请求体解析失败属于客户端问题
    const isParseError = error instanceof SyntaxError;
    return fail(
      isParseError ? "请求体不是合法 JSON" : "保存复盘存档失败",
      error,
      isParseError ? 400 : 500
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const store = loadReviewStore();
    dataDir(store);
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, removed: store.deleteReport(id) });
  } catch (error) {
    return fail("删除复盘存档失败", error);
  }
}
