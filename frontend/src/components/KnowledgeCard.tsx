import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { KnowledgePoint } from "@aigame/shared";
import { palette, radius, space, fontSize, fontWeight, fontFamily, shadow } from "../theme";

/** 知识点 ID → emoji 映射，全站统一使用 */
export const TRAP_EMOJI_MAP: Record<string, string> = {
  "kp-gaslight": "💡",
  "kp-pua": "💼",
  "kp-family": "👨‍👩‍👧",
  "kp-network": "👾",
  "kp-bias": "🎭",
};

// ==================== 5 关静态知识点兜底 ====================
// 后端 NPC 生成时会产生更贴合案例的版本（含真实案例故事）覆盖 currentKnowledgePoint；
// 此处作为兜底，保证准备页/成长页在无网络或未生成时也有教育内容。
export const LEVEL_KNOWLEDGE: Record<number, KnowledgePoint> = {
  1: {
    id: "kp-gaslight",
    tactic: "煤气灯操控",
    definition: "操控者通过否认你的记忆、感受和事实，让你怀疑自己的判断力，逐渐失去对现实的掌控。",
    signals: [
      "对方常说「你太敏感了」「你记错了」",
      "你的真实感受被说成是「想太多」",
      "事情发生后对方改口否认说过的话",
      "你开始频繁自我怀疑、反复查证记忆",
    ],
    nonSignals: [
      "对方承认「这次是我记错了」，并愿意一起翻聊天记录或其他记录",
      "对方说「我当时是这么想的」，而你们确实只是理解不同，他也承认自己讲得不清楚",
      "对方解释迟到是因为睡过头，并给出下次的具体做法，没有反过来指责你太计较",
      "对方在你表达不满后，问的是「你希望我以后怎么做」，而不是「你怎么又敏感了」",
    ],
    confirmationPrompts: [
      "我想先确认一下：你是不记得那件事，还是我说得不够清楚？我们对着记录看一下。",
      "我刚才有点被绕晕了。你先告诉我，这件事你记得的版本是什么。",
      "如果是我记错了，我愿意改；如果是我们记的不一样，那就把事实摆出来看。",
    ],
    healthyResponse: [
      "我可以确认自己的感受是真实的，不需要你来证明",
      "我记得很清楚，我们当时说的是……",
      "如果你不记得，我们可以一起看聊天记录",
    ],
    caseStory:
      "小柔的男友总在她提出不满时说「你又敏感了」。久而久之她不敢表达，直到朋友提醒：你的感受没有错，错的是否认。",
  },
  2: {
    id: "kp-pua",
    tactic: "职场打压",
    definition: "上级或同事以「为你好」之名持续贬低你的能力与价值，瓦解自信，让你安于被压榨。",
    signals: [
      "拿你和别人比较来否定你",
      "把正常失误放大成「能力不行」",
      "用职位权威堵住你的反驳",
      "让你觉得离开这里就找不到更好的",
    ],
    nonSignals: [
      "上司指出方案的具体问题（哪一页、哪个数据、哪句结论），并说明可以怎么改",
      "评价只针对这次的产出，没有顺带评价你这个人「行不行」",
      "明确说明晋升落选是因为哪一项没达标，并给出时间和资源让你补",
      "你提出异议后，他没有因此改变对你的态度，也没有暗示你「态度有问题」",
    ],
    confirmationPrompts: [
      "我想确认一下：你说的是这次方案的哪一部分？具体哪一页，我照着改。",
      "这类评价我听得进去，但我想知道评判的标准是什么，我好对着补。",
      "我可以接受这次不晋升。你能告诉我差在哪一项吗？我按这个来。",
    ],
    healthyResponse: [
      "这是我基于事实的判断，我们可以就事论事",
      "我希望得到具体可改进的反馈，而不是笼统否定",
      "我的价值不取决于一次评价",
    ],
    caseStory:
      "阿杰的方案被当众说成「毫无逻辑」，同事私下却觉得很好。他后来学会区分「批评」与「打压」。",
  },
  3: {
    id: "kp-family",
    tactic: "亲情绑架",
    definition: "家人以爱、牺牲与孝道为名，用内疚感迫使你服从，边界被「为你好」悄悄侵蚀。",
    signals: [
      "常说「我为你付出这么多」",
      "不听话就等于「不孝」「不懂事」",
      "用健康或情绪要挟你的选择",
      "拿你与「别人家孩子」比较",
    ],
    nonSignals: [
      "父母表达想念和期待，但接受你今年不回家的决定",
      "明确说「我希望你考公，但这是你的选择」，没有把选择与孝不孝顺挂钩",
      "提出请求时说明「不方便也没关系」，你拒绝后不再追着问原因",
      "你说了难处之后，讨论的是折中方案，而不是反复强调过去为你牺牲了多少",
    ],
    confirmationPrompts: [
      "我知道你们是担心我。我们先说清楚：这件事你们希望我做到哪一步？",
      "我理解你的心情，但我需要先确认——如果我这次真的不回去，你们会怎么想？",
      "我不是不愿意帮，我想先弄清楚这笔钱具体用在哪，我们再决定怎么给。",
    ],
    healthyResponse: [
      "我理解你的关心，但这是我自己的人生决定",
      "爱不等于要我放弃边界",
      "我可以关心你，也可以坚持自己的选择",
    ],
    caseStory:
      "晓雯被父母以「我们白养你了」逼迫考公。她最终明白：孝顺不是丧失自我，而是彼此尊重。",
  },
  4: {
    id: "kp-network",
    tactic: "网络围攻",
    definition: "匿名的群体以标签、谣言与围攻对你进行去人格化攻击，利用从众压力制造孤立。",
    signals: [
      "大量陌生账号同时攻击你",
      "断章取义的截图被当成「实锤」",
      "你被贴上负面标签难以撕掉",
      "反对的声音被音量淹没",
    ],
    nonSignals: [
      "有人就事论事地反对你的观点，不给你贴身份标签，也不号召别人一起上",
      "有人指出你上一条表达得不够清楚，并说明他理解成了什么",
      "批评针对具体内容，不针对你的人格、外貌或私生活",
      "你说「这是我理解错了」之后，对方就停下了，没有继续追打",
    ],
    confirmationPrompts: [
      "我先确认一下你说的是哪一条内容，我把上下文补全，你再判断。",
      "你可以不同意我的观点，但我想知道你是针对这句话，还是针对我这个人。",
      "我愿意改表达，但我不接受这种骂法。我们把具体那一句拿出来说。",
    ],
    healthyResponse: [
      "这是断章取义，我可以提供完整上下文",
      "标签不能定义我，我不为网暴自证",
      "我会保护隐私，必要时截图举报",
    ],
    caseStory:
      "一条吐槽被截图传播后，小雨遭群嘲。她学会：面对网暴，先保存证据，再冷处理，不陷入对线。",
  },
  5: {
    id: "kp-bias",
    tactic: "偏见伪装",
    definition: "以「善意」「专业」包装的微妙偏见，用预设与双重标准悄悄低估你的能力。",
    signals: [
      "用「你真的适合吗」式关怀质疑",
      "标准对你更严苛、对别人更宽松",
      "把你的成就归因于运气",
      "你总被要求额外「证明自己」",
    ],
    nonSignals: [
      "面试官说明这个岗位的硬性要求（年限、技能、语言），并明确你不符合哪一条",
      "对方指出的是具体不足（某项技能不熟），而不是含糊地说「怕你适应不了」",
      "决定理由透明：标准是什么、你排在哪、差多远，都说得出来",
      "你问「这个标准对所有人一致吗」之后，对方愿意回答或修正，而不是觉得你太敏感",
    ],
    confirmationPrompts: [
      "我想先确认，这个岗位的硬性要求是哪几条？我看看我差在哪。",
      "如果标准是对所有人一样的，请问我这一项和别人的差距具体是什么？",
      "我不是拒绝被评估，我只是想知道评估用的是什么标准。",
    ],
    healthyResponse: [
      "我用作品和结果说话，欢迎就事论事",
      "请用同一把尺子衡量所有人",
      "我的能力不需要先证伪",
    ],
    caseStory:
      "面试中，琳被反复追问「如何平衡家庭」，而男候选人没有。她意识到：这是微侵犯，不是关心。",
  },
};

export function getLevelKnowledgePoint(level: number): KnowledgePoint {
  return LEVEL_KNOWLEDGE[Math.min(5, Math.max(1, level))] || LEVEL_KNOWLEDGE[1];
}

// ==================== 组件 ====================
export default function KnowledgeCard({
  kp,
  compact = false,
}: {
  kp: KnowledgePoint;
  compact?: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>📖 知识点</Text>
        </View>
        <Text style={styles.tactic}>{kp.tactic}</Text>
      </View>

      <Text style={styles.definition}>{kp.definition}</Text>

      {!compact && (
        <>
          <Text style={styles.sectionLabel}>🔍 识别信号</Text>
          {kp.signals.map((s, i) => (
            <View key={`s${i}`} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{s}</Text>
            </View>
          ))}

          {/* 与"识别信号"成对呈现：只给信号会让人见谁都像操控者，给出反例才有辨别力 */}
          {kp.nonSignals?.length ? (
            <>
              <Text style={styles.sectionLabel}>⚠️ 这些不算操控</Text>
              {kp.nonSignals.map((s, i) => (
                <View key={`n${i}`} style={styles.bulletRow}>
                  <Text style={styles.bulletDotSafe}>✓</Text>
                  <Text style={styles.bulletText}>{s}</Text>
                </View>
              ))}
            </>
          ) : null}

          {kp.confirmationPrompts?.length ? (
            <>
              <Text style={styles.sectionLabel}>⏸ 先确认，再反击</Text>
              <Text style={styles.sectionHint}>
                先要具体（哪件事、哪句话）→ 再说感受（我听到的是…）→ 最后定边界。
              </Text>
              {kp.confirmationPrompts.map((s, i) => (
                <View key={`c${i}`} style={styles.bulletRow}>
                  <Text style={styles.bulletDotAsk}>✓</Text>
                  <Text style={styles.bulletText}>{s}</Text>
                </View>
              ))}
            </>
          ) : null}

          <Text style={styles.sectionLabel}>💬 健康应对</Text>
          {kp.healthyResponse.map((h, i) => (
            <View key={`h${i}`} style={styles.bulletRow}>
              <Text style={styles.bulletDotGreen}>✓</Text>
              <Text style={styles.bulletText}>{h}</Text>
            </View>
          ))}

          {kp.caseStory ? (
            <>
              <Text style={styles.sectionLabel}>📝 真实案例</Text>
              <Text style={styles.caseText}>{kp.caseStory}</Text>
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: space.lg,
    ...shadow.soft,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: space.sm,
  },
  badge: {
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginRight: space.sm,
  },
  badgeText: {
    color: palette.primaryDark,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  tactic: {
    color: palette.text,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  definition: {
    color: palette.text,
    fontSize: fontSize.body,
    lineHeight: 24,
    marginTop: space.xs,
  },
  sectionLabel: {
    color: palette.primaryDark,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.semibold,
    marginTop: space.md,
    marginBottom: space.xs,
    fontFamily,
  },
  /** 栏目标题下的一句方法说明（如"先要具体 → 再说感受 → 最后定边界"） */
  sectionHint: {
    color: palette.textFaint,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: space.xs,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: space.xs,
  },
  bulletDot: {
    color: palette.clay,
    fontSize: fontSize.body,
    marginRight: 8,
    lineHeight: 22,
  },
  bulletDotGreen: {
    color: palette.green,
    fontSize: fontSize.body,
    marginRight: 8,
    lineHeight: 22,
    fontWeight: fontWeight.bold,
  },
  /** 「这些不算操控」：用 sage 与"识别信号"的警示色区分开，避免反例也被读成危险信号 */
  bulletDotSafe: {
    color: palette.sage,
    fontSize: fontSize.body,
    marginRight: 8,
    lineHeight: 22,
    fontWeight: fontWeight.bold,
  },
  /** 「先确认，再反击」：用 blue 表示"澄清/求证"这条中间道路 */
  bulletDotAsk: {
    color: palette.blue,
    fontSize: fontSize.body,
    marginRight: 8,
    lineHeight: 22,
    fontWeight: fontWeight.bold,
  },
  bulletText: {
    flex: 1,
    color: palette.textSoft,
    fontSize: fontSize.body,
    lineHeight: 22,
  },
  caseText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    lineHeight: 24,
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.md,
    padding: space.md,
    borderLeftWidth: 3,
    borderLeftColor: palette.peach,
  },
});
