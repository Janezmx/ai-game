/**
 * 关卡名的展示层归一化
 *
 * 为什么需要：`levelTitle` 会被**快照**进玩家数据 ——
 * `GameRecord.levelTitle`（localStorage 的战绩）、`SavedReviewReport.levelTitle`
 * 与 `SavedReviewReport.knowledgePoint.tactic`（服务端存档文件）。
 * 关卡一旦改名，历史数据里仍是旧名，会在"成长页对战记录""导出报告的标题与文件名"
 * 这些地方露出来。
 *
 * 这里选择在**展示时**做旧名 → 新名的翻译：
 * - 不动玩家存档，不需要数据迁移，历史成绩不会因为改名而失效；
 * - 旧存档原文仍保留在磁盘上，导出的 JSON 结构不变。
 *
 * 维护约定：以后新增或再次改名时，把**旧名作为键**追加到本表即可（只增不删）。
 * 映射是一次性的，不要在这里做链式转换。
 *
 * 匹配策略：**精确整串匹配**，不做子串替换。
 * 因为归一化只用于"标签"（关卡名 / 知识点手法名），
 * 而像"煤气灯效应阶段"这种出现在点评正文里的术语，必须原样保留。
 */
const LEGACY_LEVEL_TITLES: Record<string, string> = {
  "煤气灯效应": "煤气灯操控",
  "职场PUA": "职场打压",
  "匿名网络攻击": "网络围攻",
  "隐性歧视": "偏见伪装",
};

/** 把历史快照里的旧关卡名 / 旧手法名翻译为当前名；未命中或为空则原样返回 */
export function normalizeLevelTitle(title?: string | null): string {
  const t = (title || "").trim();
  if (!t) return "";
  return LEGACY_LEVEL_TITLES[t] ?? t;
}

/**
 * 操控手法标签（`trapType`）的宽松归一化。
 *
 * 与 normalizeLevelTitle 的关键区别：这里做**子串替换**。
 * 因为 trapType 是模型自由生成的短标签，旧存档里常见拼接写法
 * （如「煤气灯效应 + 情感绑架」），整串精确匹配会漏掉。
 *
 * 只可用于标签（复盘页/导出的「操控手法」），**不要用于点评正文**——
 * 正文里的「煤气灯效应阶段」是心理学专有名词，必须原样保留。
 */
export function normalizeTrapType(trapType?: string | null): string {
  let t = trapType || "";
  if (!t.trim()) return "";
  for (const [from, to] of Object.entries(LEGACY_LEVEL_TITLES)) {
    if (t.includes(from)) t = t.split(from).join(to);
  }
  return t;
}
