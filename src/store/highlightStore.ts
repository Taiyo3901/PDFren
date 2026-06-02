import { create } from "zustand";
import type { HighlightTarget } from "../types/pdf";

type HighlightState = {
  activeHighlight: HighlightTarget | null;
  setHighlight: (highlight: HighlightTarget) => void;
  clearHighlight: () => void;
};

export const useHighlightStore = create<HighlightState>((set) => ({
  activeHighlight: null,

  setHighlight: (highlight) =>
    set({
      activeHighlight: highlight,
    }),

  clearHighlight: () =>
    set({
      activeHighlight: null,
    }),
}));