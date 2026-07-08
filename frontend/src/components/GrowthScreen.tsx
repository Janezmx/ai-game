import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Modal,
} from "react-native";
import Svg, { Circle, Line, Polyline, Polygon, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameStore } from "../store/gameStore";
import { KnowledgePoint } from "@aigame/shared";
import {
  palette,
  radius,
  space,
  fontSize,
  fontWeight,
  fontFamily,
  shadow,
} from "../theme";
import KnowledgeCard, { LEVEL_KNOWLEDGE, TRAP_EMOJI_MAP } from "./KnowledgeCard";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_SIZE = Math.min(SCREEN_WIDTH - 48, 320);
const CENTER = CHART_SIZE / 2;
const RADAR_RADIUS = CENTER * 0.65;

const DIMENSION_KEYS = ["boundaryAwareness", "emotionalStability", "cognitiveClarity", "assertiveResponse"] as const;
const DIMENSION_LABELS: Record<string, string> = {
  boundaryAwareness: "边界意识",
  emotionalStability: "情绪稳定",
  cognitiveClarity: "认知清晰",
  assertiveResponse: "坚定回应",
};

type Tab = "history" | "badges";

function RadarChart({ scores }: { scores: Record<string, number> }) {
  const angles = DIMENSION_KEYS.map((_, i) => (i / DIMENSION_KEYS.length) * Math.PI * 2 - Math.PI / 2);
  const levels = [20, 40, 60, 80, 100];

  const getPoint = (angle: number, value: number) => ({
    x: CENTER + Math.cos(angle) * (RADAR_RADIUS * (value / 100)),
    y: CENTER + Math.sin(angle) * (RADAR_RADIUS * (value / 100)),
  });

  const dataPoints = DIMENSION_KEYS.map((key, i) => getPoint(angles[i], scores[key] || 0));
  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const labelPoints = DIMENSION_KEYS.map((key, i) => getPoint(angles[i], 120));

  return (
    <Svg width={CHART_SIZE} height={CHART_SIZE} viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`}>
      {/* 背景网格 */}
      {levels.map((lv) => {
        const pts = DIMENSION_KEYS.map((_, i) => {
          const p = getPoint(angles[i], lv);
          return `${p.x},${p.y}`;
        }).join(" ");
        return <Polygon key={lv} points={pts} fill="none" stroke={palette.border} strokeWidth={1} />;
      })}
      {/* 轴线 */}
      {DIMENSION_KEYS.map((_, i) => {
        const end = getPoint(angles[i], 100);
        return (
          <Line
            key={i}
            x1={CENTER}
            y1={CENTER}
            x2={end.x}
            y2={end.y}
            stroke={palette.border}
            strokeWidth={1}
          />
        );
      })}
      {/* 数据区域 */}
      <Polygon points={polygonPoints} fill="#E0A89944" stroke={palette.primaryDark} strokeWidth={2} />
      {/* 数据点 */}
      {dataPoints.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={4} fill={palette.primaryDark} />
      ))}
      {/* 标签 */}
      {labelPoints.map((p, i) => (
        <SvgText
          key={i}
          x={p.x}
          y={p.y}
          fill={palette.textSoft}
          fontSize={11}
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {DIMENSION_LABELS[DIMENSION_KEYS[i]]}
        </SvgText>
      ))}
      {/* 中心数值 */}
      <SvgText x={CENTER} y={CENTER + 4} fill={palette.primaryDark} fontSize={18} fontWeight="bold" textAnchor="middle">
        {Math.round((scores.boundaryAwareness + scores.emotionalStability + scores.cognitiveClarity + scores.assertiveResponse) / 4)}
      </SvgText>
    </Svg>
  );
}

function MiniLineChart({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = Math.min(SCREEN_WIDTH - 48, 320);
  const h = 100;
  const pad = 8;
  const chartW = w - pad * 2;
  const chartH = h - pad * 2;
  const max = Math.max(...data, 100);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = chartW / (data.length - 1);

  const points = data.map((v, i) => `${pad + i * stepX},${pad + chartH - ((v - min) / range) * chartH}`).join(" ");

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {/* 参考线 */}
      <Line x1={pad} y1={pad} x2={pad} y2={pad + chartH} stroke={palette.border} strokeWidth={1} />
      <Line x1={pad} y1={pad + chartH} x2={pad + chartW} y2={pad + chartH} stroke={palette.border} strokeWidth={1} />
      {/* 折线 */}
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} />
      {/* 数据点 + 数值标签 */}
      {data.map((v, i) => {
        const cx = pad + i * stepX;
        const cy = pad + chartH - ((v - min) / range) * chartH;
        return (
          <React.Fragment key={i}>
            <Circle cx={cx} cy={cy} r={3} fill={color} />
            <SvgText x={cx} y={cy - 8} fill={color} fontSize={9} textAnchor="middle" fontWeight="bold">
              {Math.round(v)}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

export default function GrowthScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { gameHistory, badges, review, masteredKnowledgePointIds } = useGameStore();
  const [tab, setTab] = useState<Tab>("history");

  const bestScores = review.bestScores;
  const scoreTrend = gameHistory.map((r) => r.avgScore);
  const victories = gameHistory.filter((r) => r.victory).length;
  const totalGames = gameHistory.length;
  const unlockedBadges = badges.filter((b) => b.unlockedAt);

  const allKnowledge = Object.values(LEVEL_KNOWLEDGE);
  const [selectedKp, setSelectedKp] = useState<KnowledgePoint | null>(null);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🌱 成长记录</Text>
        <View style={styles.backBtn} />
      </View>

      {/* 统计概览 */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalGames}</Text>
          <Text style={styles.statLabel}>总对局</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{victories}</Text>
          <Text style={styles.statLabel}>胜利</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{unlockedBadges.length}/{badges.length}</Text>
          <Text style={styles.statLabel}>徽章</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{masteredKnowledgePointIds.length}/{allKnowledge.length}</Text>
          <Text style={styles.statLabel}>知识点</Text>
        </View>
      </View>

      {/* 标签切换 */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === "history" && styles.tabActive]}
          onPress={() => setTab("history")}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, tab === "history" && styles.tabTextActive]}>战绩</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "badges" && styles.tabActive]}
          onPress={() => setTab("badges")}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, tab === "badges" && styles.tabTextActive]}>徽章</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {tab === "history" ? (
          <>
            {/* 已掌握知识点 */}
            <Text style={styles.sectionTitle}>📚 已掌握知识点</Text>
            <View style={styles.kpWrap}>
              {allKnowledge.map((kp) => {
                const mastered = masteredKnowledgePointIds.includes(kp.id);
                return (
                  <TouchableOpacity
                    key={kp.id}
                    style={[styles.kpItem, !mastered && styles.kpItemLocked]}
                    onPress={() => setSelectedKp(kp)}
                    activeOpacity={0.7}
                    accessibilityLabel={`查看${kp.tactic}详情`}
                    accessibilityRole="button"
                  >
                    <Text style={styles.kpEmoji}>{TRAP_EMOJI_MAP[kp.id] || "📖"}</Text>
                    <View style={styles.kpTextWrap}>
                      <Text style={[styles.kpName, !mastered && styles.kpNameLocked]}>{kp.tactic}</Text>
                      <Text style={styles.kpDef} numberOfLines={1}>{kp.definition}</Text>
                    </View>
                    <Text style={[styles.kpMark, mastered ? styles.kpMastered : styles.kpUnmastered]}>
                      {mastered ? "✓" : "○"}
                    </Text>
                    <Text style={styles.kpArrow}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 雷达图 */}
            {bestScores && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>📊 四维能力雷达</Text>
                <View style={styles.chartCenter}>
                  <RadarChart scores={bestScores} />
                </View>
              </View>
            )}

            {/* 趋势折线图 */}
            {scoreTrend.length >= 2 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>📈 评分趋势</Text>
                <View style={styles.chartCenter}>
                  <MiniLineChart data={scoreTrend} color={palette.primary} />
                </View>
              </View>
            )}

            {/* 历史记录 */}
            <Text style={styles.sectionTitle}>📜 对战记录</Text>
            {gameHistory.length === 0 && (
              <Text style={styles.emptyText}>还没有对战记录，快去挑战吧！</Text>
            )}
            {[...gameHistory].reverse().map((record, idx) => (
              <View key={idx} style={styles.recordCard}>
                <View style={styles.recordHeader}>
                  <Text style={styles.recordLevel}>第 {record.level} 关</Text>
                  <Text style={[styles.recordResult, record.victory ? styles.victory : styles.defeat]}>
                    {record.victory ? "✅ 胜利" : "💔 失败"}
                  </Text>
                </View>
                <Text style={styles.recordTitle}>{record.levelTitle}</Text>
                <Text style={styles.recordScore}>综合评分: {record.avgScore}</Text>
                <Text style={styles.recordTime}>
                  {new Date(record.timestamp).toLocaleString("zh-CN")}
                </Text>
              </View>
            ))}
          </>
        ) : (
          /* 徽章墙 */
          <View style={styles.badgeGrid}>
            {badges.map((badge) => (
              <View
                key={badge.id}
                style={[styles.badgeItem, !badge.unlockedAt && styles.badgeLocked]}
              >
                <Text style={[styles.badgeIcon, !badge.unlockedAt && styles.badgeIconLocked]}>
                  {badge.unlockedAt ? badge.icon : "🔒"}
                </Text>
                <Text style={[styles.badgeName, !badge.unlockedAt && styles.badgeNameLocked]}>
                  {badge.name}
                </Text>
                <Text style={styles.badgeDesc}>{badge.description}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* 知识点详情弹框 */}
      <Modal visible={!!selectedKp} transparent animationType="fade" onRequestClose={() => setSelectedKp(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView style={styles.modalScroll}>
              {selectedKp && <KnowledgeCard kp={selectedKp} />}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setSelectedKp(null)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCloseBtnText}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  backBtn: { width: 60 },
  backText: { color: palette.primaryDark, fontSize: fontSize.sub, fontFamily },
  title: { color: palette.primaryDark, fontSize: fontSize.title, fontWeight: fontWeight.bold, textAlign: "center", fontFamily },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: space.md,
    marginHorizontal: space.md,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.soft,
  },
  statItem: { alignItems: "center" },
  statValue: { color: palette.primaryDark, fontSize: 24, fontWeight: fontWeight.bold, fontFamily },
  statLabel: { color: palette.textSoft, fontSize: fontSize.caption, marginTop: 2, fontFamily },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: space.md,
    marginBottom: space.md,
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: palette.border,
  },
  tab: { flex: 1, paddingVertical: space.sm, alignItems: "center" },
  tabActive: { backgroundColor: "rgba(224,168,153,0.25)" },
  tabText: { color: palette.textSoft, fontSize: fontSize.sub, fontFamily },
  tabTextActive: { color: palette.primaryDark, fontWeight: fontWeight.semibold, fontFamily },
  scroll: { flex: 1 },
  scrollContent: { padding: space.md, paddingTop: 0, paddingBottom: space.xl },
  sectionTitle: {
    color: palette.primaryDark,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    marginBottom: space.sm,
    marginTop: space.xs,
    fontFamily,
  },
  emptyText: { color: palette.textFaint, fontSize: fontSize.body, textAlign: "center", paddingVertical: space.lg, fontFamily },
  kpWrap: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: space.sm,
    marginBottom: space.md,
    ...shadow.soft,
  },
  kpItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  kpItemLocked: { opacity: 0.55 },
  kpEmoji: { fontSize: fontSize.title, marginRight: space.sm },
  kpTextWrap: { flex: 1 },
  kpName: { color: palette.text, fontSize: fontSize.sub, fontWeight: fontWeight.semibold, fontFamily },
  kpNameLocked: { color: palette.textSoft },
  kpDef: { color: palette.textFaint, fontSize: fontSize.caption, marginTop: 2, fontFamily },
  kpMark: { fontSize: fontSize.title, marginLeft: space.sm, fontWeight: fontWeight.bold },
  kpMastered: { color: palette.green },
  kpUnmastered: { color: palette.textFaint },
  chartCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.soft,
  },
  chartTitle: { color: palette.primaryDark, fontSize: fontSize.sub, fontWeight: fontWeight.semibold, marginBottom: space.sm, fontFamily },
  chartCenter: { alignItems: "center" },
  recordCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  recordHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  recordLevel: { color: palette.primaryDark, fontSize: fontSize.sub, fontWeight: fontWeight.bold, fontFamily },
  recordResult: { fontSize: fontSize.body, fontFamily },
  victory: { color: palette.green },
  defeat: { color: palette.clay },
  recordTitle: { color: palette.textSoft, fontSize: fontSize.caption, marginTop: 2, fontFamily },
  recordScore: { color: palette.text, fontSize: fontSize.caption, marginTop: space.xs, fontFamily },
  recordTime: { color: palette.textFaint, fontSize: fontSize.caption, marginTop: 2, fontFamily },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
    justifyContent: "center",
  },
  badgeItem: {
    width: (SCREEN_WIDTH - 56) / 3,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: space.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.soft,
  },
  badgeLocked: { opacity: 0.4, borderColor: palette.border },
  badgeIcon: { fontSize: 32, marginBottom: space.xs },
  badgeIconLocked: { opacity: 0.5 },
  badgeName: { color: palette.text, fontSize: fontSize.caption, fontWeight: fontWeight.semibold, textAlign: "center", fontFamily },
  badgeNameLocked: { color: palette.textFaint },
  badgeDesc: { color: palette.textSoft, fontSize: 10, textAlign: "center", marginTop: 2, fontFamily },

  kpArrow: { color: palette.textFaint, fontSize: fontSize.sub, marginLeft: space.xs },

  // ===== 知识点详情弹框 =====
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(10,10,26,0.4)",
    padding: space.md,
  },
  modalContent: {
    backgroundColor: palette.bg,
    borderRadius: radius.lg,
    padding: space.md,
    maxWidth: 500,
    width: "100%",
    maxHeight: "85%",
  },
  modalScroll: {
    maxHeight: "100%",
  },
  modalCloseBtn: {
    backgroundColor: palette.primary,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    marginTop: space.md,
  },
  modalCloseBtnText: {
    color: palette.surface,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.semibold,
    fontFamily,
  },
});
