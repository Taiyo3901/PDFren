import { useEffect, useMemo, useRef } from "react";
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
  fontName?: string;
  fontFamily?: string;
  isBold?: boolean;
};

type TextItemRange = {
  item: PositionedTextItem;
  start: number;
  end: number;
};

function getTextContentSignature(textContent: any): string {
  const items = textContent?.items as any[] | undefined;

  if (!items || items.length === 0) {
    return "empty";
  }

  const first = String(items[0]?.str ?? "");
  const last = String(items[items.length - 1]?.str ?? "");

  return `${items.length}:${first}:${last}`;
}

function isBoldFont(fontName?: string, fontFamily?: string): boolean {
  const source = `${fontName ?? ""} ${fontFamily ?? ""}`.toLowerCase();

  return (
    source.includes("bold") ||
    source.includes("black") ||
    source.includes("heavy") ||
    source.includes("semibold") ||
    source.includes("demibold") ||
    source.includes("medium") ||
    source.includes("gothicbbb") ||
    source.includes("gothic")
  );
}

const URL_PATTERN_GLOBAL = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_URL_PUNCTUATION = /[),.;:!?]+$/;

function normalizeClickableUrl(rawText: string): string | null {
  const rawUrl = rawText.replace(TRAILING_URL_PUNCTUATION, "");

  if (!rawUrl) return null;

  return rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
    ? rawUrl
    : `https://${rawUrl}`;
}

function createLinkOverlay(
  href: string,
  ranges: TextItemRange[],
  start: number,
  end: number,
  debug: boolean
): HTMLAnchorElement | null {
  const rects = ranges
    .map((range) => {
      const overlapStart = Math.max(start, range.start);
      const overlapEnd = Math.min(end, range.end);

      if (overlapStart >= overlapEnd || range.item.str.length === 0) {
        return null;
      }

      const charWidth = range.item.width / range.item.str.length;
      const localStart = overlapStart - range.start;
      const localEnd = overlapEnd - range.start;
      const x = range.item.x + charWidth * localStart;
      const width = Math.max(1, charWidth * (localEnd - localStart));

      return {
        x,
        y: range.item.y,
        right: x + width,
        bottom: range.item.y + range.item.height,
      };
    })
    .filter((rect): rect is { x: number; y: number; right: number; bottom: number } => {
      return rect !== null;
    });

  if (rects.length === 0) return null;

  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const link = document.createElement("a");

  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = href;
  link.setAttribute("aria-label", href);

  link.style.position = "absolute";
  link.style.left = `${left}px`;
  link.style.top = `${top}px`;
  link.style.width = `${Math.max(1, right - left)}px`;
  link.style.height = `${Math.max(1, bottom - top)}px`;
  link.style.display = "block";
  link.style.zIndex = "12";
  link.style.pointerEvents = "auto";
  link.style.cursor = "pointer";
  link.style.background = debug ? "rgba(37, 99, 235, 0.18)" : "transparent";
  link.style.outline = debug ? "1px solid rgba(37, 99, 235, 0.6)" : "none";

  link.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });

  return link;
}

function appendUrlLinkOverlays(
  fragment: DocumentFragment,
  positionedItems: PositionedTextItem[],
  debug: boolean
) {
  const lines: PositionedTextItem[][] = [];

  for (const item of positionedItems) {
    const lastLine = lines[lines.length - 1];
    const lastItem = lastLine?.[lastLine.length - 1];
    const yTolerance = Math.max(4, item.height * 0.45);

    if (lastLine && lastItem && Math.abs(lastItem.y - item.y) <= yTolerance) {
      lastLine.push(item);
    } else {
      lines.push([item]);
    }
  }

  for (const line of lines) {
    const sortedLine = [...line].sort((a, b) => a.x - b.x);
    const ranges: TextItemRange[] = [];
    let lineText = "";

    for (const item of sortedLine) {
      const start = lineText.length;
      lineText += item.str;
      ranges.push({
        item,
        start,
        end: lineText.length,
      });
    }

    for (const match of lineText.matchAll(URL_PATTERN_GLOBAL)) {
      const matchText = match[0];
      const matchStart = match.index ?? 0;
      const href = normalizeClickableUrl(matchText);

      if (!href) continue;

      const trimmedLength = href.startsWith("https://") && matchText.startsWith("www.")
        ? href.length - "https://".length
        : href.length;
      const overlay = createLinkOverlay(
        href,
        ranges,
        matchStart,
        matchStart + trimmedLength,
        debug
      );

      if (overlay) {
        fragment.appendChild(overlay);
      }
    }
  }
}

export function TextLayer({
  textContent,
  viewport,
  pageNumber,
  debug = false,
  onItems,
}: TextLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const onItemsRef = useRef<TextLayerProps["onItems"]>(onItems);

  useEffect(() => {
    onItemsRef.current = onItems;
  }, [onItems]);

  const renderKey = useMemo(() => {
    return [
      pageNumber,
      viewport?.width,
      viewport?.height,
      viewport?.scale,
      getTextContentSignature(textContent),
      debug ? "debug" : "normal",
    ].join("|");
  }, [pageNumber, viewport, textContent, debug]);

  useEffect(() => {
    const container = layerRef.current;

    if (!container) return;

    const handleNativeSelectStart = (event: Event) => {
      if (event.target === container) {
        event.preventDefault();
      }
    };

    container.addEventListener("selectstart", handleNativeSelectStart);

    return () => {
      container.removeEventListener("selectstart", handleNativeSelectStart);
    };
  }, []);

  useEffect(() => {
    const container = layerRef.current;

    if (!container || !textContent || !viewport) return;

    container.innerHTML = "";

    const rawItems = textContent.items as any[];
    const styles = textContent.styles ?? {};

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
          Math.max(String(item.str).length * height * 0.5, 1);

        const fontName =
          typeof item.fontName === "string" ? item.fontName : undefined;

        const styleInfo = fontName ? styles[fontName] : undefined;

        const fontFamily =
          typeof styleInfo?.fontFamily === "string"
            ? styleInfo.fontFamily
            : undefined;

        const positionedItem: PositionedTextItem = {
          str: String(item.str),
          x,
          y: baselineY - height,
          width,
          height,
          fontName,
          fontFamily,
          isBold: isBoldFont(fontName, fontFamily),
        };

        return positionedItem;
      })
      .sort((a, b) => {
        const yDiff = a.y - b.y;

        if (Math.abs(yDiff) > 3) {
          return yDiff;
        }

        return a.x - b.x;
      });

    const exportedItems: PdfTextItem[] = positionedItems.map((item) => ({
      str: item.str,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      page: pageNumber,
      fontName: item.fontName,
      fontFamily: item.fontFamily,
      isBold: item.isBold,
    }));

    const fragment = document.createDocumentFragment();

    for (const item of positionedItems) {
      const span = document.createElement("span");

      span.textContent = item.str;
      span.dataset.pdfText = "true";

      span.style.position = "absolute";
      span.style.left = `${item.x}px`;
      span.style.top = `${item.y}px`;
      span.style.width = `${Math.max(item.width, 1)}px`;
      span.style.height = `${Math.max(item.height, 1)}px`;
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
      span.style.textDecoration = "none";

      if (debug) {
        span.style.color = item.isBold ? "blue" : "red";
        span.style.background = item.isBold
          ? "rgba(0,120,255,0.15)"
          : "rgba(255,0,0,0.15)";
        span.style.outline = item.isBold
          ? "1px solid rgba(0,120,255,0.5)"
          : "1px solid rgba(255,0,0,0.4)";
      } else {
        span.style.color = "transparent";
        span.style.background = "transparent";
      }

      fragment.appendChild(span);
    }

    appendUrlLinkOverlays(fragment, positionedItems, debug);

    container.appendChild(fragment);

    onItemsRef.current?.(pageNumber, exportedItems);
  }, [renderKey, textContent, viewport, pageNumber, debug]);

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
