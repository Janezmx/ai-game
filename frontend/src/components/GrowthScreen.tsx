import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
} from "react-native";
import Svg, { Circle, Line, Polyline, Polygon, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameStore } from "../store/gameStore";
import { GestureHandlerRootView } from "react-native-gesture-handler";

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
        return <Polygon key={lv} points={pts} fill="none" stroke="#2a2a4a" strokeWidth={1} />;
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
            stroke="#2a2a4a"
            strokeWidth={1}
          />
        );
      })}
      {/* 数据区域 */}
      <Polygon points={polygonPoints} fill="#7c4dff44" stroke="#b388ff" strokeWidth={2} />
      {/* 数据点 */}
      {dataPoints.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={4} fill="#b388ff" />
      ))}
      {/* 标签 */}
      {labelPoints.map((p, i) => (
        <SvgText
          key={i}
          x={p.x}
          y={p.y}
          fill="#888"
          fontSize={11}
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {DIMENSION_LABELS[DIMENSION_KEYS[i]]}
        </SvgText>
      ))}
      {/* 中心数值 */}
      <SvgText x={CENTER} y={CENTER + 4} fill="#b388ff" fontSize={18} fontWeight="bold" textAnchor="middle">
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
      <Line x1={pad} y1={pad} x2={pad} y2={pad + chartH} stroke="#2a2a4a" strokeWidth={1} />
      <Line x1={pad} y1={pad + chartH} x2={pad + chartW} y2={pad + chartH} stroke="#2a2a4a" strokeWidth={1} />
      {/* 折线 */}
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} />
      {/* 数据点 */}
      {data.map((v, i) => (
        <Circle key={i} cx={pad + i * stepX} cy={pad + chartH - ((v - min) / range) * chartH} r={3} fill={color} />
      ))}
    </Svg>
  );
}

export default function GrowthScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { gameHistory, badges, review } = useGameStore();
  const [tab, setTab] = useState<Tab>("history");

  const bestScores = review.bestScores;
  const scoreTrend = gameHistory.map((r) => r.avgScore);
  const victories = gameHistory.filter((r) => r.victory).length;
  const totalGames = gameHistory.length;
  const unlockedBadges = badges.filter((b) => b.unlockedAt);

  return (
    <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top, maxWidth: 500, width: "100%", alignSelf: "center" }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
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
      </View>

      {/* 标签切换 */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === "history" && styles.tabActive]}
          onPress={() => setTab("history")}
        >
          <Text style={[styles.tabText, tab === "history" && styles.tabTextActive]}>战绩</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "badges" && styles.tabActive]}
          onPress={() => setTab("badges")}
        >
          <Text style={[styles.tabText, tab === "badges" && styles.tabTextActive]}>徽章</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {tab === "history" ? (
          <>
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
                  <MiniLineChart data={scoreTrend} color="#7c4dff" />
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0d0d1a" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: { width: 60 },
  backText: { color: "#7c4dff", fontSize: 15 },
  title: { color: "#b388ff", fontSize: 20, fontWeight: "bold", textAlign: "center" },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    marginHorizontal: 16,
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    marginBottom: 12,
  },
  statItem: { alignItems: "center" },
  statValue: { color: "#b388ff", fontSize: 24, fontWeight: "bold" },
  statLabel: { color: "#888", fontSize: 11, marginTop: 2 },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    overflow: "hidden",
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabActive: { backgroundColor: "#7c4dff33" },
  tabText: { color: "#888", fontSize: 14 },
  tabTextActive: { color: "#b388ff", fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 0, paddingBottom: 32 },
  chartCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  chartTitle: { color: "#b388ff", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  chartCenter: { alignItems: "center" },
  sectionTitle: { color: "#b388ff", fontSize: 14, fontWeight: "600", marginBottom: 8, marginTop: 4 },
  emptyText: { color: "#666", fontSize: 13, textAlign: "center", paddingVertical: 20 },
  recordCard: {
    backgroundColor: "#151525",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  recordHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  recordLevel: { color: "#b388ff", fontSize: 14, fontWeight: "bold" },
  recordResult: { fontSize: 13 },
  victory: { color: "#81c784" },
  defeat: { color: "#ef5350" },
  recordTitle: { color: "#aaa", fontSize: 12, marginTop: 2 },
  recordScore: { color: "#ddd", fontSize: 12, marginTop: 4 },
  recordTime: { color: "#555", fontSize: 11, marginTop: 2 },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  badgeItem: {
    width: (SCREEN_WIDTH - 56) / 3,
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#7c4dff33",
  },
  badgeLocked: { opacity: 0.4, borderColor: "#2a2a4a" },
  badgeIcon: { fontSize: 32, marginBottom: 6 },
  badgeIconLocked: { opacity: 0.5 },
  badgeName: { color: "#ddd", fontSize: 12, fontWeight: "600", textAlign: "center" },
  badgeNameLocked: { color: "#666" },
  badgeDesc: { color: "#888", fontSize: 10, textAlign: "center", marginTop: 2 },
});
