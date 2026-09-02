import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Locale = "en" | "zh";
type LabState = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
};

export const useLabStore = create<LabState>()(
  persist(
    (set, get) => ({
      locale: "en",
      setLocale: (locale) => set({ locale }),
      toggleLocale: () => set({ locale: get().locale === "en" ? "zh" : "en" }),
    }),
    { name: "pokerlab-preferences" },
  ),
);

export function useCopy<T>(english: T, chinese: T): T {
  return useLabStore((state) => (state.locale === "zh" ? chinese : english));
}
