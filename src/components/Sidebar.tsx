import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  FormulaCandidate,
  HighlightTarget,
  OutlineItem,
  PaneId,
  PdfTextItem,
  SearchResult,
} from "../types/pdf";
import { copyLatexToClipboard } from "../pdf/formula";
import { searchTextItems } from "../pdf/search";
import { getPageCanvas } from "../pdf/canvasRegistry";
import { cropCanvasByCssRect } from "../pdf/crop";
import { runMathOcr } from "../pdf/mathOcr";
import { askPaperQuestion } from "../pdf/qa";
import { itemsToPlainText } from "../pdf/textLayout";
import { useViewerStore } from "../store/viewerStore";
import { useHighlightStore } from "../store/highlightStore";

type TextItemsByPane = Record<PaneId, PdfTextItem[]>;

type SidebarProps = {
  formulas: FormulaCandidate[];
  outlineItems: OutlineItem[];
  textItemsByPane: TextItemsByPane;
  debugTextLayer: boolean;
  collapsed: boolean;
  onToggleSidebar: () => void;
  onToggleDebugTextLayer: () => void;
};

type SidebarTab = "controls" | "search" | "outline" | "latex" | "qa";

export function Sidebar({
  formulas,
  outlineItems,
  textItemsByPane,
  debugTextLayer,
  collapsed,
  onToggleSidebar,
  onToggleDebugTextLayer,
}: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>("controls");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [ocrLatexById, setOcrLatexById] = useState<Record<string, string>>({});
  const [ocrLoadingId, setOcrLoadingId] = useState<string | null>(null);
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaAnswer, setQaAnswer] = useState("");
  const [qaLoading, setQaLoading] = useState(false);

  const panes = useViewerStore((state) => state.panes);
  const loadPdf = useViewerStore((state) => state.loadPdf);
  const clearPdf = useViewerStore((state) => state.clearPdf);
  const jumpToPage = useViewerStore((state) => state.jumpToPage);
  const zoomIn = useViewerStore((state) => state.zoomIn);
  const zoomOut = useViewerStore((state) => state.zoomOut);
  const setUserScale = useViewerStore((state) => state.setUserScale);
  const openLeftPdfOnRightDifferentPage = useViewerStore(
    (state) => state.openLeftPdfOnRightDifferentPage
  );

  const setHighlight = useHighlightStore((state) => state.setHighlight);
  const clearHighlight = useHighlightStore((state) => state.clearHighlight);

  const searchResults = useMemo<SearchResult[]>(() => {
    if (!searchQuery.trim()) return [];

    return [
      ...searchTextItems("left", searchQuery, textItemsByPane.left),
      ...searchTextItems("right", searchQuery, textItemsByPane.right),
    ];
  }, [searchQuery, textItemsByPane.left, textItemsByPane.right]);

  const formulasByPane = useMemo(() => {
    return {
      left: formulas.filter((formula) => formula.pane === "left"),
      right: formulas.filter((formula) => formula.pane === "right"),
    };
  }, [formulas]);

  const outlineByPane = useMemo(() => {
    return {
      left: outlineItems.filter((item) => item.pane === "left"),
      right: outlineItems.filter((item) => item.pane === "right"),
    };
  }, [outlineItems]);

  const selectTab = (nextTab: SidebarTab) => {
    if (nextTab !== tab) {
      clearHighlight();
    }

    setTab(nextTab);
  };

  const handleFileChange = (
    pane: PaneId,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const url = URL.createObjectURL(file);
    loadPdf(pane, url, file.name);

    event.target.value = "";
  };

  const jumpAndHighlight = (target: {
    id: string;
    pane: PaneId;
    page: number;
    rect: { page: number; x: number; y: number; width: number; height: number };
    label?: string;
    source?: HighlightTarget["source"];
  }) => {
    jumpToPage(target.pane, target.page);

    setHighlight({
      id: target.id,
      pane: target.pane,
      page: target.page,
      rect: target.rect,
      label: target.label,
      source: target.source,
    });
  };

  useEffect(() => {
    clearHighlight();
  }, [clearHighlight, searchQuery]);

  const copyOne = async (formula: FormulaCandidate) => {
    const latex = ocrLatexById[formula.id] ?? formula.latex;

    await copyLatexToClipboard(latex);
    setCopiedId(formula.id);

    window.setTimeout(() => {
      setCopiedId(null);
    }, 1200);
  };

  const copyAllCurrentPage = async () => {
    const text = formulas
      .map((formula) => {
        const latex = ocrLatexById[formula.id] ?? formula.latex;
        return `% ${formula.pane} p.${formula.page}\n${latex}`;
      })
      .join("\n\n");

    await copyLatexToClipboard(text);
    setCopiedId("all");

    window.setTimeout(() => {
      setCopiedId(null);
    }, 1200);
  };

  const runFormulaImageOcr = async (formula: FormulaCandidate) => {
    const canvas = getPageCanvas(formula.pane, formula.page);

    if (!canvas) {
      alert("対象ページのCanvasが見つかりません。ページを表示してから再実行してください。");
      return;
    }

    try {
      setOcrLoadingId(formula.id);

      const base64 = cropCanvasByCssRect(canvas, formula.rect, 10);
      const latex = await runMathOcr(base64);

      setOcrLatexById((prev) => ({
        ...prev,
        [formula.id]: latex,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(message);
    } finally {
      setOcrLoadingId(null);
    }
  };

  const askQuestion = async () => {
    if (!qaQuestion.trim()) return;

    const context = [
      "左ペイン:",
      itemsToPlainText(textItemsByPane.left),
      "",
      "右ペイン:",
      itemsToPlainText(textItemsByPane.right),
    ].join("\n");

    try {
      setQaLoading(true);
      setQaAnswer("");

      const result = await askPaperQuestion({
        question: qaQuestion,
        context,
      });

      setQaAnswer(result.answer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setQaAnswer(`エラー: ${message}`);
    } finally {
      setQaLoading(false);
    }
  };

  if (collapsed) {
    return (
      <aside className="sidebar sidebar-mini">
        <button className="sidebar-toggle" onClick={onToggleSidebar}>
          ▶
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-title-row">
        <h1>PDF Analyzer</h1>
        <button className="sidebar-toggle" onClick={onToggleSidebar}>
          ◀
        </button>
      </div>

      <div className="sidebar-tabs five-tabs">
        <button
          className={tab === "controls" ? "active" : ""}
          onClick={() => selectTab("controls")}
        >
          操作
        </button>

        <button
          className={tab === "search" ? "active" : ""}
          onClick={() => selectTab("search")}
        >
          検索
        </button>

        <button
          className={tab === "outline" ? "active" : ""}
          onClick={() => selectTab("outline")}
        >
          目次
        </button>

        <button
          className={tab === "latex" ? "active" : ""}
          onClick={() => selectTab("latex")}
        >
          LaTeX
        </button>

        <button
          className={tab === "qa" ? "active" : ""}
          onClick={() => selectTab("qa")}
        >
          Q&A
        </button>
      </div>

      {tab === "controls" && (
        <div className="sidebar-content">
          <button className="primary-button" onClick={openLeftPdfOnRightDifferentPage}>
            左PDFの別ページを右へ
          </button>

          <PaneControls
            title="左ペイン"
            pane="left"
            fileName={panes.left.title}
            pageNumber={panes.left.pageNumber}
            totalPages={panes.left.totalPages}
            userScale={panes.left.userScale}
            onFileChange={handleFileChange}
            onClear={clearPdf}
            onJumpPage={jumpToPage}
            onZoomIn={() => zoomIn("left")}
            onZoomOut={() => zoomOut("left")}
            onSetScale={setUserScale}
          />

          <PaneControls
            title="右ペイン"
            pane="right"
            fileName={panes.right.title}
            pageNumber={panes.right.pageNumber}
            totalPages={panes.right.totalPages}
            userScale={panes.right.userScale}
            onFileChange={handleFileChange}
            onClear={clearPdf}
            onJumpPage={jumpToPage}
            onZoomIn={() => zoomIn("right")}
            onZoomOut={() => zoomOut("right")}
            onSetScale={setUserScale}
          />

          <button onClick={onToggleDebugTextLayer}>
            TextLayer Debug: {debugTextLayer ? "ON" : "OFF"}
          </button>
        </div>
      )}

      {tab === "search" && (
        <div className="sidebar-content">
          <input
            className="search-input"
            placeholder="PDF内検索"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />

          <div className="small-label">検索結果: {searchResults.length}</div>

          <div className="result-list">
            {searchResults.map((result) => (
              <button
                key={result.id}
                className="result-card"
                onClick={() =>
                  jumpAndHighlight({
                    id: result.id,
                    pane: result.pane,
                    page: result.page,
                    rect: result.rect,
                    label: result.text,
                    source: "search",
                  })
                }
              >
                <div className="result-meta">
                  {result.pane} / p.{result.page}
                </div>
                <div>{result.text}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "outline" && (
        <div className="sidebar-content">
          <OutlineList
            title="左ペイン"
            items={outlineByPane.left}
            onSelect={(target) =>
              jumpAndHighlight({ ...target, source: "outline" })
            }
          />

          <OutlineList
            title="右ペイン"
            items={outlineByPane.right}
            onSelect={(target) =>
              jumpAndHighlight({ ...target, source: "outline" })
            }
          />
        </div>
      )}

      {tab === "latex" && (
        <div className="sidebar-content">
          <button onClick={copyAllCurrentPage} disabled={formulas.length === 0}>
            表示中ページのLaTeXを全部コピー
          </button>

          {copiedId === "all" && <div className="copied">コピーしました</div>}

          <FormulaList
            title="左 LaTeX"
            formulas={formulasByPane.left}
            copiedId={copiedId}
            ocrLatexById={ocrLatexById}
            ocrLoadingId={ocrLoadingId}
            onCopy={copyOne}
            onHighlight={(target) =>
              jumpAndHighlight({ ...target, source: "formula" })
            }
            onImageOcr={runFormulaImageOcr}
          />

          <FormulaList
            title="右 LaTeX"
            formulas={formulasByPane.right}
            copiedId={copiedId}
            ocrLatexById={ocrLatexById}
            ocrLoadingId={ocrLoadingId}
            onCopy={copyOne}
            onHighlight={(target) =>
              jumpAndHighlight({ ...target, source: "formula" })
            }
            onImageOcr={runFormulaImageOcr}
          />
        </div>
      )}

      {tab === "qa" && (
        <div className="sidebar-content">
          <textarea
            className="qa-input"
            placeholder="論文・PDFについて質問"
            value={qaQuestion}
            onChange={(event) => setQaQuestion(event.target.value)}
          />

          <button onClick={askQuestion} disabled={qaLoading}>
            {qaLoading ? "回答生成中..." : "質問する"}
          </button>

          {qaAnswer && <pre className="qa-answer">{qaAnswer}</pre>}
        </div>
      )}
    </aside>
  );
}

type PaneControlsProps = {
  title: string;
  pane: PaneId;
  fileName: string;
  pageNumber: number;
  totalPages: number;
  userScale: number;
  onFileChange: (pane: PaneId, event: ChangeEvent<HTMLInputElement>) => void;
  onClear: (pane: PaneId) => void;
  onJumpPage: (pane: PaneId, pageNumber: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSetScale: (pane: PaneId, scale: number) => void;
};

function PaneControls({
  title,
  pane,
  fileName,
  pageNumber,
  totalPages,
  userScale,
  onFileChange,
  onClear,
  onJumpPage,
  onZoomIn,
  onZoomOut,
  onSetScale,
}: PaneControlsProps) {
  const [pageInput, setPageInput] = useState(String(pageNumber));
  const [zoomInput, setZoomInput] = useState(String(Math.round(userScale * 100)));

  useEffect(() => {
    setPageInput(String(pageNumber));
  }, [pageNumber]);

  useEffect(() => {
    setZoomInput(String(Math.round(userScale * 100)));
  }, [userScale]);

  const jump = () => {
    const parsed = Number(pageInput);

    if (!Number.isFinite(parsed)) {
      setPageInput(String(pageNumber));
      return;
    }

    const safePage =
      totalPages > 0
        ? Math.min(Math.max(1, Math.floor(parsed)), totalPages)
        : Math.max(1, Math.floor(parsed));

    setPageInput(String(safePage));
    onJumpPage(pane, safePage);
  };

  const applyZoom = () => {
    const parsed = Number(zoomInput);

    if (!Number.isFinite(parsed)) {
      setZoomInput(String(Math.round(userScale * 100)));
      return;
    }

    const safePercent = Math.min(600, Math.max(25, Math.floor(parsed)));
    const nextScale = safePercent / 100;

    setZoomInput(String(safePercent));
    onSetScale(pane, nextScale);
  };

  return (
    <section className="pane-control-card">
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

      <button onClick={() => onClear(pane)}>閉じる</button>

      <div className="control-row">
        <button onClick={onZoomOut}>-</button>

        <input
          className="zoom-input"
          type="number"
          min={25}
          max={600}
          value={zoomInput}
          onChange={(event) => setZoomInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              applyZoom();
            }
          }}
          onBlur={applyZoom}
        />

        <span>%</span>

        <button onClick={onZoomIn}>+</button>
      </div>

      <div className="page-jump-row">
        <input
          className="page-jump-input"
          type="number"
          min={1}
          max={totalPages || undefined}
          value={pageInput}
          onChange={(event) => setPageInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              jump();
            }
          }}
          onBlur={jump}
        />

        <span>/ {totalPages || "-"}</span>

        <button onClick={jump}>移動</button>
      </div>
    </section>
  );
}

function OutlineList({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: OutlineItem[];
  onSelect: (target: {
    id: string;
    pane: PaneId;
    page: number;
    rect: OutlineItem["rect"];
    label?: string;
  }) => void;
}) {
  const sortedItems = [...items].sort((a, b) => {
    if (a.page !== b.page) {
      return a.page - b.page;
    }

    if (a.rect.y !== b.rect.y) {
      return a.rect.y - b.rect.y;
    }

    return a.rect.x - b.rect.x;
  });

  return (
    <section className="panel-section">
      <h2>{title}</h2>

      {sortedItems.length === 0 && (
        <div className="empty-message">目次候補なし</div>
      )}

      {sortedItems.map((item) => (
        <button
          key={item.id}
          className={`outline-item level-${item.level}`}
          onClick={() =>
            onSelect({
              id: item.id,
              pane: item.pane,
              page: item.page,
              rect: item.rect,
              label: item.title,
            })
          }
        >
          p.{item.page} {item.title}
        </button>
      ))}
    </section>
  );
}

function FormulaList({
  title,
  formulas,
  copiedId,
  ocrLatexById,
  ocrLoadingId,
  onCopy,
  onHighlight,
  onImageOcr,
}: {
  title: string;
  formulas: FormulaCandidate[];
  copiedId: string | null;
  ocrLatexById: Record<string, string>;
  ocrLoadingId: string | null;
  onCopy: (formula: FormulaCandidate) => void;
  onHighlight: (target: {
    id: string;
    pane: PaneId;
    page: number;
    rect: FormulaCandidate["rect"];
    label?: string;
  }) => void;
  onImageOcr: (formula: FormulaCandidate) => void;
}) {
  return (
    <section className="panel-section">
      <h2>{title}</h2>

      {formulas.length === 0 && (
        <div className="empty-message">数式候補なし</div>
      )}

      {formulas.map((formula) => {
        const latex = ocrLatexById[formula.id] ?? formula.latex;

        return (
          <div key={formula.id} className="formula-card">
            <button
              className="formula-jump"
              onClick={() =>
                onHighlight({
                  id: formula.id,
                  pane: formula.pane,
                  page: formula.page,
                  rect: formula.rect,
                  label: latex,
                })
              }
            >
              p.{formula.page} / score {formula.score}
            </button>

            <div className="formula-raw">{formula.rawText}</div>

            <pre className="formula-latex">{latex}</pre>

            <div className="formula-actions">
              <button onClick={() => onCopy(formula)}>
                {copiedId === formula.id ? "コピー済み" : "コピー"}
              </button>

              <button onClick={() => onImageOcr(formula)}>
                {ocrLoadingId === formula.id ? "OCR中..." : "画像OCR"}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
