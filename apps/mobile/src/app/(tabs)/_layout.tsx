import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { useSlip } from "@/lib/slipStore";
import { useTheme } from "@/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
const icon = (name: IconName) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;

export default function TabsLayout() {
  const c = useTheme();
  const count = useSlip((s) => s.selections.length);
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.text3,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", headerTitle: "MatchLens", tabBarIcon: icon("home-outline") }} />
      <Tabs.Screen name="matches" options={{ title: "Matches", tabBarIcon: icon("football-outline") }} />
      <Tabs.Screen name="predictions" options={{ title: "Predictions", headerTitle: "Strongest predictions", tabBarIcon: icon("stats-chart-outline") }} />
      <Tabs.Screen name="slip" options={{ title: "Slip", headerTitle: "My slip", tabBarIcon: icon("receipt-outline"), tabBarBadge: count > 0 ? count : undefined, tabBarBadgeStyle: { backgroundColor: c.accent, color: c.accentInk } }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person-outline") }} />
    </Tabs>
  );
}
