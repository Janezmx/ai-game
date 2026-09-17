// ==================== 游戏阶段枚举 ====================
export enum GamePhase {
  SanctuaryPrep = "SanctuaryPrep",
  DialogueBattle = "DialogueBattle",
  AftermathRepair = "AftermathRepair",
}

// ==================== 心域状态 ====================
export enum ArtifactType {
  Shield = "Shield",
  Mirror = "Mirror",
  Spear = "Spear",
  Insight = "Insight",
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
  alternatives?: AlternativeResponse[]; // 替代回应建议
  // —— 教育化扩展（可选，向后兼容）——
  whyNote?: string; // 为什么点评：科普本轮操控利用了人的什么心理
  identificationTip?: string; // 本轮识别要点：可操作的观察线索
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
}

// ==================== 评估维度 ====================
export interface DimensionScores {
  boundaryAwareness: number; // 边界意识
  emotionalStability: number; // 情绪稳定
  cognitiveClarity: number; // 认知清晰
  assertiveResponse: number; // 坚定回应
}

// ==================== NPC 评估 ====================
export interface AlternativeResponse {
  text: string;
  rationale: string;
}

export interface NPCResponseAssessment {
  // —— 对话期轻量评估（实时结算，必填，由 /api/chat 每轮产出）——
  trapType: string; // 操控手法类型
  playerStatus: "effective" | "shaken" | "trapped"; // 判断玩家状态
  dimensions: DimensionScores; // 四维评分
  // —— 复盘期完整文本（可选：对话期评估不产出，玩家进入复盘阶段后由补全接口生成）——
  trapAnalysis?: string; // 陷阱分析
  nextStrategy?: string; // NPC下一轮策略
  nextDialogue?: string; // NPC下一轮话术（已废弃，台词由独立台词段生成）
  alternatives?: AlternativeResponse[]; // 替代回应建议（含原因）
  assessment?: string; // 心理分析师点评
  // —— 教育化扩展（可选，向后兼容）——
  whyNote?: string; // 为什么点评：科普本轮操控利用了人的什么心理
  identificationTip?: string; // 本轮识别要点：可操作的观察线索
  knowledgePointId?: string; // 关联知识点 ID
  progressNote?: string; // 进步对比：与上一轮评分对比的反馈
  conversationEnded?: boolean; // NPC 是否认输
  /**
   * 本轮评估是否走了兜底（模型空返回/解析失败后用占位值补齐）。
   * true 表示 trapType/dimensions 等是补出来的假数据：不计入本局综合分与最高分，
   * 不生成进步对比，复盘页需提示“本轮评估未获取到有效数据”。
   */
  degraded?: boolean;
}

// 复盘补全接口返回的完整评估文本，字段与 NPCResponseAssessment 的复盘期可选字段一致
export type ReviewAssessmentContent = Pick<
  NPCResponseAssessment,
  "trapAnalysis" | "alternatives" | "assessment" | "whyNote" | "identificationTip" | "progressNote"
>;

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

// ==================== 复盘报告存档 ====================
/**
 * 列表页使用的轻量元数据：成长页只读它渲染记录卡片，
 * 避免为了显示列表而把上百份正文全部读一遍。
 */
export interface ReviewReportMeta {
  id: string; // `${timestamp}-${level}`
  level: number;
  levelTitle: string;
  timestamp: number;
  victory: boolean;
  avgScore: number;
  roundCount: number;
}

/**
 * 单局完整复盘报告：落盘到本机文件后可随时回看、导出。
 * rounds 里同时含对话原文与该轮的复盘长文本，因此必须等补全接口
 * 生成文本后再更新存档，中途退出则以已生成的部分存档。
 */
export interface SavedReviewReport {
  id: string;
  version: 1; // 结构版本，便于后续迁移
  level: number;
  levelTitle: string;
  timestamp: number;
  victory: boolean;
  avgScore: number;
  dimensions: DimensionScores; // 本局四维平均，与 GameRecord 口径一致
  dimensionHistory: DimensionScores[]; // 逐轮四维评分
  rounds: ReviewRound[];
  knowledgePointId?: string;
  /** 本课知识点快照：存档后知识点文案可能随版本调整，存一份便于导出时完整还原 */
  knowledgePoint?: KnowledgePoint;
  savedAt?: number; // 服务端写入时间
}

// ==================== 游戏记录 / 成长系统 ====================
export interface GameRecord {
  level: number;
  timestamp: number;
  victory: boolean;
  avgScore: number;
  dimensions: DimensionScores;
  levelTitle: string;
  /** 关联的复盘报告 id；旧存档无此字段，卡片自动降级为不可点击 */
  reportId?: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt?: number;
}

// 说明：badge 的 id 是**已持久化的存档键**（localStorage 按 id 记录已解锁项），
// 因此关卡改名时只更新面向玩家的 name / description，id 一律保持不变，
// 否则老玩家的解锁进度会被静默清空。
export const ALL_BADGES: Badge[] = [
  { id: "first_clear", name: "初次通关", description: "完成第一关", icon: "🌟" },
  { id: "gaslight_master", name: "煤气灯识破者", description: "通关煤气灯操控关卡", icon: "💡" },
  { id: "pua_resist", name: "打压反击者", description: "通关职场打压关卡", icon: "💼" },
  { id: "family_bound", name: "亲情边界", description: "通关亲情绑架关卡", icon: "👨‍👩‍👧" },
  { id: "net_guard", name: "网络守卫", description: "通关网络围攻关卡", icon: "👾" },
  { id: "bias_breaker", name: "偏见破除者", description: "通关偏见伪装关卡", icon: "🎭" },
  { id: "all_clear", name: "全通者", description: "通关全部5关", icon: "🏆" },
  { id: "perfect_defense", name: "完美防御", description: "任意一关综合评分≥90", icon: "✨" },
];

// ==================== 关卡配置 ====================
// 预设场景开场白池：进入关卡时随机取 1 条，
// scenario：场景前提（作为 {scenario} 传给 /api/npc/generate 约束大模型生成开场白）；
// line：本地兜底开场白，仅当大模型生成失败/超时/未返回 opening_line 时使用。
export interface LevelOpening {
  scenario: string;
  line: string;
}

export interface LevelConfig {
  id: number;             // 1-5
  title: string;          // 关卡主题
  subtitle: string;       // 关卡副标题
  npcRole: string;        // NPC 角色定位
  coreTactic: string;     // 核心操控类型
  npcRoles: string[];     // NPC 可能身份池
  scenarios: string[];    // 场景池
  openings: LevelOpening[]; // 预设场景/兜底开场白池（正式开场白由 /api/npc/generate 大模型生成）
  tactics: string[];      // 操控手法池
}

export const LEVELS: LevelConfig[] = [
  {
    id: 1,
    title: "煤气灯操控",
    subtitle: "否定感受 · 认知侵蚀",
    npcRole: "亲密关系中的操控者",
    coreTactic: "煤气灯操控",
    npcRoles: ["恋人", "暧昧对象", "密友"],
    scenarios: ["迟到/失约", "忘记重要承诺", "物品丢失", "否认说过的话"],
    openings: [
      { scenario: "迟到/失约", line: "我不是在微信里跟你说晚点到了吗？你怎么又没看到……你最近总是这么心不在焉，跟你说话你都记不住。" },
      { scenario: "忘记重要承诺", line: "上周我就跟你说了周末要一起回我爸妈家，你居然说没听过？行吧，反正在这个家里，所有事都得我记着。" },
      { scenario: "物品丢失", line: "我的手表就放在床头柜上的，家里就你在，你说没动过？……也许是你不小心放别处又忘了，你自己再想想。" },
      { scenario: "否认说过的话", line: "我什么时候说过那种伤人的话？你肯定记错了。你总爱把没发生的事说得跟真的一样，让人很累。" },
      { scenario: "感受否定", line: "你又在钻牛角尖了，我根本不是那个意思，是你自己想太多。每次都要闹成这样，有意思吗？" },
    ],
    tactics: ["记忆否认", "感受否定", "角色反转", "事实扭曲", "淡化伤害"],
  },
  {
    id: 2,
    title: "职场打压",
    subtitle: "能力贬低 · 价值否定",
    npcRole: "职场中的打压者",
    coreTactic: "职场打压",
    npcRoles: ["直属上司", "资深同事", "客户", "HR"],
    scenarios: ["方案被当众否定", "晋升落选", "公开批评", "功劳被抢", "绩效评估不公"],
    openings: [
      { scenario: "方案被当众否定", line: "这个方案你觉得很得意？可刚才会议上没有一个人点头。你要认清现实，你的能力还撑不起这样的自信。" },
      { scenario: "晋升落选", line: "这次晋升我顶了多大的压力推荐你，你知道吗？可你准备的东西实在拿不出手。别急着委屈，先想想自己差在哪。" },
      { scenario: "公开批评", line: "我当着全组的面说你，是想给你长记性。别人想让我说，我还不稀罕说。你这点批评都受不了，以后怎么扛事？" },
      { scenario: "功劳被抢", line: "这个项目能落地，全靠组里几个老同事给你兜底。你一个新人，别把功劳都往自己身上揽，多学着点。" },
      { scenario: "绩效评估不公", line: "这次绩效我很难给你打高。你看看同批的小王，态度多端正。你呢，还差得远，明年再努力吧。" },
    ],
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
    openings: [
      { scenario: "假期安排冲突", line: "大过年的你都不回来？我和你爸盼了一年，就盼着全家团圆。你心里到底还有没有这个家？" },
      { scenario: "职业选择干涉", line: "我厚着脸皮托人给你找的稳定工作你不要，非要出去闯。我一把年纪为你低声下气，你对得起我吗？" },
      { scenario: "婚恋决定施压", line: "那个对象条件多好，你不抓紧，过了这村就没这店。妈吃的盐比你吃的米还多，妈会害你吗？" },
      { scenario: "金钱索取", line: "你弟这次是真遇到难处了，你这个当姐的不帮谁帮？当年我们砸锅卖铁供你读书，现在找你借点钱还推三阻四？" },
      { scenario: "孝道绑架", line: "你爸身体一天不如一天，你就不能顺着他？非要把他气出个好歹，你就满意了？我们真是白养你了。" },
    ],
    tactics: ["三角测量", "代际绑架", "自我惩罚暗示", "牺牲叙事", "比较羞辱"],
  },
  {
    id: 4,
    title: "网络围攻",
    subtitle: "群体极化 · 去人格化",
    npcRole: "网络暴力的施暴者",
    coreTactic: "网络围攻",
    npcRoles: ["匿名账号群", "水军", "冒充熟人", "键盘侠"],
    scenarios: ["评论区争议", "照片被恶意传播", "谣言四起", "被网暴围攻", "社交账号被举报"],
    openings: [
      { scenario: "评论区争议", line: "大家快来看啊，这人三观歪成这样还敢发帖，怕不是水军洗地吧？看这口吻，实锤了。" },
      { scenario: "照片被恶意传播", line: "这不是那谁吗？穿成这样发出来，还怪别人截图。苍蝇不叮无缝的蛋，懂的都懂。" },
      { scenario: "谣言四起", line: "别洗了，我朋友当时就在现场，看得清清楚楚就是你干的。越描越黑，删帖也没用。" },
      { scenario: "被网暴围攻", line: "说两句就拉黑，心虚了吧？就这种素质也配混社区？大家动动手指，一起举报。" },
      { scenario: "社交账号被举报", line: "平时装得人模人样，背地里就这德行？你早前说的那些话我可都截图了，要不要我发出来让大家评评理？" },
    ],
    tactics: ["人肉威胁", "伪造证据", "音量压制", "恶意标签", "群体围攻"],
  },
  {
    id: 5,
    title: "偏见伪装",
    subtitle: "微侵犯 · 预设质疑",
    npcRole: "系统性的偏见者",
    coreTactic: "偏见伪装",
    npcRoles: ["面试官", "教授", "同事", "行业前辈", "权威人士"],
    scenarios: ["求职被质疑能力", "晋升被区别对待", "项目分配不公", "能力被预设低估", "被要求证明自己"],
    openings: [
      { scenario: "求职被质疑能力", line: "看了你的简历，我有点担心。我们这个岗位要求挺高的，你是××学校毕业的吧？你觉得凭什么胜任？" },
      { scenario: "晋升被区别对待", line: "这次机会我本来是想给你的。但考虑到团队氛围，你这样的……我怕其他同事有想法，你理解吧。" },
      { scenario: "项目分配不公", line: "这个核心项目客户比较传统，我考虑再三还是让经验丰富的老周牵头，你做支持就好。不是针对你，是为项目好。" },
      { scenario: "能力被预设低估", line: "没想到你也会来争取外派名额？这项目应酬多、要会来事，我怕你适应不了，要不算了？" },
      { scenario: "被要求证明自己", line: "我不是针对你，可大家都觉得你不合适，就我还在替你说话。你想争取，就得拿出比别人强的证据来。" },
    ],
    tactics: ["关怀式质疑", "双重标准", "标签化防御", "预设局限", "反向歧视指控", "刻板印象强化"],
  },
];

// ==================== 心理学知识点卡 ====================
export interface KnowledgePoint {
  id: string; // 如 "kp-gaslight"
  tactic: string; // 操控手法名（对应关卡标题）
  definition: string; // 一句话定义
  signals: string[]; // 识别信号（3-4 条）
  /**
   * 「⚠️ 这些不算操控」：与 signals 一一对照的安全反例。
   *
   * 为什么必须有：只教"识别信号"等于只给玩家一张筛子，却没有告诉他筛孔多大，
   * 结果是通关后把正常批评、情绪化表达也读成操控（假阳性）。
   * 与 signals 成对呈现，才能把"识别"升级为"辨别"。
   */
  nonSignals?: string[];
  /**
   * 「⏸ 先确认，再反击」：证据不足时的求证话术（先要具体 → 再说感受 → 最后定边界）。
   * 与 healthyResponse 的区别：healthyResponse 回答"怎么守住边界"，
   * confirmationPrompts 回答"怎么先搞清楚对方是不是这个意思"。
   */
  confirmationPrompts?: string[];
  healthyResponse: string[]; // 健康应对话术示例（2-3 条）
  caseStory?: string; // 真实案例小故事
}

// ==================== 新手引导步骤 ====================
export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  icon?: string; // emoji 图标
}

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
