import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { GestureHandlerRootView } from "../mocks/gesture-handler";
import HeartDomainPrepareScreen from "../components/HeartDomainPrepareScreen";
import BattleScreen from "../components/BattleScreen";
import RepairScreen from "../components/RepairScreen";
import { useGameStore } from "../store/gameStore";
import { GamePhase, LEVELS } from "@aigame/shared";

export default function GamePage() {
  const { phase, setPhase, currentLevel, totalLevels, nextLevel, resetForLevel } = useGameStore();
  const [showLevelTransition, setShowLevelTransition] = useState(false);
  const [lastVictory, setLastVictory] = useState(false);

  const handlePrepareComplete = useCallback(() => {
    setPhase(GamePhase.DialogueBattle);
  }, [setPhase]);

  const handleBattleComplete = useCallback((victory: boolean) => {
    // 无论是否最后一关，都先进入修复阶段
    setLastVictory(victory);
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
        return <RepairScreen onComplete={handleRepairComplete} />;
      default:
        return <HeartDomainPrepareScreen onComplete={handlePrepareComplete} />;
    }
  };

  const currentLevelCfg = LEVELS[currentLevel - 1] || LEVELS[0];

  return (
    <GestureHandlerRootView style={styles.container}>
      {renderPhase()}

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
});