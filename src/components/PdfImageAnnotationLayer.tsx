import type { PaneId, PdfImageAnnotation } from "../types/pdf";
import { useState } from "react";
import { usePdfCreationStore } from "../store/pdfCreationStore";
import { usePdfImageAnnotationStore } from "../store/pdfImageAnnotationStore";

export type PdfImageAnnotationLayerProps = {
  pane: PaneId;
  pageNumber: number;
  viewportWidth: number;
  viewportHeight: number;
};

type TrimHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TrimAmounts = {
  trimLeft: number;
  trimTop: number;
  trimRight: number;
  trimBottom: number;
  rect: Rect;
};

type TrimPreview = {
  annotationId: string;
  rect: Rect;
  imageDataUrl: string;
  originalWidth: number;
  originalHeight: number;
  offsetX: number;
  offsetY: number;
};

const MIN_IMAGE_SIZE = 24;

function createImageAnnotationId(): string {
  return `image-annotation-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeMimeType(dataUrl: string): "image/png" | "image/jpeg" {
  return dataUrl.startsWith("data:image/jpeg") ||
    dataUrl.startsWith("data:image/jpg")
    ? "image/jpeg"
    : "image/png";
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
    image.src = dataUrl;
  });
}

async function cropImageDataUrl(params: {
  imageDataUrl: string;
  displayWidth: number;
  displayHeight: number;
  trimLeft: number;
  trimTop: number;
  trimRight: number;
  trimBottom: number;
}): Promise<string> {
  const { imageDataUrl, displayWidth, displayHeight } = params;
  const image = await loadImage(imageDataUrl);

  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;

  if (
    naturalWidth <= 0 ||
    naturalHeight <= 0 ||
    displayWidth <= 0 ||
    displayHeight <= 0
  ) {
    return imageDataUrl;
  }

  const scaleX = naturalWidth / displayWidth;
  const scaleY = naturalHeight / displayHeight;

  const sourceX = clamp(Math.round(params.trimLeft * scaleX), 0, naturalWidth - 1);
  const sourceY = clamp(Math.round(params.trimTop * scaleY), 0, naturalHeight - 1);
  const sourceRight = clamp(
    Math.round(naturalWidth - params.trimRight * scaleX),
    sourceX + 1,
    naturalWidth
  );
  const sourceBottom = clamp(
    Math.round(naturalHeight - params.trimBottom * scaleY),
    sourceY + 1,
    naturalHeight
  );

  const sourceWidth = Math.max(1, sourceRight - sourceX);
  const sourceHeight = Math.max(1, sourceBottom - sourceY);

  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;

  const context = canvas.getContext("2d");
  if (!context) return imageDataUrl;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight
  );

  return canvas.toDataURL(normalizeMimeType(imageDataUrl));
}

function getTrimAmounts(params: {
  handle: TrimHandle;
  deltaX: number;
  deltaY: number;
  width: number;
  height: number;
}): TrimAmounts {
  const { handle, deltaX, deltaY, width, height } = params;

  let trimLeft = 0;
  let trimTop = 0;
  let trimRight = 0;
  let trimBottom = 0;

  if (handle.includes("w")) {
    trimLeft = clamp(deltaX, 0, width - MIN_IMAGE_SIZE);
  }

  if (handle.includes("e")) {
    trimRight = clamp(-deltaX, 0, width - MIN_IMAGE_SIZE);
  }

  if (handle.includes("n")) {
    trimTop = clamp(deltaY, 0, height - MIN_IMAGE_SIZE);
  }

  if (handle.includes("s")) {
    trimBottom = clamp(-deltaY, 0, height - MIN_IMAGE_SIZE);
  }

  const nextWidth = Math.max(MIN_IMAGE_SIZE, width - trimLeft - trimRight);
  const nextHeight = Math.max(MIN_IMAGE_SIZE, height - trimTop - trimBottom);

  return {
    trimLeft,
    trimTop,
    trimRight,
    trimBottom,
    rect: {
      x: trimLeft,
      y: trimTop,
      width: nextWidth,
      height: nextHeight,
    },
  };
}

function getNextTrimRect(params: {
  annotation: PdfImageAnnotation;
  handle: TrimHandle;
  deltaX: number;
  deltaY: number;
  viewportWidth: number;
  viewportHeight: number;
}): Rect {
  const trim = getTrimAmounts({
    handle: params.handle,
    deltaX: params.deltaX,
    deltaY: params.deltaY,
    width: params.annotation.width,
    height: params.annotation.height,
  });

  const nextX = clamp(
    params.annotation.x + trim.trimLeft,
    0,
    Math.max(0, params.viewportWidth - trim.rect.width)
  );
  const nextY = clamp(
    params.annotation.y + trim.trimTop,
    0,
    Math.max(0, params.viewportHeight - trim.rect.height)
  );

  return {
    x: nextX,
    y: nextY,
    width: trim.rect.width,
    height: trim.rect.height,
  };
}

function getTrimPreview(params: {
  annotation: PdfImageAnnotation;
  handle: TrimHandle;
  deltaX: number;
  deltaY: number;
  viewportWidth: number;
  viewportHeight: number;
}): TrimPreview {
  const trim = getTrimAmounts({
    handle: params.handle,
    deltaX: params.deltaX,
    deltaY: params.deltaY,
    width: params.annotation.width,
    height: params.annotation.height,
  });

  const rect = getNextTrimRect(params);

  return {
    annotationId: params.annotation.id,
    rect,
    imageDataUrl: params.annotation.imageDataUrl,
    originalWidth: params.annotation.width,
    originalHeight: params.annotation.height,
    offsetX: trim.trimLeft,
    offsetY: trim.trimTop,
  };
}

function getTrimHandleTitle(handle: TrimHandle): string {
  if (handle === "n") return "上辺をドラッグして画像を削る";
  if (handle === "s") return "下辺をドラッグして画像を削る";
  if (handle === "e") return "右辺をドラッグして画像を削る";
  if (handle === "w") return "左辺をドラッグして画像を削る";
  return "角をドラッグして画像を削る";
}

export function PdfImageAnnotationLayer({
  pane,
  pageNumber,
  viewportWidth,
  viewportHeight,
}: PdfImageAnnotationLayerProps) {
  const [trimPreview, setTrimPreview] = useState<TrimPreview | null>(null);

  const blankPane = usePdfCreationStore((state) => state.blankPane);
  const clippedImageSelection = usePdfImageAnnotationStore(
    (state) => state.clippedImageSelection
  );
  const imageAnnotations = usePdfImageAnnotationStore(
    (state) => state.imageAnnotations
  );
  const selectedImageAnnotationId = usePdfImageAnnotationStore(
    (state) => state.selectedImageAnnotationId
  );
  const addImageAnnotation = usePdfImageAnnotationStore(
    (state) => state.addImageAnnotation
  );
  const updateImageAnnotation = usePdfImageAnnotationStore(
    (state) => state.updateImageAnnotation
  );
  const removeImageAnnotation = usePdfImageAnnotationStore(
    (state) => state.removeImageAnnotation
  );
  const selectImageAnnotation = usePdfImageAnnotationStore(
    (state) => state.selectImageAnnotation
  );

  const canDropHere = blankPane === pane;
  const pageAnnotations = imageAnnotations.filter(
    (annotation) => annotation.pane === pane && annotation.page === pageNumber
  );

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!canDropHere || !clippedImageSelection) return;

    const transferredId = event.dataTransfer.getData(
      "application/pdf-analyzer-clipped-image"
    );
    if (transferredId && transferredId !== clippedImageSelection.id) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    const desiredWidth = Math.min(
      clippedImageSelection.width,
      viewportWidth * 0.85
    );
    const scale = desiredWidth / Math.max(1, clippedImageSelection.width);
    const desiredHeight = Math.min(
      clippedImageSelection.height * scale,
      viewportHeight * 0.85
    );

    const x = clamp(
      event.clientX - rect.left - desiredWidth / 2,
      0,
      Math.max(0, viewportWidth - desiredWidth)
    );
    const y = clamp(
      event.clientY - rect.top - desiredHeight / 2,
      0,
      Math.max(0, viewportHeight - desiredHeight)
    );

    addImageAnnotation({
      id: createImageAnnotationId(),
      pane,
      page: pageNumber,
      x,
      y,
      width: desiredWidth,
      height: desiredHeight,
      imageDataUrl: clippedImageSelection.imageDataUrl,
      sourcePane: clippedImageSelection.sourcePane,
      sourcePage: clippedImageSelection.sourcePage,
    });
  };

  const startMove = (
    event: React.PointerEvent<HTMLDivElement>,
    annotation: PdfImageAnnotation
  ) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.closest("[data-image-trim-handle='true']") ||
        target.closest("[data-image-resize-handle='true']") ||
        target.closest("button"))
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setTrimPreview(null);
    selectImageAnnotation(annotation.id);

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startX = annotation.x;
    const startY = annotation.y;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startClientX;
      const deltaY = moveEvent.clientY - startClientY;

      updateImageAnnotation(annotation.id, {
        x: clamp(startX + deltaX, 0, Math.max(0, viewportWidth - annotation.width)),
        y: clamp(startY + deltaY, 0, Math.max(0, viewportHeight - annotation.height)),
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const startResize = (
    event: React.PointerEvent<HTMLDivElement>,
    annotation: PdfImageAnnotation
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setTrimPreview(null);
    selectImageAnnotation(annotation.id);

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startWidth = annotation.width;
    const startHeight = annotation.height;
    const aspectRatio = startWidth / Math.max(1, startHeight);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startClientX;
      const deltaY = moveEvent.clientY - startClientY;

      const dominantDelta =
        Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY * aspectRatio;

      const maxWidth = Math.max(MIN_IMAGE_SIZE, viewportWidth - annotation.x);
      const maxHeight = Math.max(MIN_IMAGE_SIZE, viewportHeight - annotation.y);

      let nextWidth = clamp(startWidth + dominantDelta, MIN_IMAGE_SIZE, maxWidth);
      let nextHeight = nextWidth / aspectRatio;

      if (nextHeight > maxHeight) {
        nextHeight = maxHeight;
        nextWidth = nextHeight * aspectRatio;
      }

      updateImageAnnotation(annotation.id, {
        width: nextWidth,
        height: nextHeight,
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const startTrim = (
    event: React.PointerEvent<HTMLDivElement>,
    annotation: PdfImageAnnotation,
    handle: TrimHandle
  ) => {
    event.preventDefault();
    event.stopPropagation();
    selectImageAnnotation(annotation.id);

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startAnnotation = annotation;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();

      setTrimPreview(
        getTrimPreview({
          annotation: startAnnotation,
          handle,
          deltaX: moveEvent.clientX - startClientX,
          deltaY: moveEvent.clientY - startClientY,
          viewportWidth,
          viewportHeight,
        })
      );
    };

    const handlePointerUp = async (upEvent: PointerEvent) => {
      upEvent.preventDefault();

      const deltaX = upEvent.clientX - startClientX;
      const deltaY = upEvent.clientY - startClientY;

      const trim = getTrimAmounts({
        handle,
        deltaX,
        deltaY,
        width: startAnnotation.width,
        height: startAnnotation.height,
      });

      const rect = getNextTrimRect({
        annotation: startAnnotation,
        handle,
        deltaX,
        deltaY,
        viewportWidth,
        viewportHeight,
      });

      const didTrim =
        trim.trimLeft > 0 ||
        trim.trimTop > 0 ||
        trim.trimRight > 0 ||
        trim.trimBottom > 0;

      if (!didTrim) {
        setTrimPreview(null);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
        return;
      }

      try {
        const nextImageDataUrl = await cropImageDataUrl({
          imageDataUrl: startAnnotation.imageDataUrl,
          displayWidth: startAnnotation.width,
          displayHeight: startAnnotation.height,
          trimLeft: trim.trimLeft,
          trimTop: trim.trimTop,
          trimRight: trim.trimRight,
          trimBottom: trim.trimBottom,
        });

        updateImageAnnotation(annotation.id, {
          ...rect,
          imageDataUrl: nextImageDataUrl,
        });
      } catch (error) {
        console.error("[PdfImageAnnotationLayer] image trim failed", error);
        updateImageAnnotation(annotation.id, rect);
      } finally {
        setTrimPreview(null);
      }

      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const renderImageTrimHandles = (annotation: PdfImageAnnotation) => {
    const handles: TrimHandle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

    return handles.map((handle) => (
      <div
        key={handle}
        className={`pdf-image-trim-handle trim-${handle}`}
        data-image-trim-handle="true"
        title={getTrimHandleTitle(handle)}
        onPointerDown={(event) => startTrim(event, annotation, handle)}
      />
    ));
  };

  return (
    <div
      className="pdf-image-annotation-layer"
      style={{
        position: "absolute",
        inset: 0,
        width: `${viewportWidth}px`,
        height: `${viewportHeight}px`,
        zIndex: 26,
        pointerEvents: canDropHere || pageAnnotations.length > 0 ? "auto" : "none",
      }}
      onDragOver={(event) => {
        if (!canDropHere || !clippedImageSelection) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          setTrimPreview(null);
          selectImageAnnotation(null);
        }
      }}
    >
      {pageAnnotations.map((annotation) => {
        const selected = selectedImageAnnotationId === annotation.id;
        const preview = trimPreview?.annotationId === annotation.id ? trimPreview : null;
        const rect = preview?.rect ?? annotation;

        return (
          <div
            key={annotation.id}
            className={
              selected
                ? "pdf-image-annotation selected"
                : "pdf-image-annotation"
            }
            style={{
              position: "absolute",
              left: `${rect.x}px`,
              top: `${rect.y}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
              border: selected ? "1px solid #2563eb" : "none",
              boxSizing: "border-box",
              background: "rgba(255,255,255,0.01)",
              overflow: "visible",
            }}
            onPointerDown={(event) => startMove(event, annotation)}
          >
            <div
              className="pdf-image-annotation-crop-view"
              style={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              {preview ? (
                <img
                  src={preview.imageDataUrl}
                  draggable={false}
                  alt="貼り付け画像"
                  style={{
                    width: `${preview.originalWidth}px`,
                    height: `${preview.originalHeight}px`,
                    display: "block",
                    objectFit: "fill",
                    transform: `translate(${-preview.offsetX}px, ${-preview.offsetY}px)`,
                    transformOrigin: "top left",
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                />
              ) : (
                <img
                  src={annotation.imageDataUrl}
                  draggable={false}
                  alt="貼り付け画像"
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "block",
                    objectFit: "fill",
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                />
              )}
            </div>

            {selected && (
              <>
                {renderImageTrimHandles(annotation)}

                <button
                  type="button"
                  className="pdf-image-annotation-delete-button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setTrimPreview(null);
                    removeImageAnnotation(annotation.id);
                  }}
                  title="貼り付け画像を削除"
                >
                  ×
                </button>

                <div
                  className="pdf-image-annotation-resize-handle"
                  data-image-resize-handle="true"
                  onPointerDown={(event) => startResize(event, annotation)}
                  title="ドラッグして画像サイズ変更"
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
