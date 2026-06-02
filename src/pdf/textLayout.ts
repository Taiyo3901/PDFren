import type { PdfTextItem, TextLine } from "../types/pdf";

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function buildTextLines(items: PdfTextItem[]): TextLine[] {
  const sortedItems = [...items].sort((a, b) => {
    const aCenterY = a.y + a.height / 2;
    const bCenterY = b.y + b.height / 2;
    const yDiff = aCenterY - bCenterY;

    if (Math.abs(yDiff) > Math.max(4, Math.min(a.height, b.height) * 0.45)) {
      return yDiff;
    }

    return a.x - b.x;
  });

  const lines: TextLine[] = [];

  for (const item of sortedItems) {
    const itemCenterY = item.y + item.height / 2;

    let matchedLine: TextLine | null = null;

    for (const line of lines) {
      if (line.page !== item.page) continue;

      const lineCenterY = line.y + line.height / 2;
      const threshold = Math.max(5, Math.max(line.height, item.height) * 0.45);

      if (Math.abs(lineCenterY - itemCenterY) <= threshold) {
        matchedLine = line;
        break;
      }
    }

    if (matchedLine) {
      matchedLine.items.push(item);
      matchedLine.items.sort((a, b) => a.x - b.x);

      const minX = Math.min(...matchedLine.items.map((textItem) => textItem.x));
      const maxX = Math.max(
        ...matchedLine.items.map((textItem) => textItem.x + textItem.width)
      );
      const minY = Math.min(...matchedLine.items.map((textItem) => textItem.y));
      const maxY = Math.max(
        ...matchedLine.items.map((textItem) => textItem.y + textItem.height)
      );

      matchedLine.x = minX;
      matchedLine.y = minY;
      matchedLine.width = maxX - minX;
      matchedLine.height = maxY - minY;
      matchedLine.text = joinLineItems(matchedLine.items);
    } else {
      lines.push({
        items: [item],
        text: item.str,
        page: item.page,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      });
    }
  }

  return lines.sort((a, b) => {
    const yDiff = a.y - b.y;

    if (Math.abs(yDiff) > 4) {
      return yDiff;
    }

    return a.x - b.x;
  });
}

export function joinLineItems(items: PdfTextItem[]): string {
  const sorted = [...items].sort((a, b) => a.x - b.x);

  let text = "";
  let previousRight = 0;
  const medianHeight = getMedian(sorted.map((item) => item.height)) || 10;

  for (const item of sorted) {
    const gap = item.x - previousRight;

    if (text.length > 0 && gap > medianHeight * 0.4) {
      text += " ";
    }

    text += item.str;
    previousRight = item.x + item.width;
  }

  return normalizeText(text);
}

export function itemsToPlainText(items: PdfTextItem[]): string {
  const lines = buildTextLines(items);

  return lines
    .map((line) => line.text)
    .filter((text) => text.length > 0)
    .join("\n");
}

export function getMedian(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}