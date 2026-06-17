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
import { PlantStatus, ArtifactType, Artifact, Plant, GamePhase } from "@aigame/shared";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SVG_SIZE = Math.min(SCREEN_WIDTH - 40, 300);
const CENTER = SVG_SIZE / 2;

// ==================== 心域可视化 ====================
function HeartDomainSVG({
  shieldHealth,
  plants,
  fogDensity,
  activeArtifactType,
}: {
  shieldHealth: number;
  plants: Plant[];
  fogDensity: number;
  activeArtifactType: ArtifactType | null;
}) {
  const shieldScale = 0.6 + (shieldHealth / 100) * 0.4;
  const fogOpacity = fogDensity / 100;

  return (
    <Svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 100 100`}>
      <Defs>
        <LinearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#4a9eff" stopOpacity={0.5} />
          <Stop offset="100%" stopColor="#7c7cff" stopOpacity={0.3} />
        </LinearGradient>
        <LinearGradient id="fogGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#666" stopOpacity={fogOpacity} />
          <Stop offset="100%" stopColor="#444" stopOpacity={fogOpacity * 0.5} />
        </LinearGradient>
      </Defs>

      {/* 边界护盾 */}
      <Circle
        cx={50}
        cy={50}
        r={45 * shieldScale}
        fill="none"
        stroke="#4a9eff"
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
          stroke="#fff"
          strokeWidth={2}
          strokeOpacity={0.6}
        />
      )}

      {/* 植物 */}
      {plants.map((plant) => (
        <G key={plant.id}>
          <Circle
            cx={plant.x}
            cy={plant.y}
            r={4}
            fill={plant.status === PlantStatus.Healthy ? "#4caf50" : plant.status === PlantStatus.Shaking ? "#ff9800" : "#9e9e9e"}
          />
          <Circle
            cx={plant.x}
            cy={plant.y}
            r={6}
            fill="none"
            stroke={plant.status === PlantStatus.Healthy ? "#4caf50" : "#ff9800"}
            strokeWidth={1}
            strokeDasharray={plant.status === PlantStatus.Shaking ? "2,2" : "0"}
          />
        </G>
      ))}

      {/* 迷雾覆盖 */}
      <Circle cx={50} cy={50} r={48} fill="url(#fogGrad)" />
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
      case ArtifactType.Mirror: return "🪞";
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

// ==================== 植物卡片 ====================
function PlantCard({
  plant,
  onPlant,
}: {
  plant: { id: string; name: string; icon: string; description: string };
  onPlant: (plant: { id: string; name: string; icon: string; description: string }) => void;
}) {
  return (
    <TouchableOpacity style={styles.plantCard} onPress={() => onPlant(plant)}>
      <Text style={styles.plantIcon}>{plant.icon}</Text>
      <Text style={styles.plantName}>{plant.name}</Text>
    </TouchableOpacity>
  );
}

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
    addPlant,
    setShieldHealth,
    setFogDensity,
    equipArtifact,
    useArtifact,
  } = useGameStore();

  const [amuletText, setAmuletText] = useState("");
  const [showPlantModal, setShowPlantModal] = useState(false);
  const [showArtifactModal, setShowArtifactModal] = useState(false);
  const [activeArtifactType, setActiveArtifactType] = useState<ArtifactType | null>(null);

  // 可用植物种子列表
  const availablePlants = [
    { id: "seed1", name: "铁木树", icon: "🌳", description: "强化边界锚定" },
    { id: "seed2", name: "净化藤", icon: "🌿", description: "净化负面情绪" },
    { id: "seed3", name: "安神草", icon: "🌱", description: "稳定心神" },
    { id: "seed4", name: "守护竹", icon: "🎋", description: "提升护盾强度" },
  ];

  // 种植植物
  const handlePlant = useCallback(
    (seed: { id: string; name: string; icon: string; description: string }) => {
      // 在随机空闲位置种植
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 20;
      const newPlant: Plant = {
        id: `plant-${Date.now()}`,
        name: seed.name,
        x: 50 + Math.cos(angle) * dist,
        y: 50 + Math.sin(angle) * dist,
        status: PlantStatus.Healthy,
        growthProgress: 10,
        anchorStrength: 30,
      };
      addPlant(newPlant);
      setShowPlantModal(false);
    },
    [addPlant]
  );

  // 装备法器
  const handleEquip = useCallback(
    (artifactId: string) => {
      equipArtifact(artifactId);
    },
    [equipArtifact]
  );

  const handleUnequip = useCallback(
    (artifactId: string) => {
      // 简单地从 equipped 移除
      const artifact = sanctuary.equippedArtifacts.find((a) => a.id === artifactId);
      if (artifact) {
        useArtifact(artifactId); // 仅作标记
      }
    },
    [sanctuary.equippedArtifacts, useArtifact]
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

        {/* 心域可视化 */}
        <View style={styles.domainContainer}>
          <HeartDomainSVG
            shieldHealth={sanctuary.shieldHealth}
            plants={sanctuary.plants}
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
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{sanctuary.plants.length}</Text>
            <Text style={styles.statLabel}>植物数量</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{sanctuary.fogDensity}</Text>
            <Text style={styles.statLabel}>迷雾密度</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{sanctuary.equippedArtifacts.length}</Text>
            <Text style={styles.statLabel}>法器装备</Text>
          </View>
        </View>

        {/* 护身符书写 */}
        <View style={styles.amuletSection}>
          <Text style={styles.sectionTitle}>✍️ 护身符文字</Text>
          <Text style={styles.sectionHint}>
            写下一句能提醒你坚守边界的话语
          </Text>
          <TextInput
            style={styles.amuletInput}
            value={amuletText}
            onChangeText={setAmuletText}
            placeholder="例如：我的边界不容侵犯…"
            placeholderTextColor="#555"
            multiline
            maxLength={100}
          />
        </View>

        {/* 快速操作 */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShowPlantModal(true)}
          >
            <Text style={styles.actionIcon}>🌱</Text>
            <Text style={styles.actionLabel}>种植植物</Text>
          </TouchableOpacity>

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

      {/* 种植植物 Modal */}
      <Modal
        visible={showPlantModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPlantModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🌱 选择植物</Text>
            <Text style={styles.modalHint}>
              植物可以增强心域边界锚定
            </Text>
            {availablePlants.map((plant) => (
              <PlantCard
                key={plant.id}
                plant={plant}
                onPlant={handlePlant}
              />
            ))}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowPlantModal(false)}
            >
              <Text style={styles.modalCloseBtnText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
    backgroundColor: "#0d0d1a",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    color: "#e0e0ff",
    fontSize: 26,
    fontWeight: "bold",
  },
  subtitle: {
    color: "#8888aa",
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  domainContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  statBox: {
    alignItems: "center",
  },
  statValue: {
    color: "#e0e0ff",
    fontSize: 22,
    fontWeight: "bold",
  },
  statLabel: {
    color: "#8888aa",
    fontSize: 11,
    marginTop: 2,
  },
  amuletSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#e0e0ff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  sectionHint: {
    color: "#8888aa",
    fontSize: 11,
    marginBottom: 8,
  },
  amuletInput: {
    backgroundColor: "#1a1a2e",
    borderRadius: 10,
    padding: 12,
    color: "#ccc",
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  actionLabel: {
    color: "#ccc",
    fontSize: 13,
  },
  startBtn: {
    backgroundColor: "#4a7aef",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  startBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  // ===== Modal =====
  modalOverlay: {
    flex: 1,
    backgroundColor: "#000000aa",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    color: "#e0e0ff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
  },
  modalHint: {
    color: "#8888aa",
    fontSize: 12,
    marginBottom: 16,
  },
  emptyText: {
    color: "#555",
    fontSize: 14,
    textAlign: "center",
    padding: 20,
  },
  modalCloseBtn: {
    backgroundColor: "#2a2a4a",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  modalCloseBtnText: {
    color: "#ccc",
    fontSize: 14,
    fontWeight: "600",
  },
  // ===== 法器卡片 =====
  artifactCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0d0d1a",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  artifactCardEquipped: {
    borderColor: "#4a9eff",
    backgroundColor: "#0d1a2e",
  },
  artifactIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  artifactInfo: {
    flex: 1,
  },
  artifactName: {
    color: "#e0e0ff",
    fontSize: 14,
    fontWeight: "600",
  },
  artifactDesc: {
    color: "#8888aa",
    fontSize: 11,
    marginTop: 2,
  },
  equippedBadge: {
    color: "#4a9eff",
    fontSize: 11,
    fontWeight: "600",
  },
  // ===== 植物卡片 =====
  plantCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0d0d1a",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  plantIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  plantName: {
    color: "#e0e0ff",
    fontSize: 14,
    fontWeight: "600",
  },
});