import { useEffect, useMemo, useRef, useState } from "react";
import type { PaneId } from "../types/pdf";
import { usePdfCreationStore } from "../store/pdfCreationStore";
import { usePdfImageAnnotationStore } from "../store/pdfImageAnnotationStore";
import { usePdfDrawingStore } from "../store/pdfDrawingStore";
import { usePdfTextBoxStore } from "../store/pdfTextBoxStore";

type PdfAreaSelectionLayerProps = {
  pane: PaneId;
  pageNumber: number;
  viewportWidth: number;
  viewportHeight: number;
  canvas: HTMLCanvasElement | null;
};

type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TrimHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN_SELECTION_SIZE = 12;

function createSelectionId(): string {
  return `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeRect(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): SelectionRect {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);

  return {
    x,
    y,
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  };
}

function cropCanvasToDataUrl(params: {
  sourceCanvas: HTMLCanvasElement;
  rect: SelectionRect;
  viewportWidth: number;
  viewportHeight: number;
}): string | null {
  const { sourceCanvas, rect, viewportWidth, viewportHeight } = params;

  if (
    rect.width < 4 ||
    rect.height < 4 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return null;
  }

  const scaleX = sourceCanvas.width / viewportWidth;
  const scaleY = sourceCanvas.height / viewportHeight;

  const sourceX = Math.floor(rect.x * scaleX);
  const sourceY = Math.floor(rect.y * scaleY);
  const sourceWidth = Math.max(1, Math.floor(rect.width * scaleX));
  const sourceHeight = Math.max(1, Math.floor(rect.height * scaleY));

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = sourceWidth;
  outputCanvas.height = sourceHeight;

  const context = outputCanvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.drawImage(
    sourceCanvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight
  );

  return outputCanvas.toDataURL("image/png");
}

function trimRectFromPointer(params: {
  handle: TrimHandle;
  startRect: SelectionRect;
  deltaX: number;
  deltaY: number;
  viewportWidth: number;
  viewportHeight: number;
}): SelectionRect {
  const { handle, startRect, deltaX, deltaY, viewportWidth, viewportHeight } =
    params;

  let left = startRect.x;
  let top = startRect.y;
  let right = startRect.x + startRect.width;
  let bottom = startRect.y + startRect.height;

  if (handle.includes("w")) {
    left = clamp(left + deltaX, 0, right - MIN_SELECTION_SIZE);
  }

  if (handle.includes("e")) {
    right = clamp(right + deltaX, left + MIN_SELECTION_SIZE, viewportWidth);
  }

  if (handle.includes("n")) {
    top = clamp(top + deltaY, 0, bottom - MIN_SELECTION_SIZE);
  }

  if (handle.includes("s")) {
    bottom = clamp(bottom + deltaY, top + MIN_SELECTION_SIZE, viewportHeight);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function getHandleTitle(handle: TrimHandle): string {
  if (handle === "n") return "上辺をドラッグしてトリミング";
  if (handle === "s") return "下辺をドラッグしてトリミング";
  if (handle === "e") return "右辺をドラッグしてトリミング";
  if (handle === "w") return "左辺をドラッグしてトリミング";
  return "角をドラッグしてトリミング";
}

export function PdfAreaSelectionLayer({
  pane,
  pageNumber,
  viewportWidth,
  viewportHeight,
  canvas,
}: PdfAreaSelectionLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);

  const areaSelectionMode = usePdfCreationStore(
    (state) => state.areaSelectionMode
  );
  const selectionClearRequestId = usePdfCreationStore(
    (state) => state.selectionClearRequestId
  );

  const drawingMode = usePdfDrawingStore((state) => state.drawingMode);
  const textBoxAddArmed = usePdfTextBoxStore((state) => state.textBoxAddArmed);

  const setClippedImageSelection = usePdfImageAnnotationStore(
    (state) => state.setClippedImageSelection
  );
  const clippedImageSelection = usePdfImageAnnotationStore(
    (state) => state.clippedImageSelection
  );

  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [confirmedRect, setConfirmedRect] = useState<SelectionRect | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isTrimming, setIsTrimming] = useState(false);

  const enabled = useMemo(() => {
    return (
      areaSelectionMode.enabled &&
      areaSelectionMode.sourcePane === pane &&
      !drawingMode &&
      !textBoxAddArmed
    );
  }, [
    areaSelectionMode.enabled,
    areaSelectionMode.sourcePane,
    pane,
    drawingMode,
    textBoxAddArmed,
  ]);

  const updateClippedImage = (rect: SelectionRect, selectionId?: string) => {
    if (!canvas) {
      return;
    }

    const imageDataUrl = cropCanvasToDataUrl({
      sourceCanvas: canvas,
      rect,
      viewportWidth,
      viewportHeight,
    });

    if (!imageDataUrl) {
      return;
    }

    setClippedImageSelection({
      id: selectionId ?? clippedImageSelection?.id ?? createSelectionId(),
      sourcePane: pane,
      sourcePage: pageNumber,
      imageDataUrl,
      width: rect.width,
      height: rect.height,
    });
  };

  useEffect(() => {
    setSelectionRect(null);
    setConfirmedRect(null);
    setIsSelecting(false);
    setIsTrimming(false);
    startPointRef.current = null;
  }, [selectionClearRequestId]);

  useEffect(() => {
    if (!clippedImageSelection) {
      setSelectionRect(null);
      setConfirmedRect(null);
      setIsSelecting(false);
      setIsTrimming(false);
      startPointRef.current = null;
    }
  }, [clippedImageSelection]);

  useEffect(() => {
    setSelectionRect(null);
    setConfirmedRect(null);
    setIsSelecting(false);
    setIsTrimming(false);
    startPointRef.current = null;
  }, [pane, pageNumber]);

  const getPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = layerRef.current;

    if (!element) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, viewportWidth);
    const y = clamp(event.clientY - rect.top, 0, viewportHeight);

    return { x, y };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) {
      return;
    }

    const target = event.target;

    if (
      target instanceof HTMLElement &&
      target.closest('[data-area-selection-preview="true"]')
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = getPoint(event);

    if (!point) {
      return;
    }

    startPointRef.current = point;
    setIsSelecting(true);
    setSelectionRect({ x: point.x, y: point.y, width: 0, height: 0 });
    setConfirmedRect(null);
    setClippedImageSelection(null);

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || !isSelecting || !startPointRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = getPoint(event);

    if (!point) {
      return;
    }

    setSelectionRect(
      normalizeRect(startPointRef.current.x, startPointRef.current.y, point.x, point.y)
    );
  };

  const finishSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || !isSelecting) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setIsSelecting(false);
    startPointRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const rect = selectionRect;

    if (!rect || rect.width < 4 || rect.height < 4 || !canvas) {
      setSelectionRect(null);
      setConfirmedRect(null);
      setClippedImageSelection(null);
      return;
    }

    const selectionId = createSelectionId();
    setConfirmedRect(rect);
    updateClippedImage(rect, selectionId);
  };

  const startTrim = (
    event: React.PointerEvent<HTMLDivElement>,
    handle: TrimHandle
  ) => {
    if (!confirmedRect || !canvas) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startRect = confirmedRect;
    const selectionId = clippedImageSelection?.id ?? createSelectionId();

    setIsTrimming(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();

      const nextRect = trimRectFromPointer({
        handle,
        startRect,
        deltaX: moveEvent.clientX - startClientX,
        deltaY: moveEvent.clientY - startClientY,
        viewportWidth,
        viewportHeight,
      });

      setConfirmedRect(nextRect);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      upEvent.preventDefault();

      const nextRect = trimRectFromPointer({
        handle,
        startRect,
        deltaX: upEvent.clientX - startClientX,
        deltaY: upEvent.clientY - startClientY,
        viewportWidth,
        viewportHeight,
      });

      setConfirmedRect(nextRect);
      updateClippedImage(nextRect, selectionId);
      setIsTrimming(false);

      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const activeRect = confirmedRect ?? selectionRect;

  const renderTrimHandles = () => {
    if (!confirmedRect) {
      return null;
    }

    const handles: TrimHandle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

    return handles.map((handle) => (
      <div
        key={handle}
        className={`pdf-area-trim-handle trim-${handle}`}
        data-area-trim-handle="true"
        title={getHandleTitle(handle)}
        onPointerDown={(event) => startTrim(event, handle)}
      />
    ));
  };

  return (
    <div
      ref={layerRef}
      className={enabled ? "pdf-area-selection-layer active" : "pdf-area-selection-layer"}
      style={{
        position: "absolute",
        inset: 0,
        width: `${viewportWidth}px`,
        height: `${viewportHeight}px`,
        zIndex: enabled ? 60 : 28,
        pointerEvents: enabled ? "auto" : "none",
        cursor: enabled ? "crosshair" : "default",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishSelection}
      onPointerCancel={finishSelection}
    >
      {activeRect && (
        <div
          data-area-selection-preview="true"
          className={
            confirmedRect
              ? "pdf-area-selection-rect confirmed pdf-area-selection-preview"
              : "pdf-area-selection-rect"
          }
          draggable={Boolean(confirmedRect && clippedImageSelection && !isTrimming)}
          onPointerDown={(event) => {
            if (!confirmedRect || !clippedImageSelection) {
              return;
            }

            event.stopPropagation();
          }}
          onDragStart={(event) => {
            if (!confirmedRect || !clippedImageSelection || isTrimming) {
              event.preventDefault();
              return;
            }

            event.stopPropagation();
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData(
              "application/pdf-analyzer-clipped-image",
              clippedImageSelection.id
            );
            event.dataTransfer.setData("text/plain", clippedImageSelection.id);
          }}
          title={
            confirmedRect
              ? "中央をドラッグで貼り付け / 四辺をドラッグでトリミング"
              : "範囲選択中"
          }
          style={{
            position: "absolute",
            left: `${activeRect.x}px`,
            top: `${activeRect.y}px`,
            width: `${activeRect.width}px`,
            height: `${activeRect.height}px`,
            border: confirmedRect ? "2px solid #f59e0b" : "2px dashed #60a5fa",
            background: confirmedRect
              ? "rgba(245, 158, 11, 0.18)"
              : "rgba(96, 165, 250, 0.14)",
            boxSizing: "border-box",
            pointerEvents: confirmedRect ? "auto" : "none",
            cursor: confirmedRect ? "grab" : "crosshair",
          }}
        >
          {renderTrimHandles()}
        </div>
      )}
    </div>
  );
}
