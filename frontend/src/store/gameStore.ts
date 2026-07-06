import { create } from "zustand";
import {
  GamePhase,
  ArtifactType,
  Weather,
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
  GameRecord,
  Badge,
  ALL_BADGES,
  KnowledgePoint,
} from "@aigame/shared";

// ==================== 教育内容持久化（localStorage） ====================
const EDU_STORAGE_KEY = "aigame-edu";

interface PersistedEdu {
  masteredKnowledgePointIds: string[];
  hasSeenTutorial: boolean;
}

function loadEdu(): PersistedEdu {
  try {
    const raw = localStorage.getItem(EDU_STORAGE_KEY);
    if (!raw) return { masteredKnowledgePointIds: [], hasSeenTutorial: false };
    const p = JSON.parse(raw);
    return {
      masteredKnowledgePointIds: Array.isArray(p.masteredKnowledgePointIds) ? p.masteredKnowledgePointIds : [],
      hasSeenTutorial: !!p.hasSeenTutorial,
    };
  } catch {
    return { masteredKnowledgePointIds: [], hasSeenTutorial: false };
  }
}

function saveEdu(mastered: string[], hasSeenTutorial: boolean) {
  try {
    localStorage.setItem(
      EDU_STORAGE_KEY,
      JSON.stringify({ masteredKnowledgePointIds: mastered, hasSeenTutorial })
    );
  } catch {
    // localStorage 不可用时静默跳过
  }
}

/** 关卡切换时清空的本关临时教育数据 */
function freshLevelEducation() {
  return {
    currentKnowledgePoint: null as KnowledgePoint | null,
    scenarioPremise: "",
    collectedWhyNotes: [] as string[],
  };
}

// ==================== 初始数据 ====================

function createInitialArtifacts(): Artifact[] {
  return [
    { id: "a1", name: "心盾", type: ArtifactType.Shield, description: "提升抵抗值", remainingCooldown: 0, maxCooldown: 3, power: 60 },
    { id: "a2", name: "真言镜", type: ArtifactType.Mirror, description: "降低NPC控制力", remainingCooldown: 0, maxCooldown: 4, power: 55 },
    { id: "a3", name: "破谎矛", type: ArtifactType.Spear, description: "强力降低NPC控制力", remainingCooldown: 0, maxCooldown: 5, power: 75 },
    { id: "a4", name: "雾散灯", type: ArtifactType.Shield, description: "驱散迷雾", remainingCooldown: 0, maxCooldown: 3, power: 40 },
  ];
}

function createInitialSanctuary(level = 1): SanctuaryState {
  return {
    shieldHealth: Math.max(60, 100 - (level - 1) * 10),
    artifacts: createInitialArtifacts(),
    equippedArtifacts: createInitialArtifacts().slice(0, 3),
    fogDensity: (level - 1) * 5,
    weather: Weather.Clear,
  };
}

/** 每关难度参数 */
const LEVEL_STATS: Record<number, { resistance: number; control: number }> = {
  1: { resistance: 100, control: 50 },
  2: { resistance: 90, control: 55 },
  3: { resistance: 80, control: 60 },
  4: { resistance: 70, control: 65 },
  5: { resistance: 60, control: 70 },
};

function createInitialConversation(level = 1): ConversationState {
  const stats = LEVEL_STATS[level] || LEVEL_STATS[1];
  return {
    npcName: "",
    messages: [],
    playerResistance: stats.resistance,
    npcControlLevel: stats.control,
    isPlayerTurn: false,
    turnCount: 0,
    isCritical: false,
    criticalCountdown: Math.max(3, 5 - (level - 1)),
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

function createInitialBadges(): Badge[] {
  return ALL_BADGES.map((b) => ({ ...b }));
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
  setLastMessageEducation: (whyNote: string, tip?: string) => void;
  npcAttack: string;
  setNpcControlLevel: (v: number) => void;
  setPlayerTurn: (v: boolean) => void;
  isGameOver: boolean;
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

  // 成长系统
  gameHistory: GameRecord[];
  badges: Badge[];
  addGameRecord: (record: GameRecord) => void;
  unlockBadge: (badgeId: string) => void;

  // 教育内容
  currentKnowledgePoint: KnowledgePoint | null; // 本关知识点卡
  masteredKnowledgePointIds: string[];           // 已掌握知识点（持久化）
  hasSeenTutorial: boolean;                       // 是否看过新手引导（持久化）
  scenarioPremise: string;                        // 当前关卡场景前提
  collectedWhyNotes: string[];                    // 本关收集的"为什么"科普点评

  setKnowledgePoint: (kp: KnowledgePoint) => void;
  markKnowledgeMastered: (id: string) => void;
  setHasSeenTutorial: (v: boolean) => void;
  setScenarioPremise: (text: string) => void;
  amuletText: string;
  setAmuletText: (text: string) => void;
  addWhyNote: (note: string) => void;
}

// ==================== Store 实现 ====================

export const useGameStore = create<GameStore>((set, get) => ({
  // 初始状态
  phase: GamePhase.SanctuaryPrep,
  sanctuary: createInitialSanctuary(),
  conversation: createInitialConversation(),
  repair: createInitialRepair(),
  review: createInitialReview(),
  gameHistory: [],
  badges: createInitialBadges(),
  currentRoundIndex: 0,
  npcAttack: "",
  isGameOver: false,

  // 教育内容初始状态（已掌握知识点 / 教程标记从 localStorage 恢复）
  currentKnowledgePoint: null,
  masteredKnowledgePointIds: loadEdu().masteredKnowledgePointIds,
  hasSeenTutorial: loadEdu().hasSeenTutorial,
  scenarioPremise: "",
  amuletText: "",
  collectedWhyNotes: [],

  // 关卡管理
  currentLevel: 1,
  totalLevels: LEVELS.length,

  nextLevel: () => {
    const s = get();
    const next = s.currentLevel + 1;
    if (next > s.totalLevels) return s.totalLevels;
    set({
      currentLevel: next,
      conversation: createInitialConversation(next),
      currentRoundIndex: 0,
      ...freshLevelEducation(),
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
      ...freshLevelEducation(),
    }),

  resetForLevel: (level: number) =>
    set({
      currentLevel: level,
      conversation: createInitialConversation(level),
      repair: createInitialRepair(),
      review: createInitialReview(),
      currentRoundIndex: 0,
      phase: GamePhase.SanctuaryPrep,
      ...freshLevelEducation(),
    }),

  // === 阶段管理 ===
  setPhase: (phase) => set({ phase }),

  // === 心域 ===
  setShieldHealth: (v) =>
    set((s) => ({ sanctuary: { ...s.sanctuary, shieldHealth: Math.max(0, Math.min(100, v)) } })),

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
      npcAttack: attack,
    })),

  setLastMessageEducation: (whyNote, tip) =>
    set((s) => {
      const msgs = [...s.conversation.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "npc") {
        msgs[msgs.length - 1] = {
          ...last,
          whyNote,
          identificationTip: tip ?? last.identificationTip,
        };
      }
      return { conversation: { ...s.conversation, messages: msgs } };
    }),

  setNpcControlLevel: (v) =>
    set((s) => ({
      conversation: {
        ...s.conversation,
        npcControlLevel: Math.max(0, Math.min(100, v)),
      },
    })),

  setPlayerTurn: (v) =>
    set((s) => ({ conversation: { ...s.conversation, isPlayerTurn: v } })),

  setGameOver: (v) => set((s) => ({ conversation: { ...s.conversation }, isGameOver: v })),

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

  // === 成长系统 ===
  addGameRecord: (record) =>
    set((s) => ({ gameHistory: [...s.gameHistory, record] })),

  unlockBadge: (badgeId) =>
    set((s) => ({
      badges: s.badges.map((b) =>
        b.id === badgeId && !b.unlockedAt ? { ...b, unlockedAt: Date.now() } : b
      ),
    })),

  // === 教育内容 ===
  setKnowledgePoint: (kp) => set({ currentKnowledgePoint: kp }),

  markKnowledgeMastered: (id) =>
    set((s) => {
      if (s.masteredKnowledgePointIds.includes(id)) return s;
      const next = [...s.masteredKnowledgePointIds, id];
      saveEdu(next, s.hasSeenTutorial);
      return { masteredKnowledgePointIds: next };
    }),

  setHasSeenTutorial: (v) =>
    set((s) => {
      saveEdu(s.masteredKnowledgePointIds, v);
      return { hasSeenTutorial: v };
    }),

  setScenarioPremise: (text) => set({ scenarioPremise: text }),

  setAmuletText: (text) => set({ amuletText: text }),

  addWhyNote: (note) =>
    set((s) => {
      if (!note || s.collectedWhyNotes.includes(note)) return s;
      return { collectedWhyNotes: [...s.collectedWhyNotes, note] };
    }),
}));