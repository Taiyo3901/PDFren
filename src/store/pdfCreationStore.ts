import { create } from "zustand";
import type { PaneId } from "../types/pdf";

export type AreaSelectionMode = {
  enabled: boolean;
  sourcePane: PaneId | null;
};

type PdfCreationState = {
  blankPane: PaneId | null;
  areaSelectionMode: AreaSelectionMode;
  selectionClearRequestId: number;

  setBlankPane: (pane: PaneId | null) => void;
  clearBlankPane: (pane?: PaneId) => void;
  swapBlankPane: () => void;

  enableAreaSelection: (sourcePane: PaneId) => void;
  disableAreaSelection: () => void;
  clearAreaSelection: () => void;
};

export const usePdfCreationStore = create<PdfCreationState>((set) => ({
  blankPane: null,
  areaSelectionMode: {
    enabled: false,
    sourcePane: null,
  },
  selectionClearRequestId: 0,

  setBlankPane: (pane) => set({ blankPane: pane }),

  clearBlankPane: (pane) =>
    set((state) => {
      if (!pane || state.blankPane === pane) {
        return {
          blankPane: null,
          areaSelectionMode: {
            enabled: false,
            sourcePane: null,
          },
          selectionClearRequestId: state.selectionClearRequestId + 1,
        };
      }

      return state;
    }),

  swapBlankPane: () =>
    set((state) => ({
      blankPane:
        state.blankPane === "left"
          ? "right"
          : state.blankPane === "right"
          ? "left"
          : null,
      areaSelectionMode: state.areaSelectionMode.enabled
        ? {
            enabled: true,
            sourcePane:
              state.areaSelectionMode.sourcePane === "left"
                ? "right"
                : state.areaSelectionMode.sourcePane === "right"
                ? "left"
                : null,
          }
        : state.areaSelectionMode,
    })),

  enableAreaSelection: (sourcePane) =>
    set({
      areaSelectionMode: {
        enabled: true,
        sourcePane,
      },
    }),

  disableAreaSelection: () =>
    set((state) => ({
      areaSelectionMode: {
        enabled: false,
        sourcePane: null,
      },
      selectionClearRequestId: state.selectionClearRequestId + 1,
    })),

  clearAreaSelection: () =>
    set((state) => ({
      selectionClearRequestId: state.selectionClearRequestId + 1,
    })),
}));
