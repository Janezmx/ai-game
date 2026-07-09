import React, { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameStore } from "../store/gameStore";
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
function getTrapEmoji(type: string): string {
  const idMap: Record<string, string> = {
    "煤气灯": "kp-gaslight",
    "职场PUA": "kp-pua",
    "职场": "kp-pua",
    "亲情": "kp-family",
    "网络": "kp-network",
    "歧视": "kp-bias",
  };
  for (const [key, kpId] of Object.entries(idMap)) {
    if (type.includes(key)) return TRAP_EMOJI_MAP[kpId] || "🎯";
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
}: {
  onComplete: () => void;
}) {
  const insets = useSafeAreaInsets();
  const {
    review,
    currentLevel,
    currentKnowledgePoint,
    markKnowledgeMastered,
  } = useGameStore();
  const { rounds, bestScores } = review;

  const knowledgePoint = currentKnowledgePoint || getLevelKnowledgePoint(currentLevel);

  // 完成本关复盘 → 标记该知识点为已掌握（持久化）
  useEffect(() => {
    if (knowledgePoint?.id) {
      markKnowledgeMastered(knowledgePoint.id);
    }
  }, [knowledgePoint, markKnowledgeMastered]);

  const avgScore = bestScores
    ? Math.round(
        (bestScores.boundaryAwareness +
          bestScores.emotionalStability +
          bestScores.cognitiveClarity +
          bestScores.assertiveResponse) /
          4
      )
    : 0;

  const effectiveCount = rounds.filter(
    (r) => r.assessment?.playerStatus === "effective"
  ).length;
  const totalRounds = rounds.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>📋 心域复盘报告</Text>
      <Text style={styles.subtitle}>回顾你的应对，识别操控套路</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 综合评分卡片 */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryScore}>{avgScore}</Text>
          <Text style={styles.summaryLabel}>综合防御评分</Text>
          <Text style={styles.summarySub}>
            {totalRounds > 0
              ? `${effectiveCount}/${totalRounds} 轮有效防御`
              : "暂无数据"}
          </Text>
          {bestScores && (
            <View style={styles.bestScoresRow}>
              <ScoreBar
                label="边界意识"
                value={bestScores.boundaryAwareness}
                color={palette.blue}
              />
              <ScoreBar
                label="情绪稳定"
                value={bestScores.emotionalStability}
                color={palette.green}
              />
              <ScoreBar
                label="认知清晰"
                value={bestScores.cognitiveClarity}
                color={palette.peach}
              />
              <ScoreBar
                label="坚定回应"
                value={bestScores.assertiveResponse}
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

        {/* 每轮分析 */}
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
                    {round.assessment.trapType}
                  </Text>
                </View>

                {/* NPC 动机 */}
                <Text style={styles.sectionLabel}>🎯 NPC 的动机</Text>
                <Text style={styles.analysisText}>
                  {round.assessment.trapAnalysis}
                </Text>

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

                {/* 本轮科普点评（为什么 + 识别要点） */}
                {round.assessment.whyNote && (
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
                )}

                {/* 维度评分 */}
                <View style={styles.dimRow}>
                  {Object.entries(round.assessment.dimensions).map(
                    ([key, val]) => (
                      <View key={key} style={styles.dimItem}>
                        <Text style={styles.dimValue}>{Math.round(val)}</Text>
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
                ) : (
                  <Text style={styles.emptyHint}>暂无建议</Text>
                )}
                {/* 进步对比 */}
                {round.assessment?.progressNote && round.assessment.progressNote !== "首轮评估" && (
                  <View style={styles.progressNote}>
                    <Text style={styles.progressNoteText}>{round.assessment.progressNote}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.completeBtn} onPress={onComplete} activeOpacity={0.85} accessibilityLabel="完成复盘，进入修复" accessibilityRole="button">
        <Text style={styles.completeBtnText}>进入修复 →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: palette.bg,
    maxWidth: 500,
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
  summaryScore: { color: palette.primaryDark, fontSize: 48, fontWeight: fontWeight.bold, fontFamily },
  summaryLabel: { color: palette.textSoft, fontSize: fontSize.caption, marginBottom: 2, fontFamily },
  summarySub: { color: palette.textFaint, fontSize: fontSize.caption, marginBottom: space.md, fontFamily },
  bestScoresRow: { width: "100%", gap: 4 },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginVertical: 1,
  },
  scoreLabel: { color: palette.textSoft, fontSize: fontSize.caption, width: 56, fontFamily },
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
    width: 28,
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
    lineHeight: 22,
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
  npcText: { color: palette.textSoft, fontSize: fontSize.body, lineHeight: 20, fontFamily },
  playerBubble: {
    backgroundColor: palette.surfaceSoft,
    padding: space.sm,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: palette.blue,
  },
  playerText: { color: palette.textSoft, fontSize: fontSize.body, lineHeight: 20, fontFamily },
  trapRow: { flexDirection: "row", marginTop: space.xs, gap: space.xs },
  trapTag: { color: palette.peach, fontSize: fontSize.body, fontWeight: fontWeight.semibold, fontFamily },
  analysisText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    lineHeight: 20,
    fontFamily,
  },
  adviceText: {
    color: palette.green,
    fontSize: fontSize.body,
    lineHeight: 20,
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
    lineHeight: 22,
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
    lineHeight: 20,
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
    lineHeight: 20,
    fontFamily,
  },
  altRationale: {
    color: palette.blue,
    fontSize: fontSize.caption,
    lineHeight: 16,
    marginTop: 2,
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
    lineHeight: 20,
    fontFamily,
  },
  emptyHint: {
    color: palette.textFaint,
    fontSize: fontSize.caption,
    fontStyle: "italic",
    fontFamily,
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
