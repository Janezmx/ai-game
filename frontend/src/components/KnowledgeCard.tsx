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
    tactic: "煤气灯效应",
    definition: "操控者通过否认你的记忆、感受和事实，让你怀疑自己的判断力，逐渐失去对现实的掌控。",
    signals: [
      "对方常说「你太敏感了」「你记错了」",
      "你的真实感受被说成是「想太多」",
      "事情发生后对方改口否认说过的话",
      "你开始频繁自我怀疑、反复查证记忆",
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
    tactic: "职场PUA",
    definition: "上级或同事以「为你好」之名持续贬低你的能力与价值，瓦解自信，让你安于被压榨。",
    signals: [
      "拿你和别人比较来否定你",
      "把正常失误放大成「能力不行」",
      "用职位权威堵住你的反驳",
      "让你觉得离开这里就找不到更好的",
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
    tactic: "匿名网络攻击",
    definition: "匿名的群体以标签、谣言与围攻对你进行去人格化攻击，利用从众压力制造孤立。",
    signals: [
      "大量陌生账号同时攻击你",
      "断章取义的截图被当成「实锤」",
      "你被贴上负面标签难以撕掉",
      "反对的声音被音量淹没",
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
    tactic: "隐性歧视",
    definition: "以「善意」「专业」包装的微妙偏见，用预设与双重标准悄悄低估你的能力。",
    signals: [
      "用「你真的适合吗」式关怀质疑",
      "标准对你更严苛、对别人更宽松",
      "把你的成就归因于运气",
      "你总被要求额外「证明自己」",
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
    lineHeight: 22,
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
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: space.xs,
  },
  bulletDot: {
    color: palette.clay,
    fontSize: fontSize.body,
    marginRight: 8,
    lineHeight: 20,
  },
  bulletDotGreen: {
    color: palette.green,
    fontSize: fontSize.body,
    marginRight: 8,
    lineHeight: 20,
    fontWeight: fontWeight.bold,
  },
  bulletText: {
    flex: 1,
    color: palette.textSoft,
    fontSize: fontSize.body,
    lineHeight: 20,
  },
  caseText: {
    color: palette.textSoft,
    fontSize: fontSize.body,
    lineHeight: 22,
    backgroundColor: palette.surfaceSoft,
    borderRadius: radius.md,
    padding: space.md,
    borderLeftWidth: 3,
    borderLeftColor: palette.peach,
  },
});
