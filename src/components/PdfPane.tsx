import { useCallback, useEffect, useRef, useState } from "react";
import { pdfjsLib } from "../lib/pdfjs";
import { PdfPage } from "./PdfPage";
import type { PaneId, PdfTextItem } from "../types/pdf";
import { useViewerStore } from "../store/viewerStore";
import { useHighlightStore } from "../store/highlightStore";

type PdfPaneProps = {
  pane: PaneId;
  debugTextLayer: boolean;
  onTextItems: (pane: PaneId, page: number, items: PdfTextItem[]) => void;
};

type ScrollAnchor = {
  page: number;
  ratioY: number;
};

const MIN_SCALE = 0.25;
const PANE_HORIZONTAL_PADDING = 40;
const AUTO_FIT_MARGIN = 16;

export function PdfPane({ pane, debugTextLayer, onTextItems }: PdfPaneProps) {
  const paneState = useViewerStore((state) => state.panes[pane]);
  const setTotalPages = useViewerStore((state) => state.setTotalPages);
  const setPageNumber = useViewerStore((state) => state.setPageNumber);
  const setUserScale = useViewerStore((state) => state.setUserScale);
  const setFitScale = useViewerStore((state) => state.setFitScale);
  const activeHighlight = useHighlightStore((state) => state.activeHighlight);
  const clearHighlight = useHighlightStore((state) => state.clearHighlight);

  const containerRef = useRef<HTMLElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const tickingRef = useRef(false);

  const initialScrollDoneRef = useRef(false);
  const lastJumpRequestIdRef = useRef<number>(paneState.jumpRequestId);
  const previousScaleRef = useRef<number>(paneState.userScale);
  const scrollAnchorRef = useRef<ScrollAnchor | null>(null);
  const suppressPageDetectUntilRef = useRef<number>(0);

  const lastAvailableWidthRef = useRef<number | null>(null);
  const latestUserScaleRef = useRef<number>(paneState.userScale);

  const [pdf, setPdf] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [basePageWidth, setBasePageWidth] = useState<number | null>(null);

  const effectiveScale = paneState.userScale;

  useEffect(() => {
    latestUserScaleRef.current = paneState.userScale;
  }, [paneState.userScale]);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    lastJumpRequestIdRef.current = paneState.jumpRequestId;
    previousScaleRef.current = paneState.userScale;
    scrollAnchorRef.current = null;
    suppressPageDetectUntilRef.current = 0;
    lastAvailableWidthRef.current = null;

    setBasePageWidth(null);

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

        if (!cancelled) {
          setBasePageWidth(baseViewport.width);
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

  const getDominantVisiblePage = (): number => {
    const container = containerRef.current;

    if (!container || !pdf) {
      return paneState.pageNumber;
    }

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

    return bestPage;
  };

  const getScrollAnchor = (): ScrollAnchor | null => {
    const container = containerRef.current;

    if (!container) return null;

    const page = getDominantVisiblePage();
    const pageElement = pageRefs.current[page];

    if (!pageElement) return null;

    const containerRect = container.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();

    const offsetInPage = containerRect.top - pageRect.top;

    const ratioY =
      pageElement.offsetHeight > 0
        ? Math.min(Math.max(offsetInPage / pageElement.offsetHeight, 0), 1)
        : 0;

    return {
      page,
      ratioY,
    };
  };

  const restoreScrollAnchor = (anchor: ScrollAnchor | null) => {
    if (!anchor) return;

    const container = containerRef.current;
    const pageElement = pageRefs.current[anchor.page];

    if (!container || !pageElement) return;

    const targetTop =
      pageElement.offsetTop + pageElement.offsetHeight * anchor.ratioY;

    container.scrollTop = Math.max(0, targetTop);
  };

  const scrollToPageWhenReady = useCallback(
    (pageNumber: number, behavior: ScrollBehavior, maxAttempts = 30) => {
      let attempts = 0;

      const tryScroll = () => {
        const target = pageRefs.current[pageNumber];

        if (!target) {
          if (attempts < maxAttempts) {
            attempts += 1;
            window.requestAnimationFrame(tryScroll);
          }

          return;
        }

        if (target.offsetHeight <= 0 && attempts < maxAttempts) {
          attempts += 1;
          window.requestAnimationFrame(tryScroll);
          return;
        }

        target.scrollIntoView({
          block: "start",
          behavior,
        });
      };

      window.requestAnimationFrame(tryScroll);
    },
    []
  );

  /**
   * 自動縮尺:
   * - 初回表示時には、PDFがペインより大きすぎる場合のみ縮小
   * - ペイン幅が狭くなった時のみ縮小
   * - ユーザーがズームインしただけでは縮小しない
   */
  useEffect(() => {
    const container = containerRef.current;

    if (!container || !basePageWidth) return;

    const updateFitAndShrinkIfNeeded = () => {
      const availableWidth =
        container.clientWidth - PANE_HORIZONTAL_PADDING - AUTO_FIT_MARGIN;

      if (availableWidth <= 0) return;

      const fitScale = Math.max(MIN_SCALE, availableWidth / basePageWidth);
      setFitScale(pane, fitScale);

      const previousAvailableWidth = lastAvailableWidthRef.current;
      const currentUserScale = latestUserScaleRef.current;
      const currentRenderedWidth = basePageWidth * currentUserScale;

      const isInitialMeasure = previousAvailableWidth === null;
      const paneBecameNarrower =
        previousAvailableWidth !== null &&
        availableWidth < previousAvailableWidth - 2;

      const shouldAutoShrink =
        (isInitialMeasure || paneBecameNarrower) &&
        currentRenderedWidth > availableWidth;

      if (shouldAutoShrink) {
        const nextScale = Math.max(MIN_SCALE, fitScale);

        if (nextScale < currentUserScale) {
          scrollAnchorRef.current = getScrollAnchor();
          setUserScale(pane, nextScale);
        }
      }

      lastAvailableWidthRef.current = availableWidth;
    };

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(updateFitAndShrinkIfNeeded);
    });

    observer.observe(container);
    window.requestAnimationFrame(updateFitAndShrinkIfNeeded);

    return () => {
      observer.disconnect();
    };
  }, [pane, basePageWidth, setFitScale, setUserScale]);

  // 初回ロード時のみ現在ページへ移動
  useEffect(() => {
    if (!pdf) return;
    if (initialScrollDoneRef.current) return;

    scrollToPageWhenReady(paneState.pageNumber, "auto");

    initialScrollDoneRef.current = true;
    suppressPageDetectUntilRef.current = Date.now() + 900;
  }, [pdf, paneState.pageNumber, scrollToPageWhenReady]);

  // 明示的ページジャンプ時のみscrollIntoView
  useEffect(() => {
    if (!pdf) return;

    if (paneState.jumpRequestId === lastJumpRequestIdRef.current) {
      return;
    }

    lastJumpRequestIdRef.current = paneState.jumpRequestId;

    scrollToPageWhenReady(paneState.pageNumber, "smooth");

    suppressPageDetectUntilRef.current = Date.now() + 900;
  }, [pdf, paneState.jumpRequestId, paneState.pageNumber, scrollToPageWhenReady]);

  // ズーム後に見ていた位置を復元
  useEffect(() => {
    if (!pdf) return;

    if (previousScaleRef.current === paneState.userScale) {
      return;
    }

    const anchor = scrollAnchorRef.current ?? getScrollAnchor();

    previousScaleRef.current = paneState.userScale;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        restoreScrollAnchor(anchor);
        scrollAnchorRef.current = null;
        suppressPageDetectUntilRef.current = Date.now() + 300;
      });
    });
  }, [pdf, paneState.userScale]);

  const updateDominantVisiblePage = () => {
    if (!pdf) return;

    if (Date.now() < suppressPageDetectUntilRef.current) {
      return;
    }

    const bestPage = getDominantVisiblePage();

    if (bestPage !== paneState.pageNumber) {
      setPageNumber(pane, bestPage);
    }
  };

  const clearOutlineHighlightIfPageIsGone = () => {
    if (!activeHighlight || activeHighlight.source !== "outline") return;
    if (activeHighlight.pane !== pane) return;

    const container = containerRef.current;
    const pageElement = pageRefs.current[activeHighlight.page];

    if (!container || !pageElement) return;

    const containerRect = container.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();
    const visibleTop = Math.max(pageRect.top, containerRect.top);
    const visibleBottom = Math.min(pageRect.bottom, containerRect.bottom);
    const visibleLeft = Math.max(pageRect.left, containerRect.left);
    const visibleRight = Math.min(pageRect.right, containerRect.right);
    const isVisible =
      visibleBottom > visibleTop + 1 && visibleRight > visibleLeft + 1;

    if (!isVisible) {
      clearHighlight();
    }
  };

  const handleScroll = () => {
    if (tickingRef.current) return;

    tickingRef.current = true;

    window.requestAnimationFrame(() => {
      updateDominantVisiblePage();
      clearOutlineHighlightIfPageIsGone();
      tickingRef.current = false;
    });
  };

  if (!paneState.pdfUrl) {
    return (
      <section className="pdf-pane empty-pane" data-pane-id={pane}>
        <div>PDFが読み込まれていません</div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="pdf-pane empty-pane" data-pane-id={pane}>
        <div>
          <h3>PDF読み込みエラー</h3>
          <pre>{loadError}</pre>
        </div>
      </section>
    );
  }

  if (!pdf) {
    return (
      <section className="pdf-pane empty-pane" data-pane-id={pane}>
        <div>PDFを読み込み中...</div>
      </section>
    );
  }

  return (
    <section
      ref={containerRef}
      className="pdf-pane"
      data-pane-id={pane}
      onScroll={handleScroll}
    >
      <div className="pane-status">
        {pane === "left" ? "左" : "右"} / p.{paneState.pageNumber} /{" "}
        {paneState.totalPages} / {Math.round(effectiveScale * 100)}%
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
              pane={pane}
              pdf={pdf}
              pageNumber={pageNumber}
              scale={effectiveScale}
              debugTextLayer={debugTextLayer}
              onTextItems={(page, items) => onTextItems(pane, page, items)}
            />
          </div>
        );
      })}
    </section>
  );
}
