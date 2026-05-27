import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";
import type { FormulaCandidate, PaneId } from "../types/pdf";
import { copyLatexToClipboard } from "../pdf/formula";
import { useViewerStore } from "../store/viewerStore";

type SidebarProps = {
  formulas: FormulaCandidate[];
  debugTextLayer: boolean;
  onToggleDebugTextLayer: () => void;
};

type SidebarTab = "controls" | "latex";

export function Sidebar({
  formulas,
  debugTextLayer,
  onToggleDebugTextLayer,
}: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>("controls");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const panes = useViewerStore((state) => state.panes);
  const loadPdf = useViewerStore((state) => state.loadPdf);
  const clearPdf = useViewerStore((state) => state.clearPdf);
  const setPageNumber = useViewerStore((state) => state.setPageNumber);
  const zoomIn = useViewerStore((state) => state.zoomIn);
  const zoomOut = useViewerStore((state) => state.zoomOut);
  const mirrorLeftToRight = useViewerStore((state) => state.mirrorLeftToRight);

  const formulasByPane = useMemo(() => {
    return {
      left: formulas.filter((formula) => formula.pane === "left"),
      right: formulas.filter((formula) => formula.pane === "right"),
    };
  }, [formulas]);

  const handleFileChange = (pane: PaneId, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const url = URL.createObjectURL(file);
    loadPdf(pane, url, file.name);

    event.target.value = "";
  };

  const copyOne = async (formula: FormulaCandidate) => {
    await copyLatexToClipboard(formula.latex);
    setCopiedId(formula.id);

    window.setTimeout(() => {
      setCopiedId(null);
    }, 1200);
  };

  const copyAllCurrentPage = async () => {
    const text = formulas
      .map((formula) => `% ${formula.pane} p.${formula.page}\n${formula.latex}`)
      .join("\n\n");

    await copyLatexToClipboard(text);
    setCopiedId("all");
    window.setTimeout(() => setCopiedId(null), 1200);
  };

  return (
    <aside className="sidebar">
      <h1>Paper PDF Analyzer</h1>

      <div className="sidebar-tabs">
        <button
          className={tab === "controls" ? "active" : ""}
          onClick={() => setTab("controls")}
        >
          操作
        </button>

        <button
          className={tab === "latex" ? "active" : ""}
          onClick={() => setTab("latex")}
        >
          LaTeX
        </button>
      </div>

      {tab === "controls" && (
        <div className="sidebar-content">
          <button onClick={mirrorLeftToRight}>
            左PDFを右にも開く
          </button>

          <button onClick={onToggleDebugTextLayer}>
            TextLayer Debug: {debugTextLayer ? "ON" : "OFF"}
          </button>

          <PaneControls
            pane="left"
            title="左ペイン"
            fileName={panes.left.title}
            pageNumber={panes.left.pageNumber}
            totalPages={panes.left.totalPages}
            scale={panes.left.scale}
            onFileChange={handleFileChange}
            onClear={clearPdf}
            onPrev={() => setPageNumber("left", panes.left.pageNumber - 1)}
            onNext={() => setPageNumber("left", panes.left.pageNumber + 1)}
            onZoomIn={() => zoomIn("left")}
            onZoomOut={() => zoomOut("left")}
            onPageInput={(value) => setPageNumber("left", value)}
          />

          <PaneControls
            pane="right"
            title="右ペイン"
            fileName={panes.right.title}
            pageNumber={panes.right.pageNumber}
            totalPages={panes.right.totalPages}
            scale={panes.right.scale}
            onFileChange={handleFileChange}
            onClear={clearPdf}
            onPrev={() => setPageNumber("right", panes.right.pageNumber - 1)}
            onNext={() => setPageNumber("right", panes.right.pageNumber + 1)}
            onZoomIn={() => zoomIn("right")}
            onZoomOut={() => zoomOut("right")}
            onPageInput={(value) => setPageNumber("right", value)}
          />
        </div>
      )}

      {tab === "latex" && (
        <div className="sidebar-content">
          <button onClick={copyAllCurrentPage} disabled={formulas.length === 0}>
            この表示中ページのLaTeXを全部コピー
          </button>

          {copiedId === "all" && <div className="copied">コピーしました</div>}

          <FormulaList
            title="左ペイン"
            formulas={formulasByPane.left}
            copiedId={copiedId}
            onCopy={copyOne}
          />

          <FormulaList
            title="右ペイン"
            formulas={formulasByPane.right}
            copiedId={copiedId}
            onCopy={copyOne}
          />
        </div>
      )}
    </aside>
  );
}

type PaneControlsProps = {
  pane: PaneId;
  title: string;
  fileName: string;
  pageNumber: number;
  totalPages: number;
  scale: number;
  onFileChange: (pane: PaneId, event: ChangeEvent<HTMLInputElement>) => void;
  onClear: (pane: PaneId) => void;
  onPrev: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPageInput: (page: number) => void;
};

function PaneControls({
  pane,
  title,
  fileName,
  pageNumber,
  totalPages,
  scale,
  onFileChange,
  onClear,
  onPrev,
  onNext,
  onZoomIn,
  onZoomOut,
  onPageInput,
}: PaneControlsProps) {
  return (
    <section className="pane-controls">
      <h2>{title}</h2>

      <div className="file-name">{fileName}</div>

      <label className="file-button">
        PDFを読み込む
        <input
          type="file"
          accept="application/pdf"
          onChange={(event) => onFileChange(pane, event)}
        />
      </label>

      <button onClick={() => onClear(pane)}>クリア</button>

      <div className="control-row">
        <button onClick={onZoomOut}>-</button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={onZoomIn}>+</button>
      </div>

      <div className="control-row">
        <button onClick={onPrev}>前</button>

        <input
          type="number"
          min={1}
          max={Math.max(1, totalPages)}
          value={pageNumber}
          onChange={(event) => onPageInput(Number(event.target.value))}
        />

        <span>/ {totalPages || "-"}</span>

        <button onClick={onNext}>次</button>
      </div>
    </section>
  );
}

type FormulaListProps = {
  title: string;
  formulas: FormulaCandidate[];
  copiedId: string | null;
  onCopy: (formula: FormulaCandidate) => void;
};

function FormulaList({
  title,
  formulas,
  copiedId,
  onCopy,
}: FormulaListProps) {
  return (
    <section className="formula-list">
      <h2>{title}</h2>

      {formulas.length === 0 && (
        <div className="empty-message">数式候補なし</div>
      )}

      {formulas.map((formula) => (
        <div key={formula.id} className="formula-card">
          <div className="formula-meta">
            p.{formula.page} / score {formula.score}
          </div>

          <div className="formula-raw">{formula.rawText}</div>

          <pre className="formula-latex">{formula.latex}</pre>

          <button onClick={() => onCopy(formula)}>
            {copiedId === formula.id ? "コピー済み" : "LaTeXコピー"}
          </button>
        </div>
      ))}
    </section>
  );
}