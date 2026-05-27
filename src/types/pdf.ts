export type PaneId = "left" | "right";

export type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
};

export type FormulaCandidate = {
  id: string;
  pane: PaneId;
  page: number;
  rawText: string;
  latex: string;
  score: number;
};

export type OcrResult = {
  page: number;
  text: string;
};