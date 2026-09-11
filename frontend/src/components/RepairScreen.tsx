import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import Svg, { Path, G, Defs, LinearGradient, Stop } from "react-native-svg";
import { GestureHandlerRootView, PanGestureHandler, State, PanGestureHandlerGestureEvent } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  FadeIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameStore } from "../store/gameStore";
import { GamePhase } from "@aigame/shared";
import { getLevelKnowledgePoint } from "./KnowledgeCard";
import { startWaterSound, stopWaterSound } from "../utils/sound";
import {
  palette,
  radius,
  space,
  fontSize,
  fontWeight,
  fontFamily,
  shadow,
} from "../theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SVG_SIZE = Math.min(SCREEN_WIDTH - 40, 360);
const CENTER = SVG_SIZE / 2;

// ==================== 呼吸引导组件 ====================
function BreathingGuide({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const breathScale = useSharedValue(1);
  const breathOpacity = useSharedValue(1);
  const [phase, setPhase] = useState<"inhale" | "exhale" | "hold">("inhale");
  const [progress, setProgress] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepsRef = useRef(0);

  // 组件卸载时清理 interval 与流水声
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      stopWaterSound();
    };
  }, []);

  const startBreathing = useCallback(() => {
    if (isActive) return;
    setIsActive(true);
    setPhase("inhale");
    stepsRef.current = 0;
    startWaterSound();

    intervalRef.current = setInterval(() => {
      stepsRef.current++;
      const newProgress = Math.min(100, (stepsRef.current / 20) * 100);
      setProgress(newProgress);

      // 4秒吸气 → 4秒呼气
      const cyclePos = (stepsRef.current % 20) / 20; // 0~1 per cycle
      if (cyclePos < 0.5) {
        setPhase("inhale");
        breathScale.value = withTiming(1 + cyclePos * 0.3, { duration: 200 });
        breathOpacity.value = withTiming(0.6 + cyclePos * 0.4, { duration: 200 });
      } else {
        setPhase("exhale");
        breathScale.value = withTiming(1.3 - (cyclePos - 0.5) * 0.3, { duration: 200 });
        breathOpacity.value = withTiming(1.0 - (cyclePos - 0.5) * 0.4, { duration: 200 });
      }

      if (newProgress >= 100) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setIsActive(false);
        stopWaterSound();
        onComplete();
      }
    }, 400);
  }, [isActive, onComplete, breathScale, breathOpacity]);

  const circleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathScale.value }],
    opacity: breathOpacity.value,
  }));

  return (
    <View style={styles.breathingContainer}>
      {!isActive ? (
        <TouchableOpacity style={styles.startBreathBtn} onPress={startBreathing} activeOpacity={0.9} accessibilityLabel="开始呼吸引导" accessibilityRole="button">
          <Text style={styles.startBreathBtnText}>开始呼吸引导</Text>
          <Text style={styles.startBreathSubtext}>深呼吸激活副交感神经——科学研究表明，慢节奏呼吸能直接降低操控焦虑带来的生理反应。</Text>
        </TouchableOpacity>
      ) : (
        <>
          <Animated.View style={[styles.breathCircle, circleAnimStyle]} />
          <Text style={styles.breathPhaseText}>
            {phase === "inhale" ? "🌬️ 吸气..." : "🌪️ 呼气..."}
          </Text>
          <View style={styles.breathProgressBar}>
            <View style={[styles.breathProgressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.breathProgressText}>{Math.round(progress)}%</Text>
        </>
      )}
    </View>
  );
}

// ==================== 边界重绘组件 ====================
/** 计算绘制路径对理想边界的覆盖百分比 */
function calcCoverage(
  allPaths: { points: { x: number; y: number }[] }[],
  sides: number,
  sampleCount = 48,
  threshold = 12,
): number {
  if (allPaths.length === 0 || sampleCount <= 0) return 0;
  // 生成理想形状上的采样点
  const samples = getShapePoints(sides, sampleCount);
  // 展平所有绘制点
  const allPoints = allPaths.flatMap((p) => p.points);
  // 统计被覆盖的采样点
  let covered = 0;
  for (const s of samples) {
    for (const p of allPoints) {
      const dx = s.x - p.x;
      const dy = s.y - p.y;
      if (dx * dx + dy * dy <= threshold * threshold) {
        covered++;
        break;
      }
    }
  }
  return Math.round((covered / sampleCount) * 100);
}

/** 生成多边形/圆形的顶点 */
function getShapePoints(sides: number, count: number): { x: number; y: number }[] {
  const r = CENTER * 0.7;
  const points: { x: number; y: number }[] = [];
  if (sides <= 0) {
    // 圆形：平滑采样
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      points.push({ x: CENTER + Math.cos(a) * r, y: CENTER + Math.sin(a) * r });
    }
  } else {
    // 多边形：每个边再细分采样点
    const perSide = Math.floor(count / sides);
    for (let s = 0; s < sides; s++) {
      const a1 = (s / sides) * Math.PI * 2 - Math.PI / 2;
      const a2 = ((s + 1) / sides) * Math.PI * 2 - Math.PI / 2;
      const p1 = { x: CENTER + Math.cos(a1) * r, y: CENTER + Math.sin(a1) * r };
      const p2 = { x: CENTER + Math.cos(a2) * r, y: CENTER + Math.sin(a2) * r };
      for (let j = 0; j < perSide; j++) {
        const t = j / perSide;
        points.push({ x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t });
      }
    }
  }
  return points;
}

/** 生成 SVG path d 属性 */
function pointsToPathD(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + "Z";
}

function BoundaryDrawer({
  onComplete,
  integrity,
  sides,
}: {
  onComplete: (integrity: number) => void;
  integrity: number;
  sides: number;
}) {
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // 实时覆盖度（只算当前这一笔）
  const liveCoverage = useMemo(() => {
    if (currentPath.length === 0) return 0;
    return calcCoverage([{ points: currentPath }], sides);
  }, [currentPath, sides]);

  // 理想的边界形状路径
  const idealPoints = useMemo(() => getShapePoints(sides, 48), [sides]);
  const idealPathD = useMemo(() => pointsToPathD(idealPoints), [idealPoints]);

  const handleGesture = (event: PanGestureHandlerGestureEvent) => {
    const { state, absoluteX, absoluteY } = event.nativeEvent;

    if (state === State.ACTIVE) {
      setIsDrawing(true);
      setCurrentPath((prev) => [
        ...prev,
        { x: absoluteX, y: absoluteY },
      ]);
    }

    if (state === State.END) {
      setIsDrawing(false);
      // 一笔完成后立刻判定覆盖度
      if (currentPath.length > 5) {
        const cov = calcCoverage([{ points: currentPath }], sides);
        if (cov >= 80) {
          onComplete(Math.max(integrity, Math.min(100, cov)));
          return;
        }
      }
      // 不达标：清空，必须重新一笔完成
      setCurrentPath([]);
    }
  };

  return (
    <View style={styles.drawContainer}>
      <Text style={styles.drawTitle}>手势重绘边界</Text>
      <Text style={styles.shapeLabel}>
        {sides <= 0 ? "⊙ 圆形" : `⬠ ${SHAPE_NAMES[sides] || "多边形"}(${sides}边)`}
      </Text>
      <Text style={styles.drawHint}>边界就像心理防线——必须一笔完成，中途抬起则重新开始。</Text>

      <GestureHandlerRootView>
        <PanGestureHandler
          onGestureEvent={handleGesture}
          onHandlerStateChange={handleGesture}
          minDist={5}
        >
          <Animated.View style={styles.drawArea}>
            <Svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
              <Defs>
                <LinearGradient id="idealGrad" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor={palette.blue} stopOpacity={0.5} />
                  <Stop offset="100%" stopColor={palette.primary} stopOpacity={0.35} />
                </LinearGradient>
              </Defs>

              {/* 理想边界（虚线引导） */}
              <Path
                d={idealPathD}
                fill="none"
                stroke={palette.blue}
                strokeWidth={2}
                strokeDasharray="4,4"
                opacity={0.7}
              />

              {/* 当前绘制中的路径（只有一笔） */}
              {currentPath.length > 1 && (
                <Path
                  d={currentPath
                    .map((p, i) =>
                      i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`
                    )
                    .join(" ")}
                  stroke={palette.primary}
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.85}
                />
              )}
            </Svg>
          </Animated.View>
        </PanGestureHandler>
      </GestureHandlerRootView>

      <View style={styles.drawFooter}>
        <Text style={styles.drawProgress}>
          边界完整性: {liveCoverage}% {isDrawing && "（抬笔后判定）"}
        </Text>
      </View>
    </View>
  );
}

// ==================== 主组件 ====================

interface RepairScreenProps {
  onComplete?: () => void;
  level: number;
}

// 每关不同形状: 圆形, 五边形, 三角形, 正方形, 六边形
const SHAPE_SIDES: Record<number, number> = { 1: 0, 2: 5, 3: 3, 4: 4, 5: 6 };
const SHAPE_NAMES: Record<number, string> = { 1: "圆形", 2: "五边形", 3: "三角形", 4: "正方形", 5: "六边形" };

export default function RepairScreen({ onComplete, level }: RepairScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    repair,
    sanctuary,
    setBoundaryIntegrity,
    setBreathingProgress,
    setRemainingFog,
    setFogDensity,
    setPhase,
    setShieldHealth,
    currentKnowledgePoint,
    currentLevel,
    masteredKnowledgePointIds,
  } = useGameStore();

  const kp = currentKnowledgePoint || getLevelKnowledgePoint(currentLevel);
  const isMastered = masteredKnowledgePointIds.includes(kp.id);

  const [step, setStep] = useState<"draw" | "breathe">("draw");
  const [showComplete, setShowComplete] = useState(false);

  const handleDrawComplete = useCallback(
    (integrity: number) => {
      setBoundaryIntegrity(integrity);
      // 边界完整性影响护盾恢复
      const shieldRecovery = Math.min(100, sanctuary.shieldHealth + integrity * 0.5);
      setShieldHealth(shieldRecovery);
      setStep("breathe");
    },
    [sanctuary.shieldHealth]
  );

  const handleBreathComplete = useCallback(() => {
    setBreathingProgress(100);
    // 呼吸完成驱散大部分迷雾
    const newFog = Math.max(0, sanctuary.fogDensity - 60);
    setRemainingFog(newFog);
    setFogDensity(newFog);
    setShowComplete(true);
  }, [sanctuary.fogDensity]);

  const handleComplete = useCallback(() => {
    setPhase(GamePhase.SanctuaryPrep);
    onComplete?.();
  }, []);

  return (
    <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top }]}>
      {/* 标题 */}
      <View style={styles.header}>
        <Text style={styles.title}>🌿 战后修复</Text>
        <Text style={styles.subtitle}>重建心域边界，恢复内心安宁</Text>
      </View>

      {/* 步骤指示器 */}
      <View style={styles.stepIndicator}>
        <View style={[styles.stepDot, step === "draw" && styles.stepDotActive]}>
          <Text style={styles.stepNumber}>1</Text>
        </View>
        <View style={[styles.stepLine, step === "breathe" && styles.stepLineActive]} />
        <View style={[styles.stepDot, step === "breathe" && styles.stepDotActive]}>
          <Text style={styles.stepNumber}>2</Text>
        </View>
        <View style={[styles.stepLine, showComplete && styles.stepLineActive]} />
        <View style={[styles.stepDot, showComplete && styles.stepDotActive]}>
          <Text style={styles.stepNumber}>✓</Text>
        </View>
      </View>

      {/* 内容区域 */}
      <View style={styles.content}>
        {step === "draw" && (
          <BoundaryDrawer
            onComplete={handleDrawComplete}
            integrity={repair.boundaryIntegrity}
            sides={SHAPE_SIDES[level] || 0}
          />
        )}

        {step === "breathe" && !showComplete && (
          <BreathingGuide onComplete={handleBreathComplete} />
        )}

        {showComplete && (
          <Animated.View style={styles.completeContainer} entering={FadeIn.duration(500)}>
            <Text style={styles.completeIcon}>✨</Text>
            <Text style={styles.completeTitle}>修复完成</Text>
            <Text style={styles.completeText}>
              边界完整性: {Math.round(repair.boundaryIntegrity)}%{"\n"}
              护盾恢复至: {Math.round(sanctuary.shieldHealth)}%
            </Text>

            {/* 教育回顾卡片 */}
            <View style={styles.eduReviewCard}>
              <Text style={styles.eduReviewIcon}>📚</Text>
              <Text style={styles.eduReviewTitle}>本关学会的关键一课</Text>
              <Text style={styles.eduReviewTactic}>{kp.tactic}</Text>
              <Text style={styles.eduReviewDef}>{kp.definition}</Text>
              <Text style={styles.eduReviewSignalLabel}>最重要的识别信号：</Text>
              <Text style={styles.eduReviewSignal}>{kp.signals?.[0] || "保持对自我感受的觉察"}</Text>
              {isMastered && <Text style={styles.eduMastered}>✓ 已掌握</Text>}
            </View>

            <TouchableOpacity style={styles.completeBtn} onPress={handleComplete} activeOpacity={0.9} accessibilityLabel="返回心域" accessibilityRole="button">
              <Text style={styles.completeBtnText}>返回心域</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: "auto",
    backgroundColor: palette.bg,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    alignItems: "center",
    backgroundColor: palette.surfaceSoft,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  title: {
    color: palette.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  subtitle: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    marginTop: 4,
    fontFamily,
  },
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: space.sm,
    paddingHorizontal: 40,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.surfaceSoft,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: palette.borderStrong,
  },
  stepDotActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primaryDark,
  },
  stepNumber: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: palette.border,
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: palette.primary,
  },
  content: {
    flex: 1,
    padding: space.md,
  },
  // ===== 绘制边界 =====
  drawContainer: {
    flex: 1,
    alignItems: "center",
  },
  drawTitle: {
    color: palette.text,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.semibold,
    marginBottom: 4,
    fontFamily,
  },
  shapeLabel: {
    color: palette.primaryDark,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    marginBottom: 4,
    fontFamily,
  },
  drawHint: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    marginBottom: space.md,
    fontFamily,
  },
  drawArea: {
    width: SVG_SIZE,
    height: SVG_SIZE,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: "hidden",
  },
  drawFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: space.md,
    paddingHorizontal: space.xs,
  },
  drawProgress: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    fontFamily,
  },
  completeDrawBtn: {
    backgroundColor: palette.primary,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
  },
  completeDrawBtnDisabled: {
    backgroundColor: palette.surfaceSoft,
    opacity: 0.6,
  },
  completeDrawBtnText: {
    color: palette.surface,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    fontFamily,
  },
  // ===== 呼吸引导 =====
  breathingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  startBreathBtn: {
    backgroundColor: palette.blue,
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: radius.lg,
    alignItems: "center",
    ...shadow.soft,
  },
  startBreathBtnText: {
    color: palette.surface,
    fontSize: fontSize.title,
    fontWeight: fontWeight.semibold,
    fontFamily,
  },
  startBreathSubtext: {
    color: palette.bg,
    fontSize: fontSize.caption,
    marginTop: 6,
    fontFamily,
  },
  breathCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: palette.blue,
    opacity: 0.85,
    marginBottom: space.lg,
  },
  breathPhaseText: {
    color: palette.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.semibold,
    marginBottom: space.md,
    fontFamily,
  },
  breathProgressBar: {
    width: 200,
    height: 6,
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.pill,
    overflow: "hidden",
    marginBottom: space.xs,
  },
  breathProgressFill: {
    height: "100%",
    backgroundColor: palette.blue,
    borderRadius: radius.pill,
  },
  breathProgressText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    fontFamily,
  },
  // ===== 完成 =====
  completeContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  completeIcon: {
    fontSize: 66,
    marginBottom: space.md,
  },
  completeTitle: {
    color: palette.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    marginBottom: space.sm,
    fontFamily,
  },
  completeText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    textAlign: "center",
    lineHeight: 26,
    marginBottom: space.lg,
    fontFamily,
  },
  completeBtn: {
    backgroundColor: palette.primary,
    paddingVertical: space.sm,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    ...shadow.soft,
  },
  completeBtnText: {
    color: palette.surface,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.semibold,
    fontFamily,
  },
  eduReviewCard: {
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: palette.border,
    borderLeftWidth: 4,
    borderLeftColor: palette.green,
    width: "100%",
  },
  eduReviewIcon: { fontSize: 30, marginBottom: space.xs },
  eduReviewTitle: {
    color: palette.green,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    fontFamily,
    marginBottom: space.xs,
  },
  eduReviewTactic: {
    color: palette.primaryDark,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    fontFamily,
    marginBottom: 4,
  },
  eduReviewDef: {
    color: palette.text,
    fontSize: fontSize.body,
    lineHeight: 22,
    fontFamily,
    marginBottom: space.sm,
  },
  eduReviewSignalLabel: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    fontFamily,
    marginBottom: 2,
  },
  eduReviewSignal: {
    color: palette.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    fontFamily,
    fontStyle: "italic",
  },
  eduMastered: {
    color: palette.green,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    fontFamily,
    marginTop: space.sm,
    textAlign: "center",
  },
});
