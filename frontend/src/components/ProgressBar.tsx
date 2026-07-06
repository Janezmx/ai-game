import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { palette, radius, fontSize, fontFamily } from "../theme";

interface ProgressBarProps {
  label: string;
  value: number;
  color: string;
  icon?: string;
}

/** 通用进度条组件，BattleScreen / ReviewScreen 共享 */
export default function ProgressBar({ label, value, color, icon }: ProgressBarProps) {
  return (
    <View style={styles.row}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.min(100, Math.max(0, value))}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
      <Text style={styles.value}>{Math.round(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginVertical: 1,
  },
  icon: {
    fontSize: fontSize.caption,
  },
  label: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    fontFamily,
  },
  track: {
    flex: 1,
    height: 6,
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  value: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    fontFamily,
  },
});
