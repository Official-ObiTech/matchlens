"use client";
import type { SavedSlipDto } from "@fpp/core";
import { use } from "react";
import { CardSkeletons, ErrorState } from "@/components/ui";
import { api } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import { SlipCard } from "../../history/SlipCard";

export default function SharedSlip({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const res = useApi(`shared:${token}`, () => api<SavedSlipDto>(`/slips/shared/${encodeURIComponent(token)}`));
  return (
    <div className="stack">
      <h1>Shared prediction slip</h1>
      {res.loading ? <CardSkeletons n={1} /> : res.error ? <ErrorState message={res.error.message} /> : <SlipCard s={res.data!} />}
    </div>
  );
}
