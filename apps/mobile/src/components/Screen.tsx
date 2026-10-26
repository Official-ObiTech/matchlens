import type { ReactNode } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { useTheme } from "@/theme";

/** Scrollable screen body with pull-to-refresh and consistent spacing. */
export function Screen({ children, refreshing, onRefresh }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const c = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={c.accent} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}
