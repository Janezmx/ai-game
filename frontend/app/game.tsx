import React, { useCallback } from "react";
import { View, StyleSheet, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useRouter } from "expo-router";
import HeartDomainPrepareScreen from "../src/components/HeartDomainPrepareScreen";
import { useGameStore } from "../src/store/gameStore";
import { GamePhase } from "@aigame/shared";

export default function GameScreen() {
  const router = useRouter();
  const { setPhase } = useGameStore();

  const handleComplete = useCallback(() => {
    setPhase(GamePhase.DialogueBattle);
  }, [setPhase]);

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#16213e" />
      <HeartDomainPrepareScreen onComplete={handleComplete} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a1a",
  },
});