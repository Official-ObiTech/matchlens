import AsyncStorage from "@react-native-async-storage/async-storage";
import { addOutcome, emptySlip, slipReducer, type SlipAddResult, type SlipSelection, type SlipState } from "@fpp/core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SlipStore extends SlipState {
  add: (s: SlipSelection) => SlipAddResult;
  remove: (fixtureId: string) => void;
  clear: () => void;
}

/** Same reducer as the website; persisted on-device so the slip survives tab switches and restarts. */
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
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ selections: s.selections }),
      merge: (persisted, current) => slipReducer(current, { type: "restore", selections: (persisted as Partial<SlipState>)?.selections ?? [] }) as SlipStore,
    },
  ),
);
