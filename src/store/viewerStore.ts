import { create } from "zustand";
import type { PaneId } from "../types/pdf";

type PaneState = {
  pdfUrl: string | null;
  title: string;
  pageNumber: number;
  totalPages: number;
  scale: number;
};

type ViewerState = {
  panes: Record<PaneId, PaneState>;

  loadPdf: (pane: PaneId, url: string, title?: string) => void;
  clearPdf: (pane: PaneId) => void;

  setPageNumber: (pane: PaneId, pageNumber: number) => void;
  setTotalPages: (pane: PaneId, totalPages: number) => void;

  zoomIn: (pane: PaneId) => void;
  zoomOut: (pane: PaneId) => void;
  setScale: (pane: PaneId, scale: number) => void;

  mirrorLeftToRight: () => void;
};

const initialPaneState: PaneState = {
  pdfUrl: null,
  title: "未読み込み",
  pageNumber: 1,
  totalPages: 0,
  scale: 1.2,
};

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
    set((state) => ({
      panes: {
        ...state.panes,
        [pane]: {
          ...state.panes[pane],
          totalPages,
          pageNumber: Math.min(
            Math.max(1, state.panes[pane].pageNumber),
            Math.max(1, totalPages)
          ),
        },
      },
    })),

  zoomIn: (pane) =>
    set((state) => ({
      panes: {
        ...state.panes,
        [pane]: {
          ...state.panes[pane],
          scale: Math.min(
            3,
            Number((state.panes[pane].scale + 0.15).toFixed(2))
          ),
        },
      },
    })),

  zoomOut: (pane) =>
    set((state) => ({
      panes: {
        ...state.panes,
        [pane]: {
          ...state.panes[pane],
          scale: Math.max(
            0.5,
            Number((state.panes[pane].scale - 0.15).toFixed(2))
          ),
        },
      },
    })),

  setScale: (pane, scale) =>
    set((state) => ({
      panes: {
        ...state.panes,
        [pane]: {
          ...state.panes[pane],
          scale: Math.min(3, Math.max(0.5, scale)),
        },
      },
    })),

  mirrorLeftToRight: () =>
    set((state) => {
      const left = state.panes.left;

      if (!left.pdfUrl) return state;

      return {
        panes: {
          ...state.panes,
          right: {
            ...state.panes.right,
            pdfUrl: left.pdfUrl,
            title: `${left.title} / 別ページ`,
            pageNumber: Math.min(left.pageNumber + 1, Math.max(1, left.totalPages)),
            totalPages: left.totalPages,
            scale: left.scale,
          },
        },
      };
    }),
}));