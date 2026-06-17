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
    if (currentLevel >= totalLevels) {
      // 最后一关完成，回到主页
      setPhase(GamePhase.SanctuaryPrep);
      // 重置到第一关（通过全局导航或状态重置）
      resetForLevel(1);
      return;
    }
    // 先显示过渡，然后进入修复阶段
    setLastVictory(victory);
    setPhase(GamePhase.AftermathRepair);
  }, [currentLevel, totalLevels, setPhase, resetForLevel]);

  const handleRepairComplete = useCallback(() => {
    // 修复完成后自动进入下一关
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
});