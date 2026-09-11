import type { DimensionScores } from "@aigame/shared";

export const DIMENSION_KEYS = [
  "boundaryAwareness",
  "emotionalStability",
  "cognitiveClarity",
  "assertiveResponse",
] as const;

export const DIMENSION_LABELS: Record<string, string> = {
  boundaryAwareness: "边界意识",
  emotionalStability: "情绪稳定",
  cognitiveClarity: "认知清晰",
  assertiveResponse: "坚定回应",
};

export function emptyDimensions(): DimensionScores {
  return { boundaryAwareness: 0, emotionalStability: 0, cognitiveClarity: 0, assertiveResponse: 0 };
}

/**
 * 单维评分归一化（0~100 整数）。
 *
 * 为什么必须有：评估模型偶发按 0~1 小数制输出四维（0.62/0.65/0.7/0.78 本意是 62/65/70/78 分）。
 * 后端过去只做 0~100 钳位、没做小数制换算，小数被原样存进复盘与战绩，于是：
 *   1. 四维数值显示 Math.round(0.62) = 1（四个维度全变「1」）；
 *   2. 评分条宽度按 0.62% 渲染，几乎不可见；
 *   3. 与百分制轮次混在一起求平均，综合评分被严重拉低（72/0.62/65/50/50 → 47 分）。
 * 因此凡是从模型拿到、或读自旧存档的分数，一律先经此函数换算成百分制。
 */
export function normalizeDimensionScore(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  // (0,1) 区间视为小数制：×100 还原百分制；0 与 ≥1 的值本身已是百分制，原样保留
  const percent = n > 0 && n < 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

/** 四维整体归一化（逐维换算 + 钳位），用于入库兜底与旧存档兼容 */
export function normalizeDimensions(
  d: Partial<DimensionScores> | null | undefined,
  fallback = 0
): DimensionScores {
  return {
    boundaryAwareness: normalizeDimensionScore(d?.boundaryAwareness, fallback),
    emotionalStability: normalizeDimensionScore(d?.emotionalStability, fallback),
    cognitiveClarity: normalizeDimensionScore(d?.cognitiveClarity, fallback),
    assertiveResponse: normalizeDimensionScore(d?.assertiveResponse, fallback),
  };
}

/** 四维的综合评分（均值，四舍五入） */
export function averageOf(d: DimensionScores | null | undefined): number {
  if (!d) return 0;
  const n = normalizeDimensions(d);
  return Math.round(
    (n.boundaryAwareness + n.emotionalStability + n.cognitiveClarity + n.assertiveResponse) / 4
  );
}

/**
 * 多轮四维逐维取平均 = 「本局表现」。
 * 必须与 bestScores 的逐维取最大值（峰值/历史最佳）区分开：
 * 峰值语义单调不减，一旦某轮拿到高分就永远不变，输赢都不会回落。
 */
export function averageDimensions(
  list: DimensionScores[] | null | undefined
): DimensionScores | null {
  // 逐条先归一化再平均：既兜住小数制脏数据，也让旧存档（磁盘上已存成 0.62）显示回 62
  const valid = (list || [])
    .filter((d) => !!d && DIMENSION_KEYS.every((k) => Number.isFinite(d[k])))
    .map((d) => normalizeDimensions(d));
  if (valid.length === 0) return null;
  const acc = emptyDimensions();
  for (const d of valid) {
    for (const k of DIMENSION_KEYS) acc[k] += d[k];
  }
  for (const k of DIMENSION_KEYS) acc[k] = Math.round(acc[k] / valid.length);
  return acc;
}

/** 是否还有任何有效数据（四维全 0 视为无数据，避免雷达图退化成一个中心点） */
export function hasAnyScore(d: DimensionScores | null | undefined): boolean {
  if (!d) return false;
  return DIMENSION_KEYS.some((k) => normalizeDimensionScore(d[k]) > 0);
}
