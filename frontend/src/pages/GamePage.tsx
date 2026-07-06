import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useNavigate } from "react-router-dom";
import { GestureHandlerRootView } from "../mocks/gesture-handler";
import HeartDomainPrepareScreen from "../components/HeartDomainPrepareScreen";
import BattleScreen from "../components/BattleScreen";
import RepairScreen from "../components/RepairScreen";
import ReviewScreen from "../components/ReviewScreen";
import { useGameStore } from "../store/gameStore";
import { GamePhase, LEVELS, GameRecord, Badge, ALL_BADGES } from "@aigame/shared";
import {
  palette,
  radius,
  space,
  fontSize,
  fontWeight,
  fontFamily,
  shadow,
} from "../theme";

export default function GamePage() {
  const navigate = useNavigate();
  const { phase, setPhase, currentLevel, totalLevels, nextLevel, resetForLevel } = useGameStore();
  const [showLevelTransition, setShowLevelTransition] = useState(false);
  const [lastVictory, setLastVictory] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);
  const [showHomeModal, setShowHomeModal] = useState(false);

  const handlePrepareComplete = useCallback(() => {
    setPhase(GamePhase.DialogueBattle);
  }, [setPhase]);

  const handleBattleComplete = useCallback((victory: boolean) => {
    setLastVictory(victory);
    setShowReview(true);
  }, []);

  // 保存通关记录（在复盘完成时调用）
  const saveGameRecord = useCallback((victory: boolean) => {
    const state = useGameStore.getState();
    const { review, currentLevel, badges: oldBadges } = state;
    const lvlCfg = LEVELS[currentLevel - 1];
    if (!lvlCfg) return;
    const best = review.bestScores;
    const avgScore = Math.round(
      (best.boundaryAwareness + best.emotionalStability + best.cognitiveClarity + best.assertiveResponse) / 4
    );
    const record: GameRecord = {
      level: currentLevel,
      timestamp: Date.now(),
      victory,
      avgScore,
      dimensions: best,
      levelTitle: lvlCfg.title,
    };
    state.addGameRecord(record);
    console.log("[record saved]", record);

    // 解锁徽章
    const beforeUnlock = oldBadges.filter((b) => b.unlockedAt).map((b) => b.id);
    const badgeMap: Record<number, string> = { 1: "gaslight_master", 2: "pua_resist", 3: "family_bound", 4: "net_guard", 5: "bias_breaker" };
    const badgeId = badgeMap[currentLevel];
    if (badgeId) state.unlockBadge(badgeId);
    state.unlockBadge("first_clear");
    if (avgScore >= 90) state.unlockBadge("perfect_defense");
    const allCleared = LEVELS.every((_, i) =>
      state.gameHistory.some((r) => r.level === i + 1)
    );
    if (allCleared) state.unlockBadge("all_clear");

    const afterState = useGameStore.getState();
    return afterState.badges.filter((b) => b.unlockedAt && !beforeUnlock.includes(b.id));
  }, []);

  const handleReviewComplete = useCallback(() => {
    const newlyUnlocked = saveGameRecord(lastVictory) || [];
    if (newlyUnlocked.length > 0) {
      setNewBadges(newlyUnlocked);
    } else {
      setShowReview(false);
      setPhase(GamePhase.AftermathRepair);
    }
  }, [setPhase, lastVictory, saveGameRecord]);

  const handleBadgeModalClose = useCallback(() => {
    setNewBadges([]);
    setShowReview(false);
    setPhase(GamePhase.AftermathRepair);
  }, [setPhase]);

  const [showNextLevelModal, setShowNextLevelModal] = useState(false);

  const handleRepairComplete = useCallback(() => {
    // 修复完成后弹出确认框
    setShowNextLevelModal(true);
  }, []);

  const confirmNextLevel = useCallback(() => {
    setShowNextLevelModal(false);
    const next = nextLevel();
    if (next <= totalLevels) {
      // 显示关卡转场
      setShowLevelTransition(true);
      setTimeout(() => {
        setShowLevelTransition(false);
        setPhase(GamePhase.SanctuaryPrep);
      }, 2500);
    } else {
      // 所有关卡通关，回到主页
      resetForLevel(1);
    }
  }, [nextLevel, totalLevels, resetForLevel, setPhase]);

  const renderPhase = () => {
    switch (phase) {
      case GamePhase.SanctuaryPrep:
        return <HeartDomainPrepareScreen onComplete={handlePrepareComplete} />;
      case GamePhase.DialogueBattle:
        return (
          <BattleScreen
            onComplete={handleBattleComplete}
            level={currentLevel}
          />
        );
      case GamePhase.AftermathRepair:
        return <RepairScreen onComplete={handleRepairComplete} level={currentLevel} />;
      default:
        return <HeartDomainPrepareScreen onComplete={handlePrepareComplete} />;
    }
  };

  const currentLevelCfg = LEVELS[currentLevel - 1] || LEVELS[0];

  return (
    <GestureHandlerRootView style={styles.container}>
      {showReview ? (
        <ReviewScreen onComplete={handleReviewComplete} />
      ) : (
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={styles.pageScrollContent}
          showsVerticalScrollIndicator
        >
          {renderPhase()}
        </ScrollView>
      )}

      {/* 首页按钮 */}
      <TouchableOpacity style={styles.homeBtn} onPress={() => setShowHomeModal(true)} accessibilityLabel="返回首页" accessibilityRole="button">
        <Text style={styles.homeBtnText}>🏠</Text>
      </TouchableOpacity>

      {/* 返回首页确认弹框 */}
      {showHomeModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalIcon}>🚪</Text>
            <Text style={styles.modalTitle}>离开当前关卡？</Text>
            <Text style={styles.modalDesc}>
              返回首页后当前进度将丢失，确定要离开吗？
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowHomeModal(false)}
                accessibilityLabel="继续游戏"
                accessibilityRole="button"
              >
                <Text style={styles.modalCancelText}>继续游戏</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: palette.clay }]}
                onPress={() => {
                  setShowHomeModal(false);
                  resetForLevel(1);
                  navigate("/");
                }}
                accessibilityLabel="确认返回首页"
                accessibilityRole="button"
              >
                <Text style={styles.modalConfirmText}>返回首页</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 徽章解锁弹框 */}
      {newBadges.length > 0 && (
        <View style={styles.modalOverlay}>
          <View style={styles.badgeModalCard}>
            {newBadges.map((badge) => (
              <View key={badge.id} style={styles.badgeModalContent}>
                <Text style={styles.badgeModalIcon}>{badge.icon}</Text>
                <Text style={styles.badgeModalTitle}>🎉 获得新徽章！</Text>
                <Text style={styles.badgeModalName}>{badge.name}</Text>
                <Text style={styles.badgeModalDesc}>{badge.description}</Text>
              </View>
            ))}
            <TouchableOpacity style={styles.badgeModalBtn} onPress={handleBadgeModalClose} accessibilityLabel="确认徽章" accessibilityRole="button">
              <Text style={styles.badgeModalBtnText}>太棒了！</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 下一关确认弹框 */}
      {showNextLevelModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalIcon}>🏆</Text>
            <Text style={styles.modalTitle}>准备进入下一关</Text>
            <Text style={styles.modalDesc}>
              你已经完成了本关的修复，准备好迎接第 {currentLevel + 1} 关的挑战了吗？
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowNextLevelModal(false)}
                accessibilityLabel="再等等"
                accessibilityRole="button"
              >
                <Text style={styles.modalCancelText}>再等等</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={confirmNextLevel}
                accessibilityLabel="进入下一关"
                accessibilityRole="button"
              >
                <Text style={styles.modalConfirmText}>进入下一关</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 关卡转场覆盖层 */}
      {showLevelTransition && (
        <View style={styles.levelTransition}>
          <Text style={styles.transitionLabel}>下一关</Text>
          <Text style={styles.transitionTitle}>
            第 {currentLevel} 关 · {currentLevelCfg.title}
          </Text>
          <Text style={styles.transitionSubtitle}>{currentLevelCfg.subtitle}</Text>
          <Text style={styles.transitionHint}>准备迎接新的挑战...</Text>
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
    backgroundColor: palette.bg,
    maxWidth: 500,
    width: "100%",
    alignSelf: "center",
  },
  pageScroll: {
    flex: 1,
    width: "100%",
  },
  pageScrollContent: {
    minHeight: "100%",
  },
  homeBtn: {
    position: "absolute",
    top: 50,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surface,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 90,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.soft,
  },
  homeBtnText: {
    fontSize: 18,
  },
  levelTransition: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(74, 64, 57, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  transitionLabel: {
    color: palette.primaryDark,
    fontSize: fontSize.caption,
    letterSpacing: 2,
    marginBottom: 8,
    fontFamily,
  },
  transitionTitle: {
    color: palette.surface,
    fontSize: fontSize.heading,
    fontWeight: fontWeight.bold,
    textAlign: "center",
    marginBottom: 6,
    fontFamily,
  },
  transitionSubtitle: {
    color: palette.surfaceSoft,
    fontSize: fontSize.body,
    textAlign: "center",
    marginBottom: space.lg,
    fontFamily,
  },
  transitionHint: {
    color: palette.surfaceSoft,
    fontSize: fontSize.caption,
    fontStyle: "italic",
    fontFamily,
  },
  // 确认弹框
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(74, 64, 57, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 200,
  },
  modalCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    marginHorizontal: space.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.lift,
  },
  modalIcon: {
    fontSize: 40,
    marginBottom: space.sm,
  },
  modalTitle: {
    color: palette.primaryDark,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    marginBottom: space.xs,
    fontFamily,
  },
  modalDesc: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: space.lg,
    fontFamily,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceSoft,
  },
  modalCancelText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    fontFamily,
  },
  modalConfirmBtn: {
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
    backgroundColor: palette.primary,
  },
  modalConfirmText: {
    color: palette.surface,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    fontFamily,
  },
  badgeModalCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    marginHorizontal: space.lg,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(224, 176, 132, 0.5)",
    ...shadow.lift,
  },
  badgeModalContent: { alignItems: "center", marginBottom: space.xs },
  badgeModalIcon: { fontSize: 64, marginBottom: space.xs },
  badgeModalTitle: { color: palette.peach, fontSize: fontSize.title, fontWeight: fontWeight.bold, marginBottom: space.xs, fontFamily },
  badgeModalName: { color: palette.text, fontSize: fontSize.sub, fontWeight: fontWeight.semibold, marginBottom: 4, fontFamily },
  badgeModalDesc: { color: palette.textSoft, fontSize: fontSize.body, textAlign: "center", fontFamily },
  badgeModalBtn: {
    marginTop: space.md,
    backgroundColor: palette.peach,
    paddingVertical: space.sm,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    ...shadow.soft,
  },
  badgeModalBtnText: { color: palette.text, fontSize: fontSize.sub, fontWeight: fontWeight.bold, fontFamily },
});