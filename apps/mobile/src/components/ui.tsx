import { QUALITY_LABEL, type DataQualityGrade } from "@fpp/core";
import { useEffect, useRef, type ReactNode } from "react";
import { ActivityIndicator, Animated, Image, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { radius, useTheme } from "@/theme";

export function T({ children, style, variant = "body", numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; variant?: "h1" | "h2" | "h3" | "body" | "muted" | "subtle" | "strong"; numberOfLines?: number }) {
  const c = useTheme();
  const v: Record<string, TextStyle> = {
    h1: { fontSize: 24, fontWeight: "800", color: c.text, letterSpacing: -0.3 },
    h2: { fontSize: 18, fontWeight: "700", color: c.text },
    h3: { fontSize: 15, fontWeight: "700", color: c.text },
    body: { fontSize: 15, color: c.text },
    strong: { fontSize: 15, color: c.text, fontWeight: "600" },
    muted: { fontSize: 14, color: c.text2 },
    subtle: { fontSize: 12.5, color: c.text3 },
  };
  return <Text numberOfLines={numberOfLines} style={[v[variant], style]}>{children}</Text>;
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  const c = useTheme();
  const base: ViewStyle = { backgroundColor: c.surface, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: 14, gap: 10 };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [base, pressed && { opacity: 0.85 }, style]}>
      {children}
    </Pressable>
  );
}

export function Button({ title, onPress, kind = "default", disabled, loading, small, style }: { title: string; onPress: () => void; kind?: "primary" | "default" | "danger" | "ghost"; disabled?: boolean; loading?: boolean; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  const bg = kind === "primary" ? c.accent : kind === "ghost" ? "transparent" : c.surface;
  const fg = kind === "primary" ? c.accentInk : kind === "danger" ? c.danger : c.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        { minHeight: small ? 36 : 48, paddingHorizontal: small ? 12 : 18, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: bg, borderWidth: kind === "ghost" ? 0 : 1, borderColor: kind === "primary" ? c.accent : c.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: "700", fontSize: small ? 13.5 : 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: selected ? c.text : c.border, backgroundColor: selected ? c.text : c.surface, justifyContent: "center" }}>
      <Text style={{ color: selected ? c.bg : c.text2, fontWeight: "600", fontSize: 13.5 }}>{label}</Text>
    </Pressable>
  );
}

export function Crest({ src, name, size = 24 }: { src: string | null; name: string; size?: number }) {
  const c = useTheme();
  if (!src) {
    const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
    return (
      <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: size * 0.32, fontWeight: "800", color: c.text2 }}>{initials}</Text>
      </View>
    );
  }
  return <Image source={{ uri: src }} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

export function QualityBadge({ grade }: { grade: DataQualityGrade }) {
  const c = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: c.q[grade], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }} accessibilityLabel={`Data quality ${grade}, ${QUALITY_LABEL[grade]}`}>
      <Text style={{ color: c.q[grade], fontSize: 11.5, fontWeight: "700" }}>{grade} · {QUALITY_LABEL[grade]}</Text>
    </View>
  );
}

export function ProbBar({ value, width }: { value: number; width?: number }) {
  const c = useTheme();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surface2, overflow: "hidden", width }}>
      <View style={{ height: 8, width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: c.accent, borderRadius: 4 }} />
    </View>
  );
}

export function StatusPill({ status }: { status: string }) {
  const c = useTheme();
  const tone = status === "won" ? [c.accentSoft, c.win] : status === "lost" || status === "live" ? [c.dangerSoft, c.loss] : [c.surface2, c.text2];
  return (
    <View style={{ backgroundColor: tone[0], borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: tone[1], fontSize: 11.5, fontWeight: "800" }}>{status.toUpperCase()}</Text>
    </View>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "danger" }) {
  const c = useTheme();
  return (
    <View style={{ backgroundColor: tone === "warn" ? c.warnSoft : tone === "danger" ? c.dangerSoft : c.infoSoft, padding: 12, borderRadius: 11 }} accessibilityRole={tone === "danger" ? "alert" : undefined}>
      {typeof children === "string" ? <T variant="muted" style={{ color: c.text }}>{children}</T> : children}
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: 28 }}>
      <T variant="h3" style={{ textAlign: "center" }}>{title}</T>
      {body && <T variant="muted" style={{ textAlign: "center" }}>{body}</T>}
      {action}
    </Card>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Empty title="Couldn’t load this" body={message} action={onRetry && <Button small title="Try again" onPress={onRetry} />} />;
}

export function Skeleton({ h = 16, w = "100%" }: { h?: number; w?: number | `${number}%` }) {
  const c = useTheme();
  const o = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 1, duration: 650, useNativeDriver: true }), Animated.timing(o, { toValue: 0.5, duration: 650, useNativeDriver: true })]));
    a.start();
    return () => a.stop();
  }, [o]);
  return <Animated.View style={{ height: h, width: w, borderRadius: 8, backgroundColor: c.surface2, opacity: o }} />;
}

export function CardSkeletons({ n = 3 }: { n?: number }) {
  return (
    <View style={{ gap: 10 }} accessibilityLabel="Loading">
      {Array.from({ length: n }, (_, i) => (
        <Card key={i}><Skeleton h={12} w="45%" /><Skeleton h={18} /><Skeleton h={18} /><Skeleton h={34} /></Card>
      ))}
    </View>
  );
}

export function FormDots({ form }: { form: ("W" | "D" | "L")[] }) {
  const c = useTheme();
  if (!form.length) return <T variant="subtle">No results</T>;
  return (
    <View style={{ flexDirection: "row", gap: 3 }} accessibilityLabel={`Recent form ${form.join(" ")}`}>
      {form.map((r, i) => (
        <View key={i} style={{ width: 20, height: 20, borderRadius: 5, alignItems: "center", justifyContent: "center", backgroundColor: r === "W" ? c.win : r === "L" ? c.loss : c.void }}>
          <Text style={{ color: "#fff", fontSize: 10.5, fontWeight: "800" }}>{r}</Text>
        </View>
      ))}
    </View>
  );
}

export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[{ flexDirection: "row", alignItems: "center", gap: 10 }, style]}>{children}</View>;
