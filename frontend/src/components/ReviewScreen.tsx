import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  type DimensionValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameStore } from "../store/gameStore";
import { NPCResponseAssessment, SavedReviewReport } from "@aigame/shared";
import { fetchReviewComplete } from "../api/sse";
import {
  palette,
  radius,
  space,
  fontSize,
  fontWeight,
  fontFamily,
  shadow,
} from "../theme";
import KnowledgeCard, { getLevelKnowledgePoint, TRAP_EMOJI_MAP } from "./KnowledgeCard";
import {
  averageDimensions,
  averageOf,
  normalizeDimensionScore,
  normalizeDimensions,
} from "../utils/dimensions";

const STATUS_EMOJI: Record<string, string> = {
  effective: "✅",
  shaken: "⚠️",
  trapped: "❌",
};

const STATUS_LABEL: Record<string, string> = {
  effective: "有效防御",
  shaken: "轻度动摇",
  trapped: "落入陷阱",
};

/** 按操控手法中文名匹配 TRAP_EMOJI_MAP 的 id */
function getTrapEmoji(type?: string): string {
  // 兜底：后端评估偶发漏掉 trapType（输出合法 JSON 但键缺失），未归一化时 type 为
  // undefined，走到 type.includes 会抛异常导致复盘/修复界面整页白屏
  const safe = (type || "").trim();
  const idMap: Record<string, string> = {
    "煤气灯": "kp-gaslight",
    "职场PUA": "kp-pua",
    "职场": "kp-pua",
    "亲情": "kp-family",
    "网络": "kp-network",
    "歧视": "kp-bias",
  };
  for (const [key, kpId] of Object.entries(idMap)) {
    if (safe.includes(key)) return TRAP_EMOJI_MAP[kpId] || "🎯";
  }
  return "🎯";
}

function getAdvice(playerStatus: string): string {
  switch (playerStatus) {
    case "effective":
      return "你做得很好，保持了边界清晰。继续保持这种状态。";
    case "shaken":
      return "你开始动摇了，试着回归事实本身，不要被情绪带偏。";
    case "trapped":
      return "你落入了操控陷阱，深呼吸，重新审视对方的逻辑漏洞。";
    default:
      return "保持警惕，注意识别操控手法。";
  }
}

/** 该轮复盘长文本是否已补全：对话期评估仅含数值，三个关键长字段齐备才算完整 */
function hasFullReviewText(
  a: NPCResponseAssessment | null | undefined
): boolean {
  if (!a) return false;
  return Boolean(
    a.trapAnalysis?.trim() &&
      a.whyNote?.trim() &&
      Array.isArray(a.alternatives) &&
      a.alternatives.length > 0
  );
}

function ScoreBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.scoreTrack}>
        <View
          style={[styles.scoreFill, { width: `${value}%`, backgroundColor: color }]}
        />
      </View>
      <Text style={styles.scoreValue}>{Math.round(value)}</Text>
    </View>
  );
}

export default function ReviewScreen({
  onComplete,
  victory = false,
  report,
  onBack,
  footer,
}: {
  onComplete: () => void;
  victory?: boolean;
  /** 传入历史存档即进入只读模式：数据全部取自快照，不发请求、不写回 store */
  report?: SavedReviewReport;
  /** 只读模式下返回上一级的回调 */
  onBack?: () => void;
  /** 只读模式下替换底部按钮区（历史详情页用它承载导出/删除操作） */
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const {
    review,
    currentLevel,
    currentKnowledgePoint,
    markKnowledgeMastered,
  } = useGameStore();

  const readOnly = !!report;
  // 只读浏览历史存档时统一用快照数据，避免串入当前对局的实时状态
  const rounds = report ? report.rounds : review.rounds;
  // 旧存档里可能混入 0~1 小数制评分（0.62 本意是 62 分），读取时归一化，否则四维显示成 1
  const bestScores = normalizeDimensions(report ? report.dimensions : review.bestScores);
  const dimensionHistory = report
    ? report.dimensionHistory
    : review.dimensionHistory;
  const level = report ? report.level : currentLevel;
  // 本局表现 = 各轮四维的平均值。旧逻辑直接用 bestScores（逐轮取最大的峰值），
  // 等于把本关历史最高分当成「本局成绩」，赢了不涨、输了也不回落。
  const sessionScores = averageDimensions(dimensionHistory) || bestScores;

  const fallbackKp = getLevelKnowledgePoint(level);
  const knowledgePoint = readOnly
    ? report?.knowledgePoint || fallbackKp
    : currentKnowledgePoint || fallbackKp;

  // 仅胜利时才标记该知识点为已掌握。
  // 同时标记 currentKnowledgePoint.id（后端返回的）和标准兜底 id，
  // 这样即便模型生成的 id 异常（空/错误），标准 id 也能被记录，
  // 避免成长记录页看不到已掌握。
  useEffect(() => {
    // 只读浏览历史存档不能改写成长进度
    if (readOnly || !victory) return;
    const idsToMark = new Set<string>();
    if (currentKnowledgePoint?.id) idsToMark.add(currentKnowledgePoint.id);
    if (fallbackKp?.id) idsToMark.add(fallbackKp.id);
    idsToMark.forEach((id) => markKnowledgeMastered(id));
  }, [currentKnowledgePoint, fallbackKp, markKnowledgeMastered, victory, readOnly]);

  const avgScore = averageOf(sessionScores);

  const effectiveCount = rounds.filter(
    (r) => r.assessment?.playerStatus === "effective"
  ).length;
  const totalRounds = rounds.length;

  // —— 复盘文本补全：对话期评估仅含数值，缺失的复盘长文本进入复盘界面后按需补全 ——
  const [completingIds, setCompletingIds] = useState<number[]>([]);
  const reviewCompletedRef = useRef<Set<number>>(new Set());

  /** 单轮补全：始终从 store 读取最新 round 数据，发起 /api/review/complete 并回写 */
  const completeOne = useCallback(
    (idx: number) => {
      if (reviewCompletedRef.current.has(idx)) return; // 已在途/已完成，防重复（含手动点击竞态）
      const s = useGameStore.getState();
      const round = s.review.rounds[idx];
      if (!round) return;
      const assess = round.assessment;
      const npc = round.npcMessage?.content;
      const player = round.playerMessage?.content;
      if (!assess || !npc || !player) {
        reviewCompletedRef.current.add(idx); // 无对话原文/结算数值可补，跳过避免反复重试
        return;
      }
      reviewCompletedRef.current.add(idx); // 先标记，防止重复请求
      setCompletingIds((arr) => (arr.includes(idx) ? arr : [...arr, idx]));
      fetchReviewComplete({
        npcContent: npc,
        playerContent: player,
        trapType: assess.trapType,
        playerStatus: assess.playerStatus,
        dimensions: assess.dimensions,
        prevDimensions:
          s.review.rounds[idx - 1]?.assessment?.dimensions ?? null,
        roundNumber: idx + 1,
        levelTitle: level ? `第 ${level} 关` : undefined,
        // 兜底轮的分数是占位值：告诉后端禁止据此生成"下降X分"之类的对比文案
        degraded: assess.degraded === true,
      })
        .then((res) => {
          const full = res.assessment as unknown as NPCResponseAssessment;
          s.setRoundAssessment(idx, full);
          if (full.whyNote) s.addWhyNote(full.whyNote);
          // 补齐一轮就同步刷新存档：即使玩家中途离开，已生成的内容也已落盘
          void s.saveReviewReportDraft(victory);
        })
        .catch((err) => {
          console.warn("[review] 复盘点评补全失败:", err);
          // 失败不保留完成标记：重进复盘界面或手动点击可再次补全
          reviewCompletedRef.current.delete(idx);
        })
        .finally(() => {
          setCompletingIds((arr) => arr.filter((i) => i !== idx));
        });
    },
    [level, victory]
  );

  useEffect(() => {
    // 只读浏览历史存档时不发起任何补全请求（存档里有什么就展示什么）
    if (readOnly) return;
    // 每个 round（含第 1 轮）都是「NPC 台词 + 玩家回复 + 评估」的完整对话轮，
    // 只要评估缺复盘长文本就自动补全，不再跳过首轮。
    rounds.forEach((r, idx) => {
      if (!r.assessment) return;
      if (hasFullReviewText(r.assessment)) return; // 关键长文本已齐（数值评估不算完整）
      completeOne(idx);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, completeOne, readOnly]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>
        {readOnly ? `📋 第 ${level} 关复盘` : "📋 心域复盘报告"}
      </Text>
      <Text style={styles.subtitle}>
        {readOnly ? "历史存档 · 只读浏览" : "回顾你的应对，识别操控套路"}
      </Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 综合评分卡片 */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryScore}>{avgScore}</Text>
          <Text style={styles.summaryLabel}>本局综合评分</Text>
          <Text style={styles.summarySub}>
            {totalRounds > 0
              ? `${effectiveCount}/${totalRounds} 轮有效防御`
              : "暂无数据"}
          </Text>
          {sessionScores && (
            <View style={styles.bestScoresRow}>
              <ScoreBar
                label="边界意识"
                value={sessionScores.boundaryAwareness}
                color={palette.blue}
              />
              <ScoreBar
                label="情绪稳定"
                value={sessionScores.emotionalStability}
                color={palette.green}
              />
              <ScoreBar
                label="认知清晰"
                value={sessionScores.cognitiveClarity}
                color={palette.peach}
              />
              <ScoreBar
                label="坚定回应"
                value={sessionScores.assertiveResponse}
                color={palette.clay}
              />
            </View>
          )}
        </View>

        {/* 总结建议 */}
        {avgScore > 0 && (
          <View style={styles.conclusionCard}>
            <Text style={styles.conclusionTitle}>
              {avgScore >= 80
                ? "🌟 优秀表现"
                : avgScore >= 60
                ? "👍 表现不错"
                : avgScore >= 40
                ? "💪 仍需努力"
                : "📚 需要更多练习"}
            </Text>
            <Text style={styles.conclusionText}>
              {avgScore >= 80
                ? "你非常擅长识别心理操控，边界意识很强。继续保持，你能够应对更复杂的操控手法。"
                : avgScore >= 60
                ? "你有一定的防御能力，但在某些操控手法面前仍然容易动摇。建议多关注自己的情绪反应，识别对方的逻辑漏洞。"
                : avgScore >= 40
                ? "你需要更多的练习来识别心理操控。记住：操控者通常会否定你的感受、扭曲事实。相信自己的判断。"
                : "心理操控往往难以识别，建议从最基础的边界意识开始练习：当对方让你感到困惑或愧疚时，停下来想一想。"}
            </Text>
          </View>
        )}

        {/* 本课知识点沉淀 */}
        <Text style={styles.sectionTitleLarge}>📖 本课知识点</Text>
        <KnowledgeCard kp={knowledgePoint} />

        {/* 每轮分析：rounds 每项均为「NPC台词 + 玩家回复 + 评估」的完整一轮 */}
        {rounds.map((round, idx) => (
          <View key={idx} style={styles.roundCard}>
            <View style={styles.roundHeader}>
              <Text style={styles.roundTitle}>第 {idx + 1} 轮</Text>
              {round.assessment && (
                <View
                  style={[
                    styles.statusBadge,
                    round.assessment.playerStatus === "effective" &&
                      styles.statusEffective,
                    round.assessment.playerStatus === "shaken" &&
                      styles.statusShaken,
                    round.assessment.playerStatus === "trapped" &&
                      styles.statusTrapped,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {STATUS_EMOJI[round.assessment.playerStatus]}{" "}
                    {STATUS_LABEL[round.assessment.playerStatus]}
                  </Text>
                </View>
              )}
            </View>

            {/* 兜底提示：本轮分数/手法是后端占位值（模型空返回或解析失败），不参与综合评分 */}
            {round.assessment?.degraded && (
              <View style={styles.degradedBanner}>
                <Text style={styles.degradedText}>
                  ⚠️ 本轮评估未获取到有效数据，分数仅供参考、不计入本局综合评分
                </Text>
              </View>
            )}

            {/* NPC 话术 */}
            <Text style={styles.sectionLabel}>👾 NPC 说了什么</Text>
            <View style={styles.npcBubble}>
              <Text style={styles.npcText}>{round.npcMessage.content}</Text>
            </View>

            {round.assessment && (
              <>
                {/* 操控手法标签 */}
                <View style={styles.trapRow}>
                  <Text style={styles.trapTag}>
                    {getTrapEmoji(round.assessment.trapType)}{" "}
                    {round.assessment.trapType || "未知操控"}
                  </Text>
                </View>

                {/* NPC 动机（长文本延迟补全，缺失时显示 loading/可点击重试） */}
                <Text style={styles.sectionLabel}>🎯 NPC 的动机</Text>
                {round.assessment.trapAnalysis ? (
                  <Text style={styles.analysisText}>
                    {round.assessment.trapAnalysis}
                  </Text>
                ) : readOnly ? (
                  <Text style={styles.emptyHint}>该轮解析未生成</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.emptyRetry}
                    onPress={() => {
                      reviewCompletedRef.current.delete(idx);
                      completeOne(idx);
                    }}
                    disabled={completingIds.includes(idx)}
                    accessibilityRole="button"
                    accessibilityLabel="重试生成本轮动机解析"
                  >
                    <Text style={styles.emptyHint}>
                      {completingIds.includes(idx)
                        ? "正在生成本轮解析…"
                        : "解析暂不可用，点此重试"}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* 玩家回应 */}
                {round.playerMessage && (
                  <>
                    <Text style={styles.sectionLabel}>🧘 你的回应</Text>
                    <View style={styles.playerBubble}>
                      <Text style={styles.playerText}>
                        {round.playerMessage.content}
                      </Text>
                    </View>
                  </>
                )}

                {/* 建议 */}
                <Text style={styles.sectionLabel}>💡 给你的建议</Text>
                <Text style={styles.adviceText}>
                  {getAdvice(round.assessment.playerStatus)}
                </Text>

                {/* 本轮科普点评（为什么 + 识别要点；延迟补全，缺失时 loading） */}
                {round.assessment.whyNote ? (
                  <>
                    <Text style={styles.sectionLabel}>🔍 本轮科普点评</Text>
                    <View style={styles.whyBox}>
                      <Text style={styles.whyText}>{round.assessment.whyNote}</Text>
                      {round.assessment.identificationTip && (
                        <View style={styles.tipBox}>
                          <Text style={styles.tipLabel}>识别要点</Text>
                          <Text style={styles.tipText}>
                            {round.assessment.identificationTip}
                          </Text>
                        </View>
                      )}
                    </View>
                  </>
                ) : readOnly ? (
                  <Text style={styles.emptyHint}>该轮科普点评未生成</Text>
                ) : completingIds.includes(idx) ? (
                  <Text style={styles.emptyHint}>正在生成科普点评…</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.emptyRetry}
                    onPress={() => {
                      reviewCompletedRef.current.delete(idx);
                      completeOne(idx);
                    }}
                    disabled={false}
                    accessibilityRole="button"
                    accessibilityLabel="重试生成科普点评"
                  >
                    <Text style={styles.emptyHint}>科普点评暂不可用，点此重试</Text>
                  </TouchableOpacity>
                )}

                {/* 维度评分 */}
                <View style={styles.dimRow}>
                  {Object.entries(round.assessment.dimensions).map(
                    ([key, val]) => (
                      <View key={key} style={styles.dimItem}>
                        <Text style={styles.dimValue}>{normalizeDimensionScore(val)}</Text>
                        <Text style={styles.dimLabel}>
                          {key === "boundaryAwareness"
                            ? "边界"
                            : key === "emotionalStability"
                            ? "情绪"
                            : key === "cognitiveClarity"
                            ? "认知"
                            : "回应"}
                        </Text>
                      </View>
                    )
                  )}
                </View>

                {/* 替代回应 */}
                <Text style={styles.sectionLabel}>🔄 更好的回应方式</Text>
                {round.assessment.alternatives?.length ? (
                  round.assessment.alternatives.map((alt, i) => (
                    <View key={i} style={styles.altItem}>
                      <Text style={styles.altNum}>{i + 1}.</Text>
                      <View style={styles.altTextWrap}>
                        <Text style={styles.altText}>{alt.text}</Text>
                        <Text style={styles.altRationale}>💡 {alt.rationale}</Text>
                      </View>
                    </View>
                  ))
                ) : completingIds.includes(idx) ? (
                  <Text style={styles.emptyHint}>正在生成…</Text>
                ) : (
                  <Text style={styles.emptyHint}>暂无建议</Text>
                )}
                {/* 进步对比：首轮没有可对比的上一轮数据，一律不展示；兜底轮不做任何分数对比 */}
                {idx > 0 &&
                  !round.assessment?.degraded &&
                  round.assessment?.progressNote &&
                  round.assessment.progressNote !== "首轮评估" &&
                  round.assessment.progressNote !== "第一轮，暂无对比" &&
                  round.assessment.progressNote !== "本轮评估未获取到有效数据" && (
                  <View style={styles.progressNote}>
                    <Text style={styles.progressNoteText}>{round.assessment.progressNote}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        ))}
      </ScrollView>

      {readOnly && footer ? (
        footer
      ) : (
        <TouchableOpacity
          style={styles.completeBtn}
          onPress={readOnly ? onBack || onComplete : onComplete}
          activeOpacity={0.85}
          accessibilityLabel={readOnly ? "返回成长记录" : "完成复盘，进入修复"}
          accessibilityRole="button"
        >
          <Text style={styles.completeBtnText}>
            {readOnly ? "← 返回" : "进入修复 →"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh" as DimensionValue,
    backgroundColor: palette.bg,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    color: palette.primaryDark,
    fontSize: fontSize.heading,
    fontWeight: fontWeight.bold,
    textAlign: "center",
    marginTop: space.sm,
    fontFamily,
  },
  subtitle: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    textAlign: "center",
    marginBottom: space.md,
    fontFamily,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: space.md, paddingBottom: space.xl },
  summaryCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    ...shadow.soft,
  },
  summaryScore: { color: palette.primaryDark, fontSize: 50, fontWeight: fontWeight.bold, fontFamily },
  summaryLabel: { color: palette.textSoft, fontSize: fontSize.caption, marginBottom: 2, fontFamily },
  summarySub: { color: palette.textFaint, fontSize: fontSize.caption, marginBottom: space.md, fontFamily },
  bestScoresRow: { width: "100%", gap: 4 },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginVertical: 1,
  },
  // 固定宽度需容纳最长的四字标签（如「边界意识」），14px 字号下四字约 56px，故留到 68 不折行
  scoreLabel: { color: palette.textSoft, fontSize: fontSize.caption, width: 68, fontFamily },
  scoreTrack: {
    flex: 1,
    height: 6,
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  scoreFill: { height: "100%", borderRadius: radius.pill },
  scoreValue: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    width: 32,
    textAlign: "right",
    fontFamily,
  },
  conclusionCard: {
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  conclusionTitle: {
    color: palette.green,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    marginBottom: space.xs,
    fontFamily,
  },
  conclusionText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    lineHeight: 24,
    fontFamily,
  },
  sectionTitleLarge: {
    color: palette.primaryDark,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    marginBottom: space.sm,
    marginTop: space.sm,
    fontFamily,
  },
  roundCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.soft,
  },
  roundHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space.sm,
  },
  roundTitle: { color: palette.primaryDark, fontSize: fontSize.sub, fontWeight: fontWeight.bold, fontFamily },
  statusBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  statusEffective: { backgroundColor: "rgba(136,168,120,0.18)" },
  statusShaken: { backgroundColor: "rgba(224,176,132,0.22)" },
  statusTrapped: { backgroundColor: "rgba(201,123,110,0.22)" },
  statusText: { color: palette.text, fontSize: fontSize.caption, fontFamily },
  sectionLabel: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    marginTop: space.sm,
    marginBottom: space.xs,
    fontWeight: fontWeight.semibold,
    fontFamily,
  },
  npcBubble: {
    backgroundColor: palette.surfaceSoft,
    padding: space.sm,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: palette.clay,
  },
  npcText: { color: palette.textSoft, fontSize: fontSize.body, lineHeight: 22, fontFamily },
  playerBubble: {
    backgroundColor: palette.surfaceSoft,
    padding: space.sm,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: palette.blue,
  },
  playerText: { color: palette.textSoft, fontSize: fontSize.body, lineHeight: 22, fontFamily },
  trapRow: { flexDirection: "row", marginTop: space.xs, gap: space.xs },
  trapTag: { color: palette.peach, fontSize: fontSize.body, fontWeight: fontWeight.semibold, fontFamily },
  analysisText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    lineHeight: 22,
    fontFamily,
  },
  adviceText: {
    color: palette.green,
    fontSize: fontSize.body,
    lineHeight: 22,
    fontStyle: "italic",
    fontFamily,
  },
  whyBox: {
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.sm,
    padding: space.sm,
    borderWidth: 1,
    borderColor: palette.border,
    borderLeftWidth: 3,
    borderLeftColor: palette.peach,
  },
  whyText: {
    color: palette.text,
    fontSize: fontSize.body,
    lineHeight: 24,
    fontFamily,
  },
  tipBox: {
    marginTop: space.xs,
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    padding: space.sm,
    borderLeftWidth: 3,
    borderLeftColor: palette.blue,
  },
  tipLabel: {
    color: palette.primaryDark,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    marginBottom: 2,
    fontFamily,
  },
  tipText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    lineHeight: 22,
    fontFamily,
  },
  dimRow: {
    flexDirection: "row",
    gap: space.xs,
    marginTop: space.sm,
    justifyContent: "center",
  },
  dimItem: {
    backgroundColor: palette.surfaceSoft,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    alignItems: "center",
    flex: 1,
  },
  dimValue: { color: palette.primaryDark, fontSize: fontSize.sub, fontWeight: fontWeight.bold, fontFamily },
  dimLabel: { color: palette.textFaint, fontSize: fontSize.caption, marginTop: 2, fontFamily },
  altItem: {
    flexDirection: "row",
    gap: 4,
    marginTop: space.xs,
    paddingLeft: 4,
  },
  altNum: { color: palette.green, fontSize: fontSize.body, width: 16, fontFamily },
  altTextWrap: { flex: 1 },
  altText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    lineHeight: 22,
    fontFamily,
  },
  altRationale: {
    color: palette.blue,
    fontSize: fontSize.caption,
    lineHeight: 18,
    marginTop: 2,
    fontFamily,
  },
  degradedBanner: {
    marginTop: space.sm,
    backgroundColor: "rgba(214,138,110,0.14)",
    borderRadius: radius.sm,
    padding: space.sm,
    borderLeftWidth: 3,
    borderLeftColor: palette.clay,
  },
  degradedText: {
    color: palette.clay,
    fontSize: fontSize.body,
    lineHeight: 20,
    fontFamily,
  },
  progressNote: {
    marginTop: space.sm,
    backgroundColor: "rgba(167,196,212,0.15)",
    borderRadius: radius.sm,
    padding: space.sm,
    borderLeftWidth: 3,
    borderLeftColor: palette.blue,
  },
  progressNoteText: {
    color: palette.blue,
    fontSize: fontSize.body,
    lineHeight: 22,
    fontFamily,
  },
  emptyHint: {
    color: palette.textFaint,
    fontSize: fontSize.caption,
    fontStyle: "italic",
    fontFamily,
    marginTop: space.xs,
  },
  emptyRetry: {
    alignSelf: "flex-start",
    marginTop: space.xs,
  },
  completeBtn: {
    backgroundColor: palette.primary,
    marginHorizontal: space.md,
    marginBottom: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: "center",
    ...shadow.soft,
  },
  completeBtnText: { color: palette.surface, fontSize: fontSize.sub, fontWeight: fontWeight.semibold, fontFamily },
});
