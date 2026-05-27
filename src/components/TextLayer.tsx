import { useEffect, useRef } from "react";
import { pdfjsLib } from "../lib/pdfjs";
import type { PdfTextItem } from "../types/pdf";

type TextLayerProps = {
  textContent: any;
  viewport: any;
  pageNumber: number;
  debug?: boolean;
  onItems?: (page: number, items: PdfTextItem[]) => void;
};

type PositionedTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function TextLayer({
  textContent,
  viewport,
  pageNumber,
  debug = false,
  onItems,
}: TextLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = layerRef.current;

    if (!container || !textContent || !viewport) return;

    container.innerHTML = "";

    const rawItems = textContent.items as any[];

    const positionedItems: PositionedTextItem[] = rawItems
      .filter((item) => {
        return typeof item.str === "string" && item.str.trim().length > 0;
      })
      .map((item) => {
        const tx = pdfjsLib.Util.transform(
          viewport.transform,
          item.transform
        );

        const x = tx[4];
        const baselineY = tx[5];

        const height =
          Math.hypot(tx[2], tx[3]) ||
          Math.abs((item.height ?? 10) * viewport.scale) ||
          10;

        const width =
          Math.abs((item.width ?? 0) * viewport.scale) ||
          Math.max(item.str.length * height * 0.5, 1);

        return {
          str: item.str,
          x,
          y: baselineY - height,
          width,
          height,
        };
      })
      .sort((a, b) => {
        const yDiff = a.y - b.y;

        if (Math.abs(yDiff) > 3) {
          return yDiff;
        }

        return a.x - b.x;
      });

    const exportedItems: PdfTextItem[] = positionedItems.map((item) => ({
      ...item,
      page: pageNumber,
    }));

    for (const item of positionedItems) {
      const span = document.createElement("span");

      span.textContent = item.str;
      span.dataset.pdfText = "true";

      span.style.position = "absolute";
      span.style.left = `${item.x}px`;
      span.style.top = `${item.y}px`;
      span.style.width = `${item.width}px`;
      span.style.height = `${item.height}px`;

      span.style.fontSize = `${item.height}px`;
      span.style.lineHeight = "1";
      span.style.whiteSpace = "pre";
      span.style.overflow = "hidden";
      span.style.display = "block";
      span.style.transformOrigin = "0 0";

      span.style.userSelect = "text";
      span.style.webkitUserSelect = "text";
      span.style.pointerEvents = "auto";
      span.style.cursor = "text";

      if (debug) {
        span.style.color = "red";
        span.style.background = "rgba(255,0,0,0.15)";
        span.style.outline = "1px solid rgba(255,0,0,0.4)";
      } else {
        span.style.color = "transparent";
        span.style.background = "transparent";
      }

      container.appendChild(span);
    }

    onItems?.(pageNumber, exportedItems);
  }, [textContent, viewport, pageNumber, debug, onItems]);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      event.preventDefault();

      const selection = window.getSelection();
      selection?.removeAllRanges();
    }
  };

  return (
    <div
      ref={layerRef}
      className="pdf-text-layer"
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        inset: 0,
        width: `${viewport.width}px`,
        height: `${viewport.height}px`,
        overflow: "hidden",
        zIndex: 10,

        userSelect: "none",
        WebkitUserSelect: "none",
        pointerEvents: "auto",

        border: debug ? "1px solid red" : "none",
      }}
    />
  );
}