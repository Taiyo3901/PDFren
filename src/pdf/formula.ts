import type {
  FormulaCandidate,
  PaneId,
  PdfTextItem,
  TextLine,
} from "../types/pdf";

const MATH_SYMBOL_REGEX = /[=+\-−×÷*/^_√∫∑ΣΠπ∞≈≠≤≥<>±∂∆∇]/;
const LATIN_VARIABLE_REGEX = /[a-zA-Z]\s*[=+\-−×÷*/^_]/;
const NUMBER_OPERATOR_REGEX = /\d+\s*[=+\-−×÷*/^_]\s*\d+/;
const FUNCTION_REGEX = /\b(sin|cos|tan|log|ln|lim|max|min|exp)\b/i;
const STRICT_MATH_SYMBOL_REGEX =
  /[=+\-−×÷*/^_∫∑ΣΠ√∞≈≠≤≥±∂∆Δ∇π<>()[\]{}]/u;
const CALCULUS_REGEX =
  /(\b(d|D)\s*\/\s*d[a-zA-Z]\b|\b(d|D|∂)\s*[a-zA-Z]\s*\/\s*(d|D|∂)\s*[a-zA-Z]\b|∫|∂|\blim\b)/i;
const COMMON_TEXT_WORDS = new Set([
  "and",
  "are",
  "can",
  "for",
  "from",
  "into",
  "let",
  "then",
  "that",
  "the",
  "this",
  "where",
  "with",
]);
const GREEK_REGEX = /[αβγδθλμσφωΩΓΔΛ]/i;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeFormulaText(text: string): string {
  return normalizeText(text)
    .replaceAll("−", "-")
    .replaceAll("×", "*")
    .replaceAll("÷", "/");
}

function countTextWords(text: string): number {
  const words = text.match(/[A-Za-z]{3,}/g) ?? [];

  return words.filter((word) => {
    const lower = word.toLowerCase();
    return !COMMON_TEXT_WORDS.has(lower) && !FUNCTION_REGEX.test(lower);
  }).length;
}

function isProbablyProse(text: string): boolean {
  const normalized = normalizeFormulaText(text);
  const wordCount = countTextWords(normalized);
  const hasStrongMath =
    STRICT_MATH_SYMBOL_REGEX.test(normalized) ||
    CALCULUS_REGEX.test(normalized) ||
    NUMBER_OPERATOR_REGEX.test(normalized);

  if (wordCount >= 4 && !hasStrongMath) return true;
  if (wordCount >= 6) return true;
  if (/[。.!?]$/.test(normalized) && wordCount >= 3) return true;

  return false;
}

function isSingleVariable(text: string): boolean {
  return /^[a-zA-Z](?:['′])?$/.test(text.trim());
}

function isMathToken(text: string): boolean {
  const normalized = normalizeFormulaText(text);

  if (!normalized) return false;
  if (STRICT_MATH_SYMBOL_REGEX.test(normalized)) return true;
  if (CALCULUS_REGEX.test(normalized)) return true;
  if (FUNCTION_REGEX.test(normalized)) return true;
  if (GREEK_REGEX.test(normalized)) return true;
  if (isSingleVariable(normalized)) return true;
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return true;
  if (/^[,.;:|]+$/.test(normalized)) return true;
  if (/^[a-zA-Z]{2,}$/.test(normalized)) return false;

  return /^[a-zA-Z0-9()[\]{}+\-−×÷*/^_=<>.,]+$/.test(normalized);
}

function isCoreMathToken(text: string): boolean {
  const normalized = normalizeFormulaText(text);

  return (
    STRICT_MATH_SYMBOL_REGEX.test(normalized) ||
    CALCULUS_REGEX.test(normalized) ||
    FUNCTION_REGEX.test(normalized) ||
    LATIN_VARIABLE_REGEX.test(normalized) ||
    NUMBER_OPERATOR_REGEX.test(normalized)
  );
}

function getMedian(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function joinLineItems(items: PdfTextItem[]): string {
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

function buildTextLines(items: PdfTextItem[]): TextLine[] {
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
      const newLine: TextLine = {
        items: [item],
        text: item.str,
        page: item.page,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      };

      lines.push(newLine);
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

function scoreFormulaLine(text: string): number {
  const normalized = normalizeFormulaText(text);

  let score = 0;

  if (MATH_SYMBOL_REGEX.test(normalized)) score += 4;
  if (LATIN_VARIABLE_REGEX.test(normalized)) score += 2;
  if (NUMBER_OPERATOR_REGEX.test(normalized)) score += 2;
  if (GREEK_REGEX.test(normalized)) score += 2;
  if (FUNCTION_REGEX.test(normalized)) score += 3;

  if (/[a-zA-Z][0-9]/.test(normalized)) score += 1;
  if (/[a-zA-Z]\([a-zA-Z0-9]/.test(normalized)) score += 2;
  if (/\b\d+\.\d+\b/.test(normalized)) score += 1;

  if (normalized.length <= 2) score -= 3;
  if (/^[。、，．・:：\s]+$/.test(normalized)) score -= 5;

  if (/^[ぁ-んァ-ヶ一-龠\s。、，．・:：]+$/.test(normalized)) {
    score -= 4;
  }

  return score;
}

function escapeLatexText(text: string): string {
  return text
    .replace(/\\/g, "\\backslash ")
    .replace(/#/g, "\\#")
    .replace(/%/g, "\\%")
    .replace(/&/g, "\\&");
}

function applyCalculusReplacements(text: string): string {
  let result = text;

  result = result.replace(
    /\b(d|D)\s*([a-zA-Z])\s*\/\s*d\s*([a-zA-Z])\b/g,
    "\\frac{d $2}{d $3}"
  );
  result = result.replace(
    /∂\s*([a-zA-Z])\s*\/\s*∂\s*([a-zA-Z])/g,
    "\\frac{\\partial $1}{\\partial $2}"
  );
  result = result.replace(
    /\b(d|D)\s*\/\s*d\s*([a-zA-Z])\b/g,
    "\\frac{d}{d $2}"
  );
  result = result.replace(
    /∂\s*\/\s*∂\s*([a-zA-Z])/g,
    "\\frac{\\partial}{\\partial $1}"
  );
  result = result.replace(
    /\blim\s*_\s*([^=]+)\s*->\s*([^\s]+)/g,
    "\\lim_{$1 \\to $2}"
  );
  result = result.replace(/\b([dD])([a-zA-Z])\b/g, "\\, d$2");

  return result;
}

function applySymbolReplacements(text: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/∫/g, "\\int"],
    [/∑/g, "\\sum"],
    [/Σ/g, "\\Sigma"],
    [/Π/g, "\\Pi"],
    [/√\s*([a-zA-Z0-9]+)/g, "\\sqrt{$1}"],
    [/∞/g, "\\infty"],
    [/≈/g, "\\approx"],
    [/≠/g, "\\neq"],
    [/≤/g, "\\leq"],
    [/≥/g, "\\geq"],
    [/±/g, "\\pm"],
    [/∂/g, "\\partial"],
    [/[∆Δ]/g, "\\Delta"],
    [/∇/g, "\\nabla"],
    [/π/g, "\\pi"],
    [/α/g, "\\alpha"],
    [/β/g, "\\beta"],
    [/γ/g, "\\gamma"],
    [/δ/g, "\\delta"],
    [/ε/g, "\\epsilon"],
    [/θ/g, "\\theta"],
    [/λ/g, "\\lambda"],
    [/μ/g, "\\mu"],
    [/σ/g, "\\sigma"],
    [/φ/g, "\\phi"],
    [/ω/g, "\\omega"],
    [/×/g, "\\times"],
    [/÷/g, "\\div"],
    [/−/g, "-"],
    [/π/g, "\\pi"],
    [/Σ/g, "\\Sigma"],
    [/∑/g, "\\sum"],
    [/Π/g, "\\Pi"],
    [/∫/g, "\\int"],
    [/√\s*([a-zA-Z0-9]+)/g, "\\sqrt{$1}"],
    [/∞/g, "\\infty"],
    [/≈/g, "\\approx"],
    [/≠/g, "\\neq"],
    [/≤/g, "\\leq"],
    [/≥/g, "\\geq"],
    [/±/g, "\\pm"],
    [/∂/g, "\\partial"],
    [/∆/g, "\\Delta"],
    [/∇/g, "\\nabla"],
    [/α/g, "\\alpha"],
    [/β/g, "\\beta"],
    [/γ/g, "\\gamma"],
    [/δ/g, "\\delta"],
    [/θ/g, "\\theta"],
    [/λ/g, "\\lambda"],
    [/μ/g, "\\mu"],
    [/σ/g, "\\sigma"],
    [/φ/g, "\\phi"],
    [/ω/g, "\\omega"],
    [/\bsin\b/g, "\\sin"],
    [/\bcos\b/g, "\\cos"],
    [/\btan\b/g, "\\tan"],
    [/\blog\b/g, "\\log"],
    [/\bln\b/g, "\\ln"],
    [/\blim\b/g, "\\lim"],
    [/\bexp\b/g, "\\exp"],
  ];

  let result = text;

  for (const [regex, replacement] of replacements) {
    result = result.replace(regex, replacement);
  }

  return result;
}

function lineItemsToLatex(items: PdfTextItem[]): string {
  if (items.length === 0) return "";

  const sortedItems = [...items].sort((a, b) => a.x - b.x);

  const medianHeight = getMedian(sortedItems.map((item) => item.height)) || 10;

  const centers = sortedItems
    .map((item) => item.y + item.height / 2)
    .sort((a, b) => a - b);

  const medianCenterY = centers[Math.floor(centers.length / 2)] || 0;

  let latex = "";
  let previousRight = 0;

  for (const item of sortedItems) {
    const raw = normalizeFormulaText(item.str);
    if (!raw) continue;

    const centerY = item.y + item.height / 2;
    const isSmall = item.height < medianHeight * 0.9;

    const isSuperscript =
      isSmall && centerY < medianCenterY - medianHeight * 0.18;

    const isSubscript =
      isSmall && centerY > medianCenterY + medianHeight * 0.18;

    const gap = item.x - previousRight;

    if (gap > medianHeight * 0.35 && latex.length > 0) {
      latex += " ";
    }

    const converted = applySymbolReplacements(
      applyCalculusReplacements(escapeLatexText(raw))
    );

    if (isSuperscript && latex.length > 0) {
      latex += `^{${converted}}`;
    } else if (isSubscript && latex.length > 0) {
      latex += `_{${converted}}`;
    } else {
      latex += converted;
    }

    previousRight = item.x + item.width;
  }

  latex = latex.replace(/([a-zA-Z0-9)\]}])\^([a-zA-Z0-9]+)/g, "$1^{$2}");
  latex = latex.replace(/([a-zA-Z0-9)\]}])_([a-zA-Z0-9]+)/g, "$1_{$2}");

  return latex.trim();
}

function getGap(left: PdfTextItem, right: PdfTextItem): number {
  return right.x - (left.x + left.width);
}

function getFormulaItemGroups(line: TextLine): PdfTextItem[][] {
  const items = [...line.items].sort((a, b) => a.x - b.x);
  const mathFlags = items.map((item) => isMathToken(item.str));
  const coreFlags = items.map((item) => isCoreMathToken(item.str));
  const ranges: Array<{ start: number; end: number }> = [];
  const medianHeight = getMedian(items.map((item) => item.height)) || line.height || 10;

  for (let index = 0; index < items.length; index += 1) {
    if (!coreFlags[index]) continue;

    let start = index;
    let end = index;

    while (start > 0) {
      const gap = getGap(items[start - 1], items[start]);
      const canInclude =
        mathFlags[start - 1] &&
        gap < medianHeight * 1.6 &&
        !isProbablyProse(items[start - 1].str);

      if (!canInclude) break;
      start -= 1;
    }

    while (end < items.length - 1) {
      const gap = getGap(items[end], items[end + 1]);
      const canInclude =
        mathFlags[end + 1] &&
        gap < medianHeight * 1.6 &&
        !isProbablyProse(items[end + 1].str);

      if (!canInclude) break;
      end += 1;
    }

    ranges.push({ start, end });
  }

  if (ranges.length === 0) {
    const rawLine = normalizeFormulaText(line.text);

    if (
      !isProbablyProse(rawLine) &&
      items.length <= 10 &&
      items.filter((item) => isMathToken(item.str)).length >= Math.max(2, items.length - 1)
    ) {
      return [items];
    }

    return [];
  }

  const merged: Array<{ start: number; end: number }> = [];

  for (const range of ranges.sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];

    if (last && range.start <= last.end + 1) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  return merged
    .map((range) => items.slice(range.start, range.end + 1))
    .filter((group) => group.length > 0);
}

function getItemsRect(items: PdfTextItem[]) {
  const minX = Math.min(...items.map((item) => item.x));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const minY = Math.min(...items.map((item) => item.y));
  const maxY = Math.max(...items.map((item) => item.y + item.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function dedupeCandidates(candidates: FormulaCandidate[]): FormulaCandidate[] {
  const seen = new Set<string>();
  const result: FormulaCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.pane}-${candidate.page}-${candidate.rawText}`;

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(candidate);
  }

  return result.sort((a, b) => b.score - a.score);
}

export function textToLatex(input: string): string {
  let text = normalizeFormulaText(input);

  text = escapeLatexText(text);
  text = applyCalculusReplacements(text);
  text = applySymbolReplacements(text);

  text = text.replace(/([a-zA-Z0-9)\]}])\^([a-zA-Z0-9]+)/g, "$1^{$2}");
  text = text.replace(/([a-zA-Z0-9)\]}])_([a-zA-Z0-9]+)/g, "$1_{$2}");

  return text.trim();
}

export function extractFormulaCandidates(
  pane: PaneId,
  page: number,
  items: PdfTextItem[]
): FormulaCandidate[] {
  const pageItems = items.filter((item) => item.page === page);
  const lines = buildTextLines(pageItems);

  const candidates: FormulaCandidate[] = [];

  for (const line of lines) {
    const groups = getFormulaItemGroups(line);

    for (const group of groups) {
      const rawText = normalizeFormulaText(joinLineItems(group));
      const latex = lineItemsToLatex(group);
      const rect = getItemsRect(group);

      const score = scoreFormulaLine(rawText) + scoreFormulaLine(latex);

      if (score >= 4) {
        const candidate: FormulaCandidate = {
          id: `${pane}-${page}-${rect.x.toFixed(1)}-${rect.y.toFixed(1)}-${rawText}`,
          pane,
          page,
          rawText,
          latex,
          score,
          rect: {
            page,
            ...rect,
          },
        };

        candidates.push(candidate);
      }
    }
  }

  return dedupeCandidates(candidates);
}

export async function copyLatexToClipboard(latex: string): Promise<void> {
  await navigator.clipboard.writeText(latex);
}
