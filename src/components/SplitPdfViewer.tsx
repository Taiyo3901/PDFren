import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { PdfPane } from "./PdfPane";
import { useViewerStore } from "../store/viewerStore";
import type { FormulaCandidate, OutlineItem, PaneId, PdfTextItem } from "../types/pdf";
import { extractFormulaCandidates } from "../pdf/formula";
import { extractOutlineItems } from "../pdf/outline";

type TextItemsByPane = Record<PaneId, PdfTextItem[]>;

export function SplitPdfViewer() {
  const loadPdf = useViewerStore((state) => state.loadPdf);
  const panes = useViewerStore((state) => state.panes);
  const zoomIn = useViewerStore((state) => state.zoomIn);
  const zoomOut = useViewerStore((state) => state.zoomOut);

  const appRootRef = useRef<HTMLDivElement | null>(null);
  const viewerAreaRef = useRef<HTMLElement | null>(null);
  const wheelLockRef = useRef(false);

  const [debugTextLayer, setDebugTextLayer] = useState(false);
  const [splitRatio, setSplitRatio] = useState(50);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [textItemsByPane, setTextItemsByPane] = useState<TextItemsByPane>({
    left: [],
    right: [],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pdfParam = params.get("pdf");

    if (
      typeof pdfParam === "string" &&
      pdfParam.length > 0 &&
      !panes.left.pdfUrl
    ) {
      loadPdf("left", pdfParam, "URL PDF");
    }
  }, [loadPdf, panes.left.pdfUrl]);

  useEffect(() => {
    const root = appRootRef.current;
    if (!root) return;

    const handleWheel = (event: WheelEvent) => {
      const isZoomGesture = event.ctrlKey || event.metaKey;

      if (!isZoomGesture) return;

      event.preventDefault();
      event.stopPropagation();

      const target = event.target;

      if (!(target instanceof Element)) return;

      const paneElement = target.closest("[data-pane-id]");
      if (!paneElement) return;

      const paneId = paneElement.getAttribute("data-pane-id");

      if (paneId !== "left" && paneId !== "right") return;

      if (wheelLockRef.current) return;

      wheelLockRef.current = true;

      if (event.deltaY < 0) {
        zoomIn(paneId);
      } else {
        zoomOut(paneId);
      }

      window.setTimeout(() => {
        wheelLockRef.current = false;
      }, 40);
    };

    root.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    });

    return () => {
      root.removeEventListener("wheel", handleWheel, true);
    };
  }, [zoomIn, zoomOut]);

  const handleTextItems = useCallback(
    (pane: PaneId, page: number, items: PdfTextItem[]) => {
      setTextItemsByPane((prev) => {
        const filtered = prev[pane].filter((item) => item.page !== page);

        return {
          ...prev,
          [pane]: [...filtered, ...items],
        };
      });
    },
    []
  );

  const hasLeftPdf = Boolean(panes.left.pdfUrl);
  const hasRightPdf = Boolean(panes.right.pdfUrl);
  const isSplitMode = hasLeftPdf && hasRightPdf;

  const visiblePanes: PaneId[] = useMemo(() => {
    if (hasLeftPdf && hasRightPdf) return ["left", "right"];
    if (hasLeftPdf) return ["left"];
    if (hasRightPdf) return ["right"];
    return [];
  }, [hasLeftPdf, hasRightPdf]);

  const formulas = useMemo<FormulaCandidate[]>(() => {
    const result: FormulaCandidate[] = [];

    if (hasLeftPdf) {
      result.push(
        ...extractFormulaCandidates(
          "left",
          panes.left.pageNumber,
          textItemsByPane.left
        )
      );
    }

    if (hasRightPdf) {
      result.push(
        ...extractFormulaCandidates(
          "right",
          panes.right.pageNumber,
          textItemsByPane.right
        )
      );
    }

    return result;
  }, [
    hasLeftPdf,
    hasRightPdf,
    panes.left.pageNumber,
    panes.right.pageNumber,
    textItemsByPane.left,
    textItemsByPane.right,
  ]);

  const outlineItems = useMemo<OutlineItem[]>(() => {
  return [
    ...extractOutlineItems("left", textItemsByPane.left),
    ...extractOutlineItems("right", textItemsByPane.right),
  ].sort((a, b) => {
    if (a.pane !== b.pane) {
      return a.pane === "left" ? -1 : 1;
    }

    if (a.page !== b.page) {
      return a.page - b.page;
    }

    if (a.rect.y !== b.rect.y) {
      return a.rect.y - b.rect.y;
    }

    return a.rect.x - b.rect.x;
  });
}, [textItemsByPane.left, textItemsByPane.right]);

  const handleDividerPointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    event.preventDefault();

    const viewerArea = viewerAreaRef.current;
    if (!viewerArea) return;

    const rect = viewerArea.getBoundingClientRect();

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const x = moveEvent.clientX - rect.left;
      const ratio = (x / rect.width) * 100;

      const clamped = Math.min(78, Math.max(22, ratio));
      setSplitRatio(Number(clamped.toFixed(1)));
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <div
      ref={appRootRef}
      className={
        isSidebarCollapsed
          ? "app-layout sidebar-collapsed"
          : "app-layout sidebar-expanded"
      }
    >
      <Sidebar
        formulas={formulas}
        outlineItems={outlineItems}
        textItemsByPane={textItemsByPane}
        debugTextLayer={debugTextLayer}
        collapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed((value) => !value)}
        onToggleDebugTextLayer={() => setDebugTextLayer((value) => !value)}
      />

      <main
        ref={viewerAreaRef}
        className={
          isSplitMode ? "viewer-area split-mode" : "viewer-area single-mode"
        }
        style={
          isSplitMode
            ? {
                gridTemplateColumns: `${splitRatio}fr 8px ${
                  100 - splitRatio
                }fr`,
              }
            : undefined
        }
      >
        {visiblePanes.length === 0 && (
          <div className="no-pdf-message">PDFを読み込んでください</div>
        )}

        {!isSplitMode &&
          visiblePanes.map((pane) => (
            <PdfPane
              key={pane}
              pane={pane}
              debugTextLayer={debugTextLayer}
              onTextItems={handleTextItems}
            />
          ))}

        {isSplitMode && (
          <>
            <PdfPane
              pane="left"
              debugTextLayer={debugTextLayer}
              onTextItems={handleTextItems}
            />

            <div
              className="split-divider"
              onPointerDown={handleDividerPointerDown}
              title="ドラッグして表示幅を調整"
            />

            <PdfPane
              pane="right"
              debugTextLayer={debugTextLayer}
              onTextItems={handleTextItems}
            />
          </>
        )}
      </main>
    </div>
  );
}