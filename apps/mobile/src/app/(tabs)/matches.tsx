import { localToday, type FixturesResponse } from "@fpp/core";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { MatchCard } from "@/components/MatchCard";
import { CardSkeletons, Chip, Empty, ErrorState, Notice } from "@/components/ui";
import { api, tzOffset } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useTheme } from "@/theme";

type Day = "today" | "tomorrow" | "upcoming";

export default function Matches() {
  const c = useTheme();
  const params = useLocalSearchParams<{ q?: string; range?: string; competition?: string }>();
  const [day, setDay] = useState<Day>(params.range === "upcoming" ? "upcoming" : "today");
  const [q, setQ] = useState(params.q ?? "");
  const [query, setQuery] = useState(params.q ?? "");
  const [competition, setCompetition] = useState(params.competition ?? "");
  const [minProb, setMinProb] = useState<number | null>(null);
  useEffect(() => { if (params.q != null) { setQ(params.q); setQuery(params.q); } }, [params.q]);
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 350); return () => clearTimeout(t); }, [q]);

  const date = day === "tomorrow" ? localToday(1) : localToday();
  const res = useApi(`m:${day}:${date}:${query}:${competition}:${minProb}`, () =>
    api<FixturesResponse>("/fixtures", { params: { date: day === "upcoming" ? undefined : date, range: day === "upcoming" ? "upcoming" : "day", tz: tzOffset(), q: query, competition, minProbability: minProb } }),
  );
  const comps = useMemo(() => [...new Map((res.data?.fixtures ?? []).map((f) => [f.competition.id, f.competition.name])).entries()], [res.data]);

  const header = (
    <View style={{ gap: 10, paddingBottom: 4 }}>
      <TextInput
        placeholder="Search team, competition or country"
        placeholderTextColor={c.text3}
        value={q}
        onChangeText={setQ}
        clearButtonMode="while-editing"
        style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14, color: c.text, fontSize: 15 }}
        accessibilityLabel="Search"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {(["today", "tomorrow", "upcoming"] as Day[]).map((d) => <Chip key={d} label={d === "upcoming" ? "Next 7 days" : d[0]!.toUpperCase() + d.slice(1)} selected={day === d} onPress={() => setDay(d)} />)}
        {[0.75, 0.85].map((p) => <Chip key={p} label={`${p * 100}%+ pick`} selected={minProb === p} onPress={() => setMinProb(minProb === p ? null : p)} />)}
      </ScrollView>
      {comps.length > 1 || competition ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Chip label="All competitions" selected={!competition} onPress={() => setCompetition("")} />
          {comps.map(([id, name]) => <Chip key={id} label={name} selected={competition === id} onPress={() => setCompetition(id)} />)}
        </ScrollView>
      ) : null}
      {res.data?.notices.map((n) => <Notice key={n} tone="warn">{n}</Notice>)}
      {res.loading && <CardSkeletons n={4} />}
      {res.error && <ErrorState message={res.error.message} onRetry={res.reload} />}
      {res.data && res.data.fixtures.length === 0 && <Empty title="No matches found" body="Try another day or remove a filter." />}
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      data={res.loading || res.error ? [] : res.data?.fixtures ?? []}
      keyExtractor={(f) => f.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => <MatchCard f={item} showDate={day === "upcoming"} />}
      refreshControl={<RefreshControl refreshing={res.refreshing} onRefresh={res.reload} tintColor={c.accent} />}
      keyboardShouldPersistTaps="handled"
    />
  );
}
