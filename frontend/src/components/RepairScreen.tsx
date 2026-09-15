import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
} from "react-native";
import Svg, { Path, G, Defs, LinearGradient, RadialGradient, Stop, Circle } from "react-native-svg";
import { GestureHandlerRootView, PanGestureHandler, State, PanGestureHandlerGestureEvent } from "react-native-gesture-handler";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameStore } from "../store/gameStore";
import { GamePhase } from "@aigame/shared";
import { getLevelKnowledgePoint } from "./KnowledgeCard";
import { startWaterSound, stopWaterSound } from "../utils/sound";
import capybaraBreath from "../assets/breath/capybara-breath.png";
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
// 节奏：开始前 3 秒准备倒数（3→2→1）→ 5 秒吸气 → 5 秒呼气，共 2 轮（合计 23 秒）。
// 比原先 4 秒一轮更接近真实深呼吸，也更贴合「缓慢呼吸」的调节节奏。
const BREATH_LEAD_MS = 3000;
const BREATH_INHALE_MS = 5000;
const BREATH_EXHALE_MS = 5000;
const BREATH_CYCLE_MS = BREATH_INHALE_MS + BREATH_EXHALE_MS;
const BREATH_ROUNDS = 2;
const BREATH_TOTAL_MS = BREATH_LEAD_MS + BREATH_CYCLE_MS * BREATH_ROUNDS;

const RING_SIZE = 280;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CENTER = RING_SIZE / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const CAPY_FRAME = 256;
// 图片放大到 1.2 倍再居中裁切：既避开生成平台压在右下角的水印，又让水豚填满圆形舞台。
// 圆形舞台会切掉四角，而水豚的脚和耳朵正好在四角方向，所以放大倍数和呼吸形变幅度
// 是互相牵制的——这里的取值已按"呼吸到最大时四肢仍不出圆"预留了余量。
const CAPY_IMAGE = CAPY_FRAME * 1.2;

const PHASE_COPY: Record<"ready" | "inhale" | "exhale", { title: string; hint: string }> = {
  ready: { title: "准备", hint: "调整好姿势，跟着倒数一起开始" },
  inhale: { title: "吸气…", hint: "跟着水豚，把气慢慢吸满" },
  exhale: { title: "呼气…", hint: "缓缓吐出，让肩膀落下来" },
};

function BreathingGuide({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [isActive, setIsActive] = useState(false);
  const [breath, setBreath] = useState(0); // 饱满度：0 = 呼尽，1 = 吸满
  const [phase, setPhase] = useState<"ready" | "inhale" | "exhale">("ready");
  const [countdown, setCountdown] = useState(3); // 开始前准备阶段的 3→2→1
  const [progress, setProgress] = useState(0);
  const [round, setRound] = useState(1);
  const rafRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  // 组件卸载时清理动画帧与背景音
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      stopWaterSound();
    };
  }, []);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setBreath(0);
    setProgress(100);
    setIsActive(false);
    stopWaterSound();
    onComplete();
  }, [onComplete]);

  const startBreathing = useCallback(() => {
    if (isActive) return;
    finishedRef.current = false;
    setIsActive(true);
    setBreath(0);
    setProgress(0);
    setPhase("ready");
    setCountdown(3);
    setRound(1);
    startWaterSound();

    // 用 requestAnimationFrame 逐帧驱动。Web 构建里 reanimated 被 mock 成静态值
    // （withTiming 直接返回目标值、useAnimatedStyle 只算一次），承担不了这个动画；
    // 这里每帧只更新一个 0~1 的饱满度，参与动画的元素很少，开销可忽略。
    const startAt = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startAt;
      if (elapsed >= BREATH_TOTAL_MS) {
        finish();
        return;
      }
      let s: number;
      let nextPhase: "ready" | "inhale" | "exhale";
      if (elapsed < BREATH_LEAD_MS) {
        // 准备阶段：还没开始呼吸，画面倒数 3→2→1，水豚保持呼尽状态不动
        s = 0;
        nextPhase = "ready";
        setCountdown(Math.max(1, Math.ceil((BREATH_LEAD_MS - elapsed) / 1000)));
      } else {
        const inCycle = (elapsed - BREATH_LEAD_MS) % BREATH_CYCLE_MS;
        if (inCycle < BREATH_INHALE_MS) {
          // 吸气：0 → 1，余弦缓动（两端速度为 0，最贴近真实深呼吸的手感）
          const p = inCycle / BREATH_INHALE_MS;
          s = (1 - Math.cos(Math.PI * p)) / 2;
          nextPhase = "inhale";
        } else {
          // 呼气：1 → 0，同样余弦缓动
          const p = (inCycle - BREATH_INHALE_MS) / BREATH_EXHALE_MS;
          s = (1 + Math.cos(Math.PI * p)) / 2;
          nextPhase = "exhale";
        }
      }

      setBreath(s);
      setPhase(nextPhase);
      // 进度只统计真正呼吸的那 20 秒：准备倒数期间进度保持 0，不提前起跑
      const breathElapsed = Math.max(0, elapsed - BREATH_LEAD_MS);
      setProgress(Math.min(100, (breathElapsed / (BREATH_CYCLE_MS * BREATH_ROUNDS)) * 100));
      // 准备倒数阶段还没进入第一轮，轮次钳在 1
      const roundIdx = Math.max(0, Math.floor((elapsed - BREATH_LEAD_MS) / BREATH_CYCLE_MS));
      setRound(Math.min(BREATH_ROUNDS, roundIdx + 1));

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [isActive, finish]);

  const copy = PHASE_COPY[phase];
  // 呼尽(breath=0) → 吸满(breath=1) 的落差要够大，节奏才看得出来：
  // 光晕直径涨缩 0.78→1.22、水豚上浮 10px、整体放大 4%、纵向再舒展 9%（模拟腹部吸入空气）
  const haloScale = 0.78 + 0.44 * breath;
  const haloOpacity = 0.12 + 0.38 * breath;
  const charLift = -10 * breath;
  const charScale = 1 + 0.04 * breath;
  const charScaleY = 1 + 0.09 * breath;
  const ringOffset = RING_CIRCUMFERENCE * (1 - progress / 100);

  return (
    <View style={styles.breathingContainer}>
      {!isActive ? (
        <TouchableOpacity
          style={styles.startBreathBtn}
          onPress={startBreathing}
          activeOpacity={0.9}
          accessibilityLabel="开始呼吸引导"
          accessibilityRole="button"
        >
          <View style={styles.startCapybaraFrame}>
            <Image source={{ uri: capybaraBreath }} style={styles.startCapybaraImage} />
          </View>
          <Text style={styles.startBreathBtnText}>开始呼吸引导</Text>
          <Text style={styles.startBreathSubtext}>
            深吸慢呼能激活副交感神经——研究表明，缓慢呼吸可以直接降低焦虑带来的生理反应。
          </Text>
        </TouchableOpacity>
      ) : (
        <>
          <View style={styles.breathStage}>
            {/* 光晕：随吸气放大变亮，呼气收敛 */}
            <View
              style={[
                styles.breathHalo,
                { opacity: haloOpacity, transform: [{ scale: haloScale }] },
              ]}
            />
            {/* 呼吸环：整个过程走完 23 秒（3 秒准备倒数 + (5 秒吸气 + 5 秒呼气) × 2 轮） */}
            <Svg width={RING_SIZE} height={RING_SIZE} style={styles.breathRingSvg}>
              <Defs>
                <LinearGradient id="breathRingGradient" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={palette.primary} />
                  <Stop offset="1" stopColor={palette.sage} />
                </LinearGradient>
              </Defs>
              <G rotation={-90} origin={`${RING_CENTER}, ${RING_CENTER}`}>
                <Circle
                  cx={RING_CENTER}
                  cy={RING_CENTER}
                  r={RING_RADIUS}
                  stroke={palette.surfaceSoft}
                  strokeWidth={RING_STROKE}
                  fill="none"
                />
                <Circle
                  cx={RING_CENTER}
                  cy={RING_CENTER}
                  r={RING_RADIUS}
                  stroke="url(#breathRingGradient)"
                  strokeWidth={RING_STROKE}
                  strokeLinecap="round"
                  strokeDasharray={[RING_CIRCUMFERENCE, RING_CIRCUMFERENCE]}
                  strokeDashoffset={ringOffset}
                  fill="none"
                />
              </G>
            </Svg>
            {/* 水豚：整体轻轻上浮，身体沿纵向舒展，模拟腹部吸入空气 */}
            <View
              style={[
                styles.capybaraFrame,
                { transform: [{ translateY: charLift }, { scale: charScale }] },
              ]}
            >
              <Image
                source={{ uri: capybaraBreath }}
                style={[styles.capybaraImage, { transform: [{ scaleY: charScaleY }] }]}
              />
            </View>
          </View>

          <Text style={[styles.breathPhaseText, phase === "ready" && styles.breathCountdownText]}>
            {phase === "ready" ? countdown : copy.title}
          </Text>
          <Text style={styles.breathHintText}>{copy.hint}</Text>
          <Text style={styles.breathRoundText}>
            {phase === "ready"
              ? "准备中…"
              : `第 ${round} / ${BREATH_ROUNDS} 轮 · ${Math.round(progress)}%`}
          </Text>
        </>
      )}
    </View>
  );
}

// ==================== 边界重绘组件 ====================
// 氛围动画周期：6 秒一个循环（柔光脉动 / 涟漪扩散 / 光点漂浮共用同一进度）
const AMBIENT_CYCLE_MS = 6000;

/**
 * 氛围漂浮光点：用确定性伪随机生成一次，保证每次渲染位置不跳动。
 * warm=true 用暖陶土色，false 用鼠尾草绿，与整体治愈系配色一致。
 */
const AMBIENT_MOTES = (() => {
  const rnd = (i: number, n: number) => {
    const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return Array.from({ length: 10 }, (_, i) => ({
    baseX: 0.06 + rnd(i, 1) * 0.88,
    baseY: 0.14 + rnd(i, 2) * 0.78,
    size: 2 + rnd(i, 3) * 3.5,
    rise: 0.06 + rnd(i, 4) * 0.1,
    sway: 0.012 + rnd(i, 5) * 0.035,
    phase: rnd(i, 6),
    speed: 0.6 + rnd(i, 7) * 0.7,
    warm: rnd(i, 8) > 0.45,
  }));
})();

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
  // 氛围动画进度 0~1：驱动柔光脉动、涟漪扩散与光点漂浮。
  // 与呼吸引导同理，reanimated 在 Web 构建里被 mock 成静态值，这里用 rAF 逐帧驱动。
  const [ambient, setAmbient] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setAmbient(((now - start) % AMBIENT_CYCLE_MS) / AMBIENT_CYCLE_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 实时覆盖度（只算当前这一笔）
  const liveCoverage = useMemo(() => {
    if (currentPath.length === 0) return 0;
    return calcCoverage([{ points: currentPath }], sides);
  }, [currentPath, sides]);

  // 理想的边界形状路径
  const idealPoints = useMemo(() => getShapePoints(sides, 48), [sides]);
  const idealPathD = useMemo(() => pointsToPathD(idealPoints), [idealPoints]);

  // 氛围参数：柔光随 6 秒循环轻微脉动，并随覆盖度变亮——给玩家"边界正在被填满"的正反馈
  const pulse = (1 - Math.cos(ambient * Math.PI * 2)) / 2; // 0 → 1 → 0
  const glowOpacity = 0.1 + (liveCoverage / 100) * 0.22 + pulse * 0.06;
  const glowRadius = CENTER * (0.78 + 0.1 * pulse);
  const drawnPathD =
    currentPath.length > 1
      ? currentPath.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ")
      : "";

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
                {/* 中心柔光：径向渐变，强度由覆盖度与 6 秒脉动共同决定 */}
                <RadialGradient id="boundaryGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={palette.primary} stopOpacity={glowOpacity} />
                  <Stop offset="55%" stopColor={palette.primary} stopOpacity={glowOpacity * 0.35} />
                  <Stop offset="100%" stopColor={palette.primary} stopOpacity={0} />
                </RadialGradient>
              </Defs>

              {/* 氛围层①：中心柔光，随呼吸节奏轻微涨缩 */}
              <Circle cx={CENTER} cy={CENTER} r={glowRadius} fill="url(#boundaryGlow)" />

              {/* 氛围层②：三圈涟漪向外扩散淡出，像心域在缓慢呼吸 */}
              {[0, 1, 2].map((i) => {
                const p = (ambient + i / 3) % 1;
                return (
                  <Circle
                    key={`ripple-${i}`}
                    cx={CENTER}
                    cy={CENTER}
                    r={CENTER * (0.34 + p * 0.6)}
                    fill="none"
                    stroke={palette.sage}
                    strokeWidth={1.5}
                    opacity={(1 - p) * (0.1 + (liveCoverage / 100) * 0.16)}
                  />
                );
              })}

              {/* 氛围层③：缓慢上浮的光点，淡入淡出，纯装饰不干扰绘制 */}
              {AMBIENT_MOTES.map((m, i) => {
                const p = (ambient * m.speed + m.phase) % 1;
                return (
                  <Circle
                    key={`mote-${i}`}
                    cx={(m.baseX + Math.sin(p * Math.PI * 2) * m.sway) * SVG_SIZE}
                    cy={(m.baseY - p * m.rise) * SVG_SIZE}
                    r={m.size}
                    fill={m.warm ? palette.primary : palette.sage}
                    opacity={Math.sin(p * Math.PI) * 0.45}
                  />
                );
              })}

              {/* 理想边界（虚线引导）：dashoffset 随氛围循环滚动，暗示这是"待填补的边界"。
                  偏移量取两个虚线周期（6+8=14 → 28），保证循环接缝处不跳变 */}
              <Path
                d={idealPathD}
                fill="none"
                stroke={palette.blue}
                strokeWidth={2}
                strokeDasharray="6,8"
                strokeDashoffset={-ambient * 28}
                opacity={0.7}
              />

              {/* 当前绘制中的路径（只有一笔）：三层描边模拟发光笔迹 */}
              {currentPath.length > 1 && (
                <>
                  <Path
                    d={drawnPathD}
                    stroke={palette.primary}
                    strokeWidth={14}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    opacity={0.14}
                  />
                  <Path
                    d={drawnPathD}
                    stroke={palette.primary}
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    opacity={0.28}
                  />
                  <Path
                    d={drawnPathD}
                    stroke={palette.primary}
                    strokeWidth={4.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    opacity={0.95}
                  />
                  <Path
                    d={drawnPathD}
                    stroke={palette.surface}
                    strokeWidth={1.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    opacity={0.55}
                  />
                </>
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
    paddingHorizontal: space.lg,
  },
  startBreathBtn: {
    backgroundColor: palette.primary,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
    borderRadius: radius.xl,
    alignItems: "center",
    maxWidth: 320,
    ...shadow.lift,
  },
  startCapybaraFrame: {
    width: 84,
    height: 84,
    borderRadius: 42,
    overflow: "hidden",
    backgroundColor: palette.surface,
    marginBottom: space.md,
  },
  startCapybaraImage: {
    position: "absolute",
    left: -10,
    top: -10,
    width: 104,
    height: 104,
  },
  startBreathBtnText: {
    color: palette.surface,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  startBreathSubtext: {
    color: palette.surface,
    opacity: 0.92,
    fontSize: fontSize.caption,
    lineHeight: 21,
    marginTop: space.sm,
    textAlign: "center",
    fontFamily,
  },
  breathStage: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.lg,
  },
  breathHalo: {
    position: "absolute",
    left: 0,
    top: 0,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: palette.primary,
  },
  breathRingSvg: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  capybaraFrame: {
    position: "absolute",
    left: (RING_SIZE - CAPY_FRAME) / 2,
    top: (RING_SIZE - CAPY_FRAME) / 2,
    width: CAPY_FRAME,
    height: CAPY_FRAME,
    borderRadius: CAPY_FRAME / 2,
    overflow: "hidden",
    backgroundColor: palette.surfaceSoft,
    ...shadow.soft,
  },
  capybaraImage: {
    position: "absolute",
    left: -(CAPY_IMAGE - CAPY_FRAME) / 2,
    top: -(CAPY_IMAGE - CAPY_FRAME) / 2,
    width: CAPY_IMAGE,
    height: CAPY_IMAGE,
  },
  breathPhaseText: {
    color: palette.text,
    fontSize: fontSize.heading,
    // 固定行高：吸气/呼气文案与倒计时数字字号不同，固定行高可避免每秒抖一下
    lineHeight: 44,
    fontWeight: fontWeight.semibold,
    letterSpacing: 2,
    fontFamily,
  },
  breathCountdownText: {
    color: palette.primaryDark,
    fontSize: fontSize.display,
  },
  breathHintText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    marginTop: space.xs,
    fontFamily,
  },
  breathRoundText: {
    color: palette.textFaint,
    fontSize: fontSize.caption,
    marginTop: space.md,
    letterSpacing: 0.5,
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
