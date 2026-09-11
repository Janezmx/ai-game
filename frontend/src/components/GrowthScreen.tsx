import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Modal,
  type DimensionValue,
} from "react-native";
import Svg, { Circle, Line, Polyline, Polygon, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameStore } from "../store/gameStore";
import { KnowledgePoint, DimensionScores } from "@aigame/shared";
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
import ReviewReportScreen from "./ReviewReportScreen";
import {
  averageDimensions,
  averageOf,
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  hasAnyScore,
  normalizeDimensions,
} from "../utils/dimensions";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_SIZE = Math.min(SCREEN_WIDTH - 48, 320);
const CENTER = CHART_SIZE / 2;
const RADAR_RADIUS = CENTER * 0.65;

type Tab = "history" | "badges";

type RadarView = "latest" | "average" | "peak";

type RadarScores = Record<(typeof DIMENSION_KEYS)[number], number>;

function RadarChart({ scores, references }: { scores: RadarScores; references?: RadarScores[] }) {
  const angles = DIMENSION_KEYS.map((_, i) => (i / DIMENSION_KEYS.length) * Math.PI * 2 - Math.PI / 2);
  const levels = [20, 40, 60, 80, 100];

  const getPoint = (angle: number, value: number) => ({
    x: CENTER + Math.cos(angle) * (RADAR_RADIUS * (value / 100)),
    y: CENTER + Math.sin(angle) * (RADAR_RADIUS * (value / 100)),
  });

  const toPolygon = (d: RadarScores) =>
    DIMENSION_KEYS.map((key, i) => {
      const p = getPoint(angles[i], d[key] || 0);
      return `${p.x},${p.y}`;
    }).join(" ");

  // 主多边形：图例当前选中的口径（最近一局 / 全部平均 / 历史最佳）
  const dataPoints = DIMENSION_KEYS.map((key, i) => getPoint(angles[i], scores[key] || 0));
  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");
  // 对照多边形：其余口径，只作参考；与主数据完全一致的不重复画（否则线会叠在一起）
  const refPolygons = (references || [])
    .filter((r) => r && DIMENSION_KEYS.some((k) => (r[k] || 0) !== (scores[k] || 0)))
    .map(toPolygon);
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
      {/* 其余口径（对照，浅色虚线） */}
      {refPolygons.map((pts, i) => (
        <Polygon
          key={`ref-${i}`}
          points={pts}
          fill="none"
          stroke={palette.textFaint}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      ))}
      {/* 数据区域：当前选中口径 */}
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
        {averageOf(scores)}
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
  const [radarView, setRadarView] = useState<RadarView>("latest");
  // 打开的历史复盘 id：非空时整页切换为复盘详情，返回后自动回到成长页原状态
  const [openReportId, setOpenReportId] = useState<string | null>(null);

  const scoreTrend = gameHistory.map((r) => r.avgScore);
  // 雷达图三种口径（图例可切换）：
  //   latest  = 最近一局的四维（会随输赢升降）
  //   average = 全部对局逐维取平均（整体水平）
  //   peak    = 逐维取最大值（历史最佳）。它单调不减，只能当参照，不能当主数据——
  //             否则就是"永远是满分、输了也不改"
  const latestRecord = gameHistory.length > 0 ? gameHistory[gameHistory.length - 1] : null;
  // 「历史最佳」= 历史各局里综合分最高的那**一局**（局粒度，直接展示那一局的四维）。
  // 不能用 review.bestScores：它是对话中逐轮逐维取 max 的峰值，同一局内 max ≥ 平均，
  // 会出现「只打过一局 51 分，历史最佳却 61 分」的错位；而且它跨应用重启会被恢复回来，
  // 导致「历史最佳」里混入并非任何一局真实成绩的合成分。
  const peakRecord = useMemo(() => {
    if (gameHistory.length === 0) return null;
    return gameHistory.reduce((best, r) =>
      (r.avgScore ?? averageOf(r.dimensions)) > (best.avgScore ?? averageOf(best.dimensions))
        ? r
        : best
    );
  }, [gameHistory]);
  const peakScores = useMemo(() => {
    // 旧战绩/旧存档里可能混入 0~1 小数制评分（0.62 本意是 62 分），归一化后再上雷达图
    if (peakRecord) return normalizeDimensions(peakRecord.dimensions);
    // 还没有任何对局记录（例如当前这一局尚未结算）时，退回本局逐轮峰值兜底，避免雷达图空掉
    return hasAnyScore(review.bestScores) ? normalizeDimensions(review.bestScores) : null;
  }, [peakRecord, review.bestScores]);

  type RadarViewItem = { key: RadarView; label: string; scores: DimensionScores };
  const radarViews = useMemo(() => {
    const raw: { key: RadarView; label: string; scores: DimensionScores | null }[] = [
      {
        key: "latest",
        label: "最近一局",
        scores: latestRecord ? normalizeDimensions(latestRecord.dimensions) : null,
      },
      {
        key: "average",
        label: "全部平均",
        scores: averageDimensions(gameHistory.map((r) => r.dimensions)),
      },
      { key: "peak", label: "历史最佳", scores: peakScores },
    ];
    // 四维全 0 视为无数据，不显示该口径（否则只会有一个落在中心的无意义点）
    return raw.filter((v): v is RadarViewItem => hasAnyScore(v.scores));
  }, [latestRecord, gameHistory, peakScores]);
  // 选中的口径是主数据（实色），另外两个作为浅色虚线参照
  const activeView = radarViews.find((v) => v.key === radarView) ?? radarViews[0] ?? null;
  const radarScores = activeView?.scores ?? null;
  const referenceScores = radarViews.filter((v) => v.key !== activeView?.key).map((v) => v.scores);
  const hasRadarData = hasAnyScore(radarScores);
  const victories = gameHistory.filter((r) => r.victory).length;
  const totalGames = gameHistory.length;
  const unlockedBadges = badges.filter((b) => b.unlockedAt);

  const allKnowledge = Object.values(LEVEL_KNOWLEDGE);
  const [selectedKp, setSelectedKp] = useState<KnowledgePoint | null>(null);

  // 历史复盘是独立只读页面，直接整页替换成长页（返回时本页状态原样保留）
  if (openReportId) {
    return (
      <ReviewReportScreen
        reportId={openReportId}
        onBack={() => setOpenReportId(null)}
      />
    );
  }

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
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>📊 四维能力雷达</Text>
              {hasRadarData && radarScores ? (
                <>
                  <View style={styles.chartCenter}>
                    <RadarChart scores={radarScores} references={referenceScores} />
                  </View>
                  {/* 图例 = 口径切换器：点哪一项，实色主数据就换成哪一项，其余两项退为虚线参照 */}
                  <View style={styles.viewRow}>
                    {radarViews.map((v) => {
                      const active = v.key === activeView?.key;
                      return (
                        <TouchableOpacity
                          key={v.key}
                          testID={`radar-view-${v.key}`}
                          style={[styles.viewChip, active && styles.viewChipActive]}
                          onPress={() => setRadarView(v.key)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={`查看${v.label}的四维评分`}
                        >
                          {/* 图标槽固定宽度：圆点与虚线占同一尺寸，切换口径时 chip 宽度不变、图例不抖动 */}
                          <View style={styles.legendIcon}>
                            {active ? (
                              <View style={[styles.legendDot, { backgroundColor: palette.primaryDark }]} />
                            ) : (
                              <View style={styles.legendDash} />
                            )}
                          </View>
                          <Text style={[styles.viewChipText, active && styles.viewChipTextActive]}>
                            {v.label}
                            {v.key === "latest" && latestRecord ? ` 第${latestRecord.level}关` : ""}
                            {" · "}
                            {averageOf(v.scores)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.legendHint}>
                    点图例切换口径：实色为当前查看，虚线为另外两项；历史最佳取综合分最高的那一局
                  </Text>
                </>
              ) : (
                <Text style={styles.emptyText}>完成一局对战并保存记录后，这里会生成你的四维能力雷达图</Text>
              )}
            </View>

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
            {[...gameHistory].reverse().map((record, idx) => {
              // 只有存过复盘的记录才能点开；旧存档没有 reportId，保持纯展示
              const reportId = record.reportId;
              const body = (
                <>
                  <View style={styles.recordHeader}>
                    <Text style={styles.recordLevel}>第 {record.level} 关</Text>
                    <Text style={[styles.recordResult, record.victory ? styles.victory : styles.defeat]}>
                      {record.victory ? "✅ 胜利" : "💔 失败"}
                    </Text>
                  </View>
                  <Text style={styles.recordTitle}>{record.levelTitle}</Text>
                  <View style={styles.recordFooter}>
                    <Text style={styles.recordScore}>综合评分: {record.avgScore}</Text>
                    {reportId && (
                      <Text style={styles.recordOpenHint}>查看复盘 ›</Text>
                    )}
                  </View>
                  <Text style={styles.recordTime}>
                    {new Date(record.timestamp).toLocaleString("zh-CN")}
                  </Text>
                </>
              );
              if (!reportId) {
                return (
                  <View key={idx} style={styles.recordCard}>
                    {body}
                  </View>
                );
              }
              return (
                <TouchableOpacity
                  key={idx}
                  style={styles.recordCard}
                  onPress={() => setOpenReportId(reportId)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`查看第 ${record.level} 关复盘详情`}
                >
                  {body}
                </TouchableOpacity>
              );
            })}
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
    height: "100vh" as DimensionValue,
    backgroundColor: palette.bg,
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
  // 固定宽度同时用于左侧返回键与右侧占位（保证标题居中）；
  // 「← 返回」在 fontSize.sub(18px) 下约需 52~59px，故留到 76 避免折行
  backBtn: { width: 76 },
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
  statValue: { color: palette.primaryDark, fontSize: 26, fontWeight: fontWeight.bold, fontFamily },
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
  viewRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.xs,
    marginTop: space.sm,
  },
  viewChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
  },
  viewChipActive: { backgroundColor: "rgba(224,168,153,0.28)", borderColor: palette.primaryDark },
  viewChipText: { color: palette.textSoft, fontSize: 12, fontFamily },
  // 选中态不加粗：字重变化会让文本重新测量宽度，同样造成图例抖动；用颜色 + 背景 + 边框区分
  viewChipTextActive: { color: palette.primaryDark, fontFamily },
  // 图标槽固定 14×14：圆点(8×8)与虚线(14 宽)共用同一占位，点图例切换时 chip 宽度不发生变化
  legendIcon: { width: 14, height: 14, alignItems: "center", justifyContent: "center", marginRight: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendDash: { width: 14, height: 0, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: palette.textFaint },
  legendHint: { color: palette.textFaint, fontSize: 12, textAlign: "center", marginTop: space.xs, fontFamily },
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
  recordFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recordOpenHint: { color: palette.primary, fontSize: fontSize.caption, fontWeight: fontWeight.bold, fontFamily },
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
  badgeIcon: { fontSize: 34, marginBottom: space.xs },
  badgeIconLocked: { opacity: 0.5 },
  badgeName: { color: palette.text, fontSize: fontSize.caption, fontWeight: fontWeight.semibold, textAlign: "center", fontFamily },
  badgeNameLocked: { color: palette.textFaint },
  badgeDesc: { color: palette.textSoft, fontSize: 12, textAlign: "center", marginTop: 2, fontFamily },

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
