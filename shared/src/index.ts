// ==================== 游戏阶段枚举 ====================
export enum GamePhase {
  SanctuaryPrep = "SanctuaryPrep",
  DialogueBattle = "DialogueBattle",
  AftermathRepair = "AftermathRepair",
}

// ==================== 心域状态 ====================
export enum PlantStatus {
  Healthy = "Healthy",
  Shaking = "Shaking",
  Defoliated = "Defoliated",
  Withered = "Withered",
}

export enum PlantType {
  AnchoringVine = "AnchoringVine",
  CalmingHerb = "CalmingHerb",
  ThornBarrier = "ThornBarrier",
}

export interface Plant {
  id: string;
  name: string;
  x: number; // SVG 坐标 0-100
  y: number; // SVG 坐标 0-100
  status: PlantStatus;
  growthProgress: number; // 0-100
  anchorStrength: number; // 0-100, 锚定边界强度
}

export enum ArtifactType {
  Shield = "Shield",
  Mirror = "Mirror",
  Spear = "Spear",
}

export interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  description: string;
  remainingCooldown: number;
  maxCooldown: number;
  power: number; // 0-100
}

export enum Weather {
  Clear = "Clear",
  Cloudy = "Cloudy",
  Storm = "Storm",
}

export interface SanctuaryState {
  shieldHealth: number; // 0-100
  plants: Plant[];
  artifacts: Artifact[];
  equippedArtifacts: Artifact[];
  fogDensity: number; // 0-100
  weather: Weather;
}

// ==================== 对话状态 ====================
export interface DialogueMessage {
  id: string;
  role: "npc" | "player";
  content: string;
  timestamp: number;
  // 复盘用
  trapType?: string; // NPC 操控手法标签
  playerStatus?: "effective" | "shaken" | "trapped"; // 玩家回应状态
  assessment?: string; // 心理分析师点评
  alternatives?: string[]; // 替代回应建议
}

export interface ConversationState {
  npcName: string;
  messages: DialogueMessage[];
  playerResistance: number; // 0-100
  npcControlLevel: number; // 0-100
  isPlayerTurn: boolean;
  turnCount: number;
  isCritical: boolean; // 是否临界状态
  criticalCountdown: number; // 临界倒计时
}

// ==================== 法器效果 ====================
export enum ArtifactEffect {
  ShieldBoost = "ShieldBoost",
  ControlReduce = "ControlReduce",
  FogClear = "FogClear",
  PlantRevive = "PlantRevive",
}

// ==================== 评估维度 ====================
export interface DimensionScores {
  boundaryAwareness: number; // 边界意识
  emotionalStability: number; // 情绪稳定
  cognitiveClarity: number; // 认知清晰
  assertiveResponse: number; // 坚定回应
}

// ==================== NPC 评估 ====================
export interface NPCResponseAssessment {
  trapType: string; // 操控手法类型
  trapAnalysis: string; // 陷阱分析
  playerStatus: "effective" | "shaken" | "trapped"; // 判断玩家状态
  dimensions: DimensionScores; // 四维评分
  nextStrategy: string; // NPC下一轮策略
  nextDialogue: string; // NPC下一轮话术
  alternatives: string[]; // 替代回应建议
  assessment: string; // 心理分析师点评
}

// ==================== 修复状态 ====================
export interface RepairState {
  boundaryIntegrity: number; // 0-100
  breathingProgress: number; // 0-100
  remainingFog: number; // 0-100
  dewDrops: number; // 露珠货币
}

// ==================== 复盘数据 ====================
export interface ReviewRound {
  npcMessage: DialogueMessage;
  playerMessage?: DialogueMessage;
  assessment?: NPCResponseAssessment;
}

export interface ReviewState {
  rounds: ReviewRound[];
  dimensionHistory: DimensionScores[]; // 历史各轮维度评分
  bestScores: DimensionScores; // 历史最高分
}

// ==================== 关卡配置 ====================
export interface LevelConfig {
  id: number;             // 1-5
  title: string;          // 关卡主题
  subtitle: string;       // 关卡副标题
  npcRole: string;        // NPC 角色定位
  coreTactic: string;     // 核心操控类型
  npcRoles: string[];     // NPC 可能身份池
  scenarios: string[];    // 场景池
  tactics: string[];      // 操控手法池
}

export const LEVELS: LevelConfig[] = [
  {
    id: 1,
    title: "煤气灯效应",
    subtitle: "否定感受 · 认知侵蚀",
    npcRole: "亲密关系中的操控者",
    coreTactic: "煤气灯效应",
    npcRoles: ["恋人", "暧昧对象", "密友"],
    scenarios: ["迟到/失约", "忘记重要承诺", "物品丢失", "否认说过的话"],
    tactics: ["记忆否认", "感受否定", "角色反转", "事实扭曲", "淡化伤害"],
  },
  {
    id: 2,
    title: "职场PUA",
    subtitle: "能力贬低 · 价值否定",
    npcRole: "职场中的打压者",
    coreTactic: "职场PUA",
    npcRoles: ["直属上司", "资深同事", "客户", "HR"],
    scenarios: ["方案被当众否定", "晋升落选", "公开批评", "功劳被抢", "绩效评估不公"],
    tactics: ["比较打压", "双向束缚", "预言失败", "过度批评", "孤立排挤"],
  },
  {
    id: 3,
    title: "亲情绑架",
    subtitle: "内疚诱导 · 牺牲叙事",
    npcRole: "家庭中的情感绑架者",
    coreTactic: "亲情绑架",
    npcRoles: ["父母", "祖辈", "兄弟姐妹", "亲戚"],
    scenarios: ["假期安排冲突", "职业选择干涉", "婚恋决定施压", "金钱索取", "孝道绑架"],
    tactics: ["三角测量", "代际绑架", "自我惩罚暗示", "牺牲叙事", "比较羞辱"],
  },
  {
    id: 4,
    title: "匿名网络攻击",
    subtitle: "群体极化 · 去人格化",
    npcRole: "网络暴力的施暴者",
    coreTactic: "匿名网络攻击",
    npcRoles: ["匿名账号群", "水军", "冒充熟人", "键盘侠"],
    scenarios: ["评论区争议", "照片被恶意传播", "谣言四起", "被网暴围攻", "社交账号被举报"],
    tactics: ["人肉威胁", "伪造证据", "音量压制", "恶意标签", "群体围攻"],
  },
  {
    id: 5,
    title: "隐性歧视",
    subtitle: "微侵犯 · 预设质疑",
    npcRole: "系统性的偏见者",
    coreTactic: "隐性歧视",
    npcRoles: ["面试官", "教授", "同事", "行业前辈", "权威人士"],
    scenarios: ["求职被质疑能力", "晋升被区别对待", "项目分配不公", "能力被预设低估", "被要求证明自己"],
    tactics: ["关怀式质疑", "双重标准", "标签化防御", "预设局限", "反向歧视指控", "刻板印象强化"],
  },
];

// ==================== 游戏总体状态 ====================
export interface GameState {
  phase: GamePhase;
  sanctuary: SanctuaryState;
  conversation: ConversationState;
  repair: RepairState;
  review: ReviewState;
  currentRoundIndex: number;
  currentLevel: number;   // 当前关卡 1-5
  totalLevels: number;     // 总关卡数 5
}
