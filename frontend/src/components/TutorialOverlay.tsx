import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";
import { TutorialStep } from "@aigame/shared";
import { palette, radius, space, fontSize, fontWeight, fontFamily, shadow } from "../theme";

const STEPS: TutorialStep[] = [
  {
    id: "step1",
    icon: "🌿",
    title: "守护你的心域",
    description:
      "你的内心像一个需要守护的花园（心域）。操控会像迷雾一样侵蚀它，而你的目标，是守住边界不被入侵。",
  },
  {
    id: "step2",
    icon: "🔍",
    title: "识别操控话术",
    description:
      "对话里，对手会说看似关心、实则否定的话。留意每轮之后的「为什么」点评，你会一点点学会识别套路。",
  },
  {
    id: "step3",
    icon: "🛡️",
    title: "坚定而温和地回应",
    description:
      "用清晰、不自我怀疑的话守住边界。每一次好的回应，都会增强护盾、削弱对方的控制力。",
  },
  {
    id: "step4",
    icon: "🌱",
    title: "复盘与成长",
    description:
      "每关结束会沉淀知识点与真实案例。通关后到「成长记录」查看你已掌握的心理防御知识。",
  },
];

export default function TutorialOverlay({
  visible,
  onFinish,
}: {
  visible: boolean;
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);

  // 每次打开都从头开始
  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible]);

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) onFinish();
    else setIndex(index + 1);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.icon}>{step.icon}</Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.desc}>{step.description}</Text>

          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === index && styles.dotActive]}
              />
            ))}
          </View>

          <TouchableOpacity style={styles.btn} onPress={handleNext} activeOpacity={0.85}>
            <Text style={styles.btnText}>{isLast ? "开始游戏" : "下一步"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(74, 64, 57, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: space.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: space.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.lift,
  },
  icon: {
    fontSize: 48,
    marginBottom: space.sm,
  },
  title: {
    color: palette.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    fontFamily,
    marginBottom: space.sm,
  },
  desc: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    lineHeight: 24,
    textAlign: "center",
    marginBottom: space.lg,
  },
  dots: {
    flexDirection: "row",
    marginBottom: space.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.borderStrong,
    marginHorizontal: 4,
  },
  dotActive: {
    width: 20,
    backgroundColor: palette.primary,
  },
  btn: {
    backgroundColor: palette.primary,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: radius.pill,
    ...shadow.soft,
  },
  btnText: {
    color: palette.surface,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.semibold,
    fontFamily,
  },
});
