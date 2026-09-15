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
  NPCResponseAssessment,
  DimensionScores,
  LEVELS,
  GameRecord,
  Badge,
  ALL_BADGES,
  KnowledgePoint,
  SavedReviewReport,
} from "@aigame/shared";
import { averageDimensions, averageOf, normalizeDimensions } from "../utils/dimensions";
import { saveReport } from "../api/reviews";

// ==================== 持久化（localStorage） ====================
const STORAGE_KEY = "aigame-save";

interface PersistedData {
  masteredKnowledgePointIds: string[];
  hasSeenTutorial: boolean;
  gameHistory: GameRecord[];
  badges: Badge[];
  /** 雷达图历史最高分（必须持久化，否则刷新/重开应用后成长页雷达图退化为中心一个点） */
  bestScores: DimensionScores | null;
}

function emptyPersisted(): PersistedData {
  return { masteredKnowledgePointIds: [], hasSeenTutorial: false, gameHistory: [], badges: [], bestScores: null };
}

/**
 * 校验并归一化持久化的最高分：
 * 任一维度不是有限数字就整体丢弃（避免雷达图算出 NaN 坐标）；
 * 是数字则归一化（旧 localStorage 里可能存着 0~1 小数制评分）。
 */
function sanitizeBestScores(v: unknown): DimensionScores | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const keys: (keyof DimensionScores)[] = [
    "boundaryAwareness",
    "emotionalStability",
    "cognitiveClarity",
    "assertiveResponse",
  ];
  if (!keys.every((k) => typeof o[k] === "number" && Number.isFinite(o[k] as number))) return null;
  return normalizeDimensions(o as Partial<DimensionScores>);
}

function loadPersisted(): PersistedData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPersisted();
    const p = JSON.parse(raw);
    return {
      masteredKnowledgePointIds: Array.isArray(p.masteredKnowledgePointIds) ? p.masteredKnowledgePointIds : [],
      hasSeenTutorial: !!p.hasSeenTutorial,
      gameHistory: Array.isArray(p.gameHistory) ? p.gameHistory : [],
      badges: Array.isArray(p.badges) ? p.badges : [],
      bestScores: sanitizeBestScores(p.bestScores),
    };
  } catch {
    return emptyPersisted();
  }
}

function persist(get: () => GameStore) {
  try {
    const s = get();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        masteredKnowledgePointIds: s.masteredKnowledgePointIds,
        hasSeenTutorial: s.hasSeenTutorial,
        gameHistory: s.gameHistory,
        badges: s.badges,
        bestScores: s.review.bestScores,
      })
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
    { id: "a2", name: "真言镜", type: ArtifactType.Mirror, description: "降低NPC控制力", remainingCooldown: 0, maxCooldown: 3, power: 55 },
    { id: "a3", name: "破谎矛", type: ArtifactType.Spear, description: "强力降低NPC控制力", remainingCooldown: 0, maxCooldown: 3, power: 75 },
    { id: "a4", name: "明辨铃", type: ArtifactType.Insight, description: "揭示建议回复", remainingCooldown: 0, maxCooldown: 3, power: 0 },
  ];
}

function createInitialSanctuary(level = 1): SanctuaryState {
  return {
    shieldHealth: Math.max(60, 100 - (level - 1) * 10),
    artifacts: createInitialArtifacts(),
    equippedArtifacts: createInitialArtifacts(), // 默认4件全装备
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

function createInitialReview(bestScores: DimensionScores | null = null): ReviewState {
  return {
    rounds: [],
    dimensionHistory: [],
    // 最高分从 localStorage 恢复：雷达图与综合评分都依赖它，缺失时回退全 0
    bestScores: bestScores || createInitialDimensionScores(),
  };
}

function createInitialBadges(): Badge[] {
  return ALL_BADGES.map((b) => ({ ...b }));
}

// ==================== Store 类型 ====================

export interface GameStore {
  // 阶段
  phase: GamePhase;
  // 难度（每关备战弹框选择）：easy=法器无冷却（每回合可用一次）；hard=原规则 3 回合冷却
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  sanctuary: SanctuaryState;
  conversation: ConversationState;
  repair: RepairState;
  review: ReviewState;
  currentRoundIndex: number;

  // 关卡管理
  currentLevel: number;      // 1-5
  totalLevels: number;        // 5
  setCurrentLevel: (level: number) => void;  // 从外部设置起始关卡
  nextLevel: () => number;    // 推进到下一关，返回新的关卡数
  resetLevel: () => void;     // 重置所有状态回第一关
  resetForLevel: (level: number) => void;  // 重置到指定关卡（心域血量等一并回到本关初始值）

  // 阶段管理
  setPhase: (phase: GamePhase) => void;

  // 心域操作
  setShieldHealth: (v: number) => void;
  setFogDensity: (v: number) => void;
  setWeather: (w: Weather) => void;

  // 法器操作
  useArtifact: (artifactId: string) => void;
  equipArtifact: (artifactId: string) => void;
  unequipArtifact: (artifactId: string) => void;
  tickCooldowns: () => void;
  // 法器使用失败时把冷却归零（明辨铃没生成建议时可立即重试，不用等 3 回合）
  resetArtifactCooldown: (artifactId: string) => void;

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
  /** 复盘文本补全：用补全接口返回的完整评估覆盖某轮 assessment（合并数值字段） */
  setRoundAssessment: (roundIndex: number, assessment: NPCResponseAssessment) => void;
  setDimensionScores: (scores: DimensionScores) => void;
  setBestScores: (scores: DimensionScores) => void;

  // 复盘存档（完整报告落本机文件，见 frontend/src/api/reviews.ts）
  /** 本局报告 id；同一局多次保存复用它做 upsert，避免产生重复文件 */
  currentReportId: string | null;
  /** 同步生成/复用本局报告 id，保证 GameRecord 能立刻关联上（不等待任何请求） */
  ensureReportId: () => string;
  /** 组装当前复盘快照并落盘；未产生对话轮次时返回 null，不留下空报告 */
  saveReviewReportDraft: (victory: boolean) => Promise<string | null>;
  /** 报告被删除后清掉战绩上的关联 id（战绩记录本身保留） */
  detachReportId: (reportId: string) => void;

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
  amuletText: string;                             // 玩家自定义护身符文字
  collectedWhyNotes: string[];                    // 本关收集的"为什么"科普点评

  setKnowledgePoint: (kp: KnowledgePoint) => void;
  markKnowledgeMastered: (id: string) => void;
  setHasSeenTutorial: (v: boolean) => void;
  setScenarioPremise: (text: string) => void;
  addWhyNote: (note: string) => void;
}

// ==================== 关卡难度 ====================
/** easy=简单模式：法器无冷却，每回合可用一次；hard=困难模式：法器使用后需 3 回合冷却（原规则） */
export type Difficulty = "easy" | "hard";

// ==================== Store 实现 ====================

// 持久化数据只解析一次，避免 create 初始化时反复读 localStorage
const persisted = loadPersisted();

export const useGameStore = create<GameStore>((set, get) => ({
  // 初始状态
  phase: GamePhase.SanctuaryPrep,
  difficulty: "easy",
  sanctuary: createInitialSanctuary(),
  conversation: createInitialConversation(),
  repair: createInitialRepair(),
  review: createInitialReview(persisted.bestScores),
  currentReportId: null,
  gameHistory: persisted.gameHistory,
  badges: persisted.badges.length > 0 ? persisted.badges : createInitialBadges(),
  currentRoundIndex: 0,
  npcAttack: "",
  isGameOver: false,

  // 教育内容初始状态（已掌握知识点 / 教程标记从 localStorage 恢复）
  currentKnowledgePoint: null,
  masteredKnowledgePointIds: persisted.masteredKnowledgePointIds,
  hasSeenTutorial: persisted.hasSeenTutorial,
  scenarioPremise: "",
  amuletText: "",
  collectedWhyNotes: [],

  // 关卡管理
  currentLevel: 1,
  totalLevels: LEVELS.length,

  nextLevel: () => {
    const s = get();
    const next = s.currentLevel + 1;
    // 越过最后一关时返回 totalLevels + 1，让调用方能正确判断"已全部通关"
    if (next > s.totalLevels) return s.totalLevels + 1;
    set({
      currentLevel: next,
      conversation: createInitialConversation(next),
      // 重置 review/复盘，避免累积上一关的对话轮次
      review: createInitialReview(),
      // 新一局要有新的报告 id，否则会 upsert 覆盖掉上一局的存档
      currentReportId: null,
      currentRoundIndex: 0,
      // 法器冷却单关计算：进入新关卡时所有法器冷却归零（保留心域与装备，恢复本关可用次数）
      sanctuary: {
        ...s.sanctuary,
        equippedArtifacts: s.sanctuary.equippedArtifacts.map((a) => ({ ...a, remainingCooldown: 0 })),
      },
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
      // 新一局要有新的报告 id，否则会 upsert 覆盖掉上一局的存档
      currentReportId: null,
      currentRoundIndex: 0,
      phase: GamePhase.SanctuaryPrep,
      ...freshLevelEducation(),
    }),

  resetForLevel: (level: number) => {
    set({
      currentLevel: level,
      conversation: createInitialConversation(level),
      // 心域完全重置：护盾血量、迷雾浓度、法器冷却与装备都回到本关初始值。
      // 「重新挑战」和「再等等重开」都走这里，必须是一局干净的开局，
      // 不能沿用上一局残血的护盾。
      sanctuary: createInitialSanctuary(level),
      repair: createInitialRepair(),
      review: createInitialReview(),
      // 新一局要有新的报告 id，否则会 upsert 覆盖掉上一局的存档
      currentReportId: null,
      currentRoundIndex: 0,
      phase: GamePhase.SanctuaryPrep,
      ...freshLevelEducation(),
    });
  },

  setCurrentLevel: (level: number) =>
    set({
      currentLevel: level,
      conversation: createInitialConversation(level),
      sanctuary: createInitialSanctuary(level),
      repair: createInitialRepair(),
      review: createInitialReview(),
      // 新一局要有新的报告 id，否则会 upsert 覆盖掉上一局的存档
      currentReportId: null,
      currentRoundIndex: 0,
      phase: GamePhase.SanctuaryPrep,
      ...freshLevelEducation(),
    }),

  // === 阶段管理 ===
  setPhase: (phase) => set({ phase }),
  setDifficulty: (difficulty) => set({ difficulty }),

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
            // 简单模式无冷却（每回合可用一次），困难模式按原规则进入 3 回合冷却
            ? { ...a, remainingCooldown: s.difficulty === "hard" ? a.maxCooldown : 1 }
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

  unequipArtifact: (artifactId) =>
    set((s) => {
      const artifact = s.sanctuary.equippedArtifacts.find((a) => a.id === artifactId);
      if (!artifact) return s;
      artifact.remainingCooldown = 0;
      return {
        sanctuary: {
          ...s.sanctuary,
          equippedArtifacts: s.sanctuary.equippedArtifacts.filter((a) => a.id !== artifactId),
          artifacts: [...s.sanctuary.artifacts, artifact],
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

  // 明辨铃这类法器生成失败时应"不消耗、不进入冷却"，把冷却归零，允许玩家立刻重试
  resetArtifactCooldown: (artifactId) =>
    set((s) => ({
      sanctuary: {
        ...s.sanctuary,
        equippedArtifacts: s.sanctuary.equippedArtifacts.map((a) =>
          a.id === artifactId ? { ...a, remainingCooldown: 0 } : a
        ),
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
  // 四维入库统一归一化：模型偶发按 0~1 小数输出（0.62 本意是 62 分），
  // 不换算会让复盘页四维全显示成 1、评分条几乎不可见，并把综合评分严重拉低
  addReviewRound: (round) =>
    set((s) => ({
      review: {
        ...s.review,
        rounds: [
          ...s.review.rounds,
          round.assessment
            ? {
                ...round,
                assessment: {
                  ...round.assessment,
                  dimensions: normalizeDimensions(round.assessment.dimensions),
                },
              }
            : round,
        ],
      },
    })),

  setRoundAssessment: (roundIndex, assessment) =>
    set((s) => {
      // 补全接口只回文本字段，但保险起见：带 dimensions 就归一化后再合并
      const patch = assessment.dimensions
        ? { ...assessment, dimensions: normalizeDimensions(assessment.dimensions) }
        : assessment;
      return {
        review: {
          ...s.review,
          rounds: s.review.rounds.map((r, i) =>
            i === roundIndex
              ? { ...r, assessment: { ...(r.assessment || {}), ...patch } }
              : r
          ),
        },
      };
    }),

  setDimensionScores: (scores) =>
    set((s) => ({
      review: {
        ...s.review,
        dimensionHistory: [...s.review.dimensionHistory, normalizeDimensions(scores)],
      },
    })),

  setBestScores: (scores) => {
    set((s) => ({
      review: { ...s.review, bestScores: normalizeDimensions(scores) },
    }));
    // 立即落盘：否则刷新/重开应用后成长页雷达图会退化成中心一个点
    persist(get);
  },

  // === 复盘存档 ===
  ensureReportId: () => {
    const s = get();
    if (s.currentReportId) return s.currentReportId;
    const id = `${Date.now()}-${s.currentLevel}`;
    set({ currentReportId: id });
    return id;
  },

  saveReviewReportDraft: async (victory) => {
    const s = get();
    const { rounds, dimensionHistory, bestScores } = s.review;
    // 还没打过任何一轮就不存档，避免留下空报告占额度
    if (rounds.length === 0) return null;

    const id = s.currentReportId || get().ensureReportId();
    const lvlCfg = LEVELS[s.currentLevel - 1];
    // 本局得分口径与 GameRecord 保持一致：逐轮取平均，而非逐维取最大值
    const sessionDims = averageDimensions(dimensionHistory) || bestScores;
    const report: SavedReviewReport = {
      id,
      version: 1,
      level: s.currentLevel,
      levelTitle: lvlCfg?.title || `第 ${s.currentLevel} 关`,
      // 时间戳取自 id 前缀：同一局反复 upsert 时排序位置稳定，不会越存越靠前
      timestamp: Number(id.split("-")[0]) || Date.now(),
      victory,
      avgScore: averageOf(sessionDims),
      dimensions: sessionDims,
      dimensionHistory,
      rounds,
      knowledgePointId: s.currentKnowledgePoint?.id,
      knowledgePoint: s.currentKnowledgePoint || undefined,
    };

    const { id: savedId, persisted } = await saveReport(report);
    console.log(
      `[review] 复盘${persisted ? "已落盘" : "暂存本地"} ${savedId}（${rounds.length} 轮）`
    );
    return savedId;
  },

  detachReportId: (reportId) => {
    set((s) => ({
      gameHistory: s.gameHistory.map((r) =>
        r.reportId === reportId ? { ...r, reportId: undefined } : r
      ),
    }));
    persist(get);
  },

  // === 成长系统 ===
  addGameRecord: (record) => {
    // 战绩入库同样归一化：成长页雷达图直接吃这份四维，混入小数会画出贴中心的多边形
    set((s) => ({
      gameHistory: [
        ...s.gameHistory,
        { ...record, dimensions: normalizeDimensions(record.dimensions) },
      ],
    }));
    persist(get);
  },

  unlockBadge: (badgeId) => {
    set((s) => ({
      badges: s.badges.map((b) =>
        b.id === badgeId && !b.unlockedAt ? { ...b, unlockedAt: Date.now() } : b
      ),
    }));
    persist(get);
  },

  // === 教育内容 ===
  setKnowledgePoint: (kp) => set({ currentKnowledgePoint: kp }),

  markKnowledgeMastered: (id) => {
    set((s) => {
      if (s.masteredKnowledgePointIds.includes(id)) return s;
      const next = [...s.masteredKnowledgePointIds, id];
      return { masteredKnowledgePointIds: next };
    });
    persist(get);
  },

  setHasSeenTutorial: (v) => {
    set({ hasSeenTutorial: v });
    persist(get);
  },

  setScenarioPremise: (text) => set({ scenarioPremise: text }),

  addWhyNote: (note) =>
    set((s) => {
      if (!note || s.collectedWhyNotes.includes(note)) return s;
      return { collectedWhyNotes: [...s.collectedWhyNotes, note] };
    }),
}));