import type { FormulaCandidate, PaneId, PdfTextItem } from "../types/pdf";

type TextLine = {
  items: PdfTextItem[];
  text: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const MATH_SYMBOL_REGEX = /[=+\-−×÷*/^_√∫∑ΣΠπ∞≈≠≤≥<>±∂∆∇]/;
const LATIN_VARIABLE_REGEX = /[a-zA-Z]\s*[=+\-−×÷*/^_]/;
const NUMBER_OPERATOR_REGEX = /\d+\s*[=+\-−×÷*/^_]\s*\d+/;
const FUNCTION_REGEX = /\b(sin|cos|tan|log|ln|lim|max|min|exp)\b/i;
const GREEK_REGEX = /[αβγδθλμσφωΩΓΔΛ]/i;

function normalizeFormulaText(text: string): string {
  return text
    .replaceAll("−", "-")
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replace(/\s+/g, " ")
    .trim();
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

  // 日本語文章だけの行は数式ではない可能性が高い
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

function applySymbolReplacements(text: string): string {
  const replacements: Array<[RegExp, string]> = [
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
      matchedLine.text = matchedLine.items.map((textItem) => textItem.str).join("");
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

function lineItemsToLatex(items: PdfTextItem[]): string {
  if (items.length === 0) return "";

  const sortedItems = [...items].sort((a, b) => a.x - b.x);

  const heights = sortedItems.map((item) => item.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 10;

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

    const converted = applySymbolReplacements(escapeLatexText(raw));

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

export function textToLatex(input: string): string {
  let text = normalizeFormulaText(input);

  text = escapeLatexText(text);
  text = applySymbolReplacements(text);

  text = text.replace(/([a-zA-Z0-9)\]}])\^([a-zA-Z0-9]+)/g, "$1^{$2}");
  text = text.replace(/([a-zA-Z0-9)\]}])_([a-zA-Z0-9]+)/g, "$1_{$2}");

  return text.trim();
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

export function extractFormulaCandidates(
  pane: PaneId,
  page: number,
  items: PdfTextItem[]
): FormulaCandidate[] {
  const pageItems = items.filter((item) => item.page === page);
  const lines = buildTextLines(pageItems);

  const candidates: FormulaCandidate[] = [];

  for (const line of lines) {
    const rawText = normalizeFormulaText(line.text);
    const latex = lineItemsToLatex(line.items);

    const score = scoreFormulaLine(rawText) + scoreFormulaLine(latex);

    if (score >= 4) {
      const candidate: FormulaCandidate = {
        id: `${pane}-${page}-${line.x.toFixed(1)}-${line.y.toFixed(1)}-${rawText}`,
        pane,
        page,
        rawText,
        latex,
        score,
      };

      candidates.push(candidate);
    }
  }

  return dedupeCandidates(candidates);
}

export async function copyLatexToClipboard(latex: string): Promise<void> {
  await navigator.clipboard.writeText(latex);
}