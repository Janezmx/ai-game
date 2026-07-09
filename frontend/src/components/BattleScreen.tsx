import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Animated,
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

// 打字机效果 Hook（仅对流式消息逐字输出，非流式直接返回全文）
function useTypewriter(text: string, speed = 30) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    if (!text) {
      setDisplayed("");
      indexRef.current = 0;
      return;
    }
    // 非流式消息：直接返回全文，跳过 setInterval
    if (speed >= 100) {
      setDisplayed(text);
      return;
    }
    // 如果 text 变长（新增 chunk），不重置指针，继续从当前位置打字
    if (indexRef.current >= text.length) {
      setDisplayed(text);
      return;
    }
    const timer = setInterval(() => {
      indexRef.current++;
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return displayed;
}

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

// 消息气泡
function MessageBubble({ msg, isStreaming }: { msg: DialogueMessage; isStreaming: boolean }) {
  const isPlayer = msg.role === "player";
  const typedContent = useTypewriter(msg.content, isPlayer ? 1 : 25);
  const [showWhy, setShowWhy] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const isLoading = isStreaming && !msg.content;

  useEffect(() => {
    if (msg.whyNote) {
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
  }, [msg.whyNote, fade]);

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
            {isStreaming ? typedContent : msg.content}
          </Text>
        )}

        {/* 每轮「为什么」科普点评：默认收起，降低认知负担 */}
        {!isPlayer && msg.whyNote && (
          <Animated.View style={[styles.whyNote, { opacity: fade }]}>
            <TouchableOpacity
              style={styles.whyHeader}
              onPress={() => setShowWhy((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.whyHeaderText}>💡 为什么这样操控？</Text>
              <Text style={styles.whyToggle}>{showWhy ? "收起 ▲" : "展开 ▼"}</Text>
            </TouchableOpacity>
            {showWhy && (
              <View style={styles.whyBody}>
                <Text style={styles.whyText}>{msg.whyNote}</Text>
                {msg.identificationTip ? (
                  <View style={styles.tipBox}>
                    <Text style={styles.tipLabel}>🔎 识别要点</Text>
                    <Text style={styles.tipText}>{msg.identificationTip}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </Animated.View>
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

// 第一轮玩家尚未发言时，后端还没生成 alternatives，按本关知识点（操控手法）动态生成「开口示范」兜底
const FALLBACK_OPENING: string[] = [
  "我理解你的出发点，但这件事我自己能做决定。",
  "谢谢关心，不过我的边界是我的，我希望你能尊重。",
  "我们可以继续聊，但请不要替我做判断或否定我的感受。",
];

// 逐条点评：与 LEVEL_KNOWLEDGE 的 healthyResponse 顺序一一对应，解释「为什么这句有效」
const OPENING_RATIONALE_MAP: Record<string, string[]> = {
  "kp-gaslight": [
    "先锚定自我感受的真实性，切断「你太敏感了」对判断的侵蚀。",
    "用具体事实回放替代空泛争论，让对方无法偷换你的记忆。",
    "把模糊否认变成可查证的共同回顾，瓦解煤气灯的模糊地带。",
  ],
  "kp-pua": [
    "把话题拉回事实层面，避免被情绪化贬低带偏。",
    "要求具体反馈，让「能力不行」这类笼统打压无处落脚。",
    "明确价值独立于单次评价，守住自我价值的底线。",
  ],
  "kp-family": [
    "承接关心再划边界，既不伤感情也不让孝道被利用。",
    "把爱与顺从解绑，点破「为你好」背后的控制。",
    "证明关心与坚持自我可并存，拒绝二选一的内疚陷阱。",
  ],
  "kp-network": [
    "主动补全语境，戳破截图被当「实锤」的误导性。",
    "拒绝陷入对线自证，避免被群体音量淹没。",
    "把应对转为保存证据与举报，掌握主动权。",
  ],
  "kp-bias": [
    "用客观产出回应「你真的适合吗」式的关怀质疑。",
    "直接点出双重标准，让微侵犯显形。",
    "反转举证责任，拒绝被预设要额外证明自己。",
  ],
};

// 无对应知识点时的通用轮换点评
const RATIONALE_TEMPLATES: string[] = [
  "先承接善意再明确决定权，避免被带节奏。",
  "温和而坚定地声明边界，是抵御操控的第一步。",
  "把对话拉回平等，阻止对方瓦解你的判断。",
];

function buildOpeningSuggestions(kp?: KnowledgePoint): { text: string; rationale: string }[] {
  const responses =
    kp?.healthyResponse && kp.healthyResponse.length > 0 ? kp.healthyResponse : FALLBACK_OPENING;
  const rationales = (kp?.id && OPENING_RATIONALE_MAP[kp.id]) || RATIONALE_TEMPLATES;
  return responses.slice(0, 3).map((text, i) => ({
    text,
    rationale: rationales[i] || RATIONALE_TEMPLATES[i] || "温和而坚定地守住边界。",
  }));
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

const MAX_TURNS = 10; // 最大回合数，超过后根据分数判定胜负

export default function BattleScreen({ onComplete, level }: BattleScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const store = useGameStore();
  const { conversation, sanctuary } = store;

  // 从配置中获取当前关卡信息
  const levelConfig: LevelConfig = LEVELS[level - 1] || LEVELS[0];

  // 随机选择一个场景（每关固定，不随重渲染改变）
  const [currentScenario] = useState(() => {
    const scenarios = levelConfig.scenarios;
    return scenarios[Math.floor(Math.random() * scenarios.length)];
  });

  // 本关知识点卡（后端生成版优先，兜底用静态）
  const knowledgePoint = store.currentKnowledgePoint || getLevelKnowledgePoint(level);
  const [showKp, setShowKp] = useState(false);

  // 本地状态
  const [inputText, setInputText] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [isNPCGenerating, setIsNPCGenerating] = useState(false);
  const [lastUsedArtifact, setLastUsedArtifact] = useState<Artifact | null>(null);
  const [stormMode, setStormMode] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isBattleStart, setIsBattleStart] = useState(true);
  const [showIntro, setShowIntro] = useState(true);
  const [showVictoryModal, setShowVictoryModal] = useState(false);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const [sseError, setSseError] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [artifactFeedback, setArtifactFeedback] = useState<{
    name: string;
    icon: string;
    effect: string;
    effectValue: number;
    cooldown: number;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const victoryTriggered = useRef(false);
  // 用 ref 追踪后端推送的最新数值（避免闭包过期）
  const latestValues = useRef({ npcControlLevel: conversation.npcControlLevel, playerResistance: conversation.playerResistance, turnCount: 0 });
  const lastTrapType = useRef("");
  const lastAlternatives = useRef<{ text: string; rationale: string }[]>([]);
  // 首轮建议：LLM 根据开场白生成的回复建议（与明辨铃生成的区分开）
  const openingAlternativesRef = useRef<{ text: string; rationale: string }[]>([]);
  // 保存 NPC 开场白，传给 chat 路由以建立连贯情境
  const openingLineRef = useRef("");
  // 明辨铃：记录激活时的回合数，用 useEffect 监听回合变化自动复位
  const insightActiveRef = useRef(false);
  const insightUsedTurnRef = useRef(-1);

  // 回合变化时自动关闭建议（下一轮）
  useEffect(() => {
    if (insightActiveRef.current && conversation.turnCount > insightUsedTurnRef.current) {
      insightActiveRef.current = false;
    }
  }, [conversation.turnCount]);

  // 自动滚动到底部
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [conversation.messages.length]);

  const addMessageWithId = useCallback(
    (msg: Omit<DialogueMessage, "id">) => {
      store.addMessage({ ...msg, id: makeMsgId() });
    },
    [store]
  );

  // 开始战斗 - 生成 NPC
  const startBattle = useCallback(async () => {
    if (!isBattleStart) return;
    setIsBattleStart(false);
    setIsNPCGenerating(true);

    // 记录本关场景前提
    store.setScenarioPremise(currentScenario);

    abortRef.current = new AbortController();

    try {
      const playerContext = `玩家心域状态：护盾${sanctuary.shieldHealth}%，已装备法器${sanctuary.equippedArtifacts.length}件。当前作战关卡：第${level}关「${levelConfig.title}」。`;
      await generateNPC(playerContext, 1, (event: SSEEvent) => {
        switch (event.type) {
          case "npc_name":
            store.setNpcName(event.data);
            break;
          case "npc_attack":
            if (event.data) {
              store.setNPCAttack(event.data);
              // 用 openingLine 作为 NPC 第一句攻击性对话
              if (event.data.openingLine) {
                openingLineRef.current = event.data.openingLine;
                addMessageWithId({
                  role: "npc",
                  content: event.data.openingLine,
                  timestamp: Date.now(),
                });
              }
              // 首轮建议：LLM根据开场白生成的回复建议
              if (event.data.openingAlternatives?.length) {
                openingAlternativesRef.current = event.data.openingAlternatives;
              }
            }
            break;
          case "knowledge_point":
            if (event.data) {
              store.setKnowledgePoint(event.data);
            }
            break;
          case "dialogue_chunk":
            // dialogue_chunk 是 personality/background 描述，不作为对话气泡显示
            break;
          case "done":
            setIsNPCGenerating(false);
            store.setPlayerTurn(true);
            playReceive();
            setShowIntro(false);
            break;
          case "error":
            console.error("NPC生成错误:", event.data);
            setSseError(String(event.data));
            setIsNPCGenerating(false);
            store.setPlayerTurn(true);
            setShowIntro(false);
            break;
        }
      }, abortRef.current.signal, level, currentScenario);
    } catch (err: any) {
      console.error("生成NPC失败:", err);
      setSseError(String(err.message || err));
      setIsNPCGenerating(false);
      store.setPlayerTurn(true);
      setShowIntro(false);
    }
  }, [isBattleStart, level, levelConfig, sanctuary, store, addMessageWithId, currentScenario]);

  // 发送玩家消息
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isWaiting || isSending) return;

    setInputText("");
    setIsSending(true);
    setIsWaiting(true);
    store.setPlayerTurn(false);
    playSend();

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
              store.updateLastMessage(event.data as string);
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
              lastTrapType.current = a.trapType || "";
              lastAlternatives.current = a.alternatives || [];
              console.log("[battle] assessment recv, alternatives:", a.alternatives?.length || 0, "turn:", conversation.turnCount);
              const msgs = conversation.messages;
              const npcMsg = msgs.length > 0 ? msgs[msgs.length - 1] : undefined;
              const playerMsg = msgs.length > 1 ? msgs[msgs.length - 2] : undefined;
              if (npcMsg && npcMsg.role === "npc") {
                // 把本轮「为什么」科普点评挂到这条 NPC 消息上，并收集到本关知识库
                if (a.whyNote) {
                  store.setLastMessageEducation(a.whyNote, a.identificationTip);
                  store.addWhyNote(a.whyNote);
                }
                const round: ReviewRound = {
                  npcMessage: { ...npcMsg, trapType: a.trapType, playerStatus: a.playerStatus, assessment: a.assessment, alternatives: a.alternatives, whyNote: a.whyNote, identificationTip: a.identificationTip },
                  playerMessage: playerMsg?.role === "player" ? playerMsg : undefined,
                  assessment: a,
                };
                store.addReviewRound(round);
                store.setDimensionScores(a.dimensions);
                const best = store.review.bestScores;
                store.setBestScores({
                  boundaryAwareness: Math.max(best.boundaryAwareness, a.dimensions.boundaryAwareness),
                  emotionalStability: Math.max(best.emotionalStability, a.dimensions.emotionalStability),
                  cognitiveClarity: Math.max(best.cognitiveClarity, a.dimensions.cognitiveClarity),
                  assertiveResponse: Math.max(best.assertiveResponse, a.dimensions.assertiveResponse),
                });
              }
              break;
            }
            case "done":
              setIsWaiting(false);
              setIsSending(false);
              store.setPlayerTurn(true);
              store.tickCooldowns();
              latestValues.current.turnCount++;
              store.incrementTurn();

              const vals = latestValues.current;

              // 到达最大回合数 → 根据分数判定胜负
              if (vals.turnCount >= MAX_TURNS) {
                if (vals.npcControlLevel < 50) {
                  setShowVictoryModal(true);
                } else {
                  setShowGameOverModal(true);
                }
                break;
              }

              if (vals.playerResistance < 20) {
                store.setCritical(true);
                const newCountdown = conversation.criticalCountdown - 1;
                store.setCriticalCountdown(newCountdown);
                if (newCountdown <= 0) {
                  setShowVictoryModal(false);
                  setShowGameOverModal(true);
                }
              }
              if (vals.playerResistance <= 0 || vals.npcControlLevel >= 100) {
                setShowVictoryModal(false);
                setShowGameOverModal(true);
              }
              break;
            case "error":
              console.error("对话错误:", event.data);
              setSseError(String(event.data));
              setIsWaiting(false);
              setIsSending(false);
              store.setPlayerTurn(true);
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
        }
      );
      setLastUsedArtifact(null); // 法器信息已发送，清除
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("对话请求失败:", err);
        setSseError(String(err.message || err));
      }
      setIsWaiting(false);
      setIsSending(false);
      store.setPlayerTurn(true);
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
    lastUsedArtifact,
  ]);

  // 使用法器
  const handleUseArtifact = useCallback(
    async (artifact: Artifact) => {
      if (artifact.remainingCooldown > 0 || isWaiting) return;

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
          setInsightLoading(true);
          lastAlternatives.current = []; // 清空旧建议，等 API 返回

          // 构建当前对话上下文发送给洞察 API
          const ctxMessages = conversation.messages.map((m) => ({
            role: (m.role === "player" ? "user" : "assistant") as "user" | "assistant" | "system",
            content: m.content,
          }));

          fetchInsight(ctxMessages, (event: SSEEvent) => {
            if (event.type === "alternatives" && Array.isArray(event.data)) {
              lastAlternatives.current = event.data;
              setInsightLoading(false);
              // 强制触发 React 重渲染以显示建议
              store.setPlayerTurn(conversation.isPlayerTurn);
            } else if (event.type === "error") {
              setInsightLoading(false);
            }
          }).catch(() => {
            setInsightLoading(false);
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
        cooldown: artifact.maxCooldown,
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

  // 跳过战斗阶段
  const handleSkip = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    onComplete?.(false);
  }, [onComplete]);

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
    }
  }, [conversation.npcControlLevel, conversation.turnCount, isBattleStart, isNPCGenerating, store, addMessageWithId]);

  // 开局自动开始
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startBattle();

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 已装备的法器
  const equippedArtifacts = sanctuary.equippedArtifacts;

  // 胜利/失败 音效
  useEffect(() => { if (showVictoryModal) playVictory(); }, [showVictoryModal]);
  useEffect(() => { if (showGameOverModal) playDamage(); }, [showGameOverModal]);

  // NPC 回复时自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 50);
    }
  }, [conversation.messages.length, isWaiting]);

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
        🎯 NPC操控归零即胜 | 满10回合操控&lt;50即胜 | 抵抗归零则败
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
            onPress={() => { setSseError(null); setIsBattleStart(true); startBattle(); }}
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
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        showsVerticalScrollIndicator={true}
      >
        {conversation.messages.length === 0 && isNPCGenerating && (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>🎭 操控型NPC正在生成...</Text>
          </View>
        )}

        {conversation.messages.map((msg, idx) => (
          <MessageBubble
            key={`${idx}-${msg.timestamp}`}
            msg={msg}
            isStreaming={
              idx === conversation.messages.length - 1 &&
              msg.role === "npc" &&
              isWaiting
            }
          />
        ))}
      </ScrollView>

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

      {/* 建议回复选项 */}
      {showSuggestions && (
        <View style={styles.suggestionsBar}>
          {suggestionList.filter((alt) => alt?.text).slice(0, 3).map((alt, i) => (
            <TouchableOpacity
              key={i}
              style={styles.suggestionChip}
              onPress={() => { setInputText(alt.text); }}
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
            isWaiting
              ? "NPC正在回应..."
              : isNPCGenerating
              ? "NPC生成中..."
              : `回应${conversation.npcName || "NPC"}...`
          }
          placeholderTextColor={palette.textFaint}
          editable={!isWaiting && !isNPCGenerating && conversation.isPlayerTurn}
          multiline
          maxLength={500}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={(e) => { handleSend(); }}
        />
        <View style={styles.inputButtons}>
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || isWaiting || isNPCGenerating || !conversation.isPlayerTurn) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isWaiting || isNPCGenerating || !conversation.isPlayerTurn}
            activeOpacity={0.8}
            accessibilityLabel="发送消息"
            accessibilityRole="button"
          >
            <Text style={styles.sendBtnText}>发送</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSkip} activeOpacity={0.6} accessibilityLabel="跳过当前关卡" accessibilityRole="button" style={styles.skipLinkWrap}>
            <Text style={styles.skipLink}>跳过</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 迷雾效果已隐藏：效果不明显，先不渲染（状态逻辑保留，后续可恢复）
      <View
        style={[
          styles.fogOverlay,
          {
            pointerEvents: "none",
            opacity: useMemo(
              () =>
                Math.min(
                  0.85,
                  (sanctuary.fogDensity / 100) * 1.0 + (stormMode ? 0.12 : 0)
                ),
              [sanctuary.fogDensity, stormMode]
            ),
          },
        ]}
      />
      */}

      {/* 临界状态覆盖 */}
      {conversation.isCritical && (
        <View style={styles.criticalOverlay}>
          <Text style={styles.criticalTitle}>⚠️ 心域临界</Text>
          <Text style={styles.criticalText}>
            你的抵抗正在崩溃！剩余 {conversation.criticalCountdown} 回合
          </Text>
        </View>
      )}

      {/* 失败弹框 */}
      {showGameOverModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalIcon}>💔</Text>
            <Text style={[styles.modalTitle, { color: palette.clay }]}>心域失守</Text>
            <Text style={styles.modalDesc}>
              {conversation.criticalCountdown <= 0
                ? "你的抵抗在持续的侵蚀下彻底崩溃了。"
                : "你的心域边界已被NPC完全渗透。"}
              {"\n"}需要进行修复来恢复。
            </Text>
            <TouchableOpacity
              style={[styles.modalConfirmBtn, { backgroundColor: palette.clay }]}
              onPress={() => {
                setShowGameOverModal(false);
                onComplete?.(false);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.modalConfirmText}>进入修复</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 胜利确认弹框 */}
      {showVictoryModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalIcon}>🏆</Text>
            <Text style={styles.modalTitle}>守护成功</Text>
            <Text style={styles.modalDesc}>
              你成功抵御了{conversation.npcName}的心理操控！{'\n'}
              是时候修复受损的心域边界了。
            </Text>
            <TouchableOpacity
              style={[styles.modalConfirmBtn, { backgroundColor: palette.primary }]}
              onPress={() => {
                setShowVictoryModal(false);
                onComplete?.(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.modalConfirmText}>进入修复</Text>
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
              ⏳ 冷却 {artifactFeedback.cooldown} 回合
            </Text>
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
    maxWidth: 500,
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
  },
  shieldEmoji: {
    fontSize: 20,
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
    lineHeight: 22,
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
    lineHeight: 22,
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
    overflowY: "auto",
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
    lineHeight: 22,
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
  whyNote: {
    marginTop: space.sm,
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.sm,
    padding: space.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  whyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  whyHeaderText: {
    color: palette.primaryDark,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    fontFamily,
  },
  whyToggle: {
    color: palette.textFaint,
    fontSize: fontSize.caption,
    fontFamily,
  },
  whyBody: {
    marginTop: space.xs,
  },
  whyText: {
    color: palette.text,
    fontSize: fontSize.body,
    lineHeight: 22,
    fontFamily,
  },
  tipBox: {
    marginTop: space.xs,
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    padding: space.sm,
    borderLeftWidth: 3,
    borderLeftColor: palette.peach,
  },
  tipLabel: {
    color: palette.primaryDark,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    fontFamily,
    marginBottom: 2,
  },
  tipText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    lineHeight: 20,
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
    lineHeight: 20,
    fontFamily,
  },
  suggestionRationale: {
    color: palette.green,
    fontSize: fontSize.caption,
    lineHeight: 16,
    marginTop: 3,
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
    width: 68,
    height: 56,
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    justifyContent: "center",
    alignItems: "center",
    marginRight: space.xs,
    padding: 4,
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
    width: fontSize.title,
    textAlign: "center",
  },
  artifactName: {
    color: palette.textSoft,
    fontSize: 8,
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
  skipLinkWrap: {
    paddingVertical: space.sm,
    paddingHorizontal: 4,
  },
  skipLink: {
    color: palette.textFaint,
    fontSize: fontSize.caption,
    fontFamily,
  },
  fogOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgb(110, 78, 70)",
    zIndex: 50,
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
    fontSize: 48,
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
    lineHeight: 22,
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
    fontSize: 40,
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
});
