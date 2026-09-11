/**
 * 「清醒边界」温暖治愈系设计系统
 * 柔和低饱和 · 米杏奶油底色 · 圆角卡片 · 柔和阴影 · 护眼舒适
 * 全站统一样式令牌，避免散落硬编码颜色。
 */
import { StyleSheet, Platform } from "react-native";

export const palette = {
  // 主色：暖陶土、雾玫瑰、鼠尾草绿
  primary: "#E0A899",
  primaryDark: "#C98B79",
  sage: "#A7C0AE",

  // 背景：米杏奶油 → 暖驼渐变底色
  bg: "#FBF5EC",
  bgWarm: "#F3E7D9",
  surface: "#FFFDF9",
  surfaceSoft: "#F7EEDF",

  // 文字：深可可 → 暖灰
  text: "#4A4039",
  textSoft: "#8A7B6E",
  textFaint: "#B6A89B",

  // 功能色
  green: "#88A878", // 健康/已掌握
  peach: "#E0B084", // 提示/温暖
  clay: "#C97B6E", // 警示/受创
  blue: "#A7C4D4", // 信息/平静

  // 描边
  border: "#ECDFD0",
  borderStrong: "#E0CDB6",
} as const;

export const colors = palette;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
  pill: 999,
} as const;

export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 44,
} as const;

export const fontSize = {
  caption: 14,
  body: 16,
  sub: 18,
  title: 22,
  heading: 30,
  display: 36,
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const fontFamily = "PingFang SC, -apple-system, 'Segoe UI', sans-serif";

/** 根据平台生成柔和阴影：Web 端用 boxShadow，原生端用 shadow* */
function makeShadow(y: number, r: number, o: number, e: number) {
  if (Platform.OS === "web") {
    return { boxShadow: `0px ${y}px ${r}px rgba(201, 169, 140, ${o})` };
  }
  return {
    shadowColor: "#C9A98C",
    shadowOffset: { width: 0, height: y },
    shadowOpacity: o,
    shadowRadius: r,
    elevation: e,
  };
}

/** 柔和阴影：用大半径 + 低透明度营造安抚感而非刺激感 */
export const shadow = {
  soft: makeShadow(6, 16, 0.16, 4),
  lift: makeShadow(10, 24, 0.22, 8),
};

/** 统一卡片基类，各页面直接延伸使用 */
export const cardBase = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: space.lg,
    ...shadow.soft,
  },
  surface: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: space.md,
  },
});

/** 全站根背景（米杏→暖驼柔和渐变，web 端用 linear-gradient） */
export const rootBackground = {
  backgroundColor: palette.bg,
  backgroundImage: `linear-gradient(160deg, ${palette.bg} 0%, ${palette.bgWarm} 100%)`,
} as const;

export const theme = {
  palette,
  colors,
  radius,
  space,
  fontSize,
  fontWeight,
  fontFamily,
  shadow,
  cardBase,
  rootBackground,
};

export default theme;
