import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Svg, {
  Circle,
  Path,
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
import { ArtifactType } from "@aigame/shared";
import { palette, radius } from "../theme";

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

  const renderArtifactEffect = () => {
    if (!activeArtifactType) return null;
    const r = size * 0.35;

    switch (activeArtifactType) {
      case ArtifactType.Shield:
        return (
          <Animated.View style={[StyleSheet.absoluteFill, effectAnimStyle]}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <Circle cx={CENTER} cy={CENTER} r={r} fill="none" stroke={palette.primary} strokeWidth={2} opacity={0.5} />
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
                stroke={palette.primary}
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
                stroke={palette.sage}
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
            <Stop offset="0%" stopColor={palette.primary} stopOpacity={0.4} />
            <Stop offset="70%" stopColor={palette.primaryDark} stopOpacity={0.2} />
            <Stop offset="100%" stopColor={palette.primaryDark} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={palette.bgWarm} stopOpacity={1} />
            <Stop offset="100%" stopColor={palette.bg} stopOpacity={1} />
          </RadialGradient>
        </Defs>

        <Circle cx={CENTER} cy={CENTER} r={CENTER - 2} fill="url(#bgGrad)" />

        <Circle
          cx={CENTER}
          cy={CENTER}
          r={CENTER * 0.85}
          fill="url(#shieldGrad)"
          opacity={0.3 + (sanctuary.shieldHealth / 100) * 0.5}
        />

      </Svg>

      {stormMode && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: palette.bgWarm },
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
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: palette.bg,
  },
});
