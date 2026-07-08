import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Modal,
} from "react-native";
import Svg, { Circle, G, Defs, LinearGradient, Stop } from "react-native-svg";
import { GestureHandlerRootView, PanGestureHandler, State, PanGestureHandlerGestureEvent } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useDerivedValue,
  runOnJS,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameStore } from "../store/gameStore";
import { ArtifactType, Artifact, GamePhase } from "@aigame/shared";
import KnowledgeCard, { getLevelKnowledgePoint } from "./KnowledgeCard";
import { palette, radius, space, fontSize, fontWeight, fontFamily, shadow } from "../theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SVG_SIZE = Math.min(SCREEN_WIDTH - 40, 300);
const CENTER = SVG_SIZE / 2;

// ==================== 心域可视化 ====================
function HeartDomainSVG({
  shieldHealth,
  fogDensity,
  activeArtifactType,
}: {
  shieldHealth: number;
  fogDensity: number;
  activeArtifactType: ArtifactType | null;
}) {
  const shieldScale = 0.6 + (shieldHealth / 100) * 0.4;
  const fogOpacity = 0.15 + (fogDensity / 100) * 0.6;

  return (
    <Svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 100 100`}>
      <Defs>
        <LinearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={palette.blue} stopOpacity={0.5} />
          <Stop offset="100%" stopColor={palette.primary} stopOpacity={0.3} />
        </LinearGradient>
        <LinearGradient id="fogGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={palette.fog} stopOpacity={fogOpacity} />
          <Stop offset="100%" stopColor={palette.fog} stopOpacity={fogOpacity * 0.5} />
        </LinearGradient>
      </Defs>

      {/* 边界护盾 */}
      <Circle
        cx={50}
        cy={50}
        r={45 * shieldScale}
        fill="none"
        stroke={palette.blue}
        strokeWidth={3}
        strokeOpacity={0.6 + (shieldHealth / 100) * 0.4}
      />
      <Circle
        cx={50}
        cy={50}
        r={45 * shieldScale}
        fill="url(#shieldGrad)"
      />

      {/* 护盾闪烁效果 */}
      {activeArtifactType === ArtifactType.Shield && (
        <Circle
          cx={50}
          cy={50}
          r={45 * shieldScale + 3}
          fill="none"
          stroke={palette.surface}
          strokeWidth={2}
          strokeOpacity={0.6}
        />
      )}

      {/* 迷雾覆盖（已隐藏，效果不明显，状态逻辑保留）
      <Circle cx={50} cy={50} r={48} fill="url(#fogGrad)" />
      */}
    </Svg>
  );
}

// ==================== 法器卡片 ====================
function ArtifactCard({
  artifact,
  onEquip,
  onUnequip,
  isEquipped,
}: {
  artifact: Artifact;
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
  isEquipped: boolean;
}) {
  const getIcon = (type: ArtifactType) => {
    switch (type) {
      case ArtifactType.Shield: return "🛡️";
      case ArtifactType.Mirror: return "🔍";
      case ArtifactType.Spear: return "🔱";
      default: return "🧰";
    }
  };

  return (
    <TouchableOpacity
      style={[styles.artifactCard, isEquipped && styles.artifactCardEquipped]}
      onPress={() => (isEquipped ? onUnequip(artifact.id) : onEquip(artifact.id))}
    >
      <Text style={styles.artifactIcon}>{getIcon(artifact.type)}</Text>
      <View style={styles.artifactInfo}>
        <Text style={styles.artifactName}>{artifact.name}</Text>
        <Text style={styles.artifactDesc}>{artifact.description}</Text>
      </View>
      {isEquipped && <Text style={styles.equippedBadge}>装备中</Text>}
    </TouchableOpacity>
  );
}

// ==================== 进入对话前的概念介绍 ====================
const CONCEPTS: { id: string; icon: string; title: string; desc: string }[] = [
  // 迷雾密度介绍（已隐藏，效果不明显，状态逻辑保留）
  // {
  //   id: "fog",
  //   icon: "🌫️",
  //   title: "迷雾密度",
  //   desc: "代表操控话术带来的困惑。迷雾越浓，越难看清对方套路、护盾也越脆弱；有效应对和法器可驱散它。",
  // },
  {
    id: "artifact",
    icon: "🛡️",
    title: "法器装备",
    desc: "你带入对话的心理防御道具。盾/镜/矛各有守护之力，装备后能在关键时刻帮你守住边界。",
  },
];

// ==================== 主组件 ====================

interface HeartDomainPrepareScreenProps {
  onComplete?: () => void;
}

export default function HeartDomainPrepareScreen({
  onComplete,
}: HeartDomainPrepareScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    sanctuary,
    setPhase,
    setShieldHealth,
    setFogDensity,
    equipArtifact,
    unequipArtifact,
    currentKnowledgePoint,
    currentLevel,
  } = useGameStore();

  // 本关知识点：优先用 NPC 生成（含真实案例），否则用静态兜底
  const knowledgePoint = currentKnowledgePoint || getLevelKnowledgePoint(currentLevel);

  const [showArtifactModal, setShowArtifactModal] = useState(false);
  const [activeArtifactType, setActiveArtifactType] = useState<ArtifactType | null>(null);

  // 装备法器
  const handleEquip = useCallback(
    (artifactId: string) => {
      equipArtifact(artifactId);
    },
    [equipArtifact]
  );

  const handleUnequip = useCallback(
    (artifactId: string) => {
      unequipArtifact(artifactId);
    },
    [unequipArtifact]
  );

  // 进入下一阶段
  const handleStartBattle = useCallback(() => {
    setPhase(GamePhase.DialogueBattle);
    onComplete?.();
  }, [setPhase, onComplete]);

  return (
    <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 标题 */}
        <View style={styles.header}>
          <Text style={styles.title}>🌙 心域备战</Text>
          <Text style={styles.subtitle}>
            打造你的心域边界，为即将到来的对话入侵做准备
          </Text>
        </View>

        {/* 课程导入：本关知识点卡 */}
        <View style={styles.knowledgeIntro}>
          <Text style={styles.knowledgeIntroLabel}>📚 课前导读 · 这一关要学会识别</Text>
          <KnowledgeCard kp={knowledgePoint} />
        </View>

        {/* 概念介绍：进入对话前认识三个核心元素（已隐藏）
        <View style={styles.conceptIntro}>
          <Text style={styles.conceptIntroLabel}>💡 进入对话前，先认识三个伙伴</Text>
          {CONCEPTS.map((c) => (
            <View key={c.id} style={styles.conceptItem}>
              <Text style={styles.conceptIcon}>{c.icon}</Text>
              <View style={styles.conceptBody}>
                <Text style={styles.conceptTitle}>{c.title}</Text>
                <Text style={styles.conceptDesc}>{c.desc}</Text>
              </View>
            </View>
          ))}
        </View>
        */}



        {/* 心域可视化 */}
        <View style={styles.domainContainer}>
          <HeartDomainSVG
            shieldHealth={sanctuary.shieldHealth}
            fogDensity={sanctuary.fogDensity}
            activeArtifactType={activeArtifactType}
          />
        </View>

        {/* 状态信息 */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{sanctuary.shieldHealth}</Text>
            <Text style={styles.statLabel}>护盾强度</Text>
          </View>
          {/* 迷雾密度统计（已隐藏，效果不明显，状态逻辑保留）
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{sanctuary.fogDensity}</Text>
            <Text style={styles.statLabel}>迷雾密度</Text>
          </View>
          */}
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{sanctuary.equippedArtifacts.length}</Text>
            <Text style={styles.statLabel}>法器装备</Text>
          </View>
        </View>

        {/* 快速操作 */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShowArtifactModal(true)}
          >
            <Text style={styles.actionIcon}>🛡️</Text>
            <Text style={styles.actionLabel}>装备法器</Text>
          </TouchableOpacity>
        </View>

        {/* 开始战斗按钮 */}
        <TouchableOpacity style={styles.startBtn} onPress={handleStartBattle}>
          <Text style={styles.startBtnText}>
            ⚔️ 开始对话入侵
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 装备法器 Modal */}
      <Modal
        visible={showArtifactModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowArtifactModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🛡️ 装备法器</Text>
            <Text style={styles.modalHint}>
              选择3件法器带入战斗（点击装备/卸下）
            </Text>
            {sanctuary.artifacts.length === 0 && sanctuary.equippedArtifacts.length === 0 ? (
              <Text style={styles.emptyText}>暂无可用法器</Text>
            ) : (
              <>
                {[...sanctuary.equippedArtifacts, ...sanctuary.artifacts]
                  .filter((art, index, self) => self.findIndex((a) => a.id === art.id) === index)
                  .map((art) => (
                    <ArtifactCard
                      key={art.id}
                      artifact={art}
                      onEquip={handleEquip}
                      onUnequip={handleUnequip}
                      isEquipped={sanctuary.equippedArtifacts.some((e) => e.id === art.id)}
                    />
                  ))}
              </>
            )}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowArtifactModal(false)}
            >
              <Text style={styles.modalCloseBtnText}>完成选择</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
    maxWidth: 500,
    width: "100%",
    alignSelf: "center",
  },
  scrollContent: {
    padding: space.md,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: space.md,
  },
  title: {
    color: palette.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  subtitle: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  knowledgeIntro: {
    marginBottom: space.lg,
  },
  knowledgeIntroLabel: {
    color: palette.primaryDark,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.semibold,
    fontFamily,
    marginBottom: space.sm,
  },
  // ===== 概念介绍 =====
  conceptIntro: {
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  conceptIntroLabel: {
    color: palette.primaryDark,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.semibold,
    fontFamily,
    marginBottom: space.sm,
  },
  conceptItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: space.sm,
  },
  conceptIcon: {
    fontSize: 24,
    marginRight: 12,
    marginTop: 2,
  },
  conceptBody: {
    flex: 1,
  },
  conceptTitle: {
    color: palette.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    fontFamily,
    marginBottom: 2,
  },
  conceptDesc: {
    color: palette.textSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  domainContainer: {
    alignItems: "center",
    marginBottom: space.md,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: space.lg,
  },
  statBox: {
    alignItems: "center",
  },
  statValue: {
    color: palette.text,
    fontSize: 22,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  statLabel: {
    color: palette.textSoft,
    fontSize: 11,
    marginTop: 2,
  },
  amuletSection: {
    marginBottom: space.lg,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.semibold,
    fontFamily,
    marginBottom: 4,
  },
  sectionHint: {
    color: palette.textSoft,
    fontSize: 11,
    marginBottom: space.sm,
  },
  amuletInput: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: space.md,
    color: palette.text,
    fontSize: fontSize.body,
    minHeight: 60,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: palette.border,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: space.lg,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: space.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.border,
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  actionLabel: {
    color: palette.textSoft,
    fontSize: 13,
  },
  startBtn: {
    backgroundColor: palette.primary,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: "center",
    ...shadow.soft,
  },
  startBtnText: {
    color: palette.surface,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  // ===== Modal =====
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(74, 64, 57, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: space.lg,
  },
  modalContent: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.lift,
  },
  modalTitle: {
    color: palette.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    fontFamily,
    marginBottom: 4,
  },
  modalHint: {
    color: palette.textSoft,
    fontSize: 12,
    marginBottom: space.md,
  },
  emptyText: {
    color: palette.textFaint,
    fontSize: fontSize.body,
    textAlign: "center",
    padding: space.lg,
  },
  modalCloseBtn: {
    backgroundColor: palette.surfaceSoft,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: "center",
    marginTop: space.md,
  },
  modalCloseBtnText: {
    color: palette.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  // ===== 法器卡片 =====
  artifactCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  artifactCardEquipped: {
    borderColor: palette.primary,
    backgroundColor: palette.surfaceSoft,
  },
  artifactIcon: {
    fontSize: 28,
    marginRight: 12,
    width: 32,
    textAlign: "center",
  },
  artifactInfo: {
    flex: 1,
  },
  artifactName: {
    color: palette.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  artifactDesc: {
    color: palette.textSoft,
    fontSize: 11,
    marginTop: 2,
  },
  equippedBadge: {
    color: palette.primaryDark,
    fontSize: 11,
    fontWeight: fontWeight.semibold,
  },
});