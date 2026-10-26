"use client";
import { addOutcome, emptySlip, slipReducer, type SlipAddResult, type SlipSelection, type SlipState } from "@fpp/core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SlipStore extends SlipState {
  add: (s: SlipSelection) => SlipAddResult;
  remove: (fixtureId: string) => void;
  clear: () => void;
}

/** Slip persisted in localStorage so it survives navigation and reloads (guest mode). */
export const useSlip = create<SlipStore>()(
  persist(
    (set, get) => ({
      ...emptySlip(),
      add: (selection) => {
        const result = addOutcome(get(), selection);
        set((s) => slipReducer(s, { type: "add", selection }));
        return result;
      },
      remove: (fixtureId) => set((s) => slipReducer(s, { type: "remove", fixtureId })),
      clear: () => set((s) => slipReducer(s, { type: "clear" })),
    }),
    {
      name: "fpp-slip-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ selections: s.selections }),
      merge: (persisted, current) => slipReducer(current, { type: "restore", selections: (persisted as Partial<SlipState>)?.selections ?? [] }) as SlipStore,
    },
  ),
);
