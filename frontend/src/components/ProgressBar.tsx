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
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
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
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginVertical: 1,
  },
  icon: {
    fontSize: fontSize.caption,
    width: 20, // 固定 icon 宽度，确保两行 label 起始位置对齐
    textAlign: "center",
  },
  label: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    fontFamily,
    width: 68, // 固定 label 宽度：需容纳最长的「NPC操控」，并确保两行 track 等长；配合 numberOfLines={1} 保证不折行
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
    width: 30, // 固定 value 宽度，确保两行 track 等长；14px 下三位数「100」约 26px，用固定宽度避免两行长度不等
    textAlign: "right",
  },
});
