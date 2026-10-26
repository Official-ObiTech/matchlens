"use client";
import { create } from "zustand";
import { useEffect } from "react";

export const useToast = create<{ message: string | null; show: (m: string) => void; hide: () => void }>((set) => ({
  message: null,
  show: (message) => set({ message }),
  hide: () => set({ message: null }),
}));

export function Toast() {
  const { message, hide } = useToast();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 3200);
    return () => clearTimeout(t);
  }, [message, hide]);
  return message ? <div className="toast" role="status" aria-live="polite">{message}</div> : null;
}
