import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  FormulaCandidate,
  HighlightSource,
  OutlineItem,
  PaneId,
  PdfRect,
  PdfTextBox,
  PdfTextItem,
  SearchResult,
} from "../types/pdf";
import { copyLatexToClipboard } from "../pdf/formula";
import { searchTextItems } from "../pdf/search";
import { exportAnnotatedPdf } from "../pdf/exportAnnotatedPdf";
import { loadPdfBytesFromUrl } from "../pdf/loadPdfBytesFromUrl";
import { useViewerStore } from "../store/viewerStore";
import { useHighlightStore } from "../store/highlightStore";
import { usePdfTextBoxStore } from "../store/pdfTextBoxStore";
import { usePdfSourceStore } from "../store/pdfSourceStore";
import { usePdfDrawingStore } from "../store/pdfDrawingStore";

type TextItemsByPane = { left: PdfTextItem[]; right: PdfTextItem[] };

type SidebarProps = {
  formulas: FormulaCandidate[];
  outlineItems: OutlineItem[];
  textItemsByPane: TextItemsByPane;
  debugTextLayer: boolean;
  isFullscreen: boolean;
  canUseFullscreen: boolean;
  collapsed: boolean;
  onToggleSidebar: () => void;
  onToggleDebugTextLayer: () => void;
  onToggleFullscreen: () => void;
};

type SidebarTab = "controls" | "search" | "outline" | "latex" | "textbox";
type PanelSide = "left" | "right" | "top";

type JumpHighlightTarget = {
  id: string;
  pane: PaneId;
  page: number;
  rect: PdfRect;
  label?: string;
  source?: HighlightSource;
};

type PaneScaleInfo = { userScale: number; fitScale?: number };
type ExtendedTextBox = PdfTextBox & { italic?: boolean; underline?: boolean };
type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function getFitScale(paneState: PaneScaleInfo): number {
  return typeof paneState.fitScale === "number" && Number.isFinite(paneState.fitScale)
    ? paneState.fitScale
    : paneState.userScale;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getPanelSideClass(panelSide: PanelSide): string {
  if (panelSide === "left") return "panel-left";
  if (panelSide === "right") return "panel-right";
  return "panel-top";
}

function getNextPanelSide(panelSide: PanelSide): PanelSide {
  if (panelSide === "left") return "right";
  if (panelSide === "right") return "left";
  return "left";
}

function getPanelMoveTitle(panelSide: PanelSide): string {
  if (panelSide === "left") return "操作パネルを右端へ移動";
  if (panelSide === "right") return "操作パネルを左端へ移動";
  return "操作パネルを右端へ移動";
}

function getPanelMoveIcon(panelSide: PanelSide): string {
  if (panelSide === "left") return "▶";
  if (panelSide === "right") return "◀";
  return "▶";
}

export function Sidebar({
  formulas,
  outlineItems,
  textItemsByPane,
  debugTextLayer,
  isFullscreen,
  canUseFullscreen,
  collapsed,
  onToggleDebugTextLayer,
  onToggleFullscreen,
}: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>("controls");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [panelSide, setPanelSide] = useState<PanelSide>("left");
  const [panelLocked, setPanelLocked] = useState(false);
  const [panelSearchOpen, setPanelSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.sidebarSide = panelSide;
    document.documentElement.dataset.sidebarLocked = panelLocked ? "true" : "false";
    return () => {
      delete document.documentElement.dataset.sidebarSide;
      delete document.documentElement.dataset.sidebarLocked;
    };
  }, [panelSide, panelLocked]);

  const panes = useViewerStore((state) => state.panes);
  const loadPdf = useViewerStore((state) => state.loadPdf);
  const clearPdf = useViewerStore((state) => state.clearPdf);
  const jumpToPage = useViewerStore((state) => state.jumpToPage);
  const zoomIn = useViewerStore((state) => state.zoomIn);
  const zoomOut = useViewerStore((state) => state.zoomOut);
  const setUserScale = useViewerStore((state) => state.setUserScale);
  const openLeftPdfOnRightDifferentPage = useViewerStore((state) => state.openLeftPdfOnRightDifferentPage);
  const swapPanes = useViewerStore((state) => state.swapPanes);

  const drawingMode = usePdfDrawingStore((state) => state.drawingMode);
  const toggleDrawingMode = usePdfDrawingStore((state) => state.toggleDrawingMode);
  const setDrawingMode = usePdfDrawingStore((state) => state.setDrawingMode);
  const penColor = usePdfDrawingStore((state) => state.penColor);
  const penWidth = usePdfDrawingStore((state) => state.penWidth);
  const setPenColor = usePdfDrawingStore((state) => state.setPenColor);
  const setPenWidth = usePdfDrawingStore((state) => state.setPenWidth);
  const undoStroke = usePdfDrawingStore((state) => state.undoStroke);
  const clearStrokes = usePdfDrawingStore((state) => state.clearStrokes);
  const clearPaneStrokes = usePdfDrawingStore((state) => state.clearPaneStrokes);
  const swapPaneStrokes = usePdfDrawingStore((state) => state.swapPaneStrokes);
  const drawStrokes = usePdfDrawingStore((state) => state.strokes);

  const setHighlight = useHighlightStore((state) => state.setHighlight);
  const clearHighlight = useHighlightStore((state) => state.clearHighlight);
  const clearOutlineHighlight = useHighlightStore((state) => state.clearOutlineHighlight);

  const textBoxAddArmed = usePdfTextBoxStore((state) => state.textBoxAddArmed);
  const armTextBoxAdd = usePdfTextBoxStore((state) => state.armTextBoxAdd);
  const cancelTextBoxAdd = usePdfTextBoxStore((state) => state.cancelTextBoxAdd);
  const selectedTextBoxId = usePdfTextBoxStore((state) => state.selectedTextBoxId);
  const textBoxes = usePdfTextBoxStore((state) => state.textBoxes);
  const updateTextBox = usePdfTextBoxStore((state) => state.updateTextBox);
  const removeTextBox = usePdfTextBoxStore((state) => state.removeTextBox);
  const selectTextBox = usePdfTextBoxStore((state) => state.selectTextBox);
  const viewportInfos = usePdfTextBoxStore((state) => state.viewportInfos);
  const clearPaneTextBoxes = usePdfTextBoxStore((state) => state.clearPaneTextBoxes);
  const swapPaneTextBoxes = usePdfTextBoxStore((state) => state.swapPaneTextBoxes);

  const pdfBytesByPane = usePdfSourceStore((state) => state.pdfBytesByPane);
  const setPdfBytes = usePdfSourceStore((state) => state.setPdfBytes);
  const clearPdfBytes = usePdfSourceStore((state) => state.clearPdfBytes);
  const copyPdfBytes = usePdfSourceStore((state) => state.copyPdfBytes);
  const swapPdfBytes = usePdfSourceStore((state) => state.swapPdfBytes);

  const selectedTextBox = useMemo(() => {
    if (!selectedTextBoxId) return null;
    return textBoxes.find((box) => box.id === selectedTextBoxId) ?? null;
  }, [selectedTextBoxId, textBoxes]);

  const isDualPdfMode = Boolean(panes.left.pdfUrl && panes.right.pdfUrl);
  const shouldKeepPanelOpen = Boolean(selectedTextBox) || textBoxAddArmed || panelLocked || panelSearchOpen;

  useEffect(() => {
    if (selectedTextBox) {
      setPanelSearchOpen(false);
      setDrawingMode(false);
      setTab("textbox");
      return;
    }
    if (tab === "textbox") setTab("controls");
  }, [selectedTextBox, tab, setDrawingMode]);

  useEffect(() => {
    const handleOpenSearch = () => {
      clearOutlineHighlight();
      cancelTextBoxAdd();
      setDrawingMode(false);
      setPanelSearchOpen(true);
      setTab("search");
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const input = document.querySelector<HTMLInputElement>(".search-input");
          input?.focus();
          input?.select();
        });
      });
    };
    window.addEventListener("pdf-viewer-open-search", handleOpenSearch);
    return () => window.removeEventListener("pdf-viewer-open-search", handleOpenSearch);
  }, [clearOutlineHighlight, cancelTextBoxAdd, setDrawingMode]);

  const searchResults = useMemo<SearchResult[]>(() => {
    if (!searchQuery.trim()) return [];
    return [
      ...searchTextItems("left", searchQuery, textItemsByPane.left),
      ...searchTextItems("right", searchQuery, textItemsByPane.right),
    ];
  }, [searchQuery, textItemsByPane.left, textItemsByPane.right]);

  const formulasByPane = useMemo(() => ({
    left: formulas.filter((formula) => formula.pane === "left"),
    right: formulas.filter((formula) => formula.pane === "right"),
  }), [formulas]);

  const outlineByPane = useMemo(() => ({
    left: outlineItems.filter((item) => item.pane === "left"),
    right: outlineItems.filter((item) => item.pane === "right"),
  }), [outlineItems]);

  const clearTransientUi = () => {
    clearHighlight();
    clearOutlineHighlight();
    cancelTextBoxAdd();
  };

  const blurActiveElement = () => {
    window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) activeElement.blur();
    }, 0);
  };

  const jumpAndHighlight = (target: JumpHighlightTarget) => {
    cancelTextBoxAdd();
    setDrawingMode(false);
    jumpToPage(target.pane, target.page);
    setHighlight(target);
  };

  const handleFileChange = async (pane: PaneId, event: ChangeEvent<HTMLInputElement>) => {
    clearTransientUi();
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const bytes = await file.arrayBuffer();
      setPdfBytes(pane, bytes.slice(0));
      loadPdf(pane, URL.createObjectURL(file), file.name);
    } catch (error) {
      alert(`PDFの読み込み準備に失敗しました: ${getErrorMessage(error)}`);
    } finally {
      event.target.value = "";
    }
  };

  const handleClearPane = (pane: PaneId) => {
    if (!isDualPdfMode) return;
    clearTransientUi();
    selectTextBox(null);
    setDrawingMode(false);

    if (pane === "left") {
      const rightPageBeforeMove = panes.right.pageNumber;
      swapPanes();
      swapPdfBytes();
      swapPaneTextBoxes();
      swapPaneStrokes();
      clearPaneTextBoxes("right");
      clearPaneStrokes("right");
      clearPdfBytes("right");
      clearPdf("right");
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => jumpToPage("left", rightPageBeforeMove)));
      window.setTimeout(() => jumpToPage("left", rightPageBeforeMove), 250);
      blurActiveElement();
      return;
    }

    clearPaneTextBoxes("right");
    clearPaneStrokes("right");
    clearPdfBytes("right");
    clearPdf("right");
    blurActiveElement();
  };

  const handleJumpPage = (pane: PaneId, pageNumber: number) => {
    clearTransientUi();
    setDrawingMode(false);
    jumpToPage(pane, pageNumber);
  };

  const handleSetScale = (pane: PaneId, scale: number) => {
    clearTransientUi();
    setUserScale(pane, scale);
  };

  const handleOpenLeftPdfOnRightDifferentPage = () => {
    clearTransientUi();
    selectTextBox(null);
    setDrawingMode(false);
    const leftCurrentPage = panes.left.pageNumber;
    openLeftPdfOnRightDifferentPage();
    copyPdfBytes("left", "right");
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => jumpToPage("right", leftCurrentPage)));
    window.setTimeout(() => jumpToPage("right", leftCurrentPage), 250);
    blurActiveElement();
  };

  const handleSwapPanes = () => {
    clearTransientUi();
    selectTextBox(null);
    setDrawingMode(false);
    const leftPageBeforeSwap = panes.left.pageNumber;
    const rightPageBeforeSwap = panes.right.pageNumber;
    swapPanes();
    swapPdfBytes();
    swapPaneTextBoxes();
    swapPaneStrokes();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      jumpToPage("left", rightPageBeforeSwap);
      jumpToPage("right", leftPageBeforeSwap);
    }));
    window.setTimeout(() => {
      jumpToPage("left", rightPageBeforeSwap);
      jumpToPage("right", leftPageBeforeSwap);
    }, 250);
    blurActiveElement();
  };

  const handleToggleDebugTextLayer = () => {
    clearHighlight();
    cancelTextBoxAdd();
    setDrawingMode(false);
    onToggleDebugTextLayer();
  };

  const handleToggleFullscreen = () => {
    if (!canUseFullscreen && !isFullscreen) return;
    clearHighlight();
    clearOutlineHighlight();
    cancelTextBoxAdd();
    setDrawingMode(false);
    onToggleFullscreen();
  };

  const handleArmTextBoxAdd = () => {
    clearHighlight();
    clearOutlineHighlight();
    setPanelSearchOpen(false);
    setDrawingMode(false);
    selectTextBox(null);
    armTextBoxAdd();
  };

  const handleToggleDrawing = () => {
    clearHighlight();
    clearOutlineHighlight();
    cancelTextBoxAdd();
    selectTextBox(null);
    setPanelSearchOpen(false);
    toggleDrawingMode();
  };

  const handleCyclePanelSide = () => {
    setPanelSide((current) => current === "top" ? "right" : getNextPanelSide(current));
  };

  const handleMovePanelTop = () => {
    setPanelSide((current) => (current === "top" ? "left" : "top"));
    setPanelLocked(false);
  };

  const handleExportAnnotatedPdf = async (pane: PaneId) => {
    const paneState = panes[pane];
    if (!paneState.pdfUrl) return;
    try {
      const outputFileName = `${paneState.title || pane}-annotated.pdf`;
      let sourceBytes = pdfBytesByPane[pane];
      if (!sourceBytes) {
        sourceBytes = await loadPdfBytesFromUrl(paneState.pdfUrl);
        setPdfBytes(pane, sourceBytes);
      }
      const savedBytes = await exportAnnotatedPdf({
        pdfBytes: sourceBytes,
        pane,
        textBoxes,
        viewportInfos,
        drawStrokes,
        fileName: outputFileName,
        download: true,
      });
      const savedArrayBuffer = uint8ArrayToArrayBuffer(savedBytes);
      setPdfBytes(pane, savedArrayBuffer);
      clearPaneTextBoxes(pane);
      clearPaneStrokes(pane);
      selectTextBox(null);
      cancelTextBoxAdd();
      clearHighlight();
      setDrawingMode(false);
      loadPdf(pane, URL.createObjectURL(new Blob([savedArrayBuffer], { type: "application/pdf" })), outputFileName);
    } catch (error) {
      if (getErrorMessage(error) === "SAVE_CANCELLED") return;
      alert(`PDF保存に失敗しました: ${getErrorMessage(error)}`);
    }
  };

  const copyOne = async (formula: FormulaCandidate) => {
    cancelTextBoxAdd();
    setDrawingMode(false);
    jumpToPage(formula.pane, formula.page);
    setHighlight({ id: formula.id, pane: formula.pane, page: formula.page, rect: formula.rect, label: formula.latex, source: "formula" });
    await copyLatexToClipboard(formula.latex);
    setCopiedId(formula.id);
    window.setTimeout(() => setCopiedId(null), 1200);
  };

  const copyAllCurrentPage = async () => {
    cancelTextBoxAdd();
    const lineBreak = String.fromCharCode(10);
    const text = formulas.map((formula) => [`% ${formula.pane} p.${formula.page}`, formula.latex].join(lineBreak)).join(lineBreak + lineBreak);
    await copyLatexToClipboard(text);
    setCopiedId("all");
    window.setTimeout(() => setCopiedId(null), 1200);
  };

  return (
    <aside className={["sidebar", "floating-sidebar", getPanelSideClass(panelSide), collapsed ? "is-collapsed" : "", shouldKeepPanelOpen ? "keep-open" : ""].filter(Boolean).join(" ")}>
      <div className="sidebar-hover-rail"><span>操作</span></div>
      <div className="sidebar-title-row">
        <h1>PDF Analyzer</h1>
        <div className="sidebar-title-actions">
          <button className={panelLocked ? "sidebar-lock-toggle active" : "sidebar-lock-toggle"} onClick={() => setPanelLocked((current) => !current)} title={panelLocked ? "操作パネルの固定を解除" : "操作パネルを固定"}>{panelLocked ? "🔒" : "🔓"}</button>
          <button className="sidebar-help-button" onClick={() => { setHelpOpen(true); setPanelSearchOpen(false); cancelTextBoxAdd(); setDrawingMode(false); blurActiveElement(); }} title="ヘルプを開く" aria-label="ヘルプを開く">?</button>
          <button className="sidebar-top-toggle" onClick={handleMovePanelTop} title={panelSide === "top" ? "操作パネルを左端へ移動" : "操作パネルを上部へ直接移動"} aria-label={panelSide === "top" ? "操作パネルを左端へ移動" : "操作パネルを上部へ直接移動"}>{panelSide === "top" ? "◀" : "▲"}</button>
          <button className="sidebar-position-toggle" onClick={handleCyclePanelSide} title={getPanelMoveTitle(panelSide)} aria-label={getPanelMoveTitle(panelSide)}>{getPanelMoveIcon(panelSide)}</button>
        </div>
      </div>

      <div className="sidebar-tabs">
        <button className={tab === "controls" ? "active" : ""} onClick={() => { setPanelSearchOpen(false); clearHighlight(); clearOutlineHighlight(); setTab("controls"); }}>操作</button>
        <button className={tab === "search" ? "active" : ""} onClick={() => { setPanelSearchOpen(true); clearTransientUi(); setDrawingMode(false); setTab("search"); }}>検索</button>
        <button className={tab === "outline" ? "active" : ""} onClick={() => { setPanelSearchOpen(false); clearHighlight(); cancelTextBoxAdd(); setDrawingMode(false); setTab("outline"); }}>目次</button>
        <button className={tab === "latex" ? "active" : ""} onClick={() => { setPanelSearchOpen(false); clearOutlineHighlight(); cancelTextBoxAdd(); setDrawingMode(false); setTab("latex"); }}>LaTeX</button>
        {selectedTextBox && <button className={tab === "textbox" ? "active text-setting-tab" : "text-setting-tab"} onClick={() => { setPanelSearchOpen(false); clearHighlight(); clearOutlineHighlight(); cancelTextBoxAdd(); setDrawingMode(false); setTab("textbox"); }}>テキスト設定</button>}
      </div>

      {tab === "controls" && (
        <div className="sidebar-content">
          <div className="icon-action-grid">
            <button className="icon-action-button" onClick={handleOpenLeftPdfOnRightDifferentPage} title="左右表示"><span className="icon-action-icon">□|□</span><span className="icon-action-label">左右表示</span></button>
            <button className="icon-action-button" onClick={handleSwapPanes} title="左右を入れ替え"><span className="icon-action-icon">⇄</span><span className="icon-action-label">入替</span></button>
            <button className={textBoxAddArmed ? "icon-action-button active" : "icon-action-button"} onClick={handleArmTextBoxAdd} title="PDF上をクリックしてテキストボックスを1つ追加"><span className="icon-action-icon">T</span><span className="icon-action-label">テキスト</span></button>
            <button className={drawingMode ? "icon-action-button active" : "icon-action-button"} onClick={handleToggleDrawing} title="PDF上にフリーハンド描画"><span className="icon-action-icon">✎</span><span className="icon-action-label">描画</span></button>
            <button className="icon-action-button" disabled={!panes.left.pdfUrl} onClick={() => void handleExportAnnotatedPdf("left")} title="左PDFをテキスト・描画入りで保存"><span className="icon-action-icon">💾L</span><span className="icon-action-label">左保存</span></button>
            <button className="icon-action-button" disabled={!panes.right.pdfUrl} onClick={() => void handleExportAnnotatedPdf("right")} title="右PDFをテキスト・描画入りで保存"><span className="icon-action-icon">💾R</span><span className="icon-action-label">右保存</span></button>
            <button className="icon-action-button" onClick={handleToggleDebugTextLayer} title="TextLayer Debug切替"><span className="icon-action-icon">▦</span><span className="icon-action-label">Debug {debugTextLayer ? "ON" : "OFF"}</span></button>
            <button className={isFullscreen ? "icon-action-button active" : "icon-action-button"} disabled={!canUseFullscreen && !isFullscreen} onClick={handleToggleFullscreen} title={canUseFullscreen || isFullscreen ? "フルスクリーン表示" : "全画面表示はPDFを1枚だけ表示している時のみ使用できます"}><span className="icon-action-icon">⛶</span><span className="icon-action-label">フルスクリーン表示</span></button>
          </div>

          {drawingMode && <div className="drawing-tool-panel"><label className="drawing-settings-row"><span className="small-label">色</span><input type="color" value={penColor} onChange={(event) => setPenColor(event.target.value)} /></label><label className="drawing-settings-row"><span className="small-label">太さ</span><input type="range" min={1} max={32} value={penWidth} onChange={(event) => setPenWidth(Number(event.target.value))} /></label><div className="control-row"><button type="button" onClick={() => undoStroke()}>1本戻す</button><button type="button" onClick={() => clearStrokes()}>全消去</button></div></div>}
          {textBoxAddArmed && <div className="text-box-armed-message">PDF上をクリックすると、テキストボックスを1つ追加します。<button type="button" onClick={cancelTextBoxAdd} className="text-box-armed-cancel">キャンセル</button></div>}
          <PaneControls title="左ペイン" pane="left" fileName={panes.left.title} pageNumber={panes.left.pageNumber} totalPages={panes.left.totalPages} userScale={panes.left.userScale} fitScale={getFitScale(panes.left as PaneScaleInfo)} canClose={isDualPdfMode} onFileChange={handleFileChange} onClear={handleClearPane} onJumpPage={handleJumpPage} onZoomIn={() => { clearTransientUi(); zoomIn("left"); }} onZoomOut={() => { clearTransientUi(); zoomOut("left"); }} onFitWidth={() => handleSetScale("left", getFitScale(panes.left as PaneScaleInfo))} onSetScale={handleSetScale} />
          <PaneControls title="右ペイン" pane="right" fileName={panes.right.title} pageNumber={panes.right.pageNumber} totalPages={panes.right.totalPages} userScale={panes.right.userScale} fitScale={getFitScale(panes.right as PaneScaleInfo)} canClose={isDualPdfMode} onFileChange={handleFileChange} onClear={handleClearPane} onJumpPage={handleJumpPage} onZoomIn={() => { clearTransientUi(); zoomIn("right"); }} onZoomOut={() => { clearTransientUi(); zoomOut("right"); }} onFitWidth={() => handleSetScale("right", getFitScale(panes.right as PaneScaleInfo))} onSetScale={handleSetScale} />
        </div>
      )}

      {tab === "textbox" && selectedTextBox && <TextBoxSettings selectedTextBox={selectedTextBox as ExtendedTextBox} updateTextBox={updateTextBox} removeTextBox={removeTextBox} selectTextBox={selectTextBox} setTab={setTab} />}
      {tab === "search" && <SearchPanel searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchResults={searchResults} clearOutlineHighlight={clearOutlineHighlight} setPanelSearchOpen={setPanelSearchOpen} jumpAndHighlight={jumpAndHighlight} />}
      {tab === "outline" && <div className="sidebar-content"><OutlineList title="左ペイン" items={outlineByPane.left} onSelect={jumpAndHighlight} /><OutlineList title="右ペイン" items={outlineByPane.right} onSelect={jumpAndHighlight} /></div>}
      {tab === "latex" && <div className="sidebar-content"><button onClick={copyAllCurrentPage} disabled={formulas.length === 0}>表示中ページのLaTeXを全部コピー</button>{copiedId === "all" && <div className="copied">コピーしました</div>}<FormulaList title="左 LaTeX" formulas={formulasByPane.left} copiedId={copiedId} onCopy={copyOne} onHighlight={jumpAndHighlight} /><FormulaList title="右 LaTeX" formulas={formulasByPane.right} copiedId={copiedId} onCopy={copyOne} onHighlight={jumpAndHighlight} /></div>}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </aside>
  );
}

function SearchPanel({ searchQuery, setSearchQuery, searchResults, clearOutlineHighlight, setPanelSearchOpen, jumpAndHighlight }: { searchQuery: string; setSearchQuery: (value: string) => void; searchResults: SearchResult[]; clearOutlineHighlight: () => void; setPanelSearchOpen: (value: boolean) => void; jumpAndHighlight: (target: JumpHighlightTarget) => void }) {
  return <div className="sidebar-content"><input className="search-input" placeholder="PDF内検索" value={searchQuery} onChange={(event) => { clearOutlineHighlight(); setSearchQuery(event.target.value); }} onKeyDown={(event) => { if (event.key === "Escape") { setPanelSearchOpen(false); event.currentTarget.blur(); } }} /><div className="small-label">検索結果: {searchResults.length}</div><div className="result-list">{searchResults.map((result) => <button key={result.id} className="result-card" onClick={() => jumpAndHighlight({ id: result.id, pane: result.pane, page: result.page, rect: result.rect, label: result.text, source: "search" })}><div className="result-meta">{result.pane} / p.{result.page}</div><div>{result.text}</div></button>)}</div></div>;
}

function TextBoxSettings({ selectedTextBox, updateTextBox, removeTextBox, selectTextBox, setTab }: { selectedTextBox: ExtendedTextBox; updateTextBox: (id: string, patch: Partial<PdfTextBox>) => void; removeTextBox: (id: string) => void; selectTextBox: (id: string | null) => void; setTab: (tab: SidebarTab) => void }) {
  const resetTextStyle = () => updateTextBox(selectedTextBox.id, { fontSize: 15, color: "#000000", backgroundColor: "transparent", fontWeight: "normal", italic: false, underline: false, textAlign: "left" } as Partial<PdfTextBox>);
  return <div className="sidebar-content"><section className="pane-control-card textbox-settings-card"><div className="settings-header"><div><h2>テキスト設定</h2><div className="settings-subtitle">よく使う文字装飾を変更</div></div><button className="settings-icon-button" onClick={() => { selectTextBox(null); setTab("controls"); }} title="選択解除">✕</button></div><div className="settings-group"><div className="settings-group-title">文字サイズ</div><label className="setting-row"><span className="setting-label">サイズ</span><div className="setting-stepper"><button type="button" onClick={() => updateTextBox(selectedTextBox.id, { fontSize: Math.max(6, selectedTextBox.fontSize - 1) })}>−</button><input type="number" min={6} max={72} value={selectedTextBox.fontSize} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) updateTextBox(selectedTextBox.id, { fontSize: Math.min(72, Math.max(6, value)) }); }} /><button type="button" onClick={() => updateTextBox(selectedTextBox.id, { fontSize: Math.min(72, selectedTextBox.fontSize + 1) })}>＋</button></div></label></div><div className="settings-group"><div className="settings-group-title">文字装飾</div><div className="format-button-grid"><button type="button" className={selectedTextBox.fontWeight === "bold" ? "format-button active" : "format-button"} onClick={() => updateTextBox(selectedTextBox.id, { fontWeight: selectedTextBox.fontWeight === "bold" ? "normal" : "bold" })}><strong>B</strong><span>太字</span></button><button type="button" className={selectedTextBox.italic ? "format-button active" : "format-button"} onClick={() => updateTextBox(selectedTextBox.id, { italic: !selectedTextBox.italic } as Partial<PdfTextBox>)}><em>I</em><span>斜体</span></button><button type="button" className={selectedTextBox.underline ? "format-button active" : "format-button"} onClick={() => updateTextBox(selectedTextBox.id, { underline: !selectedTextBox.underline } as Partial<PdfTextBox>)}><span className="underline-icon">U</span><span>下線</span></button></div></div><div className="settings-group"><div className="settings-group-title">配置</div><div className="setting-icon-row">{(["left", "center", "right"] as const).map((align) => <button key={align} type="button" className={(selectedTextBox.textAlign ?? "left") === align ? "setting-icon-button active" : "setting-icon-button"} onClick={() => updateTextBox(selectedTextBox.id, { textAlign: align })}>{align === "left" ? "⇤" : align === "center" ? "↔" : "⇥"}</button>)}</div></div><div className="settings-group"><div className="settings-group-title">色</div><label className="setting-row"><span className="setting-label">文字色</span><div className="color-control"><input type="color" value={selectedTextBox.color || "#000000"} onChange={(event) => updateTextBox(selectedTextBox.id, { color: event.target.value })} /><span>{selectedTextBox.color || "#000000"}</span></div></label><label className="setting-row"><span className="setting-label">ハイライト</span><div className="color-control"><input type="color" value={selectedTextBox.backgroundColor && selectedTextBox.backgroundColor !== "transparent" ? selectedTextBox.backgroundColor : "#ffff00"} onChange={(event) => updateTextBox(selectedTextBox.id, { backgroundColor: event.target.value })} /><span>{selectedTextBox.backgroundColor && selectedTextBox.backgroundColor !== "transparent" ? selectedTextBox.backgroundColor : "なし"}</span></div></label><button type="button" className="settings-wide-button" onClick={() => updateTextBox(selectedTextBox.id, { backgroundColor: "transparent" })}>ハイライトを解除</button></div><div className="settings-footer"><button type="button" className="settings-secondary-button" onClick={resetTextStyle}>書式クリア</button><button type="button" className="settings-danger-button" onClick={() => { removeTextBox(selectedTextBox.id); setTab("controls"); }}>削除</button></div></section></div>;
}

function PaneControls({ title, pane, fileName, pageNumber, totalPages, userScale, fitScale, canClose, onFileChange, onClear, onJumpPage, onZoomIn, onZoomOut, onFitWidth, onSetScale }: { title: string; pane: PaneId; fileName: string; pageNumber: number; totalPages: number; userScale: number; fitScale: number; canClose: boolean; onFileChange: (pane: PaneId, event: ChangeEvent<HTMLInputElement>) => void; onClear: (pane: PaneId) => void; onJumpPage: (pane: PaneId, pageNumber: number) => void; onZoomIn: () => void; onZoomOut: () => void; onFitWidth: () => void; onSetScale: (pane: PaneId, scale: number) => void }) {
  const [pageInput, setPageInput] = useState(String(pageNumber));
  const [zoomInput, setZoomInput] = useState(String(Math.round(userScale * 100)));
  useEffect(() => setPageInput(String(pageNumber)), [pageNumber]);
  useEffect(() => setZoomInput(String(Math.round(userScale * 100))), [userScale]);
  const jump = () => { const parsed = Number(pageInput); if (!Number.isFinite(parsed)) { setPageInput(String(pageNumber)); return; } const safePage = totalPages > 0 ? Math.min(Math.max(1, Math.floor(parsed)), totalPages) : Math.max(1, Math.floor(parsed)); setPageInput(String(safePage)); onJumpPage(pane, safePage); };
  const applyZoom = () => { const parsed = Number(zoomInput); if (!Number.isFinite(parsed)) { setZoomInput(String(Math.round(userScale * 100))); return; } const safePercent = Math.min(600, Math.max(25, Math.floor(parsed))); setZoomInput(String(safePercent)); onSetScale(pane, safePercent / 100); };
  return <section className="pane-control-card"><h2>{title}</h2><div className="file-name">{fileName}</div><div className="pane-file-actions"><label className="pane-wide-button"><span>PDFを読み込む</span><input type="file" accept="application/pdf" onChange={(event) => onFileChange(pane, event)} /></label><button className="pane-wide-button" disabled={!canClose} onClick={() => { if (canClose) onClear(pane); }}><span>✕</span><span>閉じる</span></button></div><div className="zoom-stepper-row fit-enabled"><button onClick={onZoomOut}>−</button><input className="zoom-input" type="number" min={25} max={600} value={zoomInput} onChange={(event) => setZoomInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyZoom(); }} onBlur={applyZoom} /><span>%</span><button onClick={onZoomIn}>＋</button><button onClick={onFitWidth} title={`表示エリア幅に合わせる: ${Math.round(fitScale * 100)}%`}>↔</button></div><div className="page-jump-row"><input className="page-jump-input" type="number" min={1} max={totalPages || undefined} value={pageInput} onChange={(event) => setPageInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") jump(); }} onBlur={jump} /><span>/ {totalPages || "-"}</span><button onClick={jump}>移動</button></div></section>;
}

function OutlineList({ title, items, onSelect }: { title: string; items: OutlineItem[]; onSelect: (target: JumpHighlightTarget) => void }) {
  const sortedItems = [...items].sort((a, b) => a.page !== b.page ? a.page - b.page : a.rect.y !== b.rect.y ? a.rect.y - b.rect.y : a.rect.x - b.rect.x);
  return <section className="panel-section"><h2>{title}</h2>{sortedItems.length === 0 && <div className="empty-message">目次候補なし</div>}{sortedItems.map((item) => <button key={item.id} className={`outline-item level-${item.level}`} onClick={() => onSelect({ id: item.id, pane: item.pane, page: item.page, rect: item.rect, label: item.title, source: "outline" })}>p.{item.page} {item.title}</button>)}</section>;
}

function FormulaList({ title, formulas, copiedId, onCopy, onHighlight }: { title: string; formulas: FormulaCandidate[]; copiedId: string | null; onCopy: (formula: FormulaCandidate) => void; onHighlight: (target: JumpHighlightTarget) => void }) {
  return <section className="panel-section"><h2>{title}</h2>{formulas.length === 0 && <div className="empty-message">数式候補なし</div>}{formulas.map((formula) => <div key={formula.id} className="formula-card"><button className="formula-jump" onClick={() => onHighlight({ id: formula.id, pane: formula.pane, page: formula.page, rect: formula.rect, label: formula.latex, source: "formula" })}>p.{formula.page} / score {formula.score}</button><div className="formula-raw">{formula.rawText}</div><pre className="formula-latex">{formula.latex}</pre><button onClick={() => onCopy(formula)}>{copiedId === formula.id ? "コピー済み" : "LaTeXコピー"}</button></div>)}</section>;
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  const initialWidth = Math.min(900, window.innerWidth - 24);
  const initialHeight = Math.min(720, window.innerHeight - 24);
  const [position, setPosition] = useState({ x: Math.max(12, window.innerWidth - initialWidth - 24), y: 72 });
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
  const dragStateRef = useRef({ dragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });
  const resizeStateRef = useRef({ resizing: false, direction: "se" as ResizeDirection, startX: 0, startY: 0, initialX: 0, initialY: 0, initialWidth: 0, initialHeight: 0 });
  useEffect(() => { const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown); }, [onClose]);
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => { const target = event.target; if (target instanceof HTMLElement && target.closest("button, input, textarea, select, a")) return; event.preventDefault(); dragStateRef.current = { dragging: true, startX: event.clientX, startY: event.clientY, initialX: position.x, initialY: position.y }; event.currentTarget.setPointerCapture(event.pointerId); };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => { const s = dragStateRef.current; if (!s.dragging) return; const nextX = s.initialX + event.clientX - s.startX; const nextY = s.initialY + event.clientY - s.startY; setPosition({ x: Math.min(Math.max(12, nextX), Math.max(12, window.innerWidth - size.width - 12)), y: Math.min(Math.max(12, nextY), Math.max(12, window.innerHeight - size.height - 12)) }); };
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => { dragStateRef.current.dragging = false; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  const handleResizePointerDown = (direction: ResizeDirection) => (event: ReactPointerEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); resizeStateRef.current = { resizing: true, direction, startX: event.clientX, startY: event.clientY, initialX: position.x, initialY: position.y, initialWidth: size.width, initialHeight: size.height }; event.currentTarget.setPointerCapture(event.pointerId); };
  const handleResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => { const s = resizeStateRef.current; if (!s.resizing) return; const minWidth = 420, minHeight = 320, pad = 12; const dx = event.clientX - s.startX, dy = event.clientY - s.startY; let x = s.initialX, y = s.initialY, w = s.initialWidth, h = s.initialHeight; const right = s.initialX + s.initialWidth, bottom = s.initialY + s.initialHeight; if (s.direction.includes("e")) w = clamp(s.initialWidth + dx, minWidth, Math.max(minWidth, window.innerWidth - s.initialX - pad)); if (s.direction.includes("s")) h = clamp(s.initialHeight + dy, minHeight, Math.max(minHeight, window.innerHeight - s.initialY - pad)); if (s.direction.includes("w")) { x = clamp(s.initialX + dx, pad, Math.max(pad, right - minWidth)); w = right - x; } if (s.direction.includes("n")) { y = clamp(s.initialY + dy, pad, Math.max(pad, bottom - minHeight)); h = bottom - y; } setPosition({ x, y }); setSize({ width: w, height: h }); };
  const handleResizePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => { resizeStateRef.current.resizing = false; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  return createPortal(<div className="help-pip-layer"><div className="help-pip-panel" style={{ transform: `translate(${position.x}px, ${position.y}px)`, width: `${size.width}px`, height: `${size.height}px` }} role="dialog" aria-modal="false"><div className="help-pip-header" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}><div><h2>ヘルプ</h2><p>PDF Viewer の使い方とショートカットキー</p></div><button className="help-close-button" onClick={onClose}>✕</button></div><div className="help-panel-content"><section className="help-section"><h3>基本操作</h3><ul><li><strong>PDFを読み込む:</strong> 操作パネルの「PDFを読み込む」からPDFファイルを選択します。</li><li><strong>左右表示:</strong> 左側PDFを右側にも表示できます。</li><li><strong>フルスクリーン:</strong> PDFを1枚だけ表示している時のみ使用できます。全画面中はEnterで次ページ、Backspaceで前ページへ移動します。</li></ul></section></div>{(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as ResizeDirection[]).map((direction) => <div key={direction} className={`help-pip-resize-handle resize-${direction}`} onPointerDown={handleResizePointerDown(direction)} onPointerMove={handleResizePointerMove} onPointerUp={handleResizePointerUp} />)}</div></div>, document.body);
}

function ShortcutHelp({ keys, desc }: { keys: string[]; desc: string }) {
  return <div className="shortcut-row"><div className="shortcut-keys">{keys.map((key, index) => key === "+" || key === "/" ? <span key={`${key}-${index}`}>{key}</span> : <kbd key={`${key}-${index}`}>{key}</kbd>)}</div><div className="shortcut-desc">{desc}</div></div>;
}
