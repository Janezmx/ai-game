import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Animated,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useGameStore } from "../store/gameStore";
import { chatWithNPC, generateNPC, fetchInsight, SSEEvent } from "../api/sse";
import { playSend, playReceive, playArtifact, playVictory, playDamage } from "../utils/sound";
import {
  DialogueMessage,
  ArtifactType,
  Artifact,
  LevelConfig,
  LevelOpening,
  LEVELS,
  ReviewRound,
  NPCResponseAssessment,
  KnowledgePoint,
} from "@aigame/shared";
import ProgressBar from "./ProgressBar";
import {
  palette,
  radius,
  space,
  fontSize,
  fontWeight,
  fontFamily,
  shadow,
} from "../theme";
import KnowledgeCard, { getLevelKnowledgePoint } from "./KnowledgeCard";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const CHAT_MAX_HEIGHT = SCREEN_HEIGHT * 0.45; // 聊天区最大高度为屏幕的45%

// 生成消息ID
function makeMsgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// Loading 动画（三点跳动）
function LoadingDots() {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d + 1) % 4), 400);
    return () => clearInterval(t);
  }, []);
  return <Text style={styles.loadingDots}>{".".repeat(dots) || "\u00A0"}</Text>;
}

// 正念短句常量（等待 AI 回复时轮换展示，围绕边界守护/自我价值/情绪稳定主题）
const MINDFULNESS_QUOTES: string[] = [
  "你的感受是真实的，不需要任何人来证明。",
  "边界不是墙，而是你与世界温柔的约定。",
  "你可以关心他人，同时坚定地守护自己。",
  "拒绝不等于冷漠，说「不」是你的权利。",
  "先稳住呼吸，再回应世界。",
  "被尊重，是你与生俱来的权利。",
];

// 轮播条目类型
type WaitingItem =
  | { kind: "definition"; label: string; text: string }
  | { kind: "signal"; label: string; text: string }
  | { kind: "quote"; label: string; text: string };

// 等待互动面板：在 isWaiting 阶段轮播「心理科普卡片」与「正念短句」
function WaitingInteractionPanel({
  visible,
  knowledgePoint,
}: {
  visible: boolean;
  knowledgePoint: KnowledgePoint | null;
}) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;

  // 由科普条目 + 正念短句构成轮播序列
  const items = useMemo<WaitingItem[]>(() => {
    const knowledgeItems: WaitingItem[] = knowledgePoint
      ? [
          ...(knowledgePoint.definition
            ? [{ kind: "definition" as const, label: "📖 操控手法", text: knowledgePoint.definition }]
            : []),
          ...(knowledgePoint.signals || []).map((s) => ({
            kind: "signal" as const,
            label: "🔎 识别信号",
            text: s,
          })),
        ]
      : [];
    const quoteItems: WaitingItem[] = MINDFULNESS_QUOTES.map((q) => ({
      kind: "quote" as const,
      label: "🌿 正念片刻",
      text: q,
    }));
    return [...knowledgeItems, ...quoteItems];
  }, [knowledgePoint]);

  // 可见时启动轮播；不可见时清理定时器并隐藏
  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      return;
    }
    if (items.length === 0) return;

    // 进入时先淡入当前条目
    setIndex((i) => (i >= items.length ? 0 : i));
    Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    // 每 3.5 秒切换：淡出 → 换内容 → 淡入
    let timer: ReturnType<typeof setInterval> | null = null;
    const switchDelay = setTimeout(() => {
      timer = setInterval(() => {
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(
          () => {
            setIndex((i) => (i + 1) % items.length);
            Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
          }
        );
      }, 3500);
    }, 3500);

    return () => {
      clearTimeout(switchDelay);
      if (timer) clearInterval(timer);
    };
  }, [visible, items, opacity]);

  if (!visible || items.length === 0) return null;

  const current = items[index % items.length];
  const isQuote = current.kind === "quote";

  return (
    <Animated.View
      style={[styles.waitingPanel, isQuote ? styles.waitingPanelQuote : styles.waitingPanelKnowledge, { opacity }]}
    >
      <Text style={styles.waitingPanelLabel}>{current.label}</Text>
      <Text style={styles.waitingPanelText} numberOfLines={3}>
        {current.text}
      </Text>
    </Animated.View>
  );
}

// 消息气泡（轻量评估模式：仅展示对话文本，复盘/科普长文本在复盘界面补全展示）
function MessageBubble({ msg, isLoading }: { msg: DialogueMessage; isLoading: boolean }) {
  const isPlayer = msg.role === "player";

  return (
    <View style={[styles.bubbleRow, isPlayer ? styles.playerRow : styles.npcRow]}>
      {!isPlayer && (
        <View style={styles.npcAvatar}>
          <Text style={styles.npcAvatarText}>{"🎭"}</Text>
        </View>
      )}
      <View style={[styles.bubble, isPlayer ? styles.playerBubble : styles.npcBubble]}>
        {isLoading ? (
          <LoadingDots />
        ) : (
          <Text style={[styles.bubbleText, isPlayer ? styles.playerText : styles.npcText]}>
            {msg.content}
          </Text>
        )}
      </View>
      {isPlayer && (
        <View style={styles.playerAvatar}>
          <Text style={styles.playerAvatarText}>{"🧘"}</Text>
        </View>
      )}
    </View>
  );
}

// 法器图标映射（模块级，避免每次渲染重建）
function getArtifactIcon(type: ArtifactType) {
  switch (type) {
    case ArtifactType.Shield: return "🛡️";
    case ArtifactType.Mirror: return "🔍";
    case ArtifactType.Spear: return "🔱";
    case ArtifactType.Insight: return "🔔";
    default: return "🧰";
  }
}



// 法器按钮
function ArtifactButton({
  artifact,
  onUse,
  disabled,
}: {
  artifact: Artifact;
  onUse: (a: Artifact) => void;
  disabled: boolean;
}) {
  const onCooldown = artifact.remainingCooldown > 0;

  return (
    <TouchableOpacity
      style={[
        styles.artifactBtn,
        onCooldown && styles.artifactBtnCooldown,
        disabled && styles.artifactBtnDisabled,
      ]}
      onPress={() => onUse(artifact)}
      disabled={onCooldown || disabled}
      accessibilityLabel={`使用法器 ${artifact.name}`}
      accessibilityRole="button"
    >
      <Text style={styles.artifactIcon}>{getArtifactIcon(artifact.type)}</Text>
      <Text style={styles.artifactName} numberOfLines={1}>
        {artifact.name}
      </Text>
      {onCooldown && (
        <Text style={styles.cooldownText}>{artifact.remainingCooldown}</Text>
      )}
    </TouchableOpacity>
  );
}

// ==================== 主组件 ====================

interface BattleScreenProps {
  onComplete?: (victory: boolean) => void;
  level: number;
}

const MAX_TURNS = 5; // 最大回合数，超过后根据分数判定胜负

export default function BattleScreen({ onComplete, level }: BattleScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const store = useGameStore();
  const { conversation, sanctuary } = store;

  // 从配置中获取当前关卡信息
  const levelConfig: LevelConfig = LEVELS[level - 1] || LEVELS[0];

  // 本关随机场景与「兜底开场白」（每关固定，不随重渲染改变）：
  // 从本关 openings 中随机抽取 1 条，scenario 作为本关场景前提传给 /api/npc/generate 约束大模型；
  // 正式开场白改由大模型生成（经 SSE opening_line 事件上屏），line 仅在大模型失败/超时/漏输出时兜底。
  const [battleScene] = useState<LevelOpening>(() => {
    const pool = levelConfig.openings?.length
      ? levelConfig.openings
      : levelConfig.scenarios.map((s) => ({ scenario: s, line: "……" }));
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
  });
  const currentScenario = battleScene.scenario;

  // 本关除当前场景外的其余并列子场景：用于后端在对话提示中显式禁止跑题到
  // 同关卡其它子场景（如亲情关从"职业选择干涉"滑向"孝道绑架/回家看看"）。
  // openings 与 scenarios 分别维护、可能不完全一致，这里取并集再剔除当前场景，确保禁令覆盖本关全部并列子场景。
  const peerScenarios = useMemo(() => {
    const fromOpenings = levelConfig.openings?.map((o) => o.scenario) ?? [];
    const pool = fromOpenings.length > 0
      ? [...fromOpenings, ...(levelConfig.scenarios ?? [])]
      : levelConfig.scenarios ?? [];
    return Array.from(new Set(pool)).filter((s) => s !== currentScenario);
  }, [levelConfig, currentScenario]);

  // 本关知识点卡（后端生成版优先，兜底用静态）
  const knowledgePoint = store.currentKnowledgePoint || getLevelKnowledgePoint(level);
  const [showKp, setShowKp] = useState(false);

  // 本地状态
  const [inputText, setInputText] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [showWaitingCard, setShowWaitingCard] = useState(false); // 全屏等待卡：首段台词上屏即收起
  const [isAssessing, setIsAssessing] = useState(false); // 评估阶段（台词已上屏，显示小指示）
  const [isNPCGenerating, setIsNPCGenerating] = useState(false);
  const [lastUsedArtifact, setLastUsedArtifact] = useState<Artifact | null>(null);
  const [stormMode, setStormMode] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isBattleStart, setIsBattleStart] = useState(true);
  const [showIntro, setShowIntro] = useState(true);
  const [battleEnded, setBattleEnded] = useState(false); // 胜负已分，阻断输入
  const [showVictoryModal, setShowVictoryModal] = useState(false);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const [sseError, setSseError] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  // 明辨铃失败提示：任何失败都要给出可见反馈，绝不静默
  const [insightError, setInsightError] = useState<string | null>(null);
  const [artifactFeedback, setArtifactFeedback] = useState<{
    name: string;
    icon: string;
    effect: string;
    effectValue: number;
    cooldown: number;
  } | null>(null);
  // 回合结算弹框：评估完成后展示本回合数值加减（样式对齐法器反馈弹框）
  const [assessmentFeedback, setAssessmentFeedback] = useState<{
    rows: { icon: string; label: string; text: string; good: boolean }[];
    statusText: string;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // NPC 参数(名称/知识点/克制/建议)后台生成使用独立 controller，避免被聊天流程的 abortRef 覆盖/中止
  const npcGenAbortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  // 开场白是否已上屏：防止 NPC 生成失败重试时重复插入同一条本地开场白
  const openingShownRef = useRef(false);
  const victoryTriggered = useRef(false);
  // 用 ref 追踪后端推送的最新数值（避免闭包过期）
  const latestValues = useRef({ npcControlLevel: conversation.npcControlLevel, playerResistance: conversation.playerResistance, turnCount: 0 });
  const lastTrapType = useRef("");
  const lastAlternatives = useRef<{ text: string; rationale: string }[]>([]);
  // 首轮建议：LLM 根据开场白生成的回复建议（与明辨铃生成的区分开）
  const openingAlternativesRef = useRef<{ text: string; rationale: string }[]>([]);
  // 保存 NPC 开场白，传给 chat 路由以建立连贯情境
  const openingLineRef = useRef("");
  // 本局会话 id：每开一局换一个新值传给后端，让后端按局隔离对话历史。
  // 若始终落回后端默认会话，上一局（另一个场景）的对话会被当作"本局上文"继续聊，
  // 出现开场白讲"忘记约定"、NPC 却接着上一局"写方案"的串场。
  const sessionIdRef = useRef("");
  // NPC 固定身份（由 generate 阶段选定并下发）：每轮对话随 levelContext 传给 chat 路由，
  // 让 persona 层把"你是妈妈就是妈妈"写成硬约束，防止对话中途自行改换身份/称谓（妈妈→姐姐）
  const npcIdentityRef = useRef<{ roleIdentity: string; relationship: string }>({ roleIdentity: "", relationship: "" });
  // 开场白生成超时兜底定时器：模型长时间未返回时降级本地预设，避免玩家卡死在"生成中"加载态
  const openingFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 回合结算快照：发送消息前记录战局数值，评估返回后据此计算本回合"加减"变化
  const turnStartValuesRef = useRef<{ npcControlLevel: number; playerResistance: number } | null>(null);
  // 待展示的回合结算弹框内容：评估事件到达时生成、done 事件时上屏（避免与胜负弹窗抢镜）
  const pendingSummaryRef = useRef<{
    rows: { icon: string; label: string; text: string; good: boolean }[];
    statusText: string;
  } | null>(null);
  const summaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 明辨铃：记录激活时的回合数，用 useEffect 监听回合变化自动复位
  const insightActiveRef = useRef(false);
  const insightUsedTurnRef = useRef(-1);
  // 明辨铃当前点击的法器 id：生成失败/超时后据此把冷却归零，允许立即重试
  const insightArtifactIdRef = useRef<string | null>(null);
  // 明辨铃：玩家本轮点击"采纳"的建议；发送时若内容与原建议一致，随消息上报后端
  const adoptedInsightRef = useRef<{ text: string; rationale?: string } | null>(null);

  // 回合变化时自动关闭建议（下一轮）
  useEffect(() => {
    if (insightActiveRef.current && conversation.turnCount > insightUsedTurnRef.current) {
      insightActiveRef.current = false;
      adoptedInsightRef.current = null;
    }
  }, [conversation.turnCount]);

  // 明辨铃加载超时兜底：长时间无任何事件时停止 loading 并提示，避免界面一直转圈
  useEffect(() => {
    if (!insightLoading) return;
    const timer = setTimeout(() => {
      setInsightLoading(false);
      setInsightError("明辨铃响应超时，请稍后再点一次，或直接输入你的回应。");
      // 失败不消耗法器：恢复冷却，按钮立刻可再点，不用等 3 回合
      const fid = insightArtifactIdRef.current;
      if (fid) store.resetArtifactCooldown(fid);
    }, 60000);
    return () => clearTimeout(timer);
  }, [insightLoading]);

  // 自动滚动到底部
  // 依赖最后一条消息的 content 长度（流式更新时触发），同时把 whyNote/identificationTip/alternatives
  // 算进依赖（这些字段让消息渲染变高，需要重新滚动到底部）
  const lastMsg = conversation.messages.length > 0 ? conversation.messages[conversation.messages.length - 1] : null;
  const lastMsgContent = lastMsg?.content || "";
  const lastMsgWhy = lastMsg?.whyNote || "";
  const lastMsgAlt = (lastMsg?.alternatives?.length || 0);
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [conversation.messages.length, lastMsgContent, lastMsgWhy, lastMsgAlt, isWaiting, isNPCGenerating]);

  const addMessageWithId = useCallback(
    (msg: Omit<DialogueMessage, "id">) => {
      store.addMessage({ ...msg, id: makeMsgId() });
    },
    [store]
  );

  // 开始战斗 - 生成 NPC（含开场白：由 /api/npc/generate 大模型基于本关场景生成）
  const startBattle = useCallback(async () => {
    if (!isBattleStart) return;
    setIsBattleStart(false);

    // 新一局开始：清空上一次生成的 NPC 身份锁定，等待本次 generate 重新下发
    npcIdentityRef.current = { roleIdentity: "", relationship: "" };
    // 新一局同时换一个会话 id：后端据此丢弃上一局残留的对话历史与评估记录
    sessionIdRef.current = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // 记录本关场景前提
    store.setScenarioPremise(currentScenario);

    // NPC 开场白不再用本地预设直接上屏：先进入"生成中"态，
    // 等大模型生成的 opening_line 事件到达后上屏并解锁输入；
    // 仅当生成失败/超时/漏输出时降级使用 battleScene.line，保证开局不卡死。
    setIsNPCGenerating(true);

    // 上屏开场白并解锁对话输入（幂等：超时/重试/迟到的 opening_line 只会生效一次）
    const unlockOpening = (line: string) => {
      if (openingShownRef.current) return;
      openingShownRef.current = true;
      if (openingFallbackTimerRef.current) {
        clearTimeout(openingFallbackTimerRef.current);
        openingFallbackTimerRef.current = null;
      }
      openingLineRef.current = line;
      addMessageWithId({ role: "npc", content: line, timestamp: Date.now() });
      playReceive();
      setIsNPCGenerating(false);
      store.setPlayerTurn(true);
      setShowIntro(false);
    };

    // 超时兜底：大模型 25s 内未产出开场白时，用本地预设解锁对话
    openingFallbackTimerRef.current = setTimeout(() => {
      if (!openingShownRef.current) {
        console.warn("[battle] NPC 开场白生成超时，降级使用本地预设开场白");
        unlockOpening(battleScene.line);
      }
    }, 25000);

    const playerContext = `玩家心域状态：护盾${sanctuary.shieldHealth}%，已装备法器${sanctuary.equippedArtifacts.length}件。当前作战关卡：第${level}关「${levelConfig.title}」。`;
    const npcGenAbort = new AbortController();
    npcGenAbortRef.current = npcGenAbort;
    generateNPC(
      playerContext,
      1,
      (event: SSEEvent) => {
        switch (event.type) {
          case "npc_name":
            store.setNpcName(event.data);
            break;
          case "npc_identity":
            // 开局生成时即锁定的 NPC 固定身份：存下后每轮对话回传给 chat 路由，
            // 防止模型在"避免重复/升级手法"压力下中途把身份从妈妈改写成姐姐
            if (event.data && typeof event.data === "object") {
              const d = event.data as { roleIdentity?: string; relationship?: string };
              npcIdentityRef.current = {
                roleIdentity: d.roleIdentity || "",
                relationship: d.relationship || "",
              };
            }
            break;
          case "opening_line":
            // 大模型生成的开场白台词到达 → 上屏并解锁对话输入
            if (event.data) unlockOpening(String(event.data));
            break;
          case "npc_attack":
            if (event.data) {
              store.setNPCAttack(event.data);
              // 开场白已由 opening_line 事件上屏；此处仅保留首轮建议（如有）供明辨铃降级使用
              if (event.data.openingAlternatives?.length) {
                openingAlternativesRef.current = event.data.openingAlternatives;
              }
            }
            break;
          case "dialogue_chunk":
            // dialogue_chunk 是 personality/background 描述，不作为对话气泡显示
            break;
          case "done":
            // 流正常结束：若模型漏输 opening_line，用本地预设兜底解锁，保证开局可用
            if (!openingShownRef.current) {
              console.warn("[battle] 未收到 opening_line，降级使用本地预设开场白");
              unlockOpening(battleScene.line);
            }
            break;
          case "error":
            console.error("NPC参数生成错误:", event.data);
            // 生成失败：本地预设兜底解锁，保证开局可用
            if (!openingShownRef.current) unlockOpening(battleScene.line);
            break;
        }
      },
      npcGenAbort.signal,
      level,
      currentScenario
    ).catch((err: any) => {
      if (err?.name === "AbortError") return;
      console.error("生成NPC参数失败:", err);
      // 请求失败：本地预设兜底解锁，保证开局可用
      if (!openingShownRef.current) unlockOpening(battleScene.line);
    });
  }, [isBattleStart, level, levelConfig, sanctuary, store, addMessageWithId, currentScenario, battleScene]);

  // 发送玩家消息
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isWaiting || isSending) return;

    setInputText("");
    setIsSending(true);
    setIsWaiting(true);
    setShowWaitingCard(true);
    setIsAssessing(false);
    store.setPlayerTurn(false);
    playSend();

    // 明辨铃：玩家若在发送前点击采纳了某条建议、且发送内容与原建议一致，
    // 则视为"有意的采纳"，随消息上报后端——评估端识别为策略性抵抗（计划A），
    // 结算端在最坏情况下也保证操控值下降而非上升（计划B 保底）。
    const adoptedSuggestion = adoptedInsightRef.current;
    adoptedInsightRef.current = null;
    const adoptedInsightChoice =
      adoptedSuggestion && adoptedSuggestion.text && adoptedSuggestion.text.trim() === text
        ? { text: adoptedSuggestion.text, rationale: adoptedSuggestion.rationale || "" }
        : null;

    // 记录回合开始前的战局数值，评估返回后据此计算本回合"加减"变化
    turnStartValuesRef.current = {
      npcControlLevel: conversation.npcControlLevel,
      playerResistance: conversation.playerResistance,
    };

    // 添加玩家消息
    addMessageWithId({ role: "player", content: text, timestamp: Date.now() });

    // 构建对话历史
    const msgsForAPI = conversation.messages.map((m) => ({
      role: (m.role === "player" ? "user" : "assistant") as "user" | "assistant" | "system",
      content: m.content,
    }));
    msgsForAPI.push({ role: "user" as const, content: text });

    // 添加一条空 NPC 消息用于流式更新
    addMessageWithId({ role: "npc", content: "", timestamp: Date.now() });

    abortRef.current = new AbortController();

    try {
      await chatWithNPC(
        [
          {
            role: "system",
            content: `你是操控型NPC「${conversation.npcName}」，正在试图侵入玩家的心域。
你的说话风格：善用情感操控、模糊逻辑、制造愧疚感、贬低对方的边界意识。
逐步提升操控语气，但不直接攻击。
玩家当前抵抗值：${conversation.playerResistance}，
NPC控制等级：${conversation.npcControlLevel}，
回合数：${conversation.turnCount}。`,
          },
          ...msgsForAPI,
        ],
        sanctuary,
        (event: SSEEvent) => {
          switch (event.type) {
            case "chunk":
              // 首段台词上屏即收起全屏等待卡
              setShowWaitingCard(false);
              store.updateLastMessage(event.data as string);
              break;
            case "assessing":
              // 台词流已结束，进入评估阶段：收起等待卡并显示小指示
              setShowWaitingCard(false);
              setIsAssessing(true);
              break;
            case "control_level":
              store.setNpcControlLevel(event.data);
              latestValues.current.npcControlLevel = event.data;
              break;
            case "shield_damage": {
              // 防御减免：已装备法器数量提供锚定减伤（每件 5，上限 15），合并原植物锚定防御
              const reduction = Math.min(15, sanctuary.equippedArtifacts.length * 5);
              const actualDamage = Math.max(0, event.data - reduction);
              store.setPlayerResistance(actualDamage);
              latestValues.current.playerResistance = actualDamage;
              if (actualDamage > 10) playDamage();
              if (actualDamage < 30) {
                setStormMode(true);
              }
              break;
            }
            case "fog":
              // 迷雾由后端根据每轮评估驱动（被操控变浓 / 有效应对驱散）
              store.setFogDensity(event.data);
              break;
            case "assessment": {
              const a = event.data as NPCResponseAssessment;
              setIsAssessing(false);
              const s = useGameStore.getState();
              // 依据发送前快照，把本轮战局数值变化换算成"加减"，供回合结算弹框展示
              const startVals = turnStartValuesRef.current;
              turnStartValuesRef.current = null;
              if (startVals) {
                // 差值取整后展示：避免后端小数波动（如 68.5）经相减后出现多位小数（如 0.30000000000000004）
                const npcDelta = Math.round(s.conversation.npcControlLevel - startVals.npcControlLevel);
                const shieldDelta = Math.round(s.conversation.playerResistance - startVals.playerResistance);
                const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);
                const rows: { icon: string; label: string; text: string; good: boolean }[] = [];
                // 控制力下降=我方获益(绿)；抵抗上升=获益。
                // 迷雾不在回合结算弹框展示（按产品要求隐藏），如需恢复可在此补迷雾行。
                if (npcDelta !== 0) rows.push({ icon: "🧠", label: "NPC控制力", text: signed(npcDelta), good: npcDelta < 0 });
                if (shieldDelta !== 0) rows.push({ icon: "🛡️", label: "心域护盾", text: signed(shieldDelta), good: shieldDelta > 0 });
                const statusText =
                  a.playerStatus === "effective"
                    ? "✓ 你的回应稳住了局面"
                    : a.playerStatus === "shaken"
                      ? "这一轮你有些被动"
                      : a.playerStatus === "trapped"
                        ? "你落入了对方的节奏"
                        : rows.length === 0
                          ? "本回合数值无显著变化"
                          : "本回合战局已结算";
                pendingSummaryRef.current = { rows, statusText };
              }
              lastTrapType.current = a.trapType || "";
              lastAlternatives.current = a.alternatives || [];
              const turnAtAssessment = s.conversation.turnCount;
              console.log("[battle] assessment recv, alternatives:", a.alternatives?.length || 0, "turn:", turnAtAssessment);
              // 后端已拆两段调用：台词流结束（assessing）后评估才返回，
              // 此处消息列表已完整，无需再延迟等待 chunk 流完。
              const latestMsgs = s.conversation.messages;
              // playerMsg 取最新 player 消息；npcMsg 取其前方最近一条非空 npc 消息
              // （第1轮=开场白，后续轮=上一轮已经说出口的 NPC 台词，语义与旧 nextDialogue 配对一致）
              let playerMsg: any;
              let npcContent: string | null = null;
              for (let i = latestMsgs.length - 1; i >= 0; i--) {
                const m = latestMsgs[i];
                if (m.role === "player" && m.content && m.content.length > 0) { playerMsg = m; break; }
              }
              if (playerMsg) {
                const pIdx = latestMsgs.indexOf(playerMsg);
                for (let j = pIdx - 1; j >= 0; j--) {
                  const m = latestMsgs[j];
                  if (m.role === "npc" && m.content && m.content.length > 0) { npcContent = m.content; break; }
                }
              }
              if (npcContent && npcContent.length > 0) {
                const npcMsg: any = {
                  id: `npc-eval-${Date.now()}`,
                  role: "npc" as const,
                  content: npcContent,
                  timestamp: Date.now(),
                };
                // 轻量评估模式：对话期只入复盘轮次与数值结算，不再内联展示科普/点评文本。
                // 复盘长文本（whyNote/identificationTip/trapAnalysis/alternatives 等）已延迟，
                // 玩家进入复盘界面后由 /api/review/complete 按轮补全。
                // 维度兜底：后端偶发返回缺 dimensions 的评估（模型漏字段），按 50 补齐，
                // 避免 setDimensionScores/复盘/最高分结算读取 undefined 直接崩溃
                const rawDims: any = a.dimensions;
                const dims = {
                  boundaryAwareness: typeof rawDims?.boundaryAwareness === "number" ? rawDims.boundaryAwareness : 50,
                  emotionalStability: typeof rawDims?.emotionalStability === "number" ? rawDims.emotionalStability : 50,
                  cognitiveClarity: typeof rawDims?.cognitiveClarity === "number" ? rawDims.cognitiveClarity : 50,
                  assertiveResponse: typeof rawDims?.assertiveResponse === "number" ? rawDims.assertiveResponse : 50,
                };
                const round: ReviewRound = {
                  npcMessage: { ...npcMsg, trapType: a.trapType, playerStatus: a.playerStatus },
                  playerMessage: playerMsg?.role === "player" ? playerMsg : undefined,
                  assessment: a.dimensions ? a : { ...a, dimensions: dims },
                };
                store.addReviewRound(round);
                // 兜底轮（a.degraded）的 dims 是后端补的占位 50 分，不是玩家真实表现：
                // 不写进 dimensionHistory（本局综合分/成长曲线）与历史最高分，否则假 50 会被
                // 当成成绩结算、还会把最高分拉低。该轮仍进复盘轮次，并在复盘页提示"评估未获取到有效数据"。
                if (!a.degraded) {
                  store.setDimensionScores(dims);
                  // 用 getState() 取最新值：store 是组件渲染快照，闭包里可能已过期，
                  // 会让「历史最高分」被本轮较低分覆盖
                  const best = useGameStore.getState().review.bestScores;
                  store.setBestScores({
                    boundaryAwareness: Math.max(best.boundaryAwareness, dims.boundaryAwareness),
                    emotionalStability: Math.max(best.emotionalStability, dims.emotionalStability),
                    cognitiveClarity: Math.max(best.cognitiveClarity, dims.cognitiveClarity),
                    assertiveResponse: Math.max(best.assertiveResponse, dims.assertiveResponse),
                  });
                }
              }
              break;
            }
            case "done":
              setIsWaiting(false);
              setIsSending(false);
              setShowWaitingCard(false);
              setIsAssessing(false);
              store.setPlayerTurn(true);
              store.tickCooldowns();
              latestValues.current.turnCount++;
              store.incrementTurn();

              const vals = latestValues.current;

              // 若胜利已被 useEffect 提前触发（controlLevel<=0 分支），不再重复弹 banner
              if (victoryTriggered.current || battleEnded) break;

              // 到达最大回合数 → 根据分数判定胜负
              if (vals.turnCount >= MAX_TURNS) {
                if (vals.npcControlLevel < 50) {
                  setShowVictoryModal(true);
                  setBattleEnded(true);
                } else {
                  setShowGameOverModal(true);
                  setBattleEnded(true);
                }
                break;
              }

              // NPC 操控归零 → 立即胜利（不等下一回合）
              // 最小回合保护：至少打完 2 轮完整对话（turnCount >= 2），
              // 避免 LLM 单轮评分异常 / 首回合法器效果导致 NPC 操控意外归零时，玩家一句话就通关。
              // 与下方 useEffect 的 turnCount > 1 判定保持一致。
              if (vals.npcControlLevel <= 0 && vals.turnCount >= 2) {
                victoryTriggered.current = true;
                setShowVictoryModal(true);
                setBattleEnded(true);
                break;
              }

              if (vals.playerResistance < 20) {
                store.setCritical(true);
                const newCountdown = conversation.criticalCountdown - 1;
                store.setCriticalCountdown(newCountdown);
                if (newCountdown <= 0) {
                  setShowVictoryModal(false);
                  setShowGameOverModal(true);
                  setBattleEnded(true);
                  break; // 心跳枯竭已判定失败：跳过结算弹框，直接展示失败弹窗
                }
              }
              if (vals.playerResistance <= 0 || vals.npcControlLevel >= 100) {
                setShowVictoryModal(false);
                setShowGameOverModal(true);
                setBattleEnded(true);
                break;
              }

              // 回合未分胜负 → 上屏回合结算弹框（本回合数值加减），2.6s 后自动收起。
              // 走到这里说明上面所有胜负/结束分支都未触发，不会与结束弹窗叠现。
              const pendingSummary = pendingSummaryRef.current;
              pendingSummaryRef.current = null;
              if (pendingSummary) {
                setAssessmentFeedback(pendingSummary);
                if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current);
                summaryTimerRef.current = setTimeout(() => setAssessmentFeedback(null), 2600);
              }
              break;
            case "error":
              console.error("对话错误:", event.data);
              setSseError(String(event.data));
              setIsWaiting(false);
              setIsSending(false);
              setShowWaitingCard(false);
              setIsAssessing(false);
              store.setPlayerTurn(true);
              // 出错回合不弹结算：清空快照与待展示内容
              turnStartValuesRef.current = null;
              pendingSummaryRef.current = null;
              break;
          }
        },
        lastUsedArtifact,
        abortRef.current.signal,
        {
          level,
          levelTitle: levelConfig.title,
          levelSubtitle: levelConfig.subtitle,
          levelNpcRole: levelConfig.npcRole,
          levelTactics: levelConfig.tactics.join("、"),
          levelScenario: currentScenario,
          levelSignals: knowledgePoint.signals || [],
          openingLine: openingLineRef.current,
          npcRoleIdentity: npcIdentityRef.current.roleIdentity || undefined,
          npcRelationship: npcIdentityRef.current.relationship || undefined,
          peerScenarios,
          ...(adoptedInsightChoice ? { insightChoice: adoptedInsightChoice } : {}),
        },
        sessionIdRef.current
      );
      setLastUsedArtifact(null); // 法器信息已发送，清除
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("对话请求失败:", err);
        setSseError(String(err.message || err));
      }
      setIsWaiting(false);
      setIsSending(false);
      setShowWaitingCard(false);
      setIsAssessing(false);
      store.setPlayerTurn(true);
      // 请求失败同样清空回合结算快照与待展示内容
      turnStartValuesRef.current = null;
      pendingSummaryRef.current = null;
    }
  }, [
    inputText,
    isWaiting,
    isSending,
    conversation,
    sanctuary,
    store,
    addMessageWithId,
    level,
    levelConfig,
    currentScenario,
    peerScenarios,
    lastUsedArtifact,
  ]);

  // 使用法器
  const handleUseArtifact = useCallback(
    async (artifact: Artifact) => {
      if (artifact.remainingCooldown > 0 || isWaiting) return;

      // 使用任何法器时清空此前可能存在的"待发送采纳建议"，避免跨法器误报采纳
      adoptedInsightRef.current = null;
      store.useArtifact(artifact.id);
      setLastUsedArtifact(artifact);
      playArtifact();

      // 法器策略系统：特定法器对特定操控手法有克制加成
      const trap = lastTrapType.current || "";
      const hasBonus = (keywords: string[]) => keywords.some((k) => trap.includes(k));
      let bonus = 1;
      let effectLabel = "";
      let effectValue = 0;
      const artifactIcon = getArtifactIcon(artifact.type);

      switch (artifact.type) {
        case ArtifactType.Shield: // 心盾：提升抵抗值
          bonus = hasBonus(["煤气灯", "感受否定", "情感绑架"]) ? 2 : 1;
          effectValue = 15 * bonus;
          store.setPlayerResistance(conversation.playerResistance + effectValue);
          effectLabel = `抵抗值 +${effectValue}`;
          break;
        case ArtifactType.Mirror: // 真言镜：降低 NPC 控制力
          bonus = hasBonus(["模糊逻辑", "记忆否认", "事实扭曲"]) ? 2 : 1;
          effectValue = 10 * bonus;
          store.setNpcControlLevel(conversation.npcControlLevel - effectValue);
          effectLabel = `NPC控制力 -${effectValue}`;
          break;
        case ArtifactType.Spear: // 破谎矛：强力降低 NPC 控制力
          bonus = trap ? 1.5 : 1;
          effectValue = Math.round(20 * bonus);
          store.setNpcControlLevel(conversation.npcControlLevel - effectValue);
          effectLabel = `NPC控制力 -${effectValue}`;
          break;
        case ArtifactType.Insight: // 明辨铃：调用洞察 API 实时生成建议
          effectLabel = "正在分析...";
          insightActiveRef.current = true;
          insightUsedTurnRef.current = conversation.turnCount;
          insightArtifactIdRef.current = artifact.id;
          setInsightLoading(true);
          setInsightError(null);
          lastAlternatives.current = []; // 清空旧建议，等 API 返回

          // 构建当前对话上下文发送给洞察 API
          const ctxMessages = conversation.messages.map((m) => ({
            role: (m.role === "player" ? "user" : "assistant") as "user" | "assistant" | "system",
            content: m.content,
          }));

          fetchInsight(ctxMessages, (event: SSEEvent) => {
            if (event.type === "alternatives" && Array.isArray(event.data)) {
              lastAlternatives.current = event.data;
              setInsightError(null);
              setInsightLoading(false);
              // 强制触发 React 重渲染以显示建议
              store.setPlayerTurn(conversation.isPlayerTurn);
            } else if (event.type === "error") {
              setInsightLoading(false);
              // 明辨铃失败必须给出可见提示（不能静默，否则用户以为功能失灵）
              const raw = String(event.data || "");
              if (raw.includes("Empty LLM response") || raw.includes("LLM 返回空内容")) {
                setInsightError("明辨铃暂时没能生成建议，请稍后再点一次，或直接输入你的回应。");
              } else {
                setInsightError(raw || "明辨铃暂时没能生成合适的建议，请稍后再试或直接输入你的回应。");
              }
              // 失败不消耗法器：恢复冷却，按钮立刻可再点，不用等 3 回合
              if (insightArtifactIdRef.current) store.resetArtifactCooldown(insightArtifactIdRef.current);
            }
          }).catch((err: any) => {
            setInsightLoading(false);
            if (err && err.name === "AbortError") return;
            console.error("明辨铃请求失败:", err);
            setInsightError("网络连接异常，明辨铃分析失败，请稍后再试或直接输入你的回应。");
            // 失败不消耗法器：恢复冷却，按钮立刻可再点，不用等 3 回合
            if (insightArtifactIdRef.current) store.resetArtifactCooldown(insightArtifactIdRef.current);
          });
          break;
      }

      // 法器语义反馈文本
      const artifactMessages: Record<string, string> = {
        Shield: bonus > 1
          ? `🛡️ 心盾双倍克制——你觉察到对方正在${trap.includes("煤气灯") ? "否认你的感受" : trap.includes("情感绑架") ? "用情感绑架你" : "操控你"}，护盾帮你稳住自我判断。`
          : `🛡️ 心盾激活——边界护盾增强，帮你保持冷静面对操控。`,
        Mirror: bonus > 1
          ? `🔍 真言镜双倍反射——对方在${trap.includes("模糊逻辑") ? "用模糊逻辑迷惑你" : "扭曲事实"}，镜子帮你照出真相。`
          : `🔍 真言镜照出真相——让对方的逻辑漏洞暴露无遗。`,
        Spear: bonus > 1
          ? `🔱 破谎矛精准命中——对方的${trap || "操控"}在真相面前不堪一击。`
          : `🔱 破谎矛出击——直接瓦解对方的攻击。`,
        Insight: `🔔 明辨铃响起——你可以听到智慧的回应方式。`,
      };

      addMessageWithId({
        role: "player",
        content: artifactMessages[artifact.type] || `🧿 [使用法器] ${artifact.name}`,
        timestamp: Date.now(),
      });

      // 显示法器反馈弹框
      setArtifactFeedback({
        name: artifact.name,
        icon: artifactIcon,
        effect: effectLabel,
        effectValue,
        cooldown: store.difficulty === "hard" ? artifact.maxCooldown : 0, // easy=无冷却（每回合可用）；hard=原规则 3 回合
      });
      setTimeout(() => setArtifactFeedback(null), 2500);

      // 法器使用后驱散迷雾（与后端效果一致，提供即时反馈）：
      const fogReduce =
        artifact.type === ArtifactType.Shield
          ? artifact.power
          : Math.round(artifact.power / 2);
      store.setFogDensity(Math.max(0, sanctuary.fogDensity - fogReduce));
    },
    [isWaiting, conversation, sanctuary, store, addMessageWithId]
  );

  // 监测胜利条件（NPC控制等级归零）
  useEffect(() => {
    if (
      conversation.npcControlLevel <= 0 &&
      !isBattleStart &&
      !isNPCGenerating &&
      conversation.turnCount > 1 &&
      !victoryTriggered.current
    ) {
      victoryTriggered.current = true;
      addMessageWithId({
        role: "player",
        content: "✨ 你成功抵御了NPC的侵蚀！心域边界暂得安宁。",
        timestamp: Date.now(),
      });
      setStormMode(false);
      setShowVictoryModal(true);
      setBattleEnded(true);
    }
  }, [conversation.npcControlLevel, conversation.turnCount, isBattleStart, isNPCGenerating, store, addMessageWithId]);

  // 开局自动开始
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startBattle();

    return () => {
      if (openingFallbackTimerRef.current) {
        clearTimeout(openingFallbackTimerRef.current);
        openingFallbackTimerRef.current = null;
      }
      if (summaryTimerRef.current) {
        clearTimeout(summaryTimerRef.current);
        summaryTimerRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
      if (npcGenAbortRef.current) {
        npcGenAbortRef.current.abort();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 已装备的法器
  const equippedArtifacts = sanctuary.equippedArtifacts;

  // 胜利/失败 音效
  useEffect(() => { if (showVictoryModal) playVictory(); }, [showVictoryModal]);
  useEffect(() => { if (showGameOverModal) playDamage(); }, [showGameOverModal]);

  // 推荐回复：仅当明辨铃在当前回合激活时显示
  const suggestionList: { text: string; rationale: string }[] =
    insightActiveRef.current && lastAlternatives.current.length > 0
      ? lastAlternatives.current
      : [];
  const showSuggestions =
    suggestionList.length > 0 && conversation.isPlayerTurn && !isWaiting && !isNPCGenerating;

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* 关卡标题横幅 */}
      <View style={[styles.levelBanner, { paddingTop: insets.top + 4 }]}>
        <Text style={styles.levelLabel}>
          第 {level}/{store.totalLevels} 关
        </Text>
        <Text style={styles.levelTitle}>{levelConfig.title}</Text>
        <Text style={styles.levelSubtitle}>{levelConfig.subtitle}</Text>
        <TouchableOpacity
          style={styles.kpToggle}
          onPress={() => setShowKp((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.kpToggleText}>
            📖 本关知识点：{knowledgePoint.tactic} {showKp ? "▲" : "▼"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 知识点卡（可折叠） */}
      {showKp && (
        <View style={styles.kpWrap}>
          <KnowledgeCard kp={knowledgePoint} />
        </View>
      )}

      <View style={[styles.header]}>
        {/* 心域状态 */}
        <View style={styles.shieldIcon}>
          <Text style={styles.shieldEmoji}>
            {conversation.playerResistance > 60 ? "💚" : conversation.playerResistance > 30 ? "💛" : "❤️"}
          </Text>
        </View>

        {/* 状态栏 */}
        <View style={styles.statusContainer}>
          <ProgressBar
            label="抵抗值"
            value={conversation.playerResistance}
            color={palette.blue}
            icon="🛡️"
          />
          <ProgressBar
            label="NPC操控"
            value={conversation.npcControlLevel}
            color={palette.clay}
            icon="⚡"
          />
        </View>

        {/* 回合 */}
        <Text style={styles.turnText}>回合 {conversation.turnCount}</Text>
      </View>

      {/* 胜负条件提示 */}
      <Text style={styles.victoryHint}>
        🎯 NPC操控归零即胜 | 满5回合操控&lt;50即胜 | 抵抗归零则败
      </Text>

      {/* 护身符横幅 */}
      {store.amuletText ? (
        <View style={styles.amuletBar}>
          <Text style={styles.amuletIcon}>✍️</Text>
          <Text style={styles.amuletText}>"{store.amuletText}"</Text>
        </View>
      ) : null}

      {/* 场景前提 + 刷新按钮 */}
      {store.scenarioPremise && (
        <View style={styles.scenarioBar}>
          <Text style={styles.scenarioIcon}>🎭</Text>
          <View style={styles.scenarioTextWrap}>
            <Text style={styles.scenarioLabel}>场景前提</Text>
            <Text style={styles.scenarioText}>{store.scenarioPremise}</Text>
          </View>
        </View>
      )}

      {/* NPC名称 */}
      {conversation.npcName && (
        <View style={styles.npcTitleBar}>
          <Text style={styles.npcTitleIcon}>🎭</Text>
          <Text style={styles.npcTitleText}>{conversation.npcName}</Text>
          {isNPCGenerating && (
            <Text style={styles.npcLoading}>召唤中...</Text>
          )}
        </View>
      )}

      {/* SSE 错误提示条 */}
      {sseError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>⚠️ {sseError}</Text>
          <TouchableOpacity
            onPress={() => {
              setSseError(null);
              if (conversation.npcName && conversation.messages.length > 0) {
                // 对话中出错：重新发送当前轮请求
                store.setPlayerTurn(true);
                setIsWaiting(false);
                setIsSending(false);
              } else {
                // NPC 生成失败：重新生成
                setIsBattleStart(true);
                startBattle();
              }
            }}
            style={styles.errorRetryBtn}
            activeOpacity={0.7}
            accessibilityLabel="重试连接"
            accessibilityRole="button"
          >
            <Text style={styles.errorRetryText}>重试</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 新手引导面板 */}
      {showIntro && !isNPCGenerating && (
        <View style={styles.introBanner}>
          <Text style={styles.introTitle}>💡 怎么玩</Text>
          <Text style={styles.introText}>
            当前NPC擅长「{levelConfig.tactics.join("、")}」等操控手法。
            在输入框中回应NPC的对话，使用法器抵御侵蚀。
            每轮 NPC 话术后可点开「为什么这样操控」学习识别要点。
            当NPC操控等级降至0即为胜利！
          </Text>
        </View>
      )}

      {/* 对话区域 */}
      <ScrollView
        ref={scrollRef}
        testID="battle-messages"
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        showsVerticalScrollIndicator={true}
      >
        {conversation.messages.length === 0 && isNPCGenerating && (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>🎭 操控型NPC正在准备开场白...</Text>
          </View>
        )}

        {conversation.messages.map((msg, idx) => (
          <MessageBubble
            key={`${idx}-${msg.timestamp}`}
            msg={msg}
            isLoading={
              idx === conversation.messages.length - 1 &&
              msg.role === "npc" &&
              isWaiting &&
              !msg.content
            }
          />
        ))}
      </ScrollView>

      {/* 等待互动面板：玩家已发消息、正在等 NPC 回复时悬浮在屏幕中央轮播科普/正念短句
          用 RN Modal 包裹，自动覆盖整个原生屏幕（包括安全区），不受父容器 height:"auto" 限制 */}
      <Modal
        visible={showWaitingCard && isWaiting && conversation.messages.length > 0 && !battleEnded}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={styles.waitingPanelAnchor}>
          {/* 灰色蒙版：压暗下方对话内容，突出悬浮面板 */}
          <View style={styles.waitingPanelMask} />
          <WaitingInteractionPanel
            visible={true}
            knowledgePoint={knowledgePoint}
          />
        </View>
      </Modal>

      {/* 法器工具栏 */}
      {equippedArtifacts.length > 0 && (
        <View style={styles.artifactBar}>
          <Text style={styles.artifactBarLabel}>法器</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {equippedArtifacts.map((a) => (
              <ArtifactButton
                key={a.id}
                artifact={a}
                onUse={handleUseArtifact}
                disabled={isWaiting || !conversation.isPlayerTurn}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* 明辨铃加载中 */}
      {insightLoading && (
        <View style={styles.insightLoadingBar}>
          <LoadingDots />
          <Text style={styles.insightLoadingText}>正在分析最佳回应...</Text>
        </View>
      )}

      {/* 台词已上屏、后端正在结算本轮结果（轻量数值评估，不展示评估内容） */}
      {isAssessing && !battleEnded && (
        <View style={styles.insightLoadingBar}>
          <LoadingDots />
          <Text style={styles.insightLoadingText}>正在评估分数...</Text>
        </View>
      )}

      {/* 明辨铃失败提示（只有真的拿不到建议时才出现，绝不静默） */}
      {insightError && insightActiveRef.current && conversation.isPlayerTurn && (
        <View style={styles.insightErrorBar}>
          <Text style={styles.insightErrorText}>{insightError}</Text>
        </View>
      )}

      {/* 建议回复选项 */}
      {showSuggestions && (
        <View style={styles.suggestionsBar}>
          {suggestionList.filter((alt) => alt?.text).slice(0, 3).map((alt, i) => (
            <TouchableOpacity
              key={i}
              style={styles.suggestionChip}
              onPress={() => {
                setInputText(alt.text);
                // 记录本轮采纳的建议：保持原样发送时随消息上报后端，按"有意的抵抗"评估
                adoptedInsightRef.current = { text: alt.text, rationale: alt.rationale };
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.suggestionText} numberOfLines={2}>{alt.text}</Text>
              <Text style={styles.suggestionRationale} numberOfLines={2}>💡 {alt.rationale}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 输入区域 */}
      <View style={[styles.inputArea, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={
            isAssessing
              ? "正在评估分数..."
              : isWaiting
              ? "NPC正在回应..."
              : isNPCGenerating
              ? "NPC生成中..."
              : `回应${conversation.npcName || "NPC"}...`
          }
          placeholderTextColor={palette.textFaint}
          editable={!isWaiting && !isNPCGenerating && conversation.isPlayerTurn && !battleEnded}
          multiline
          maxLength={500}
          /* Web 端：Enter 发送，Shift+Enter 换行（IME 组词回车 keyCode=229 不受影响） */
          onKeyPress={(e: any) => {
            const ne: { key?: string; shiftKey?: boolean; keyCode?: number } = e.nativeEvent;
            if (ne.key !== "Enter" || ne.shiftKey || ne.keyCode === 229) return;
            const canSend = inputText.trim() && !isWaiting && !isNPCGenerating && conversation.isPlayerTurn && !battleEnded;
            if (!canSend) return;
            e.preventDefault();
            handleSend();
          }}
        />
        <View style={styles.inputButtons}>
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || isWaiting || isNPCGenerating || !conversation.isPlayerTurn || battleEnded) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isWaiting || isNPCGenerating || !conversation.isPlayerTurn || battleEnded}
            activeOpacity={0.8}
            accessibilityLabel="发送消息"
            accessibilityRole="button"
          >
            <Text style={styles.sendBtnText}>发送</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 临界状态覆盖 */}
      {conversation.isCritical && (
        <View style={styles.criticalOverlay}>
          <Text style={styles.criticalTitle}>⚠️ 心域临界</Text>
          <Text style={styles.criticalText}>
            你的抵抗正在崩溃！剩余 {conversation.criticalCountdown} 回合
          </Text>
        </View>
      )}

      {/* 失败顶部横幅（不遮挡对话，可先看完/展开科普点评再进入修复） */}
      {showGameOverModal && (
        <View style={styles.victoryBanner} pointerEvents="box-none">
          <View style={[styles.victoryBannerCard, { borderColor: "rgba(196, 113, 90, 0.7)" }]}>
            <Text style={styles.victoryBannerIcon}>💔</Text>
            <View style={styles.victoryBannerTextWrap}>
              <Text style={[styles.victoryBannerTitle, { color: palette.clay }]}>心域失守</Text>
              <Text style={styles.victoryBannerDesc}>
                {conversation.criticalCountdown <= 0
                  ? "抵抗在持续的侵蚀下彻底崩溃。"
                  : "心域边界已被完全渗透。"}
                {" "}可继续查看下方对话，随时进入修复。
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.victoryBannerBtn, { backgroundColor: palette.clay }]}
              onPress={() => {
                setShowGameOverModal(false);
                onComplete?.(false);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.victoryBannerBtnText}>进入修复</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 胜利顶部横幅（不遮挡对话，可先看完/展开科普点评再进入修复） */}
      {showVictoryModal && (
        <View style={styles.victoryBanner} pointerEvents="box-none">
          <View style={styles.victoryBannerCard}>
            <Text style={styles.victoryBannerIcon}>🏆</Text>
            <View style={styles.victoryBannerTextWrap}>
              <Text style={styles.victoryBannerTitle}>守护成功</Text>
              <Text style={styles.victoryBannerDesc}>
                已抵御{conversation.npcName}的操控。可继续查看下方对话，随时进入修复。
              </Text>
            </View>
            <TouchableOpacity
              style={styles.victoryBannerBtn}
              onPress={() => {
                setShowVictoryModal(false);
                onComplete?.(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.victoryBannerBtnText}>进入修复</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 法器使用反馈弹框 */}
      {artifactFeedback && (
        <View style={styles.artifactFeedbackOverlay} pointerEvents="none">
          <View style={styles.artifactFeedbackCard}>
            <Text style={styles.artifactFeedbackIcon}>{artifactFeedback.icon}</Text>
            <Text style={styles.artifactFeedbackName}>{artifactFeedback.name}</Text>
            <Text style={styles.artifactFeedbackEffect}>📊 {artifactFeedback.effect}</Text>
            <Text style={styles.artifactFeedbackCooldown}>
              {artifactFeedback.cooldown > 0
                ? `⏳ 冷却 ${artifactFeedback.cooldown} 回合`
                : "✨ 简单模式 · 法器无冷却"}
            </Text>
          </View>
        </View>
      )}

      {/* 回合结算弹框：评估后展示本回合数值加减（样式对齐法器反馈弹框） */}
      {assessmentFeedback && (
        <View style={styles.artifactFeedbackOverlay} pointerEvents="none">
          <View style={styles.artifactFeedbackCard}>
            <Text style={styles.artifactFeedbackIcon}>📊</Text>
            <Text style={styles.artifactFeedbackName}>回合结算</Text>
            {assessmentFeedback.rows.length === 0 ? (
              <Text style={styles.artifactFeedbackEffect}>本回合数值无显著变化</Text>
            ) : (
              <View style={styles.summaryRows}>
                {assessmentFeedback.rows.map((row, idx) => (
                  <View key={idx} style={styles.summaryRow}>
                    <Text style={styles.summaryRowLabel}>
                      {row.icon} {row.label}
                    </Text>
                    <Text
                      style={[
                        styles.summaryRowValue,
                        row.good ? styles.summaryRowGood : styles.summaryRowBad,
                      ]}
                    >
                      {row.text}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={styles.artifactFeedbackCooldown}>{assessmentFeedback.statusText}</Text>
          </View>
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: "auto",
    backgroundColor: palette.bg,

    width: "100%",
    alignSelf: "center",
  },
  levelBanner: {
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: palette.surfaceSoft,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  levelLabel: {
    color: palette.primaryDark,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1,
    fontFamily,
  },
  levelTitle: {
    color: palette.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    marginTop: 2,
    fontFamily,
  },
  levelSubtitle: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    marginTop: 1,
    fontFamily,
  },
  kpToggle: {
    marginTop: space.xs,
    backgroundColor: palette.surface,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  kpToggleText: {
    color: palette.primaryDark,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    fontFamily,
  },
  kpWrap: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  shieldIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.bg,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start", // 顶部对齐，与第一行 ProgressBar 起始位置齐平
    marginTop: 4, // 微调，与 label 文字视觉对齐
  },
  shieldEmoji: {
    fontSize: 22,
  },
  statusContainer: {
    flex: 1,
    marginLeft: space.sm,
    gap: 4,
  },
  turnText: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    marginLeft: space.xs,
    fontFamily,
  },
  victoryHint: {
    color: palette.textFaint,
    fontSize: fontSize.caption,
    textAlign: "center",
    paddingVertical: 4,
    paddingHorizontal: space.md,
    fontFamily,
  },
  introBanner: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    padding: space.md,
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  errorBanner: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    padding: space.md,
    backgroundColor: "rgba(224,176,132,0.18)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.peach,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorBannerText: {
    color: palette.clay,
    fontSize: fontSize.body,
    flex: 1,
    marginRight: space.sm,
    fontFamily,
  },
  errorRetryBtn: {
    backgroundColor: palette.primary,
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
  errorRetryText: {
    color: palette.surface,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    fontFamily,
  },
  introTitle: {
    color: palette.primaryDark,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    marginBottom: 4,
    fontFamily,
  },
  introText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    lineHeight: 24,
    fontFamily,
  },
  amuletBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: space.md,
    marginTop: space.xs,
    padding: space.sm,
    backgroundColor: "rgba(224,176,132,0.15)",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(224,176,132,0.3)",
    borderLeftWidth: 3,
    borderLeftColor: palette.peach,
  },
  amuletIcon: {
    fontSize: fontSize.body,
    marginRight: space.xs,
  },
  amuletText: {
    color: palette.primaryDark,
    fontSize: fontSize.caption,
    fontFamily,
    fontStyle: "italic",
    flex: 1,
  },
  scenarioBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginHorizontal: space.md,
    marginTop: space.sm,
    padding: space.md,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    borderLeftWidth: 4,
    borderLeftColor: palette.peach,
    ...shadow.soft,
  },
  scenarioIcon: {
    fontSize: fontSize.title,
    marginRight: space.sm,
  },
  scenarioTextWrap: {
    flex: 1,
  },
  scenarioLabel: {
    color: palette.primaryDark,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.semibold,
    fontFamily,
    marginBottom: 2,
  },
  scenarioText: {
    color: palette.text,
    fontSize: fontSize.body,
    lineHeight: 24,
    fontFamily,
  },
  npcTitleBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: palette.surfaceSoft,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  npcTitleIcon: {
    fontSize: fontSize.sub,
    marginRight: space.xs,
  },
  npcTitleText: {
    color: palette.clay,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  npcLoading: {
    color: palette.textFaint,
    fontSize: fontSize.caption,
    marginLeft: space.xs,
    fontStyle: "italic",
    fontFamily,
  },
  messageList: {
    flex: 1,
    minHeight: 0,
    maxHeight: CHAT_MAX_HEIGHT,
  },
  messageListContent: {
    padding: space.md,
    paddingBottom: space.sm,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: space.xl,
  },
  loadingText: {
    color: palette.textSoft,
    fontSize: fontSize.sub,
    fontFamily,
  },
  bubbleRow: {
    flexDirection: "row",
    marginBottom: space.md,
    alignItems: "flex-end",
  },
  playerRow: {
    justifyContent: "flex-end",
  },
  npcRow: {
    justifyContent: "flex-start",
  },
  npcAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.surfaceSoft,
    justifyContent: "center",
    alignItems: "center",
    marginRight: space.xs,
    borderWidth: 1,
    borderColor: palette.border,
  },
  npcAvatarText: {
    fontSize: fontSize.sub,
  },
  playerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: palette.primary,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: space.xs,
  },
  playerAvatarText: {
    fontSize: fontSize.sub,
  },
  bubble: {
    maxWidth: "74%",
    padding: space.md,
    borderRadius: radius.md,
  },
  playerBubble: {
    backgroundColor: palette.primary,
    borderBottomRightRadius: 6,
  },
  npcBubble: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderBottomLeftRadius: 6,
  },
  bubbleText: {
    fontSize: fontSize.body,
    lineHeight: 24,
    fontFamily,
  },
  playerText: {
    color: palette.surface,
  },
  npcText: {
    color: palette.text,
  },
  loadingDots: {
    color: palette.textSoft,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
  },
  // ===== 等待互动面板 =====
  waitingPanel: {
    position: "absolute",
    left: space.md,
    right: space.md,
    // 锚定在屏幕垂直中段（约 40% 处），让面板悬浮在对话区中部，
    // 不遮挡顶部状态栏与底部输入区。
    top: "40%",
    transform: [{ translateY: -40 }],
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderLeftWidth: 4,
    minHeight: 80,
    justifyContent: "center",
    zIndex: 80,
    ...shadow.lift,
  },
  waitingPanelAnchor: {
    // Modal 容器内 flex:1 占满全屏，承载蒙版与面板。
    flex: 1,
  },
  waitingPanelMask: {
    // 灰色蒙版：压暗悬浮面板下方的对话内容，突出面板主体。
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(74, 64, 57, 0.35)",
  },
  waitingPanelKnowledge: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderLeftColor: palette.peach,
  },
  waitingPanelQuote: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderLeftColor: palette.green,
  },
  waitingPanelLabel: {
    color: palette.primaryDark,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    marginBottom: 2,
    fontFamily,
  },
  waitingPanelText: {
    color: palette.text,
    fontSize: fontSize.body,
    lineHeight: 23,
    fontFamily,
  },
  insightLoadingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  insightLoadingText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    marginLeft: space.xs,
    fontFamily,
  },
  suggestionsBar: {
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    gap: 4,
  },
  suggestionChip: {
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.md,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 2,
  },
  suggestionText: {
    color: palette.text,
    fontSize: fontSize.body,
    lineHeight: 22,
    fontFamily,
  },
  suggestionRationale: {
    color: palette.green,
    fontSize: fontSize.caption,
    lineHeight: 18,
    marginTop: 3,
    fontFamily,
  },
  insightErrorBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  insightErrorText: {
    color: palette.clay,
    fontSize: fontSize.body,
    textAlign: "center",
    fontFamily,
  },
  artifactBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: palette.surfaceSoft,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  artifactBarLabel: {
    color: palette.textFaint,
    fontSize: fontSize.caption,
    marginRight: space.sm,
    fontFamily,
  },
  artifactBtn: {
    width: 76,
    height: 64,
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    justifyContent: "center",
    alignItems: "center",
    marginRight: space.xs,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: palette.border,
  },
  artifactBtnCooldown: {
    opacity: 0.5,
  },
  artifactBtnDisabled: {
    opacity: 0.35,
  },
  artifactIcon: {
    fontSize: fontSize.title,
    lineHeight: fontSize.title + 2,
    textAlign: "center",
  },
  artifactName: {
    color: palette.textSoft,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
    textAlign: "center",
    fontFamily,
  },
  cooldownText: {
    color: palette.clay,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    position: "absolute",
    top: 2,
    right: 4,
    fontFamily,
  },
  inputArea: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  input: {
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    color: palette.text,
    fontSize: fontSize.body,
    maxHeight: 70,
    borderWidth: 1,
    borderColor: palette.border,
    fontFamily,
  },
  inputButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
    gap: space.sm,
  },
  sendBtn: {
    flex: 1,
    backgroundColor: palette.primary,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    alignItems: "center",
    ...shadow.soft,
  },
  sendBtnDisabled: {
    backgroundColor: palette.surfaceSoft,
    shadowOpacity: 0,
  },
  sendBtnText: {
    color: palette.surface,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.semibold,
    fontFamily,
  },
  criticalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: space.xs,
    backgroundColor: "rgba(201, 123, 110, 0.85)",
    alignItems: "center",
  },
  criticalTitle: {
    color: palette.surface,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  criticalText: {
    color: palette.surface,
    fontSize: fontSize.caption,
    marginTop: 2,
    fontFamily,
  },
  // 胜利弹框
  modalOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(74, 64, 57, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 200,
  },
  // 胜利/失败底部横幅：不遮挡对话与顶部返回按钮，让用户先看完/展开科普点评再进入修复
  victoryBanner: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    zIndex: 200,
    alignItems: "center",
  },
  victoryBannerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderWidth: 1.5,
    borderColor: "rgba(224, 176, 132, 0.6)",
    ...shadow.lift,
    width: "100%",
    maxWidth: 460,
  },
  victoryBannerIcon: { fontSize: 30, marginRight: space.sm },
  victoryBannerTextWrap: { flex: 1, marginRight: space.sm },
  victoryBannerTitle: {
    color: palette.primaryDark,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  victoryBannerDesc: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    lineHeight: 18,
    marginTop: 2,
    fontFamily,
  },
  victoryBannerBtn: {
    backgroundColor: palette.primary,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  victoryBannerBtnText: {
    color: "#FFFFFF",
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    fontFamily,
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
    fontSize: 50,
    marginBottom: space.sm,
  },
  modalTitle: {
    color: palette.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    marginBottom: space.sm,
    fontFamily,
  },
  modalDesc: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: space.lg,
    fontFamily,
  },
  modalConfirmBtn: {
    paddingVertical: space.sm,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    ...shadow.soft,
  },
  modalConfirmText: {
    color: palette.surface,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.semibold,
    fontFamily,
  },

  // ===== 法器反馈弹框 =====
  artifactFeedbackOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  artifactFeedbackCard: {
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.primary,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
    alignItems: "center",
    minWidth: 200,
    ...shadow.lift,
  },
  artifactFeedbackIcon: {
    fontSize: 42,
    marginBottom: space.xs,
  },
  artifactFeedbackName: {
    color: palette.text,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    fontFamily,
    marginBottom: space.sm,
  },
  artifactFeedbackEffect: {
    color: palette.green,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    fontFamily,
    marginBottom: 4,
  },
  artifactFeedbackCooldown: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    fontFamily,
  },

  // ===== 回合结算弹框内数值行（复用法器弹框卡片样式） =====
  summaryRows: {
    alignSelf: "stretch",
    marginTop: space.xs,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  summaryRowLabel: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    fontFamily,
  },
  summaryRowValue: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    fontFamily,
    minWidth: 44,
    textAlign: "right",
  },
  summaryRowGood: {
    color: palette.green,
  },
  summaryRowBad: {
    color: palette.clay,
  },
});
