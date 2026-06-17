import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useGameStore } from "../store/gameStore";
import { chatWithNPC, generateNPC, SSEEvent } from "../api/sse";
import { DialogueMessage, ArtifactType, Artifact, GamePhase, PlantStatus, LevelConfig, LEVELS } from "@aigame/shared";
import HeartDomainMini from "./HeartDomainMini";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// 打字机效果 Hook
function useTypewriter(text: string, speed = 30) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!text) {
      setDisplayed("");
      return;
    }
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return displayed;
}

// 生成消息ID
function makeMsgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// 消息气泡
function MessageBubble({ msg, isStreaming }: { msg: DialogueMessage; isStreaming: boolean }) {
  const isPlayer = msg.role === "player";
  const typedContent = useTypewriter(msg.content, isPlayer ? 1 : 25);

  return (
    <View
      style={[
        styles.bubbleRow,
        isPlayer ? styles.playerRow : styles.npcRow,
      ]}
    >
      {!isPlayer && (
        <View style={styles.npcAvatar}>
          <Text style={styles.npcAvatarText}>{"👾"}</Text>
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isPlayer ? styles.playerBubble : styles.npcBubble,
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            isPlayer ? styles.playerText : styles.npcText,
          ]}
        >
          {isStreaming ? typedContent : msg.content}
          {isStreaming && <Text style={styles.cursor}>|</Text>}
        </Text>
      </View>
      {isPlayer && (
        <View style={styles.playerAvatar}>
          <Text style={styles.playerAvatarText}>{"🧘"}</Text>
        </View>
      )}
    </View>
  );
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
      style={[
        styles.artifactBtn,
        onCooldown && styles.artifactBtnCooldown,
        disabled && styles.artifactBtnDisabled,
      ]}
      onPress={() => onUse(artifact)}
      disabled={onCooldown || disabled}
    >
      <Text style={styles.artifactIcon}>{getIcon(artifact.type)}</Text>
      <Text style={styles.artifactName} numberOfLines={1}>
        {artifact.name}
      </Text>
      {onCooldown && (
        <Text style={styles.cooldownText}>{artifact.remainingCooldown}</Text>
      )}
    </TouchableOpacity>
  );
}

// 状态条
function StatusBarView({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: string;
}) {
  return (
    <View style={styles.statusBar}>
      <Text style={styles.statusIcon}>{icon}</Text>
      <View style={styles.statusBarTrack}>
        <View
          style={[
            styles.statusBarFill,
            {
              width: `${value}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
      <Text style={styles.statusLabel}>
        {label}: {Math.round(value)}
      </Text>
    </View>
  );
}

// ==================== 主组件 ====================

interface BattleScreenProps {
  onComplete?: (victory: boolean) => void;
  level: number;
}

export default function BattleScreen({ onComplete, level }: BattleScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const store = useGameStore();
  const { conversation, sanctuary } = store;

  // 从配置中获取当前关卡信息
  const levelConfig: LevelConfig = LEVELS[level - 1] || LEVELS[0];

  // 本地状态
  const [inputText, setInputText] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [isNPCGenerating, setIsNPCGenerating] = useState(false);
  const [activeArtifactType, setActiveArtifactType] = useState<ArtifactType | null>(null);
  const [stormMode, setStormMode] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isBattleStart, setIsBattleStart] = useState(true);
  const [showIntro, setShowIntro] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

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

    abortRef.current = new AbortController();

    try {
      const playerContext = `玩家心域状态：护盾${sanctuary.shieldHealth}%，植物${sanctuary.plants.length}株。当前作战关卡：第${level}关「${levelConfig.title}」。`;
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
                addMessageWithId({
                  role: "npc",
                  content: event.data.openingLine,
                  timestamp: Date.now(),
                });
              }
            }
            break;
          case "dialogue_chunk":
            // dialogue_chunk 是 personality/background 描述，不作为对话气泡显示
            break;
          case "done":
            setIsNPCGenerating(false);
            store.setPlayerTurn(true);
            setShowIntro(false);
            break;
          case "error":
            console.error("NPC生成错误:", event.data);
            setIsNPCGenerating(false);
            store.setPlayerTurn(true);
            setShowIntro(false);
            break;
        }
      }, abortRef.current.signal, level);
    } catch (err) {
      console.error("生成NPC失败:", err);
      setIsNPCGenerating(false);
      store.setPlayerTurn(true);
      setShowIntro(false);
    }
  }, [isBattleStart, level, levelConfig, sanctuary, store, addMessageWithId]);

  // 发送玩家消息
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isWaiting || isSending) return;

    setInputText("");
    setIsSending(true);
    setIsWaiting(true);
    store.setPlayerTurn(false);

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
              break;
            case "shield_damage":
              store.setPlayerResistance(event.data);
              if (event.data < 30) {
                setStormMode(true);
              }
              break;
            case "plant_status":
              if (sanctuary.plants.length > 0) {
                const plant = sanctuary.plants[Math.floor(Math.random() * sanctuary.plants.length)];
                store.setPlantStatus(plant.id, PlantStatus.Shaking);
              }
              break;
            case "done":
              setIsWaiting(false);
              setIsSending(false);
              store.setPlayerTurn(true);
              store.tickCooldowns();
              store.incrementTurn();
              if (conversation.playerResistance < 20) {
                store.setCritical(true);
                store.setCriticalCountdown(conversation.criticalCountdown - 1);
              }
              if (conversation.playerResistance <= 0 || conversation.npcControlLevel >= 100) {
                store.setGameOver(false);
              }
              break;
            case "error":
              console.error("对话错误:", event.data);
              setIsWaiting(false);
              setIsSending(false);
              store.setPlayerTurn(true);
              break;
          }
        },
        undefined,
        abortRef.current.signal,
        {
          level,
          levelTitle: levelConfig.title,
          levelSubtitle: levelConfig.subtitle,
          levelNpcRole: levelConfig.npcRole,
          levelTactics: levelConfig.tactics.join("、"),
        }
      );
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("对话请求失败:", err);
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
  ]);

  // 使用法器
  const handleUseArtifact = useCallback(
    async (artifact: Artifact) => {
      if (artifact.remainingCooldown > 0 || isWaiting) return;

      store.useArtifact(artifact.id);
      setActiveArtifactType(artifact.type);
      setTimeout(() => setActiveArtifactType(null), 1500);

      // 根据法器类型产生不同效果
      switch (artifact.type) {
        case ArtifactType.Shield:
          store.setPlayerResistance(conversation.playerResistance + 15);
          break;
        case ArtifactType.Mirror:
          store.setNpcControlLevel(conversation.npcControlLevel - 10);
          break;
        case ArtifactType.Spear:
          store.setNpcControlLevel(conversation.npcControlLevel - 20);
          break;
      }

      addMessageWithId({
        role: "player",
        content: `🧿 [使用法器] ${artifact.name}`,
        timestamp: Date.now(),
      });

      // 法器使用后，增加迷雾密度（NPC反击）
      store.setFogDensity(sanctuary.fogDensity + 5);

      // 如果迷雾太浓，植物开始受影响
      if (sanctuary.fogDensity > 60 && sanctuary.plants.length > 0) {
        const idx = Math.floor(Math.random() * sanctuary.plants.length);
        const target = sanctuary.plants[idx];
        if (target.status === PlantStatus.Healthy) {
          store.setPlantStatus(target.id, PlantStatus.Shaking);
        } else if (target.status === PlantStatus.Shaking) {
          store.setPlantStatus(target.id, PlantStatus.Defoliated);
        }
      }
    },
    [isWaiting, conversation, sanctuary, store, addMessageWithId]
  );

  // 跳过战斗阶段
  const handleSkip = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    store.setPhase(GamePhase.AftermathRepair);
    onComplete?.(false);
  }, [store, onComplete]);

  // 战斗胜利条件：NPC 控制等级降为 0
  useEffect(() => {
    if (
      conversation.npcControlLevel <= 0 &&
      !isBattleStart &&
      !isNPCGenerating &&
      conversation.turnCount > 1
    ) {
      addMessageWithId({
        role: "player",
        content: "✨ 你成功抵御了NPC的侵蚀！心域边界暂得安宁。",
        timestamp: Date.now(),
      });
      setStormMode(false);
      setTimeout(() => {
        store.setGameOver(true);
        onComplete?.(true);
      }, 2000);
    }
  }, [conversation.npcControlLevel, conversation.turnCount, isBattleStart, isNPCGenerating, store, addMessageWithId, onComplete]);

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

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* 关卡标题横幅 */}
      <View style={[styles.levelBanner, { paddingTop: insets.top + 4 }]}>
        <Text style={styles.levelLabel}>
          第 {level}/{store.totalLevels} 关
        </Text>
        <Text style={styles.levelTitle}>{levelConfig.title}</Text>
        <Text style={styles.levelSubtitle}>{levelConfig.subtitle}</Text>
        <Text style={styles.levelRole}>{levelConfig.npcRole}</Text>
      </View>

      <View style={[styles.header]}>
        {/* 心域缩略图 */}
        <HeartDomainMini
          size={44}
          activeArtifactType={activeArtifactType}
          stormMode={stormMode}
        />

        {/* 状态栏 */}
        <View style={styles.statusContainer}>
          <StatusBarView
            label="抵抗值"
            value={conversation.playerResistance}
            color="#4fc3f7"
            icon="🛡️"
          />
          <StatusBarView
            label="NPC操控"
            value={conversation.npcControlLevel}
            color="#ef5350"
            icon="⚡"
          />
        </View>

        {/* 回合 */}
        <Text style={styles.turnText}>回合 {conversation.turnCount}</Text>
      </View>

      {/* NPC名称 */}
      {conversation.npcName && (
        <View style={styles.npcTitleBar}>
          <Text style={styles.npcTitleIcon}>👾</Text>
          <Text style={styles.npcTitleText}>{conversation.npcName}</Text>
          {isNPCGenerating && (
            <Text style={styles.npcLoading}>召唤中...</Text>
          )}
        </View>
      )}

      {/* 新手引导面板 */}
      {showIntro && !isNPCGenerating && (
        <View style={styles.introBanner}>
          <Text style={styles.introTitle}>💡 新手提示</Text>
          <Text style={styles.introText}>
            当前NPC擅长「{levelConfig.tactics.join("、")}」等操控手法。
            在输入框中回应NPC的对话，使用法器抵御侵蚀。
            当NPC操控等级降至0即为胜利！
          </Text>
        </View>
      )}

      {/* 对话区域 */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
      >
        {conversation.messages.length === 0 && isNPCGenerating && (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>👾 操控型NPC正在生成...</Text>
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
          placeholderTextColor="#666"
          editable={!isWaiting && !isNPCGenerating && conversation.isPlayerTurn}
          multiline
          maxLength={500}
        />
        <View style={styles.inputButtons}>
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || isWaiting || isNPCGenerating || !conversation.isPlayerTurn) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isWaiting || isNPCGenerating || !conversation.isPlayerTurn}
          >
            <Text style={styles.sendBtnText}>发送</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
            <Text style={styles.skipBtnText}>跳过 →</Text>
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0d1a",
  },
  levelBanner: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#1a1a2e",
    borderBottomWidth: 1,
    borderBottomColor: "#7c4dff33",
  },
  levelLabel: {
    color: "#7c4dff",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
  },
  levelTitle: {
    color: "#b388ff",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 2,
  },
  levelSubtitle: {
    color: "#9575cd",
    fontSize: 12,
    marginTop: 1,
  },
  levelRole: {
    color: "#7c4dff",
    fontSize: 11,
    marginTop: 2,
    fontStyle: "italic",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#1a1a2e",
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a4a",
  },
  statusContainer: {
    flex: 1,
    marginLeft: 8,
    gap: 3,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusIcon: {
    fontSize: 11,
  },
  statusBarTrack: {
    flex: 1,
    height: 5,
    backgroundColor: "#2a2a4a",
    borderRadius: 3,
    overflow: "hidden",
  },
  statusBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  statusLabel: {
    color: "#aaa",
    fontSize: 9,
    width: 55,
    textAlign: "right",
  },
  turnText: {
    color: "#888",
    fontSize: 11,
    marginLeft: 6,
  },
  introBanner: {
    marginHorizontal: 12,
    marginTop: 6,
    padding: 10,
    backgroundColor: "#1a2a3a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#4fc3f733",
  },
  introTitle: {
    color: "#4fc3f7",
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 4,
  },
  introText: {
    color: "#b0d4e8",
    fontSize: 12,
    lineHeight: 18,
  },
  npcTitleBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#1a1a2e",
    borderBottomWidth: 1,
    borderBottomColor: "#ef535033",
  },
  npcTitleIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  npcTitleText: {
    color: "#ef5350",
    fontSize: 15,
    fontWeight: "bold",
  },
  npcLoading: {
    color: "#888",
    fontSize: 11,
    marginLeft: 6,
    fontStyle: "italic",
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: 16,
    paddingBottom: 8,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  loadingText: {
    color: "#888",
    fontSize: 14,
  },
  bubbleRow: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "flex-end",
  },
  playerRow: {
    justifyContent: "flex-end",
  },
  npcRow: {
    justifyContent: "flex-start",
  },
  npcAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#2a1a1a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  npcAvatarText: {
    fontSize: 14,
  },
  playerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#1a1a3a",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  playerAvatarText: {
    fontSize: 14,
  },
  bubble: {
    maxWidth: "70%",
    padding: 10,
    borderRadius: 12,
  },
  playerBubble: {
    backgroundColor: "#1a3a5c",
    borderBottomRightRadius: 4,
  },
  npcBubble: {
    backgroundColor: "#2a1a2e",
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  playerText: {
    color: "#b3d9ff",
  },
  npcText: {
    color: "#e0b3e0",
  },
  cursor: {
    color: "#7c7cff",
    fontWeight: "bold",
  },
  artifactBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: "#1a1a2e",
    borderTopWidth: 1,
    borderTopColor: "#2a2a4a",
  },
  artifactBarLabel: {
    color: "#666",
    fontSize: 10,
    marginRight: 6,
  },
  artifactBtn: {
    width: 68,
    height: 56,
    backgroundColor: "#2a2a4a",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
    padding: 4,
  },
  artifactBtnCooldown: {
    opacity: 0.5,
  },
  artifactBtnDisabled: {
    opacity: 0.3,
  },
  artifactIcon: {
    fontSize: 18,
  },
  artifactName: {
    color: "#ccc",
    fontSize: 8,
    marginTop: 2,
    textAlign: "center",
  },
  cooldownText: {
    color: "#ff6b6b",
    fontSize: 16,
    fontWeight: "bold",
    position: "absolute",
    top: 2,
    right: 4,
  },
  inputArea: {
    paddingHorizontal: 12,
    paddingTop: 6,
    backgroundColor: "#1a1a2e",
    borderTopWidth: 1,
    borderTopColor: "#2a2a4a",
  },
  input: {
    backgroundColor: "#0d0d1a",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#ccc",
    fontSize: 14,
    maxHeight: 70,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  inputButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
    gap: 8,
  },
  sendBtn: {
    flex: 1,
    backgroundColor: "#4a6fa5",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "#2a3a5a",
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  skipBtn: {
    backgroundColor: "#2a2a4a",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  skipBtnText: {
    color: "#888",
    fontSize: 13,
  },
  criticalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 6,
    backgroundColor: "#ef5350cc",
    alignItems: "center",
  },
  criticalTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  criticalText: {
    color: "#fff",
    fontSize: 12,
    marginTop: 2,
  },
});