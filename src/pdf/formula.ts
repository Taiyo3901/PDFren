import type { FormulaCandidate, PaneId, PdfTextItem } from "../types/pdf";

type TextLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
};

const MATH_SYMBOL_REGEX = /[=+\-−×÷*/^_√∫∑ΣΠπ∞≈≠≤≥<>±∂∆∇]/;
const LATIN_VARIABLE_REGEX = /[a-zA-Z]\s*[=+\-−×÷*/^_]/;
const NUMBER_OPERATOR_REGEX = /\d+\s*[=+\-−×÷*/^_]\s*\d+/;

export function buildTextLines(items: PdfTextItem[]): TextLine[] {
  const sorted = [...items].sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 4) return yDiff;
    return a.x - b.x;
  });

  const lines: TextLine[] = [];

  for (const item of sorted) {
    const last = lines[lines.length - 1];

    if (
      last &&
      last.page === item.page &&
      Math.abs(last.y - item.y) <= Math.max(4, item.height * 0.35)
    ) {
      const gap = item.x - (last.x + last.width);
      last.text += gap > item.height * 0.45 ? ` ${item.str}` : item.str;
      last.width = Math.max(last.width, item.x + item.width - last.x);
      last.height = Math.max(last.height, item.height);
    } else {
      lines.push({
        text: item.str,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        page: item.page,
      });
    }
  }

  return lines;
}

function scoreFormulaLine(text: string): number {
  let score = 0;

  if (MATH_SYMBOL_REGEX.test(text)) score += 4;
  if (LATIN_VARIABLE_REGEX.test(text)) score += 2;
  if (NUMBER_OPERATOR_REGEX.test(text)) score += 2;
  if (/[αβγδθλμσφω]/i.test(text)) score += 2;
  if (/\b(sin|cos|tan|log|ln|lim|max|min)\b/i.test(text)) score += 3;
  if (/\b\d+\.\d+\b/.test(text)) score += 1;
  if (text.length <= 2) score -= 3;
  if (/^[。、，．・:：\s]+$/.test(text)) score -= 5;

  return score;
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
    const score = scoreFormulaLine(rawText);

    if (score >= 3) {
      candidates.push({
        id: `${pane}-${page}-${line.x.toFixed(1)}-${line.y.toFixed(1)}-${rawText}`,
        pane,
        page,
        rawText,
        latex: textToLatex(rawText),
        score,
      });
    }
  }

  return dedupeCandidates(candidates);
}

function dedupeCandidates(items: FormulaCandidate[]): FormulaCandidate[] {
  const seen = new Set<string>();
  const result: FormulaCandidate[] = [];

  for (const item of items) {
    const key = `${item.pane}-${item.page}-${item.rawText}`;

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(item);
  }

  return result.sort((a, b) => b.score - a.score);
}

function normalizeFormulaText(text: string): string {
  return text
    .replaceAll("−", "-")
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replace(/\s+/g, " ")
    .trim();
}

export function textToLatex(input: string): string {
  let text = normalizeFormulaText(input);

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
    [/\balpha\b/gi, "\\alpha"],
    [/\bbeta\b/gi, "\\beta"],
    [/\bgamma\b/gi, "\\gamma"],
    [/\btheta\b/gi, "\\theta"],
    [/\blambda\b/gi, "\\lambda"],
    [/\bmu\b/gi, "\\mu"],
    [/\bsigma\b/gi, "\\sigma"],
    [/\bphi\b/gi, "\\phi"],
    [/\bomega\b/gi, "\\omega"],
    [/\bsin\b/g, "\\sin"],
    [/\bcos\b/g, "\\cos"],
    [/\btan\b/g, "\\tan"],
    [/\blog\b/g, "\\log"],
    [/\bln\b/g, "\\ln"],
    [/\blim\b/g, "\\lim"],
  ];

  for (const [regex, replacement] of replacements) {
    text = text.replace(regex, replacement);
  }

  // x^2 -> x^{2}
  text = text.replace(/([a-zA-Z0-9)\]}])\^([a-zA-Z0-9]+)/g, "$1^{$2}");

  // x_1 -> x_{1}
  text = text.replace(/([a-zA-Z0-9)\]}])_([a-zA-Z0-9]+)/g, "$1_{$2}");

  // a/b の簡易変換は誤爆が多いのでここではしない
  return text;
}

export async function copyLatexToClipboard(latex: string): Promise<void> {
  await navigator.clipboard.writeText(latex);
}
