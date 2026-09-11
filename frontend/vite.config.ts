import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "react-native": "react-native-web",
      "react-native-svg": "react-native-svg-web",
      // 移除不兼容的原生模块
      "react-native-reanimated": path.resolve(__dirname, "src/mocks/reanimated.ts"),
      "react-native-gesture-handler": path.resolve(__dirname, "src/mocks/gesture-handler.tsx"),
      "react-native-safe-area-context": path.resolve(__dirname, "src/mocks/safe-area-context.tsx"),
      "@aigame/shared": path.resolve(__dirname, "../shared/src"),
      // 强制使用前端本地 React 版本，避免被后端 React 19 覆盖
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "scheduler": path.resolve(__dirname, "node_modules/scheduler"),
    },
    extensions: [".web.tsx", ".web.ts", ".tsx", ".ts", ".js"],
  },
  define: {
    // 模拟 react-native 全局变量
    __DEV__: "true",
    global: "globalThis",
  },
  server: {
    port: 3000,
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});