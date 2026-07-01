import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { GestureHandlerRootView } from "../mocks/gesture-handler";
import HeartDomainPrepareScreen from "../components/HeartDomainPrepareScreen";
import BattleScreen from "../components/BattleScreen";
import RepairScreen from "../components/RepairScreen";
import ReviewScreen from "../components/ReviewScreen";
import { useGameStore } from "../store/gameStore";
import { GamePhase, LEVELS, GameRecord, Badge, ALL_BADGES } from "@aigame/shared";

export default function GamePage() {
  const { phase, setPhase, currentLevel, totalLevels, nextLevel, resetForLevel } = useGameStore();
  const [showLevelTransition, setShowLevelTransition] = useState(false);
  const [lastVictory, setLastVictory] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);

  const handlePrepareComplete = useCallback(() => {
    setPhase(GamePhase.DialogueBattle);
  }, [setPhase]);

  const handleBattleComplete = useCallback((victory: boolean) => {
    setLastVictory(victory);
    setShowReview(true); // 先显示复盘
  }, []);

  const handleReviewComplete = useCallback(() => {
    // 保存通关记录
    const state = useGameStore.getState();
    const { review, currentLevel, badges: oldBadges } = state;
    const lvlCfg = LEVELS[currentLevel - 1];
    const best = review.bestScores;
    const avgScore = Math.round(
      (best.boundaryAwareness + best.emotionalStability + best.cognitiveClarity + best.assertiveResponse) / 4
    );
    const record: GameRecord = {
      level: currentLevel,
      timestamp: Date.now(),
      victory: lastVictory,
      avgScore,
      dimensions: best,
      levelTitle: lvlCfg?.title || "",
    };
    state.addGameRecord(record);

    // 记录解锁前的徽章状态
    const beforeUnlock = oldBadges.filter((b) => b.unlockedAt).map((b) => b.id);

    // 解锁关卡徽章
    const badgeMap: Record<number, string> = { 1: "gaslight_master", 2: "pua_resist", 3: "family_bound", 4: "net_guard", 5: "bias_breaker" };
    const badgeId = badgeMap[currentLevel];
    if (badgeId) state.unlockBadge(badgeId);
    state.unlockBadge("first_clear");
    if (avgScore >= 90) state.unlockBadge("perfect_defense");
    const allCleared = LEVELS.every((_, i) =>
      state.gameHistory.some((r) => r.level === i + 1)
    );
    if (allCleared) state.unlockBadge("all_clear");

    // 找出新解锁的徽章
    const afterState = useGameStore.getState();
    const newlyUnlocked = afterState.badges.filter(
      (b) => b.unlockedAt && !beforeUnlock.includes(b.id)
    );
    if (newlyUnlocked.length > 0) {
      setNewBadges(newlyUnlocked);
    } else {
      setShowReview(false);
      setPhase(GamePhase.AftermathRepair);
    }
  }, [setPhase, lastVictory]);

  const handleBadgeModalClose = useCallback(() => {
    setNewBadges([]);
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
        renderPhase()
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
            <TouchableOpacity style={styles.badgeModalBtn} onPress={handleBadgeModalClose}>
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
              >
                <Text style={styles.modalCancelText}>再等等</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={confirmNextLevel}
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
    backgroundColor: "#0a0a1a",
    maxWidth: 500,
    width: "100%",
    alignSelf: "center",
  },
  levelTransition: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0a0a1aee",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  transitionLabel: {
    color: "#7c4dff",
    fontSize: 14,
    letterSpacing: 2,
    marginBottom: 8,
  },
  transitionTitle: {
    color: "#b388ff",
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 6,
  },
  transitionSubtitle: {
    color: "#9575cd",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  transitionHint: {
    color: "#666",
    fontSize: 12,
    fontStyle: "italic",
  },
  // 确认弹框
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000aa",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 200,
  },
  modalCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 40,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#7c4dff44",
  },
  modalIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  modalTitle: {
    color: "#b388ff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  modalDesc: {
    color: "#aaa",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: "#2a2a4a",
  },
  modalCancelText: {
    color: "#888",
    fontSize: 14,
  },
  modalConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: "#7c4dff",
  },
  modalConfirmText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  badgeModalCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 32,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#ffd70066",
  },
  badgeModalContent: { alignItems: "center", marginBottom: 8 },
  badgeModalIcon: { fontSize: 64, marginBottom: 8 },
  badgeModalTitle: { color: "#ffd700", fontSize: 20, fontWeight: "bold", marginBottom: 8 },
  badgeModalName: { color: "#fff", fontSize: 18, fontWeight: "600", marginBottom: 4 },
  badgeModalDesc: { color: "#aaa", fontSize: 13, textAlign: "center" },
  badgeModalBtn: {
    marginTop: 16,
    backgroundColor: "#ffd700",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  badgeModalBtnText: { color: "#1a1a2e", fontSize: 16, fontWeight: "bold" },
});