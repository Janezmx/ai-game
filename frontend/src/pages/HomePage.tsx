import React, { useState, useCallback, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal } from "react-native";
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
  const setCurrentLevel = useGameStore((s) => s.setCurrentLevel);
  const resetLevel = useGameStore((s) => s.resetLevel);

  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  /**
   * 到达首页 = 结束本轮修炼：心域护盾复位（养满）、关卡回到第 1 关。
   *
   * 为什么放在"首页挂载"而不是"返回首页按钮"上：
   * 回到首页有多条路径（游戏页的返回首页按钮、成长记录页的 history.back()、地址栏直开 "/"），
   * 挂在按钮上会出现"有的入口复位、有的不复位"，同一个首页两种心域状态。
   * 挂在这里才能让规则统一为一句：**回到首页就复位**。
   *
   * 因此"心域磨损"只在**不回首页、一路连续点「下一关」**时累积。
   * 由于每局胜利只磨损 5、而修复一次能养回约 18，正常通关不会掉护盾；
   * 真正会把它打薄的是**失败**（每次净降 6 点左右），也就是"连败越来越吃力"这个场景。
   */
  useEffect(() => {
    resetLevel();
  }, [resetLevel]);

  const masteredCount = masteredKnowledgePointIds.length;
  const totalCount = 5;
  const clearedLevels = new Set(gameHistory.filter(r => r.victory).map(r => r.level));
  const maxCleared = clearedLevels.size > 0 ? Math.max(...clearedLevels) : 0;
  const maxUnlockedLevel = Math.min(5, maxCleared + 1);

  const handleStart = useCallback(() => {
    if (maxUnlockedLevel > 1) {
      setShowLevelPicker(true);
    } else {
      setCurrentLevel(1);
      navigate("/game");
    }
  }, [maxUnlockedLevel, navigate, setCurrentLevel]);

  const handleSelectLevel = useCallback((level: number) => {
    setCurrentLevel(level);
    setShowLevelPicker(false);
    navigate("/game");
  }, [navigate, setCurrentLevel]);

  return (
    <>
    {showLevelPicker && (
      <View style={styles.modalOverlay}>
        <View style={styles.pickerCard}>
          <Text style={styles.pickerTitle}>选择关卡</Text>
          <Text style={styles.pickerSub}>
            已通关前 {maxCleared} 关，可选 1 ～ {maxUnlockedLevel} 关
          </Text>
          <View style={styles.pickerList}>
            {Array.from({ length: maxUnlockedLevel }, (_, i) => i + 1).map((lv) => {
              const isCleared = clearedLevels.has(lv);
              const info = LEVELS.find((l) => l.id === lv);
              return (
                <TouchableOpacity
                  key={lv}
                  style={[styles.pickerItem, isCleared && styles.pickerItemCleared]}
                  onPress={() => handleSelectLevel(lv)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.pickerBadge, isCleared && styles.pickerBadgeCleared]}>
                    <Text style={styles.pickerBadgeText}>{isCleared ? "✓" : lv}</Text>
                  </View>
                  <View style={styles.pickerInfo}>
                    <Text style={styles.pickerLevelName}>
                      第{lv}关：{info?.title || ""}
                    </Text>
                    <Text style={styles.pickerLevelSub}>{info?.subtitle || ""}</Text>
                  </View>
                  {isCleared && <Text style={styles.pickerStatus}>已通关</Text>}
                  {!isCleared && lv === maxUnlockedLevel && (
                    <Text style={styles.pickerStatusNew}>新关卡</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={styles.pickerClose}
            onPress={() => setShowLevelPicker(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.pickerCloseText}>取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    )}
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.logo}>🌿 清醒边界</Text>
          <Text style={styles.subtitle}>守护你的心域，识别并抵御无形操控</Text>
          <View style={styles.descCard}>
            <Text style={styles.descText}>
              一款寓教于乐的心理防御游戏。在 AI 对话攻防中，学会识别煤气灯操控、职场打压、
              亲情绑架等操控手法，把每一次练习变成成长。
            </Text>
            {/* 入口处先立好框架：这里练的是"辨别"而不是"怀疑"，避免通关后见谁都像操控者 */}
            <Text style={styles.descHint}>
              这里练习的是「辨别」，不是「怀疑」——现实里，多数人说错话的时候并没有恶意。
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
          onPress={handleStart}
          activeOpacity={0.85}
        >
          <Text style={styles.startButtonText}>⚔️ 开始修行</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.startButton}
          onPress={() => navigate("/growth")}
          activeOpacity={0.85}
        >
          <Text style={styles.startButtonText}>📊 成长记录</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resetButton}
          onPress={() => setShowResetConfirm(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.resetButtonText}>🔄 重置数据</Text>
        </TouchableOpacity>

        {/* 重置确认弹窗 */}
        <Modal visible={showResetConfirm} transparent animationType="fade">
          <View style={styles.resetModalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>重置数据</Text>
              <Text style={styles.modalDesc}>确定要重置所有游戏数据吗？此操作不可恢复。</Text>
              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setShowResetConfirm(false)}
                >
                  <Text style={styles.modalCancelText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalConfirmBtn}
                  onPress={() => {
                    localStorage.removeItem("aigame-save");
                    window.location.reload();
                  }}
                >
                  <Text style={styles.modalConfirmText}>确定重置</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>

      <TutorialOverlay
        visible={!hasSeenTutorial}
        onFinish={() => setHasSeenTutorial(true)}
      />
    </View>
    </>
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
    lineHeight: 26,
    textAlign: "center",
  },
  /** 与主描述拉开层级：不是功能介绍，而是一句态度说明 */
  descHint: {
    color: palette.textFaint,
    fontSize: fontSize.caption,
    lineHeight: 20,
    textAlign: "center",
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: palette.border,
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
    paddingVertical: 14,
    borderRadius: radius.pill,
    marginTop: space.md,
    width: 240,
    alignSelf: "center",
    alignItems: "center",
    ...shadow.soft,
  },
  startButtonText: {
    color: palette.surface,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
    fontFamily,
  },
  resetButton: {
    backgroundColor: "transparent",
    paddingVertical: 10,
    marginTop: space.sm,
    alignSelf: "center",
  },
  resetButtonText: {
    color: palette.textFaint,
    fontSize: fontSize.caption,
    fontFamily,
  },
  resetModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalBox: { width: 300, backgroundColor: palette.surface, borderRadius: radius.md, padding: space.lg, alignItems: "center", ...shadow.soft },
  modalTitle: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: palette.text, marginBottom: space.sm, fontFamily },
  modalDesc: { fontSize: fontSize.body, color: palette.textSoft, textAlign: "center", marginBottom: space.lg, fontFamily },
  modalBtns: { flexDirection: "row", gap: space.md },
  modalCancelBtn: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border },
  modalCancelText: { fontSize: fontSize.body, color: palette.textSoft, fontFamily },
  modalConfirmBtn: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: palette.clay },
  modalConfirmText: { fontSize: fontSize.body, color: palette.surface, fontWeight: fontWeight.bold, fontFamily },
  // 关卡选择弹窗
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center",
    padding: space.lg,
  },
  pickerCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    width: "100%",
    maxWidth: 380,
    ...shadow.lift,
  },
  pickerTitle: {
    color: palette.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    fontFamily,
    textAlign: "center",
    marginBottom: space.xs,
  },
  pickerSub: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    fontFamily,
    textAlign: "center",
    marginBottom: space.lg,
  },
  pickerList: {
    marginBottom: space.md,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
  },
  pickerItemCleared: {
    opacity: 0.7,
  },
  pickerBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.sage,
    alignItems: "center",
    justifyContent: "center",
    marginRight: space.md,
  },
  pickerBadgeCleared: {
    backgroundColor: palette.green,
  },
  pickerBadgeText: {
    color: palette.surface,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
  },
  pickerInfo: {
    flex: 1,
  },
  pickerLevelName: {
    color: palette.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  pickerLevelSub: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  pickerStatus: {
    color: palette.green,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  },
  pickerStatusNew: {
    color: palette.primary,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
  },
  pickerClose: {
    marginTop: space.sm,
    paddingVertical: space.sm,
    alignItems: "center",
  },
  pickerCloseText: {
    color: palette.textFaint,
    fontSize: fontSize.body,
  },
});
