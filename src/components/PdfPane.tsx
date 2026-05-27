import { useEffect, useRef, useState } from "react";
import { pdfjsLib } from "../lib/pdfjs";
import { PdfPage } from "./PdfPage";
import type { PaneId, PdfTextItem } from "../types/pdf";
import { useViewerStore } from "../store/viewerStore";

type PdfPaneProps = {
  pane: PaneId;
  debugTextLayer: boolean;
  onTextItems: (pane: PaneId, page: number, items: PdfTextItem[]) => void;
};

const PANE_HORIZONTAL_PADDING = 48;
const AUTO_FIT_MARGIN = 24;

export function PdfPane({ pane, debugTextLayer, onTextItems }: PdfPaneProps) {
  const paneState = useViewerStore((state) => state.panes[pane]);
  const setTotalPages = useViewerStore((state) => state.setTotalPages);
  const setPageNumber = useViewerStore((state) => state.setPageNumber);
  const setScale = useViewerStore((state) => state.setScale);
  const zoomIn = useViewerStore((state) => state.zoomIn);
  const zoomOut = useViewerStore((state) => state.zoomOut);

  const containerRef = useRef<HTMLElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const tickingRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  const basePageWidthRef = useRef<number | null>(null);
  const lastAutoFitScaleRef = useRef<number | null>(null);
  const wheelZoomLockRef = useRef(false);

  const [pdf, setPdf] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    basePageWidthRef.current = null;
    lastAutoFitScaleRef.current = null;

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

        if (cancelled) return;

        setPdf(loadedPdf);
        setTotalPages(pane, loadedPdf.numPages);

        const firstPage = await loadedPdf.getPage(1);
        const baseViewport = firstPage.getViewport({ scale: 1 });
        basePageWidthRef.current = baseViewport.width;
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const fitToContainer = () => {
      const baseWidth = basePageWidthRef.current;
      if (!baseWidth) return;

      const availableWidth =
        container.clientWidth - PANE_HORIZONTAL_PADDING - AUTO_FIT_MARGIN;

      if (availableWidth <= 0) return;

      const maxScaleForWidth = availableWidth / baseWidth;
      const currentRenderedWidth = baseWidth * paneState.scale;

      if (currentRenderedWidth > availableWidth) {
        const nextScale = Math.max(0.35, Math.min(paneState.scale, maxScaleForWidth));

        if (Math.abs(nextScale - paneState.scale) > 0.02) {
          lastAutoFitScaleRef.current = nextScale;
          setScale(pane, nextScale);
        }
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(fitToContainer);
    });

    resizeObserver.observe(container);

    window.requestAnimationFrame(fitToContainer);

    return () => {
      resizeObserver.disconnect();
    };
  }, [pane, paneState.scale, setScale]);

  useEffect(() => {
    if (!pdf) return;
    if (initialScrollDoneRef.current) return;

    const targetPage = paneState.pageNumber;
    const target = pageRefs.current[targetPage];

    if (target) {
      target.scrollIntoView({
        block: "start",
        behavior: "auto",
      });

      initialScrollDoneRef.current = true;
    }
  }, [pdf, paneState.pageNumber]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (event: WheelEvent) => {
      const isZoomGesture = event.ctrlKey || event.metaKey;

      if (!isZoomGesture) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (wheelZoomLockRef.current) return;

      wheelZoomLockRef.current = true;

      if (event.deltaY < 0) {
        zoomIn(pane);
      } else {
        zoomOut(pane);
      }

      window.setTimeout(() => {
        wheelZoomLockRef.current = false;
      }, 40);
    };

    container.addEventListener("wheel", handleNativeWheel, {
      passive: false,
    });

    return () => {
      container.removeEventListener("wheel", handleNativeWheel);
    };
  }, [pane, zoomIn, zoomOut]);

  const updateDominantVisiblePage = () => {
    const container = containerRef.current;
    if (!container || !pdf) return;

    const containerRect = container.getBoundingClientRect();

    let bestPage = paneState.pageNumber;
    let bestVisibleArea = 0;

    for (let page = 1; page <= pdf.numPages; page += 1) {
      const element = pageRefs.current[page];
      if (!element) continue;

      const rect = element.getBoundingClientRect();

      const visibleTop = Math.max(rect.top, containerRect.top);
      const visibleBottom = Math.min(rect.bottom, containerRect.bottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);

      const visibleLeft = Math.max(rect.left, containerRect.left);
      const visibleRight = Math.min(rect.right, containerRect.right);
      const visibleWidth = Math.max(0, visibleRight - visibleLeft);

      const visibleArea = visibleWidth * visibleHeight;

      if (visibleArea > bestVisibleArea) {
        bestVisibleArea = visibleArea;
        bestPage = page;
      }
    }

    if (bestVisibleArea > 0 && bestPage !== paneState.pageNumber) {
      setPageNumber(pane, bestPage);
    }
  };

  const handleScroll = () => {
    if (tickingRef.current) return;

    tickingRef.current = true;

    window.requestAnimationFrame(() => {
      updateDominantVisiblePage();
      tickingRef.current = false;
    });
  };

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
    <section ref={containerRef} className="pdf-pane" onScroll={handleScroll}>
      <div className="pane-status">
        {pane === "left" ? "左" : "右"} / p.{paneState.pageNumber} /{" "}
        {paneState.totalPages} / {Math.round(paneState.scale * 100)}%
      </div>

      {Array.from({ length: pdf.numPages }, (_, index) => {
        const pageNumber = index + 1;

        return (
          <div
            key={pageNumber}
            ref={(element) => {
              pageRefs.current[pageNumber] = element;
            }}
            data-page-wrapper={pageNumber}
          >
            <PdfPage
              pdf={pdf}
              pageNumber={pageNumber}
              scale={paneState.scale}
              debugTextLayer={debugTextLayer}
              onTextItems={(page, items) => onTextItems(pane, page, items)}
            />
          </div>
        );
      })}
    </section>
  );
}