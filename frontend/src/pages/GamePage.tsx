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
import { averageDimensions, averageOf } from "../utils/dimensions";
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
  const { phase, setPhase, currentLevel, totalLevels, nextLevel, resetForLevel, resetLevel } = useGameStore();
  const [showLevelTransition, setShowLevelTransition] = useState(false);
  const [lastVictory, setLastVictory] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);
  const [showHomeModal, setShowHomeModal] = useState(false);
  const [showRetryModal, setShowRetryModal] = useState(false);

  const handlePrepareComplete = useCallback(() => {
    setPhase(GamePhase.DialogueBattle);
  }, [setPhase]);

  const handleBattleComplete = useCallback((victory: boolean) => {
    setLastVictory(victory);
    setShowReview(true);
    // 先把本局报告 id 定下来并落一次快照：即使玩家没看完复盘就离开，
    // 也已经保留了本次对局的对话与四维评分（复盘长文本会在补全后再覆盖更新）
    const state = useGameStore.getState();
    state.ensureReportId();
    void state.saveReviewReportDraft(victory);
  }, []);

  // 保存通关记录（在复盘完成时调用）
  const saveGameRecord = useCallback((victory: boolean) => {
    const state = useGameStore.getState();
    const { review, currentLevel, badges: oldBadges } = state;
    const lvlCfg = LEVELS[currentLevel - 1];
    if (!lvlCfg) return;
    // 本局得分 = 本局各轮四维的平均值。不能用 review.bestScores（逐轮取最大值），
    // 否则记录里存的永远是历史最高分，成长页雷达图与趋势只会向上爬、输了也不回落。
    const sessionDims = averageDimensions(review.dimensionHistory) || review.bestScores;
    const avgScore = averageOf(sessionDims);
    const record: GameRecord = {
      level: currentLevel,
      timestamp: Date.now(),
      victory,
      avgScore,
      dimensions: sessionDims,
      levelTitle: lvlCfg.title,
      // 关联复盘存档入口：拿不到 id 时保持 undefined，旧记录的卡片会自动不可点击
      reportId: state.currentReportId || undefined,
    };
    state.addGameRecord(record);
    console.log("[record saved]", record);

    // 解锁徽章（仅在胜利时）
    const beforeUnlock = oldBadges.filter((b) => b.unlockedAt).map((b) => b.id);
    if (victory) {
      const badgeMap: Record<number, string> = { 1: "gaslight_master", 2: "pua_resist", 3: "family_bound", 4: "net_guard", 5: "bias_breaker" };
      const badgeId = badgeMap[currentLevel];
      if (badgeId) state.unlockBadge(badgeId);
      state.unlockBadge("first_clear");
      if (avgScore >= 90) state.unlockBadge("perfect_defense");
      // 重新取最新状态（addGameRecord 后 state.gameHistory 可能尚未反映到闭包快照）
      const freshState = useGameStore.getState();
      const allCleared = LEVELS.every((_, i) =>
        freshState.gameHistory.some((r) => r.level === i + 1 && r.victory)
      );
      if (allCleared) freshState.unlockBadge("all_clear");
    }

    const afterState = useGameStore.getState();
    return afterState.badges.filter((b) => b.unlockedAt && !beforeUnlock.includes(b.id));
  }, []);

  const handleReviewComplete = useCallback(() => {
    // 兜底保存：此时各轮长文本通常已补全，确保存下的是最完整版本
    void useGameStore.getState().saveReviewReportDraft(lastVictory);
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
    // 修复完成后：胜利弹出下一关确认框；失败提供"重新挑战当前关卡"或"返回首页"
    if (lastVictory) {
      setShowNextLevelModal(true);
    } else {
      setShowRetryModal(true);
    }
  }, [lastVictory]);

  const handleRetryLevel = useCallback(() => {
    setShowRetryModal(false);
    // 重置到当前关卡：对话、迷雾、法器都回到本关初始值，
    // 但**心域护盾保留**（它是跨关养成的存量，一次重试不该把它清零）
    resetForLevel(currentLevel);
  }, [resetForLevel, currentLevel]);

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
      // 所有关卡通关：等同"回到首页"，心域一并复位（护盾回满）
      resetLevel();
    }
  }, [nextLevel, totalLevels, resetLevel, setPhase]);

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
        <ReviewScreen onComplete={handleReviewComplete} victory={lastVictory} />
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
                  // 心域复位不在这里做：统一由首页挂载时执行（HomePage 的 resetLevel），
                  // 否则"游戏页返回"与"从成长记录返回"会得到两种心域状态。
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
            <Text style={styles.badgeModalHeader}>🎉 恭喜获得新徽章</Text>
            {newBadges.map((badge, idx) => (
              <View key={badge.id} style={[styles.badgeModalContent, idx > 0 && styles.badgeModalDivider]}>
                <View style={styles.badgeModalIconWrap}>
                  <Text style={styles.badgeModalIcon}>{badge.icon}</Text>
                </View>
                <Text style={styles.badgeModalTitle}>获得新徽章！</Text>
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

      {/* 下一关确认弹框（最后一关通关时显示全部通关文案） */}
      {showNextLevelModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalIcon}>🏆</Text>
            {currentLevel >= totalLevels ? (
              <>
                <Text style={styles.modalTitle}>恭喜全部通关！</Text>
                <Text style={styles.modalDesc}>
                  你已完成全部 {totalLevels} 关挑战，抵御了所有类型的心理操控。可以回到第 1 关再次练习，或回到首页查看成长记录。
                </Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => { setShowNextLevelModal(false); navigate("/"); }}
                    accessibilityLabel="回到首页"
                    accessibilityRole="button"
                  >
                    <Text style={styles.modalCancelText}>回到首页</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalConfirmBtn}
                    onPress={confirmNextLevel}
                    accessibilityLabel="回到第 1 关"
                    accessibilityRole="button"
                  >
                    <Text style={styles.modalConfirmText}>回到第 1 关</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>准备进入下一关</Text>
                <Text style={styles.modalDesc}>
                  你已经完成了本关的修复，准备好迎接第 {currentLevel + 1} 关的挑战了吗？
                </Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => {
                      setShowNextLevelModal(false);
                      // 「再等等」= 暂不推进下一关，留在本关重新开始。
                      // 必须显式重置本关状态：否则 conversation 里还留着上一局的对话，
                      // 玩家点「开始对话入侵」会直接看到上一次的整段对话。
                      resetForLevel(currentLevel);
                    }}
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
              </>
            )}
          </View>
        </View>
      )}

      {/* 挑战失败：重玩当前关卡确认弹框 */}
      {showRetryModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalIcon}>🛡️</Text>
            <Text style={styles.modalTitle}>心域未能守住</Text>
            <Text style={styles.modalDesc}>
              第 {currentLevel} 关 · {currentLevelCfg.title} 挑战失败。可以重新挑战当前关卡，或返回首页调整状态。
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setShowRetryModal(false); navigate("/"); }}
                accessibilityLabel="返回首页"
                accessibilityRole="button"
              >
                <Text style={styles.modalCancelText}>返回首页</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleRetryLevel}
                accessibilityLabel="重新挑战当前关卡"
                accessibilityRole="button"
              >
                <Text style={styles.modalConfirmText}>重新挑战</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 关卡转场覆盖层 */}
      {showLevelTransition && (
        <View style={styles.levelTransition}>
          <View style={styles.transitionCard}>
            <Text style={styles.transitionLabel}>✨ 下一关</Text>
            <Text style={styles.transitionTitle}>
              第 {currentLevel} 关 · {currentLevelCfg.title}
            </Text>
            <Text style={styles.transitionSubtitle}>{currentLevelCfg.subtitle}</Text>
            <Text style={styles.transitionHint}>准备迎接新的挑战...</Text>
          </View>
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
    fontSize: 20,
  },
  levelTransition: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(74, 64, 57, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  // 转场内容卡片：明显的背景框，凸显过渡
  transitionCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    paddingHorizontal: space.xl,
    paddingVertical: space.xl,
    marginHorizontal: space.lg,
    width: "85%",
    maxWidth: 460,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(224, 176, 132, 0.7)",
    ...shadow.lift,
  },
  transitionLabel: {
    color: palette.primaryDark,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    letterSpacing: 3,
    marginBottom: space.sm,
    fontFamily,
  },
  transitionTitle: {
    color: palette.text,
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
    textAlign: "center",
    marginBottom: space.sm,
    lineHeight: fontSize.display + 6,
    fontFamily,
  },
  transitionSubtitle: {
    color: palette.textSoft,
    fontSize: fontSize.sub,
    textAlign: "center",
    marginBottom: space.lg,
    fontFamily,
  },
  transitionHint: {
    color: palette.primaryDark,
    fontSize: fontSize.body,
    fontStyle: "italic",
    textAlign: "center",
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
    fontSize: 42,
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
    lineHeight: 22,
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
    width: "90%",
    maxWidth: 460,
    minWidth: 340,
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(224, 176, 132, 0.5)",
    ...shadow.lift,
  },
  badgeModalHeader: {
    color: palette.primaryDark,
    fontSize: fontSize.heading,
    fontWeight: fontWeight.bold,
    textAlign: "center",
    marginBottom: space.md,
    letterSpacing: 1,
    fontFamily,
  },
  badgeModalContent: {
    width: "100%",
    alignItems: "center",
    paddingVertical: space.sm,
  },
  badgeModalDivider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(224, 176, 132, 0.25)",
    marginTop: space.sm,
    paddingTop: space.md,
  },
  badgeModalIconWrap: {
    width: 88,
    borderRadius: 44,
    backgroundColor: "rgba(224, 176, 132, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  badgeModalIcon: { fontSize: 54, lineHeight: 66 },
  badgeModalTitle: {
    color: palette.peach,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.semibold,
    marginBottom: 4,
    letterSpacing: 1,
    fontFamily,
  },
  badgeModalName: {
    color: palette.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    marginBottom: space.xs,
    textAlign: "center",
    fontFamily,
  },
  badgeModalDesc: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    lineHeight: 24,
    textAlign: "center",
    paddingHorizontal: space.sm,
    fontFamily,
  },
  badgeModalBtn: {
    marginTop: space.lg,
    backgroundColor: palette.peach,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.xxl,
    borderRadius: radius.pill,
    minWidth: 180,
    alignItems: "center",
    ...shadow.soft,
  },
  badgeModalBtnText: { color: palette.text, fontSize: fontSize.sub, fontWeight: fontWeight.bold, fontFamily },
});