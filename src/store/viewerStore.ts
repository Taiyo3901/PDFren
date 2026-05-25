import { create } from "zustand";

type ViewerState = {
  pdfUrl: string | null;
  scale: number;
  setPdfUrl: (url: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export const useViewerStore = create<ViewerState>((set) => ({
  pdfUrl: null,
  scale: 1.2,

  setPdfUrl: (url) => set({ pdfUrl: url }),

  zoomIn: () => set((s) => ({ scale: s.scale + 0.2 })),

  zoomOut: () =>
    set((s) => ({
      scale: Math.max(0.4, s.scale - 0.2),
    })),
}));