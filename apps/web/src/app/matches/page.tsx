import { Suspense } from "react";
import { CardSkeletons } from "@/components/ui";
import { MatchesView } from "./MatchesView";

export const metadata = { title: "Matches" };

export default function MatchesPage() {
  return (
    <Suspense fallback={<CardSkeletons />}>
      <MatchesView />
    </Suspense>
  );
}
