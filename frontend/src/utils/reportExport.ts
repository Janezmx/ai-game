import type { DimensionScores, SavedReviewReport } from "@aigame/shared";
import { normalizeDimensionScore } from "./dimensions";
import { normalizeLevelTitle, normalizeTrapType } from "./levelTitles";
import {
  getRealityTransfer,
  REALITY_CHECKS_TITLE,
  REALITY_MISREAD_LABEL,
  REALITY_TRANSFER_BRANCHES,
  REALITY_TRANSFER_CLOSING,
  REALITY_TRANSFER_TITLE,
} from "./realityTransfer";

/**
 * 复盘报告导出工具
 *
 * 导出走浏览器/Electron 渲染进程的 Blob + a[download]，打包版会弹出系统保存框。
 * 这样无需新增 preload/IPC 通道，纯浏览器环境也能用。
 */

const DIMENSION_LABELS: Record<keyof DimensionScores, string> = {
  boundaryAwareness: "边界意识",
  emotionalStability: "情绪稳定",
  cognitiveClarity: "认知清晰",
  assertiveResponse: "坚定回应",
};

const STATUS_LABELS: Record<string, string> = {
  effective: "✅ 有效防御",
  shaken: "⚠️ 轻度动摇",
  trapped: "❌ 落入陷阱",
};

function dimsToText(dims: DimensionScores): string {
  return (Object.keys(DIMENSION_LABELS) as (keyof DimensionScores)[])
    .map((key) => `${DIMENSION_LABELS[key]} ${normalizeDimensionScore(dims[key])}`)
    .join(" · ");
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** 文件名中的日期片段：20260910 */
function fileDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** 复盘报告 → Markdown 文本（便于直接分享或存档阅读） */
export function reportToMarkdown(report: SavedReviewReport): string {
  const lines: string[] = [];
  // 存档里的 levelTitle / 知识点手法名都是当时的快照，导出时统一翻译为当前关卡名
  const levelTitle = normalizeLevelTitle(report.levelTitle);
  lines.push(`# 复盘报告 · 第 ${report.level} 关${levelTitle ? ` ${levelTitle}` : ""}`);
  lines.push("");
  lines.push(`- 结果：${report.victory ? "✅ 胜利" : "💔 失败"}`);
  lines.push(`- 综合评分：${report.avgScore}`);
  lines.push(`- 对局时间：${formatDateTime(report.timestamp)}`);
  lines.push(`- 四维表现：${dimsToText(report.dimensions)}`);
  if (report.knowledgePoint) {
    const kp = report.knowledgePoint;
    lines.push("");
    lines.push("## 📖 本课知识点");
    lines.push("");
    lines.push(`**${normalizeLevelTitle(kp.tactic)}**：${kp.definition}`);
    if (kp.signals?.length) {
      lines.push("");
      lines.push("识别信号：");
      for (const s of kp.signals) lines.push(`- ${s}`);
    }
    if (kp.healthyResponse?.length) {
      lines.push("");
      lines.push("健康应对：");
      for (const r of kp.healthyResponse) lines.push(`- ${r}`);
    }
    if (kp.caseStory) {
      lines.push("");
      lines.push(`> 案例：${kp.caseStory}`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  report.rounds.forEach((round, idx) => {
    const a = round.assessment;
    const status = a?.playerStatus ? STATUS_LABELS[a.playerStatus] || a.playerStatus : "未评估";
    lines.push(`## 第 ${idx + 1} 轮 · ${status}`);
    lines.push("");

    if (round.npcMessage?.content) {
      lines.push("**👾 NPC 说了什么**");
      lines.push("");
      lines.push(`> ${round.npcMessage.content.replace(/\n/g, "\n> ")}`);
      lines.push("");
    }
    if (round.playerMessage?.content) {
      lines.push("**🧘 你的回应**");
      lines.push("");
      lines.push(`> ${round.playerMessage.content.replace(/\n/g, "\n> ")}`);
      lines.push("");
    }
    if (a?.trapType) {
      // 同页面口径：旧存档的 trapType 可能仍是改名前的叫法，导出前归一化
      lines.push(`**操控手法**：${normalizeTrapType(a.trapType)}`);
      lines.push("");
    }
    if (a?.trapAnalysis) {
      lines.push("**🎯 NPC 的动机**");
      lines.push("");
      lines.push(a.trapAnalysis);
      lines.push("");
    }
    if (a?.whyNote) {
      lines.push("**🔍 本轮科普点评**");
      lines.push("");
      lines.push(a.whyNote);
      lines.push("");
    }
    if (a?.identificationTip) {
      lines.push(`**识别要点**：${a.identificationTip}`);
      lines.push("");
    }
    if (a?.alternatives?.length) {
      lines.push("**💡 更好的回应方式**");
      lines.push("");
      a.alternatives.forEach((alt, i) => {
        lines.push(`${i + 1}. ${alt.text}`);
        if (alt.rationale) lines.push(`   - 为什么：${alt.rationale}`);
      });
      lines.push("");
    }
    // 进步对比：与复盘页面展示口径保持一致——首轮没有可对比的上一轮数据，导出也不输出该行。
    // 两种占位文案分别来自实时评估接口（首轮评估）与复盘补全接口（第一轮，暂无对比）。
    const progressNote = a?.progressNote?.trim();
    const showProgressNote =
      idx > 0 &&
      !!progressNote &&
      progressNote !== "首轮评估" &&
      progressNote !== "第一轮，暂无对比";
    if (showProgressNote) {
      lines.push(`**📈 进步对比**：${progressNote}`);
      lines.push("");
    }
    if (a?.dimensions) {
      lines.push(`**本轮四维**：${dimsToText(a.dimensions)}`);
      lines.push("");
    }
  });

  // 现实迁移校准：与复盘页面共用同一份按关文案（realityTransfer），保证逐字一致。
  // 逐轮复盘全是"对方在做什么"，这里必须给出等量的"我也可能读错"，
  // 否则导出件会变成一份单向的"别人都在操控我"的证据。
  const reality = getRealityTransfer(report.level);
  lines.push("---");
  lines.push("");
  lines.push(`## ${REALITY_TRANSFER_TITLE}`);
  lines.push("");
  lines.push(reality.lead);
  lines.push("");
  lines.push(`### ${REALITY_MISREAD_LABEL}`);
  lines.push("");
  lines.push(reality.misread);
  lines.push("");
  lines.push(`### ${REALITY_CHECKS_TITLE}`);
  lines.push("");
  reality.checks.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  for (const b of REALITY_TRANSFER_BRANCHES) {
    lines.push("");
    lines.push(`**${b.label}**：${b.text}`);
  }
  lines.push("");
  for (const line of REALITY_TRANSFER_CLOSING) lines.push(line);

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`共 ${report.rounds.length} 轮对话 · 由「清醒边界」自动存档生成`);
  return lines.join("\n");
}

function buildFileName(report: SavedReviewReport, ext: string): string {
  const title = normalizeLevelTitle(report.levelTitle).replace(/[\\/:*?"<>|\s]/g, "");
  return `复盘报告_第${report.level}关${title ? `_${title}` : ""}_${fileDate(report.timestamp)}.${ext}`;
}

/** 触发一次文件下载（Electron 打包版会弹出系统保存对话框） */
function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 交给浏览器完成读取后再释放
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function exportReportAsMarkdown(report: SavedReviewReport): void {
  downloadText(
    reportToMarkdown(report),
    buildFileName(report, "md"),
    "text/markdown"
  );
}

export function exportReportAsJson(report: SavedReviewReport): void {
  downloadText(
    JSON.stringify(report, null, 2),
    buildFileName(report, "json"),
    "application/json"
  );
}
