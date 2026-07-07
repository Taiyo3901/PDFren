import { create } from "zustand";
import type { PaneId, PdfImageAnnotation } from "../types/pdf";

export type PdfClippedImageSelection = {
  id: string;
  sourcePane: PaneId;
  sourcePage: number;
  imageDataUrl: string;
  width: number;
  height: number;
};

type PdfImageAnnotationState = {
  imageAnnotations: PdfImageAnnotation[];
  selectedImageAnnotationId: string | null;
  clippedImageSelection: PdfClippedImageSelection | null;
  setClippedImageSelection: (selection: PdfClippedImageSelection | null) => void;
  addImageAnnotation: (annotation: PdfImageAnnotation) => void;
  updateImageAnnotation: (id: string, patch: Partial<PdfImageAnnotation>) => void;
  removeImageAnnotation: (id: string) => void;
  selectImageAnnotation: (id: string | null) => void;
  clearPaneImageAnnotations: (pane: PaneId) => void;
  swapPaneImageAnnotations: () => void;
};

export const usePdfImageAnnotationStore = create<PdfImageAnnotationState>((set) => ({
  imageAnnotations: [],
  selectedImageAnnotationId: null,
  clippedImageSelection: null,

  setClippedImageSelection: (selection) => set({ clippedImageSelection: selection }),

  addImageAnnotation: (annotation) =>
    set((state) => ({
      imageAnnotations: [...state.imageAnnotations, annotation],
      selectedImageAnnotationId: annotation.id,
    })),

  updateImageAnnotation: (id, patch) =>
    set((state) => ({
      imageAnnotations: state.imageAnnotations.map((annotation) =>
        annotation.id === id ? { ...annotation, ...patch } : annotation
      ),
    })),

  removeImageAnnotation: (id) =>
    set((state) => ({
      imageAnnotations: state.imageAnnotations.filter((annotation) => annotation.id !== id),
      selectedImageAnnotationId:
        state.selectedImageAnnotationId === id ? null : state.selectedImageAnnotationId,
    })),

  selectImageAnnotation: (id) => set({ selectedImageAnnotationId: id }),

  clearPaneImageAnnotations: (pane) =>
    set((state) => ({
      imageAnnotations: state.imageAnnotations.filter((annotation) => annotation.pane !== pane),
      selectedImageAnnotationId: null,
      clippedImageSelection:
        state.clippedImageSelection?.sourcePane === pane ? null : state.clippedImageSelection,
    })),

  swapPaneImageAnnotations: () =>
    set((state) => ({
      imageAnnotations: state.imageAnnotations.map((annotation) => ({
        ...annotation,
        pane: annotation.pane === "left" ? "right" : "left",
        sourcePane:
          annotation.sourcePane === "left"
            ? "right"
            : annotation.sourcePane === "right"
            ? "left"
            : annotation.sourcePane,
      })),
      clippedImageSelection: state.clippedImageSelection
        ? {
            ...state.clippedImageSelection,
            sourcePane: state.clippedImageSelection.sourcePane === "left" ? "right" : "left",
          }
        : null,
      selectedImageAnnotationId: null,
    })),
}));
