/**
 * Mock for react-native-reanimated
 * 在 Web 环境下模拟 reanimated API 为普通 React 行为
 */

import React from "react";
import { View, Text, Image, ScrollView } from "react-native";

// 共享值模拟
export function useSharedValue<T>(initial: T) {
  const ref = React.useRef({ value: initial });
  return ref.current;
}

// 动画样式模拟 - 直接返回原始样式
export function useAnimatedStyle(updater: () => any) {
  const [style, setStyle] = React.useState(updater);

  React.useEffect(() => {
    const newValue = updater();
    setStyle((prev: any) => {
      const next = typeof newValue === "function" ? newValue(prev) : newValue;
      // 如果值没变，返回旧引用让 React 跳过重渲染
      if (JSON.stringify(prev) === JSON.stringify(next)) {
        return prev;
      }
      return next;
    });
  });

  return style;
}

// 派生值模拟
export function useDerivedValue(fn: () => any, deps: any[] = []) {
  const [value, setValue] = React.useState(fn());

  React.useEffect(() => {
    const newValue = fn();
    setValue((prev: any) => {
      if (JSON.stringify(prev) === JSON.stringify(newValue)) {
        return prev;
      }
      return newValue;
    });
  }, deps);

  return value;
}

// 动画函数 - 直接返回最终值
export function withSpring(toValue: any, config?: any) {
  return toValue;
}

export function withTiming(toValue: any, config?: any) {
  return toValue;
}

export function withSequence(...args: any[]) {
  return args[args.length - 1];
}

export function withRepeat(animation: any, count?: number, reverse?: boolean) {
  return animation;
}

export const Easing = {
  in: (e: any) => e,
  out: (e: any) => e,
  inOut: (e: any) => e,
  linear: (e: any) => e,
  ease: (e: any) => e,
  quad: (e: any) => e,
  cubic: (e: any) => e,
  sin: (e: any) => e,
};

// 在 JS 线程上运行
export function runOnJS<T extends (...args: any[]) => any>(fn: T) {
  return fn;
}

// 动画组件模拟
export const FadeIn = { duration: (d: number) => ({}) };
export const FadeOut = { duration: (d: number) => ({}) };
export const SlideInRight = { duration: (d: number) => ({}) };
export const SlideOutLeft = { duration: (d: number) => ({}) };
export const BounceIn = { duration: (d: number) => ({}) };

// Layout 动画模拟
export const Layout = { duration: (d: number) => ({}) };

// 创建一个包装组件来处理 Animated.View 的 entering/entering 等过渡属性
function createAnimatedComponent(Component: React.ComponentType<any>) {
  return React.forwardRef((props: any, ref) => {
    // 过滤掉 Animated 特有的 props，避免传递给原生 DOM
    const { entering, exiting, layout, ...rest } = props;
    return React.createElement(Component, { ...rest, ref });
  });
}

// Animated 组件模拟
const Animated = {
  View: createAnimatedComponent(View),
  Text: createAnimatedComponent(Text),
  Image: createAnimatedComponent(Image),
  ScrollView: createAnimatedComponent(ScrollView),
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
  runOnJS,
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  BounceIn,
  Layout,
};

// Reanimated 默认导出
export default Animated;