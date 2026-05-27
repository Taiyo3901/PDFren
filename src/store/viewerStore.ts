import { create } from "zustand";
import type { PaneId } from "../types/pdf";

export type PaneState = {
  pdfUrl: string | null;
  title: string;
  pageNumber: number;
  totalPages: number;
  userScale: number;
  fitScale: number;
};

type ViewerState = {
  panes: Record<PaneId, PaneState>;

  loadPdf: (pane: PaneId, url: string, title?: string) => void;
  clearPdf: (pane: PaneId) => void;

  setPageNumber: (pane: PaneId, pageNumber: number) => void;
  setTotalPages: (pane: PaneId, totalPages: number) => void;

  zoomIn: (pane: PaneId) => void;
  zoomOut: (pane: PaneId) => void;
  setUserScale: (pane: PaneId, scale: number) => void;
  setFitScale: (pane: PaneId, fitScale: number) => void;

  openLeftPdfOnRightDifferentPage: () => void;
};

const MIN_SCALE = 0.35;
const MAX_SCALE = 3;

const initialPaneState: PaneState = {
  pdfUrl: null,
  title: "未読み込み",
  pageNumber: 1,
  totalPages: 0,
  userScale: 1.2,
  fitScale: MAX_SCALE,
};

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(scale.toFixed(2))));
}

export const useViewerStore = create<ViewerState>((set) => ({
  panes: {
    left: { ...initialPaneState },
    right: { ...initialPaneState },
  },

  loadPdf: (pane, url, title = "PDF") =>
    set((state) => ({
      panes: {
        ...state.panes,
        [pane]: {
          ...state.panes[pane],
          pdfUrl: url,
          title,
          pageNumber: 1,
          totalPages: 0,
          fitScale: MAX_SCALE,
        },
      },
    })),

  clearPdf: (pane) =>
    set((state) => ({
      panes: {
        ...state.panes,
        [pane]: { ...initialPaneState },
      },
    })),

  setPageNumber: (pane, pageNumber) =>
    set((state) => {
      const current = state.panes[pane];

      const safePage =
        current.totalPages > 0
          ? Math.min(Math.max(1, pageNumber), current.totalPages)
          : Math.max(1, pageNumber);

      if (current.pageNumber === safePage) {
        return state;
      }

      return {
        panes: {
          ...state.panes,
          [pane]: {
            ...current,
            pageNumber: safePage,
          },
        },
      };
    }),

  setTotalPages: (pane, totalPages) =>
    set((state) => {
      const current = state.panes[pane];

      return {
        panes: {
          ...state.panes,
          [pane]: {
            ...current,
            totalPages,
            pageNumber: Math.min(
              Math.max(1, current.pageNumber),
              Math.max(1, totalPages)
            ),
          },
        },
      };
    }),

  zoomIn: (pane) =>
    set((state) => {
      const current = state.panes[pane];

      return {
        panes: {
          ...state.panes,
          [pane]: {
            ...current,
            userScale: clampScale(current.userScale + 0.15),
          },
        },
      };
    }),

  zoomOut: (pane) =>
    set((state) => {
      const current = state.panes[pane];

      return {
        panes: {
          ...state.panes,
          [pane]: {
            ...current,
            userScale: clampScale(current.userScale - 0.15),
          },
        },
      };
    }),

  setUserScale: (pane, scale) =>
    set((state) => {
      const current = state.panes[pane];
      const nextScale = clampScale(scale);

      if (current.userScale === nextScale) {
        return state;
      }

      return {
        panes: {
          ...state.panes,
          [pane]: {
            ...current,
            userScale: nextScale,
          },
        },
      };
    }),

  setFitScale: (pane, fitScale) =>
    set((state) => {
      const current = state.panes[pane];
      const nextFitScale = clampScale(fitScale);

      if (current.fitScale === nextFitScale) {
        return state;
      }

      return {
        panes: {
          ...state.panes,
          [pane]: {
            ...current,
            fitScale: nextFitScale,
          },
        },
      };
    }),

  openLeftPdfOnRightDifferentPage: () =>
    set((state) => {
      const left = state.panes.left;

      if (!left.pdfUrl) {
        return state;
      }

      const preferredPage = Math.min(
        left.pageNumber + 1,
        Math.max(1, left.totalPages || left.pageNumber + 1)
      );

      return {
        panes: {
          ...state.panes,
          right: {
            ...state.panes.right,
            pdfUrl: left.pdfUrl,
            title: `${left.title} / 別ページ`,
            pageNumber: preferredPage,
            totalPages: left.totalPages,
            userScale: left.userScale,
            fitScale: MAX_SCALE,
          },
        },
      };
    }),
}));