import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useNavigate } from "react-router-dom";
import { useGameStore } from "../store/gameStore";
import { LEVELS } from "@aigame/shared";
import TutorialOverlay from "../components/TutorialOverlay";
import { palette, radius, space, fontSize, fontWeight, fontFamily, shadow, rootBackground } from "../theme";

export default function HomePage() {
  const navigate = useNavigate();
  const hasSeenTutorial = useGameStore((s) => s.hasSeenTutorial);
  const setHasSeenTutorial = useGameStore((s) => s.setHasSeenTutorial);
  const masteredKnowledgePointIds = useGameStore((s) => s.masteredKnowledgePointIds);
  const gameHistory = useGameStore((s) => s.gameHistory);

  const masteredCount = masteredKnowledgePointIds.length;
  const totalCount = 5;
  const clearedLevels = new Set(gameHistory.filter(r => r.victory).map(r => r.level));

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.logo}>🌿 清醒边界</Text>
          <Text style={styles.subtitle}>守护你的心域，识别并抵御无形操控</Text>
          <View style={styles.descCard}>
            <Text style={styles.descText}>
              一款寓教于乐的心理防御游戏。在 AI 对话攻防中，学会识别煤气灯效应、职场PUA、
              亲情绑架等操控手法，把每一次练习变成成长。
            </Text>
          </View>
        </View>

        {/* 学习进度 */}
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>📖 学习进度</Text>
          <Text style={styles.progressLabel}>已掌握 {masteredCount}/{totalCount} 种操控手法</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(masteredCount / totalCount) * 100}%` }]} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>🗺️ 五关修炼路线</Text>
        <View style={styles.levelList}>
          {LEVELS.map((lv) => {
            const isCleared = clearedLevels.has(lv.id);
            return (
              <View key={lv.id} style={styles.levelCard}>
                <View style={[styles.levelBadge, isCleared && styles.levelBadgeCleared]}>
                  <Text style={styles.levelNum}>{isCleared ? "✓" : lv.id}</Text>
                </View>
                <View style={styles.levelInfo}>
                  <Text style={styles.levelName}>{lv.title}</Text>
                  <Text style={styles.levelSub}>{lv.subtitle}</Text>
                </View>
                {isCleared && <Text style={styles.clearedIcon}>✅</Text>}
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.startButton}
          onPress={() => navigate("/game")}
          activeOpacity={0.85}
        >
          <Text style={styles.startButtonText}>开始修行</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.growthButton}
          onPress={() => navigate("/growth")}
          activeOpacity={0.85}
        >
          <Text style={styles.growthButtonText}>🌱 成长记录</Text>
        </TouchableOpacity>
      </ScrollView>

      <TutorialOverlay
        visible={!hasSeenTutorial}
        onFinish={() => setHasSeenTutorial(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...rootBackground,
  },
  scroll: {
    alignItems: "center",
    padding: space.lg,
    paddingBottom: space.xxl,
    maxWidth: 500,
    width: "100%",
    alignSelf: "center",
  },
  hero: {
    alignItems: "center",
    marginTop: space.xxl,
    marginBottom: space.lg,
  },
  logo: {
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
    color: palette.text,
    fontFamily,
    letterSpacing: 2,
    marginBottom: space.xs,
  },
  subtitle: {
    fontSize: fontSize.sub,
    color: palette.primaryDark,
    fontWeight: fontWeight.medium,
    marginBottom: space.lg,
  },
  descCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.soft,
  },
  descText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    lineHeight: 24,
    textAlign: "center",
  },
  sectionTitle: {
    alignSelf: "flex-start",
    color: palette.text,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    fontFamily,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  levelList: {
    width: "100%",
  },
  levelCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  levelBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.sage,
    alignItems: "center",
    justifyContent: "center",
    marginRight: space.md,
  },
  levelBadgeCleared: {
    backgroundColor: palette.green,
  },
  levelNum: {
    color: palette.surface,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
  },
  clearedIcon: {
    fontSize: fontSize.title,
    marginLeft: space.xs,
  },
  progressCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: palette.border,
    width: "100%",
    ...shadow.soft,
  },
  progressTitle: {
    color: palette.primaryDark,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.semibold,
    fontFamily,
    marginBottom: space.xs,
  },
  progressLabel: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    fontFamily,
    marginBottom: space.sm,
  },
  progressTrack: {
    width: "100%",
    height: 8,
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: palette.green,
    borderRadius: radius.pill,
  },
  levelInfo: {
    flex: 1,
  },
  levelName: {
    color: palette.text,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.semibold,
  },
  levelSub: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  startButton: {
    backgroundColor: palette.primary,
    paddingHorizontal: 56,
    paddingVertical: 16,
    borderRadius: radius.pill,
    marginTop: space.lg,
    ...shadow.soft,
  },
  startButtonText: {
    color: palette.surface,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
    fontFamily,
  },
  growthButton: {
    marginTop: space.md,
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.primaryDark,
  },
  growthButtonText: {
    color: palette.primaryDark,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.medium,
  },
});
