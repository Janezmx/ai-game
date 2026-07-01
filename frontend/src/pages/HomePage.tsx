import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigate } from "react-router-dom";

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>清醒边界</Text>
      <Text style={styles.subtitle}>守护你的心域，抵御无形操控</Text>

      <View style={styles.description}>
        <Text style={styles.descText}>
          一款融合心域修炼、AI 对话攻防与正念修行的严肃游戏
        </Text>
      </View>

      <TouchableOpacity
        style={styles.startButton}
        onPress={() => navigate("/game")}
        activeOpacity={0.8}
      >
        <Text style={styles.startButtonText}>开始修行</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.growthButton}
        onPress={() => navigate("/growth")}
        activeOpacity={0.8}
      >
        <Text style={styles.growthButtonText}>🌱 成长记录</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a1a",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    maxWidth: 500,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    fontSize: 42,
    fontWeight: "700",
    color: "#e0e7ff",
    letterSpacing: 6,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#818cf8",
    marginBottom: 48,
    letterSpacing: 2,
  },
  description: {
    backgroundColor: "rgba(129, 140, 248, 0.1)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 48,
    borderWidth: 1,
    borderColor: "rgba(129, 140, 248, 0.2)",
  },
  descText: {
    color: "#a5b4fc",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  startButton: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 30,
    boxShadow: "0px 4px 12px rgba(99, 102, 241, 0.4)",
    elevation: 8,
  },
  startButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 2,
  },
  growthButton: {
    marginTop: 16,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#7c4dff66",
  },
  growthButtonText: {
    color: "#b388ff",
    fontSize: 15,
    fontWeight: "500",
  },
});