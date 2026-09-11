import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  DimensionValue,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import type { SavedReviewReport } from "@aigame/shared";
import { useGameStore } from "../store/gameStore";
import { deleteReport, getReport } from "../api/reviews";
import { exportReportAsMarkdown } from "../utils/reportExport";
import ReviewScreen from "./ReviewScreen";
import {
  palette,
  radius,
  space,
  fontSize,
  fontWeight,
  fontFamily,
  shadow,
} from "../theme";

type LoadStatus = "loading" | "ready" | "missing";

/**
 * 垃圾桶图标
 *
 * emoji（🗑️）由系统字体渲染，颜色固定为灰黑、无法跟随主题着色，
 * 因此改用 SVG 描边绘制，颜色取警示色 clay，与按钮文案同色。
 * viewBox 收紧到图形自身边界：原 24×24 画布中图形只占中间约 74%，
 * 渲染出来比文字矮一截；收紧后 size 即图标实高，与文案字号（caption 14）齐平。
 */
function TrashIcon({ size = fontSize.caption + 1, color = palette.clay }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="2.8 2.8 18.4 18.4" fill="none">
      <Path
        d="M4 6.5h16M9.5 6.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M7 6.5l.9 12.4a1.1 1.1 0 0 0 1.1 1h6a1.1 1.1 0 0 0 1.1-1L17 6.5M10.5 10.5v6M13.5 10.5v6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * 历史复盘详情
 *
 * 只负责"取数据 + 操作区"：读取存档后交给 ReviewScreen 的只读模式渲染，
 * 因此历史浏览与实时复盘共用同一套展示，不会出现两套样式漂移。
 */
export default function ReviewReportScreen({
  reportId,
  onBack,
}: {
  reportId: string;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const detachReportId = useGameStore((s) => s.detachReportId);

  const [report, setReport] = useState<SavedReviewReport | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    getReport(reportId).then((data) => {
      if (!alive) return;
      setReport(data);
      setStatus(data ? "ready" : "missing");
    });
    return () => {
      alive = false;
    };
  }, [reportId]);

  const handleDelete = useCallback(() => {
    setDeleting(true);
    deleteReport(reportId).then((removed) => {
      setDeleting(false);
      // 战绩记录保留、只解除关联：历史成绩不该因为清理存档而消失
      detachReportId(reportId);
      console.log(`[review] 已删除复盘存档 ${reportId}（本地命中=${removed}）`);
      onBack();
    });
  }, [reportId, detachReportId, onBack]);

  if (status === "loading") {
    return (
      <View style={[styles.centerWrap, { paddingTop: insets.top }]}>
        <ActivityIndicator color={palette.primary} />
        <Text style={styles.hintText}>正在读取复盘…</Text>
      </View>
    );
  }

  if (status === "missing" || !report) {
    return (
      <View style={[styles.centerWrap, { paddingTop: insets.top }]}>
        <Text style={styles.emptyEmoji}>🗂️</Text>
        <Text style={styles.emptyTitle}>这份复盘已不存在</Text>
        <Text style={styles.hintText}>
          可能已被删除，或存档目录被清理过。战绩记录仍保留在列表中。
        </Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="返回成长记录"
        >
          <Text style={styles.backBtnText}>← 返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const footer = (
    <>
      {/* 底部操作区：样式表已给上下等量留白，这里只在下方叠加安全区 */}
      <View style={[styles.actionBar, { paddingBottom: space.lg + insets.bottom }]}>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={onBack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="返回成长记录"
          >
            <Text style={styles.ghostBtnText}>← 返回</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pillBtn, styles.greenBtn]}
            onPress={() => exportReportAsMarkdown(report)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="导出为文本报告"
          >
            <Text style={styles.pillBtnText}>导出文本</Text>
          </TouchableOpacity>
          {/* 「导出 JSON」按钮暂时隐藏：面向玩家的报告只需可读文本。
              恢复时取消本段注释，并在顶部 import 回 exportReportAsJson。
          <TouchableOpacity
            style={[styles.pillBtn, styles.blueBtn]}
            onPress={() => exportReportAsJson(report)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="导出为 JSON 文件"
          >
            <Text style={[styles.pillBtnText, styles.blueBtnText]}>导出 JSON</Text>
          </TouchableOpacity>
          */}
          <TouchableOpacity
            style={[styles.ghostBtn, styles.deleteBtn]}
            onPress={() => setConfirming(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="删除本局复盘"
          >
            <TrashIcon />
            <Text style={styles.deleteBtnText}>删除本局复盘</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 删除确认：居中弹框，不再挤在底部操作区 */}
      <Modal
        visible={confirming}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deleting) setConfirming(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>删除本局复盘？</Text>
            <Text style={styles.modalDesc}>
              删除后无法恢复，战绩记录会保留。确定删除本局复盘吗？
            </Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.ghostBtn, styles.modalBtn]}
                onPress={() => setConfirming(false)}
                disabled={deleting}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="取消删除"
              >
                <Text style={styles.ghostBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSolidBtn, styles.dangerBtn, deleting && styles.btnDisabled]}
                onPress={handleDelete}
                disabled={deleting}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="确认删除本局复盘"
              >
                <Text style={[styles.pillBtnText, styles.dangerBtnText]}>
                  {deleting ? "删除中…" : "确认删除"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );

  return (
    <ReviewScreen
      report={report}
      victory={report.victory}
      onComplete={onBack}
      onBack={onBack}
      footer={footer}
    />
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    flex: 1,
    height: "100vh" as DimensionValue,
    width: "100%",
    backgroundColor: palette.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: {
    color: palette.primaryDark,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  hintText: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    textAlign: "center",
    lineHeight: 20,
    fontFamily,
  },
  backBtn: {
    marginTop: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.soft,
  },
  backBtnText: {
    color: palette.primaryDark,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  actionBar: {
    paddingHorizontal: space.md,
    // 上下用同一个值：按钮上、下留白看起来一致，同时保证不贴屏幕底边
    paddingTop: space.lg,
    paddingBottom: space.lg,
    alignItems: "center",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    width: "100%",
  },
  ghostBtn: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  ghostBtnText: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  pillBtn: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.soft,
  },
  pillBtnText: {
    color: palette.surface,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  greenBtn: { backgroundColor: palette.green },
  blueBtn: { backgroundColor: palette.blue },
  blueBtnText: { color: palette.primaryDark },
  dangerBtn: { backgroundColor: palette.clay },
  dangerBtnText: { color: palette.surface },
  btnDisabled: { opacity: 0.6 },
  // 删除入口与「返回」同款描边按钮，保证底栏三个按钮等高
  // 图标 + 文案横排：间距走 gap，不用空格字符，避免多端字体下宽度不一致
  deleteBtn: { flexDirection: "row", alignItems: "center", gap: space.xs },
  deleteBtnText: {
    color: palette.clay,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  // ===== 删除确认弹框（居中） =====
  // 弹框内两个按钮等宽（minWidth 统一），不再沿用 pillBtn 的 flex 撑满整行
  modalBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    width: "100%",
    // 卡片自带 gap 之外再补一段，让操作按钮与说明文字拉开一点
    marginTop: space.sm,
  },
  modalBtn: { minWidth: 96, alignItems: "center" },
  modalSolidBtn: {
    minWidth: 96,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.soft,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(10,10,26,0.4)",
    padding: space.md,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: space.md,
    gap: space.sm,
    ...shadow.soft,
  },
  modalTitle: {
    color: palette.primaryDark,
    fontSize: fontSize.sub,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  modalDesc: {
    color: palette.textSoft,
    fontSize: fontSize.caption,
    lineHeight: 20,
    fontFamily,
  },
});
