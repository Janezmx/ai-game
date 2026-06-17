/**
 * Mock for react-native-safe-area-context
 * 在 Web 环境下返回固定值
 */

import React from "react";

export const SafeAreaProvider = ({ children, ...props }: any) => {
  return React.createElement("div", { style: { width: "100%", height: "100%" } }, children);
};

export const SafeAreaView = ({ style, children, ...props }: any) => {
  const mergedStyle = Array.isArray(style)
    ? Object.assign({}, ...style)
    : style;
  return React.createElement("div", { style: mergedStyle, ...props }, children);
};

export function useSafeAreaInsets() {
  return {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };
}

export function useSafeAreaFrame() {
  return {
    x: 0,
    y: 0,
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  };
}

export default {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
  useSafeAreaFrame,
};