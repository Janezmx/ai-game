import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Svg, {
  Circle,
  Path,
  G,
  Ellipse,
  Defs,
  RadialGradient,
  Stop,
} from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { useGameStore } from "../store/gameStore";
import { PlantStatus, PlantType, ArtifactType } from "@aigame/shared";

const MINI_SIZE = 120;
const CENTER = MINI_SIZE / 2;

interface HeartDomainMiniProps {
  size?: number;
  activeArtifactType?: ArtifactType | null;
  stormMode?: boolean;
}

export default function HeartDomainMini({
  size = MINI_SIZE,
  activeArtifactType = null,
  stormMode = false,
}: HeartDomainMiniProps) {
  const { sanctuary } = useGameStore();

  const shieldOpacity = useSharedValue(1);
  const stormFlash = useSharedValue(0);
  const artifactEffect = useSharedValue(0);

  useEffect(() => {
    shieldOpacity.value = withTiming(sanctuary.shieldHealth / 100, {
      duration: 500,
    });
  }, [sanctuary.shieldHealth]);

  useEffect(() => {
    if (stormMode) {
      stormFlash.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 200 }),
          withTiming(0, { duration: 200 })
        ),
        -1,
        true
      );
    } else {
      stormFlash.value = withTiming(0, { duration: 300 });
    }
  }, [stormMode]);

  useEffect(() => {
    if (activeArtifactType) {
      artifactEffect.value = withSequence(
        withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 600, easing: Easing.in(Easing.quad) })
      );
    }
  }, [activeArtifactType]);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: stormFlash.value * 0.3,
  }));

  const effectAnimStyle = useAnimatedStyle(() => ({
    opacity: artifactEffect.value,
    transform: [{ scale: 1 + artifactEffect.value * 0.5 }],
  }));

  const plantPositions = [
    { x: 20, y: 20 },
    { x: size - 20, y: 20 },
    { x: 20, y: size - 20 },
    { x: size - 20, y: size - 20 },
  ];

  const getPlantColor = (status: PlantStatus, type: PlantType) => {
    if (status === PlantStatus.Healthy) {
      switch (type) {
        case PlantType.AnchoringVine: return "#4a9e4a";
        case PlantType.CalmingHerb: return "#7ec87e";
        case PlantType.ThornBarrier: return "#3d7a3d";
      }
    }
    if (status === PlantStatus.Shaking) return "#b8860b";
    return "#8b4513";
  };

  const renderPlant = (type: PlantType, status: PlantStatus, idx: number) => {
    const pos = plantPositions[idx] || plantPositions[0];
    const color = getPlantColor(status, type);
    const s = 14;

    return (
      <G key={`plant-${idx}`} opacity={status === PlantStatus.Defoliated ? 0.5 : 1}>
        <Circle cx={pos.x} cy={pos.y + s * 0.6} r={s * 0.05} fill="#5d4037" />
        <Path
          d={`M${pos.x},${pos.y + s * 0.8} L${pos.x},${pos.y + s * 0.2}`}
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <Circle cx={pos.x} cy={pos.y - s * 0.1} r={s * 0.3} fill={color} opacity={0.8} />
        {status === PlantStatus.Shaking && (
          <Path
            d={`M${pos.x - 4},${pos.y - s * 0.4} Q${pos.x},${pos.y - s * 0.7} ${pos.x + 4},${pos.y - s * 0.4}`}
            stroke="#ff0"
            strokeWidth={0.5}
            fill="none"
            opacity={0.6}
          />
        )}
      </G>
    );
  };

  const renderArtifactEffect = () => {
    if (!activeArtifactType) return null;
    const r = size * 0.35;

    switch (activeArtifactType) {
      case ArtifactType.Shield:
        return (
          <Animated.View style={[StyleSheet.absoluteFill, effectAnimStyle]}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <Circle cx={CENTER} cy={CENTER} r={r} fill="none" stroke="#7c7cff" strokeWidth={3} opacity={0.6} />
              <Circle cx={CENTER} cy={CENTER} r={r * 0.7} fill="none" stroke="#5c5cff" strokeWidth={2} opacity={0.4} />
            </Svg>
          </Animated.View>
        );
      case ArtifactType.Mirror:
        return (
          <Animated.View style={[StyleSheet.absoluteFill, effectAnimStyle]}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <Path
                d={`M${CENTER - r},${CENTER} L${CENTER},${CENTER - r} L${CENTER + r},${CENTER} L${CENTER},${CENTER + r} Z`}
                fill="none"
                stroke="#b0b0ff"
                strokeWidth={2}
                opacity={0.7}
              />
            </Svg>
          </Animated.View>
        );
      case ArtifactType.Spear:
        return (
          <Animated.View style={[StyleSheet.absoluteFill, effectAnimStyle]}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <Path
                d={`M${CENTER},${CENTER - r} L${CENTER},${CENTER + r}`}
                stroke="#6b8e23"
                strokeWidth={3}
                strokeLinecap="round"
                opacity={0.7}
              />
            </Svg>
          </Animated.View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id="shieldGrad" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#7c7cff" stopOpacity={0.4} />
            <Stop offset="70%" stopColor="#4a4aff" stopOpacity={0.2} />
            <Stop offset="100%" stopColor="#2a2aff" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#1a1a3a" stopOpacity={1} />
            <Stop offset="100%" stopColor="#0a0a1a" stopOpacity={1} />
          </RadialGradient>
        </Defs>

        <Circle cx={CENTER} cy={CENTER} r={CENTER - 2} fill="url(#bgGrad)" stroke="#2a2a4a" strokeWidth={1} />

        <Circle
          cx={CENTER}
          cy={CENTER}
          r={CENTER * 0.85}
          fill="url(#shieldGrad)"
          opacity={0.3 + (sanctuary.shieldHealth / 100) * 0.5}
        />
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={CENTER * 0.7}
          fill="none"
          stroke="#7c7cff"
          strokeWidth={1.5}
          opacity={0.2 + (sanctuary.shieldHealth / 100) * 0.4}
          strokeDasharray="3,3"
        />

        {sanctuary.fogDensity > 5 && (
          <G opacity={sanctuary.fogDensity / 100}>
            <Ellipse cx={CENTER * 0.7} cy={CENTER * 0.8} rx={20} ry={8} fill="#666" opacity={0.15} />
            <Ellipse cx={CENTER * 1.3} cy={CENTER * 1.1} rx={18} ry={6} fill="#666" opacity={0.12} />
          </G>
        )}

        {sanctuary.plants.slice(0, 4).map((p, idx) =>
          renderPlant(p.type, p.status, idx)
        )}
      </Svg>

      {stormMode && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "#fff" },
            flashStyle,
          ]}
        />
      )}

      {renderArtifactEffect()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#3a3a6a",
    backgroundColor: "#0a0a1a",
  },
});