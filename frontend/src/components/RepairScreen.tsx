import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import Svg, { Path, Circle, G, Defs, LinearGradient, Stop } from "react-native-svg";
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
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

  const startBreathing = useCallback(() => {
    if (isActive) return;
    setIsActive(true);
    setPhase("inhale");

    const cycleDuration = 8000; // 8秒一个完整呼吸周期
    let steps = 0;

    const interval = setInterval(() => {
      steps++;
      const newProgress = Math.min(100, (steps / 20) * 100);
      setProgress(newProgress);

      // 4秒吸气 → 4秒呼气
      const cyclePos = (steps % 20) / 20; // 0~1 per cycle
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
        clearInterval(interval);
        setIsActive(false);
        onComplete();
      }
    }, 400);

    return () => clearInterval(interval);
  }, [isActive]);

  const circleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathScale.value }],
    opacity: breathOpacity.value,
  }));

  return (
    <View style={styles.breathingContainer}>
      {!isActive ? (
        <TouchableOpacity style={styles.startBreathBtn} onPress={startBreathing}>
          <Text style={styles.startBreathBtnText}>开始呼吸引导</Text>
          <Text style={styles.startBreathSubtext}>通过节奏呼吸驱散心域迷雾</Text>
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
/** 计算绘制路径对理想圆形的覆盖百分比 */
function calcCoverage(
  allPaths: { points: { x: number; y: number }[] }[],
  sampleCount = 48,
  threshold = 12,
): number {
  if (allPaths.length === 0) return 0;
  const r = CENTER * 0.7;
  // 生成理想圆上的采样点
  const samples: { x: number; y: number }[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const a = (i / sampleCount) * Math.PI * 2;
    samples.push({ x: CENTER + Math.cos(a) * r, y: CENTER + Math.sin(a) * r });
  }
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

function BoundaryDrawer({
  onComplete,
  integrity,
}: {
  onComplete: (integrity: number) => void;
  integrity: number;
}) {
  const [paths, setPaths] = useState<{ points: { x: number; y: number }[] }[]>([]);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // 实时覆盖度：合并已完成路径和正在绘制的路径
  const liveCoverage = useMemo(() => {
    const allSegments = [
      ...paths,
      ...(currentPath.length > 0 ? [{ points: currentPath }] : []),
    ];
    return calcCoverage(allSegments);
  }, [paths, currentPath]);

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
      if (currentPath.length > 5) {
        setPaths((prev) => [...prev, { points: currentPath }]);
      }
      setCurrentPath([]);
      setIsDrawing(false);
    }
  };

  const completeDrawing = useCallback(() => {
    // 用实时覆盖度作为评分
    const finalCoverage = calcCoverage(paths);
    onComplete(Math.max(integrity, Math.min(100, finalCoverage)));
  }, [paths, integrity]);

  // 画完一笔后自动完成
  useEffect(() => {
    if (paths.length >= 1) {
      completeDrawing();
    }
  }, [paths.length, completeDrawing]);

  return (
    <View style={styles.drawContainer}>
      <Text style={styles.drawTitle}>手势重绘边界</Text>
      <Text style={styles.drawHint}>沿着心域轮廓描绘，重建边界护盾</Text>

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
                  <Stop offset="0%" stopColor="#4a9eff" stopOpacity={0.3} />
                  <Stop offset="100%" stopColor="#7c7cff" stopOpacity={0.15} />
                </LinearGradient>
              </Defs>

              {/* 理想边界（参考圆） */}
              <Circle
                cx={CENTER}
                cy={CENTER}
                r={CENTER * 0.7}
                fill="none"
                stroke="#4a9eff"
                strokeWidth={1}
                strokeDasharray="4,4"
                opacity={0.4}
              />

              {/* 已完成的路径 */}
              {paths.map((seg, idx) => (
                <Path
                  key={`path-${idx}`}
                  d={seg.points
                    .map((p, i) =>
                      i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`
                    )
                    .join(" ")}
                  stroke="#7c7cff"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.8}
                />
              ))}

              {/* 当前绘制中的路径 */}
              {currentPath.length > 1 && (
                <Path
                  d={currentPath
                    .map((p, i) =>
                      i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`
                    )
                    .join(" ")}
                  stroke="#b0b0ff"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.6}
                />
              )}
            </Svg>
          </Animated.View>
        </PanGestureHandler>
      </GestureHandlerRootView>

      <View style={styles.drawFooter}>
        <Text style={styles.drawProgress}>
          边界完整性: {liveCoverage}%
        </Text>
      </View>
    </View>
  );
}

// ==================== 主组件 ====================

interface RepairScreenProps {
  onComplete?: () => void;
}

export default function RepairScreen({ onComplete }: RepairScreenProps) {
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
  } = useGameStore();

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
        <Text style={styles.subtitle}>重建心域边界，驱散入侵迷雾</Text>
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
              迷雾驱散: {Math.round(60)}%{"\n"}
              护盾恢复至: {Math.round(sanctuary.shieldHealth)}%
            </Text>
            <TouchableOpacity style={styles.completeBtn} onPress={handleComplete}>
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
    backgroundColor: "#0d0d1a",
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: "center",
  },
  title: {
    color: "#e0e0ff",
    fontSize: 24,
    fontWeight: "bold",
  },
  subtitle: {
    color: "#8888aa",
    fontSize: 13,
    marginTop: 4,
  },
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 12,
    paddingHorizontal: 40,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#2a2a4a",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#3a3a6a",
  },
  stepDotActive: {
    backgroundColor: "#4a7aef",
    borderColor: "#7c9cff",
  },
  stepNumber: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#2a2a4a",
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: "#4a7aef",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  // ===== 绘制边界 =====
  drawContainer: {
    flex: 1,
    alignItems: "center",
  },
  drawTitle: {
    color: "#e0e0ff",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  drawHint: {
    color: "#8888aa",
    fontSize: 12,
    marginBottom: 12,
  },
  drawArea: {
    width: SVG_SIZE,
    height: SVG_SIZE,
    borderRadius: 16,
    backgroundColor: "#1a1a2e",
    borderWidth: 1,
    borderColor: "#2a2a4a",
    overflow: "hidden",
  },
  drawFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 12,
    paddingHorizontal: 8,
  },
  drawProgress: {
    color: "#8888aa",
    fontSize: 13,
  },
  completeDrawBtn: {
    backgroundColor: "#4a7aef",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  completeDrawBtnDisabled: {
    backgroundColor: "#2a3a5a",
    opacity: 0.6,
  },
  completeDrawBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  // ===== 呼吸引导 =====
  breathingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  startBreathBtn: {
    backgroundColor: "#2a4a6a",
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 16,
    alignItems: "center",
  },
  startBreathBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  startBreathSubtext: {
    color: "#888",
    fontSize: 12,
    marginTop: 6,
  },
  breathCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#4a9eff",
    opacity: 0.6,
    marginBottom: 24,
  },
  breathPhaseText: {
    color: "#e0e0ff",
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
  },
  breathProgressBar: {
    width: 200,
    height: 6,
    backgroundColor: "#2a2a4a",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 8,
  },
  breathProgressFill: {
    height: "100%",
    backgroundColor: "#4a9eff",
    borderRadius: 3,
  },
  breathProgressText: {
    color: "#888",
    fontSize: 14,
  },
  // ===== 完成 =====
  completeContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  completeIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  completeTitle: {
    color: "#e0e0ff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 12,
  },
  completeText: {
    color: "#aaaacc",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  completeBtn: {
    backgroundColor: "#4a7aef",
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  completeBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});