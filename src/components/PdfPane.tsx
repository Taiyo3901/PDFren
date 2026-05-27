import { useCallback, useEffect, useState } from "react";
import { pdfjsLib } from "../lib/pdfjs";
import { PdfPage } from "./PdfPage";
import type { PaneId, PdfTextItem } from "../types/pdf";
import { useViewerStore } from "../store/viewerStore";

type PdfPaneProps = {
  pane: PaneId;
  debugTextLayer: boolean;
  onTextItems: (pane: PaneId, page: number, items: PdfTextItem[]) => void;
};

export function PdfPane({ pane, debugTextLayer, onTextItems }: PdfPaneProps) {
  const paneState = useViewerStore((state) => state.panes[pane]);
  const setTotalPages = useViewerStore((state) => state.setTotalPages);
  const setPageNumber = useViewerStore((state) => state.setPageNumber);

  const [pdf, setPdf] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!paneState.pdfUrl) {
      setPdf(null);
      setLoadError(null);
      return;
    }

    let cancelled = false;

    async function loadPdf(url: string) {
      try {
        setPdf(null);
        setLoadError(null);

        const loadingTask = pdfjsLib.getDocument({ url });
        const loadedPdf = await loadingTask.promise;

        if (!cancelled) {
          setPdf(loadedPdf);
          setTotalPages(pane, loadedPdf.numPages);
        }
      } catch (error) {
        console.error(`[${pane}] PDF load failed`, error);

        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : String(error);

          setLoadError(message);
        }
      }
    }

    void loadPdf(paneState.pdfUrl);

    return () => {
      cancelled = true;
    };
  }, [pane, paneState.pdfUrl, setTotalPages]);

  const handleTextItems = useCallback(
    (page: number, items: PdfTextItem[]) => {
      onTextItems(pane, page, items);
    },
    [pane, onTextItems]
  );

  if (!paneState.pdfUrl) {
    return (
      <section className="pdf-pane empty-pane">
        <div>PDFが読み込まれていません</div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="pdf-pane empty-pane">
        <div>
          <h3>PDF読み込みエラー</h3>
          <pre>{loadError}</pre>
        </div>
      </section>
    );
  }

  if (!pdf) {
    return (
      <section className="pdf-pane empty-pane">
        <div>PDFを読み込み中...</div>
      </section>
    );
  }

  return (
    <section className="pdf-pane">
      <PdfPage
        pdf={pdf}
        pageNumber={paneState.pageNumber}
        scale={paneState.scale}
        debugTextLayer={debugTextLayer}
        onTextItems={handleTextItems}
      />

      <div className="page-bottom-controls">
        <button onClick={() => setPageNumber(pane, paneState.pageNumber - 1)}>
          前
        </button>

        <span>
          {paneState.pageNumber} / {paneState.totalPages}
        </span>

        <button onClick={() => setPageNumber(pane, paneState.pageNumber + 1)}>
          次
        </button>
      </div>
    </section>
  );
}