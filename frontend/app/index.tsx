import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";

export default function HomeScreen() {
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
        onPress={() => router.push("/game")}
        activeOpacity={0.8}
      >
        <Text style={styles.startButtonText}>开始修行</Text>
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
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  startButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 2,
  },
});