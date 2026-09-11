/**
 * 复盘报告本地存储层
 *
 * 为什么放在 electron/ 目录：打包配置（electron-builder.json 的 files）只包含
 * electron/**、frontend/dist/**、backend/.env.local，后端 app 代码不进包。
 * 存储层必须同时被"生产态 Electron 自带服务器"和"开发态 Next.js 路由"使用，
 * 所以做成纯 CJS、零依赖模块，两边各 require 同一份实现，保证行为一致。
 *
 * 存储布局（目录默认与 electron-builder productName 对应的 userData 同级）：
 *   reports/index.json   轻量元数据数组，列表页只读它，避免扫描上百个正文文件
 *   reports/<id>.json    单局完整报告（含逐轮对话原文与全部点评文本）
 *
 * 可靠性取舍：
 * - 写入顺序"先正文、后索引"，索引损坏时可扫描目录重建，避免单文件损坏丢全部；
 * - 单次写入采用"临时文件 + rename"同目录替换，防止写盘中途崩溃留下半截 JSON；
 * - 超出上限（默认 100 局）时按时间丢弃最旧的一局（同时删除其正文文件）。
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

/** 最多保留的历史复盘份数（可用环境变量覆盖，便于测试） */
const MAX_REPORTS = Number(process.env.AIGAME_REPORT_LIMIT) || 100;
const INDEX_FILE = "index.json";
const STORE_VERSION = 1;

/** 解析数据目录：优先环境变量，其次与 Electron userData 对齐的漫游目录 */
function resolveReportDir() {
  if (process.env.AIGAME_REPORT_DIR) return process.env.AIGAME_REPORT_DIR;
  const roaming =
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(roaming, "清醒边界", "reports");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** 索引文件名（不含扩展名），id 与它同名会覆盖索引，需保留 */
const RESERVED_ID = INDEX_FILE.replace(/\.json$/, "");

/** 报告 id 会参与文件名拼接，只允许时间戳与关卡号这类安全字符（同时挡住路径穿越与索引同名） */
function safeId(id) {
  const cleaned = String(id == null ? "" : id).replace(/[^0-9a-zA-Z_-]/g, "");
  return cleaned === RESERVED_ID ? "" : cleaned;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), "utf-8");
  fs.renameSync(tmp, file);
}

function reportFile(dir, id) {
  return path.join(dir, `${id}.json`);
}

/** 从完整报告中抽取列表所需的轻量元数据 */
function toMeta(report) {
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

/** 索引损坏（或首次运行）时扫描目录重建，正文损坏的单局跳过 */
function rebuildIndex(dir) {
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const index = [];
  for (const f of files) {
    if (!f.endsWith(".json") || f === INDEX_FILE) continue;
    const report = readJson(path.join(dir, f));
    if (!report || typeof report.timestamp !== "number") continue;
    const id = safeId(report.id) || safeId(f.replace(/\.json$/, ""));
    if (!id) continue;
    index.push(toMeta({ ...report, id }));
  }
  index.sort((a, b) => b.timestamp - a.timestamp);
  try {
    writeJsonAtomic(path.join(dir, INDEX_FILE), index);
    console.warn(`[review-store] 索引已重建，共 ${index.length} 份报告`);
  } catch (e) {
    console.warn("[review-store] 索引重建写盘失败:", e && e.message);
  }
  return index;
}

/** 读取索引（永不抛错，失败时重建），返回按时间倒序的元数据数组 */
function readIndex(dir) {
  const parsed = readJson(path.join(dir, INDEX_FILE));
  if (!Array.isArray(parsed)) return rebuildIndex(dir);
  const seen = new Set();
  const list = [];
  for (const item of parsed) {
    if (!item || typeof item.timestamp !== "number") continue;
    const id = safeId(item.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    list.push({ ...item, id });
  }
  list.sort((a, b) => b.timestamp - a.timestamp);
  return list;
}

/** 列出全部报告元数据（按时间倒序） */
function listReports() {
  const dir = resolveReportDir();
  ensureDir(dir);
  return readIndex(dir);
}

/** 读取单局完整报告，不存在或损坏返回 null */
function getReport(id) {
  const safe = safeId(id);
  if (!safe) return null;
  const dir = resolveReportDir();
  const report = readJson(reportFile(dir, safe));
  if (!report || typeof report !== "object") return null;
  return { ...report, id: safe };
}

/**
 * 新增或更新一份报告（同一局多次调用走 upsert，不会产生重复文件）
 * @param {object} report 完整报告，至少包含 level 与 timestamp
 * @returns {{ id: string }}
 */
function saveReport(report) {
  if (!report || typeof report !== "object") {
    throw new Error("报告内容为空");
  }
  const level = Number(report.level);
  const timestamp = Number(report.timestamp);
  if (!Number.isFinite(level) || level <= 0) {
    throw new Error("报告缺少合法的 level");
  }
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error("报告缺少合法的 timestamp");
  }

  const dir = resolveReportDir();
  ensureDir(dir);

  // id 由前端生成（`${timestamp}-${level}`），缺失时后端兜底补齐，保证 upsert 键稳定
  const id = safeId(report.id) || `${timestamp}-${level}`;
  const full = {
    ...report,
    id,
    version: STORE_VERSION,
    savedAt: Date.now(),
    level,
    timestamp,
  };

  // 先落正文：正文写成功才更新索引，避免索引指向不存在的文件
  writeJsonAtomic(reportFile(dir, id), full);

  const index = readIndex(dir).filter((item) => item.id !== id);
  index.push(toMeta(full));
  index.sort((a, b) => b.timestamp - a.timestamp);

  // 超限裁剪：丢弃最旧的一局（含正文），O(n log n) 对本量级可忽略
  const overflow = index.splice(MAX_REPORTS);
  for (const item of overflow) {
    try {
      fs.unlinkSync(reportFile(dir, item.id));
    } catch {}
  }

  writeJsonAtomic(path.join(dir, INDEX_FILE), index);
  return { id };
}

/** 删除单局报告（正文 + 索引项），返回是否确实删除了一份 */
function deleteReport(id) {
  const safe = safeId(id);
  if (!safe) return false;
  const dir = resolveReportDir();
  ensureDir(dir);

  let removed = false;
  try {
    fs.unlinkSync(reportFile(dir, safe));
    removed = true;
  } catch {}

  const index = readIndex(dir);
  const kept = index.filter((item) => item.id !== safe);
  if (kept.length !== index.length) {
    removed = true;
    writeJsonAtomic(path.join(dir, INDEX_FILE), kept);
  }
  return removed;
}

module.exports = {
  MAX_REPORTS,
  resolveReportDir,
  listReports,
  getReport,
  saveReport,
  deleteReport,
};
