import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameStore } from "../store/gameStore";
import { GestureHandlerRootView } from "react-native-gesture-handler";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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

const TRAP_EMOJI: Record<string, string> = {
  煤气灯效应: "💡",
  职场PUA: "💼",
  亲情绑架: "👨‍👩‍👧",
  匿名网络攻击: "👾",
  隐性歧视: "🎭",
};

function getTrapEmoji(type: string): string {
  for (const [key, emoji] of Object.entries(TRAP_EMOJI)) {
    if (type.includes(key)) return emoji;
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
  const { review, conversation } = useGameStore();
  const { rounds, bestScores } = review;

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
    <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top }]}>
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
                color="#4fc3f7"
              />
              <ScoreBar
                label="情绪稳定"
                value={bestScores.emotionalStability}
                color="#81c784"
              />
              <ScoreBar
                label="认知清晰"
                value={bestScores.cognitiveClarity}
                color="#ffb74d"
              />
              <ScoreBar
                label="坚定回应"
                value={bestScores.assertiveResponse}
                color="#ef5350"
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
                {round.assessment.alternatives.map((alt, i) => (
                  <View key={i} style={styles.altItem}>
                    <Text style={styles.altNum}>{i + 1}.</Text>
                    <Text style={styles.altText}>{alt}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.completeBtn} onPress={onComplete}>
        <Text style={styles.completeBtnText}>进入修复 →</Text>
      </TouchableOpacity>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0d0d1a", maxWidth: 500, width: "100%", alignSelf: "center" },
  title: {
    color: "#b388ff",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 8,
  },
  subtitle: {
    color: "#8888aa",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  summaryCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#7c4dff33",
    alignItems: "center",
  },
  summaryScore: { color: "#b388ff", fontSize: 48, fontWeight: "bold" },
  summaryLabel: { color: "#888", fontSize: 13, marginBottom: 2 },
  summarySub: { color: "#666", fontSize: 12, marginBottom: 12 },
  bestScoresRow: { width: "100%", gap: 4 },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginVertical: 1,
  },
  scoreLabel: { color: "#aaa", fontSize: 11, width: 56 },
  scoreTrack: {
    flex: 1,
    height: 6,
    backgroundColor: "#2a2a4a",
    borderRadius: 3,
    overflow: "hidden",
  },
  scoreFill: { height: "100%", borderRadius: 3 },
  scoreValue: {
    color: "#aaa",
    fontSize: 11,
    width: 28,
    textAlign: "right",
  },
  conclusionCard: {
    backgroundColor: "#1a2a1e",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#81c78433",
  },
  conclusionTitle: {
    color: "#81c784",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 6,
  },
  conclusionText: {
    color: "#aaccaa",
    fontSize: 13,
    lineHeight: 20,
  },
  roundCard: {
    backgroundColor: "#151525",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  roundHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  roundTitle: { color: "#b388ff", fontSize: 14, fontWeight: "bold" },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusEffective: { backgroundColor: "#1a3a2a" },
  statusShaken: { backgroundColor: "#3a3a1a" },
  statusTrapped: { backgroundColor: "#3a1a1a" },
  statusText: { color: "#ddd", fontSize: 11 },
  sectionLabel: {
    color: "#888",
    fontSize: 11,
    marginTop: 8,
    marginBottom: 4,
    fontWeight: "600",
  },
  npcBubble: {
    backgroundColor: "#2a1a1a",
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#ef5350",
  },
  npcText: { color: "#e0c0c0", fontSize: 13, lineHeight: 20 },
  playerBubble: {
    backgroundColor: "#1a2a3a",
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#4fc3f7",
  },
  playerText: { color: "#c0d0e0", fontSize: 13, lineHeight: 20 },
  trapRow: { flexDirection: "row", marginTop: 6, gap: 6 },
  trapTag: { color: "#ffb74d", fontSize: 12, fontWeight: "600" },
  analysisText: {
    color: "#aaa",
    fontSize: 12,
    lineHeight: 18,
  },
  adviceText: {
    color: "#81c784",
    fontSize: 12,
    lineHeight: 18,
    fontStyle: "italic",
  },
  dimRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    justifyContent: "center",
  },
  dimItem: {
    backgroundColor: "#1a1a2e",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    flex: 1,
  },
  dimValue: { color: "#b388ff", fontSize: 16, fontWeight: "bold" },
  dimLabel: { color: "#888", fontSize: 10, marginTop: 2 },
  altItem: {
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
    paddingLeft: 4,
  },
  altNum: { color: "#81c784", fontSize: 12, width: 16 },
  altText: {
    color: "#aaccaa",
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  completeBtn: {
    backgroundColor: "#7c4dff",
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  completeBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
