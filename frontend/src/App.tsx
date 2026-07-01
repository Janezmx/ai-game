import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { View, StyleSheet } from "react-native";
import HomePage from "./pages/HomePage";
import GamePage from "./pages/GamePage";
import GrowthScreen from "./components/GrowthScreen";

function Root({ children }: { children: React.ReactNode }) {
  return <View style={styles.root}>{children}</View>;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Root>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/growth" element={<GrowthScreen onBack={() => window.history.back()} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Root>
    </BrowserRouter>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0a1a",
  },
});