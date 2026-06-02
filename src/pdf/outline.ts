import type { OutlineItem, PaneId, PdfTextItem } from "../types/pdf";
import { buildTextLines, getMedian, normalizeText } from "./textLayout";

const COMMON_HEADINGS = [
  "abstract",
  "introduction",
  "related work",
  "background",
  "method",
  "methods",
  "methodology",
  "experiment",
  "experiments",
  "results",
  "discussion",
  "conclusion",
  "references",
  "acknowledgements",
  "acknowledgments",
];

function scoreHeading(text: string, height: number, medianHeight: number): number {
  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase();

  let score = 0;

  if (height > medianHeight * 1.25) score += 3;
  if (height > medianHeight * 1.5) score += 2;

  if (/^\d+(\.\d+)*\s+/.test(normalized)) score += 3;
  if (/^[A-Z][A-Za-z\s\-]{2,60}$/.test(normalized)) score += 1;

  if (COMMON_HEADINGS.some((heading) => lower === heading)) score += 5;
  if (COMMON_HEADINGS.some((heading) => lower.includes(heading))) score += 2;

  if (normalized.length < 4) score -= 3;
  if (normalized.length > 90) score -= 4;
  if (/[。.!?]$/.test(normalized)) score -= 2;
  if (/^[ぁ-んァ-ヶ一-龠]{20,}$/.test(normalized)) score -= 2;

  return score;
}

function getHeadingLevel(text: string, height: number, medianHeight: number): number {
  if (height > medianHeight * 1.6) return 1;
  if (/^\d+\s+/.test(text)) return 1;
  if (/^\d+\.\d+\s+/.test(text)) return 2;
  return 2;
}

export function extractOutlineItems(
  pane: PaneId,
  items: PdfTextItem[]
): OutlineItem[] {
  const lines = buildTextLines(items);

  const medianHeight =
    getMedian(lines.flatMap((line) => line.items.map((item) => item.height))) ||
    10;

  const results: OutlineItem[] = [];

  for (const line of lines) {
    const text = normalizeText(line.text);
    const score = scoreHeading(text, line.height, medianHeight);

    if (score < 4) continue;

    results.push({
      id: `${pane}-outline-${line.page}-${line.x.toFixed(1)}-${line.y.toFixed(1)}-${text}`,
      pane,
      page: line.page,
      title: text,
      level: getHeadingLevel(text, line.height, medianHeight),
      rect: {
        page: line.page,
        x: line.x,
        y: line.y,
        width: line.width,
        height: line.height,
      },
    });
  }

  return results;
}