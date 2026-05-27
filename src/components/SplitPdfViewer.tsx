import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "./Sidebar";
import { PdfPane } from "./PdfPane";
import { useViewerStore } from "../store/viewerStore";
import type { FormulaCandidate, PaneId, PdfTextItem } from "../types/pdf";
import { extractFormulaCandidates } from "../pdf/formula";

type TextItemsByPane = Record<PaneId, PdfTextItem[]>;

export function SplitPdfViewer() {
  const loadPdf = useViewerStore((state) => state.loadPdf);
  const panes = useViewerStore((state) => state.panes);

  const [debugTextLayer, setDebugTextLayer] = useState(false);
  const [textItemsByPane, setTextItemsByPane] = useState<TextItemsByPane>({
    left: [],
    right: [],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pdfParam = params.get("pdf");

    if (typeof pdfParam === "string" && pdfParam.length > 0) {
      loadPdf("left", pdfParam, "URL PDF");
    }
  }, [loadPdf]);

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

  const formulas = useMemo<FormulaCandidate[]>(() => {
    const leftPage = panes.left.pageNumber;
    const rightPage = panes.right.pageNumber;

    return [
      ...extractFormulaCandidates(
        "left",
        leftPage,
        textItemsByPane.left
      ),
      ...extractFormulaCandidates(
        "right",
        rightPage,
        textItemsByPane.right
      ),
    ];
  }, [
    panes.left.pageNumber,
    panes.right.pageNumber,
    textItemsByPane.left,
    textItemsByPane.right,
  ]);

  return (
    <div className="app-layout">
      <Sidebar
        formulas={formulas}
        debugTextLayer={debugTextLayer}
        onToggleDebugTextLayer={() => setDebugTextLayer((value) => !value)}
      />

      <main className="split-view">
        <PdfPane
          pane="left"
          debugTextLayer={debugTextLayer}
          onTextItems={handleTextItems}
        />

        <PdfPane
          pane="right"
          debugTextLayer={debugTextLayer}
          onTextItems={handleTextItems}
        />
      </main>
    </div>
  );
}