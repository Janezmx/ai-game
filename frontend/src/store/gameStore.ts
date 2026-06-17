import { create } from "zustand";
import {
  GamePhase,
  PlantStatus,
  ArtifactType,
  Weather,
  Plant,
  Artifact,
  DialogueMessage,
  ConversationState,
  SanctuaryState,
  RepairState,
  ReviewState,
  ReviewRound,
  DimensionScores,
  GameState,
  LEVELS,
} from "@aigame/shared";

// ==================== 初始数据 ====================

function createInitialPlants(): Plant[] {
  return [
    { id: "p1", name: "铁木树", x: 25, y: 30, status: PlantStatus.Healthy, growthProgress: 80, anchorStrength: 70 },
    { id: "p2", name: "净化藤", x: 60, y: 25, status: PlantStatus.Healthy, growthProgress: 60, anchorStrength: 50 },
    { id: "p3", name: "安神草", x: 40, y: 55, status: PlantStatus.Healthy, growthProgress: 90, anchorStrength: 40 },
    { id: "p4", name: "守护竹", x: 20, y: 65, status: PlantStatus.Healthy, growthProgress: 50, anchorStrength: 60 },
  ];
}

function createInitialArtifacts(): Artifact[] {
  return [
    { id: "a1", name: "心盾", type: ArtifactType.Shield, description: "提升抵抗值", remainingCooldown: 0, maxCooldown: 3, power: 60 },
    { id: "a2", name: "真言镜", type: ArtifactType.Mirror, description: "降低NPC控制力", remainingCooldown: 0, maxCooldown: 4, power: 55 },
    { id: "a3", name: "破谎矛", type: ArtifactType.Spear, description: "强力降低NPC控制力", remainingCooldown: 0, maxCooldown: 5, power: 75 },
    { id: "a4", name: "雾散灯", type: ArtifactType.Shield, description: "驱散迷雾", remainingCooldown: 0, maxCooldown: 3, power: 40 },
  ];
}

function createInitialSanctuary(): SanctuaryState {
  return {
    shieldHealth: 100,
    plants: createInitialPlants(),
    artifacts: createInitialArtifacts(),
    equippedArtifacts: createInitialArtifacts().slice(0, 3),
    fogDensity: 0,
    weather: Weather.Clear,
  };
}

function createInitialConversation(): ConversationState {
  return {
    npcName: "",
    messages: [],
    playerResistance: 100,
    npcControlLevel: 50,
    isPlayerTurn: false,
    turnCount: 0,
    isCritical: false,
    criticalCountdown: 5,
  };
}

function createInitialRepair(): RepairState {
  return {
    boundaryIntegrity: 0,
    breathingProgress: 0,
    remainingFog: 0,
    dewDrops: 0,
  };
}

function createInitialDimensionScores(): DimensionScores {
  return {
    boundaryAwareness: 0,
    emotionalStability: 0,
    cognitiveClarity: 0,
    assertiveResponse: 0,
  };
}

function createInitialReview(): ReviewState {
  return {
    rounds: [],
    dimensionHistory: [],
    bestScores: createInitialDimensionScores(),
  };
}

// ==================== Store 类型 ====================

export interface GameStore {
  // 阶段
  phase: GamePhase;
  sanctuary: SanctuaryState;
  conversation: ConversationState;
  repair: RepairState;
  review: ReviewState;
  currentRoundIndex: number;

  // 关卡管理
  currentLevel: number;      // 1-5
  totalLevels: number;        // 5
  nextLevel: () => number;    // 推进到下一关，返回新的关卡数
  resetLevel: () => void;     // 重置所有状态回第一关
  resetForLevel: (level: number) => void;  // 重置到指定关卡（保留心域）

  // 阶段管理
  setPhase: (phase: GamePhase) => void;

  // 心域操作
  setShieldHealth: (v: number) => void;
  addPlant: (plant: Plant) => void;
  removePlant: (plantId: string) => void;
  setPlantStatus: (plantId: string, status: PlantStatus) => void;
  setPlantGrowth: (plantId: string, progress: number) => void;
  setFogDensity: (v: number) => void;
  setWeather: (w: Weather) => void;

  // 法器操作
  useArtifact: (artifactId: string) => void;
  equipArtifact: (artifactId: string) => void;
  tickCooldowns: () => void;

  // 对话操作
  setNpcName: (name: string) => void;
  addMessage: (msg: DialogueMessage) => void;
  updateLastMessage: (chunk: string) => void;
  setPlayerResistance: (v: number) => void;
  setNPCAttack: (attack: string) => void;
  setNpcControlLevel: (v: number) => void;
  setPlayerTurn: (v: boolean) => void;
  setGameOver: (v: boolean) => void;
  incrementTurn: () => void;
  setCritical: (v: boolean) => void;
  setCriticalCountdown: (v: number) => void;

  // 修复操作
  setBoundaryIntegrity: (v: number) => void;
  setBreathingProgress: (v: number) => void;
  setRemainingFog: (v: number) => void;
  setDewDrops: (v: number) => void;

  // 复盘操作
  addReviewRound: (round: ReviewRound) => void;
  setDimensionScores: (scores: DimensionScores) => void;
  setBestScores: (scores: DimensionScores) => void;
}

// ==================== Store 实现 ====================

export const useGameStore = create<GameStore>((set, get) => ({
  // 初始状态
  phase: GamePhase.SanctuaryPrep,
  sanctuary: createInitialSanctuary(),
  conversation: createInitialConversation(),
  repair: createInitialRepair(),
  review: createInitialReview(),
  currentRoundIndex: 0,

  // 关卡管理
  currentLevel: 1,
  totalLevels: LEVELS.length,

  nextLevel: () => {
    const s = get();
    const next = s.currentLevel + 1;
    if (next > s.totalLevels) return s.totalLevels;
    set({
      currentLevel: next,
      conversation: createInitialConversation(),
      currentRoundIndex: 0,
    });
    return next;
  },

  resetLevel: () =>
    set({
      currentLevel: 1,
      conversation: createInitialConversation(),
      sanctuary: createInitialSanctuary(),
      repair: createInitialRepair(),
      review: createInitialReview(),
      currentRoundIndex: 0,
      phase: GamePhase.SanctuaryPrep,
    }),

  resetForLevel: (level: number) =>
    set({
      currentLevel: level,
      conversation: createInitialConversation(),
      repair: createInitialRepair(),
      review: createInitialReview(),
      currentRoundIndex: 0,
      phase: GamePhase.SanctuaryPrep,
    }),

  // === 阶段管理 ===
  setPhase: (phase) => set({ phase }),

  // === 心域 ===
  setShieldHealth: (v) =>
    set((s) => ({ sanctuary: { ...s.sanctuary, shieldHealth: Math.max(0, Math.min(100, v)) } })),

  addPlant: (plant) =>
    set((s) => ({ sanctuary: { ...s.sanctuary, plants: [...s.sanctuary.plants, plant] } })),

  removePlant: (plantId) =>
    set((s) => ({
      sanctuary: {
        ...s.sanctuary,
        plants: s.sanctuary.plants.filter((p) => p.id !== plantId),
      },
    })),

  setPlantStatus: (plantId, status) =>
    set((s) => ({
      sanctuary: {
        ...s.sanctuary,
        plants: s.sanctuary.plants.map((p) =>
          p.id === plantId ? { ...p, status } : p
        ),
      },
    })),

  setPlantGrowth: (plantId, progress) =>
    set((s) => ({
      sanctuary: {
        ...s.sanctuary,
        plants: s.sanctuary.plants.map((p) =>
          p.id === plantId ? { ...p, growthProgress: progress } : p
        ),
      },
    })),

  setFogDensity: (v) =>
    set((s) => ({ sanctuary: { ...s.sanctuary, fogDensity: Math.max(0, Math.min(100, v)) } })),

  setWeather: (weather) => set((s) => ({ sanctuary: { ...s.sanctuary, weather } })),

  // === 法器 ===
  useArtifact: (artifactId) =>
    set((s) => ({
      sanctuary: {
        ...s.sanctuary,
        equippedArtifacts: s.sanctuary.equippedArtifacts.map((a) =>
          a.id === artifactId
            ? { ...a, remainingCooldown: a.maxCooldown }
            : a
        ),
      },
    })),

  equipArtifact: (artifactId) =>
    set((s) => {
      const artifact = s.sanctuary.artifacts.find((a) => a.id === artifactId);
      if (!artifact || s.sanctuary.equippedArtifacts.length >= 4) return s;
      return {
        sanctuary: {
          ...s.sanctuary,
          equippedArtifacts: [...s.sanctuary.equippedArtifacts, artifact],
          artifacts: s.sanctuary.artifacts.filter((a) => a.id !== artifactId),
        },
      };
    }),

  tickCooldowns: () =>
    set((s) => ({
      sanctuary: {
        ...s.sanctuary,
        equippedArtifacts: s.sanctuary.equippedArtifacts.map((a) => ({
          ...a,
          remainingCooldown: Math.max(0, a.remainingCooldown - 1),
        })),
      },
    })),

  // === 对话 ===
  setNpcName: (name) =>
    set((s) => ({ conversation: { ...s.conversation, npcName: name } })),

  addMessage: (msg) =>
    set((s) => ({
      conversation: {
        ...s.conversation,
        messages: [...s.conversation.messages, msg],
      },
    })),

  updateLastMessage: (chunk) =>
    set((s) => {
      const msgs = [...s.conversation.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "npc") {
        msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
      }
      return { conversation: { ...s.conversation, messages: msgs } };
    }),

  setPlayerResistance: (v) =>
    set((s) => ({
      conversation: {
        ...s.conversation,
        playerResistance: Math.max(0, Math.min(100, v)),
      },
    })),

  setNPCAttack: (attack) =>
    set((s) => ({
      conversation: { ...s.conversation },
    })),

  setNpcControlLevel: (v) =>
    set((s) => ({
      conversation: {
        ...s.conversation,
        npcControlLevel: Math.max(0, Math.min(100, v)),
      },
    })),

  setPlayerTurn: (v) =>
    set((s) => ({ conversation: { ...s.conversation, isPlayerTurn: v } })),

  setGameOver: (v) => set((s) => ({ conversation: { ...s.conversation } })),

  incrementTurn: () =>
    set((s) => ({
      currentRoundIndex: s.currentRoundIndex + 1,
      conversation: { ...s.conversation, turnCount: s.conversation.turnCount + 1 },
    })),

  setCritical: (v) =>
    set((s) => ({ conversation: { ...s.conversation, isCritical: v } })),

  setCriticalCountdown: (v) =>
    set((s) => ({
      conversation: { ...s.conversation, criticalCountdown: v },
    })),

  // === 修复 ===
  setBoundaryIntegrity: (v) =>
    set((s) => ({ repair: { ...s.repair, boundaryIntegrity: Math.max(0, Math.min(100, v)) } })),

  setBreathingProgress: (v) =>
    set((s) => ({ repair: { ...s.repair, breathingProgress: Math.max(0, Math.min(100, v)) } })),

  setRemainingFog: (v) =>
    set((s) => ({ repair: { ...s.repair, remainingFog: Math.max(0, Math.min(100, v)) } })),

  setDewDrops: (v) =>
    set((s) => ({ repair: { ...s.repair, dewDrops: Math.max(0, v) } })),

  // === 复盘 ===
  addReviewRound: (round) =>
    set((s) => ({
      review: {
        ...s.review,
        rounds: [...s.review.rounds, round],
      },
    })),

  setDimensionScores: (scores) =>
    set((s) => ({
      review: {
        ...s.review,
        dimensionHistory: [...s.review.dimensionHistory, scores],
      },
    })),

  setBestScores: (scores) =>
    set((s) => ({
      review: { ...s.review, bestScores: scores },
    })),
}));