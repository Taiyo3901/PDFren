import { useCallback, useEffect, useMemo, useState } from "react";
import { pdfjsLib } from "../lib/pdfjs";
import { PdfPage } from "./PdfPage";
import { useViewerStore } from "../store/viewerStore";
import type { PdfTextItem, OcrResult } from "../types/pdf";

export function PdfViewer() {
  const { pdfUrl, setPdfUrl, zoomIn, zoomOut, scale } = useViewerStore();

  const [pdf, setPdf] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [textItems, setTextItems] = useState<PdfTextItem[]>([]);
  const [ocrResults, setOcrResults] = useState<OcrResult[]>([]);
  const [debugTextLayer, setDebugTextLayer] = useState(false);

  useEffect(() => {
    console.log("[PdfViewer] mounted");

    const params = new URLSearchParams(window.location.search);
    const pdfParam = params.get("pdf");

    console.log("[PdfViewer] pdf param:", pdfParam);

    if (typeof pdfParam === "string" && pdfParam.length > 0) {
      setPdfUrl(pdfParam);
    } else {
      setLoadError("URLパラメータ pdf が見つかりません。");
    }
  }, [setPdfUrl]);

  useEffect(() => {
    if (typeof pdfUrl !== "string" || pdfUrl.length === 0) {
      return;
    }

    const resolvedPdfUrl: string = pdfUrl;
    let cancelled = false;

    async function loadPdf(urlForLoading: string) {
      try {
        setPdf(null);
        setLoadError(null);

        console.log("[PdfViewer] loading:", urlForLoading);

        const loadingTask = pdfjsLib.getDocument({
          url: urlForLoading,
        });

        const loadedPdf = await loadingTask.promise;

        if (!cancelled) {
          console.log("[PdfViewer] loaded pages:", loadedPdf.numPages);
          setPdf(loadedPdf);
        }
      } catch (error) {
        console.error("[PdfViewer] PDF load failed:", error);

        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : String(error);

          setLoadError(
            [
              "PDFの読み込みに失敗しました。",
              "",
              message,
              "",
              "file:/// のPDFを開いている場合は、Chrome拡張の詳細画面で",
              "「ファイルのURLへのアクセスを許可する」をONにしてください。",
            ].join("\n")
          );
        }
      }
    }

    void loadPdf(resolvedPdfUrl);

    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  const pageNumbers = useMemo(() => {
    if (!pdf) return [];

    return Array.from({ length: pdf.numPages }, (_, index) => index + 1);
  }, [pdf]);

  const handleTextItems = useCallback((page: number, items: PdfTextItem[]) => {
    setTextItems((prev) => {
      const filtered = prev.filter((item) => item.page !== page);
      return [...filtered, ...items];
    });
  }, []);

  const handleOcrText = useCallback((page: number, text: string) => {
    setOcrResults((prev) => {
      const filtered = prev.filter((item) => item.page !== page);
      return [...filtered, { page, text }];
    });
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#111",
        color: "white",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 8,
          background: "#222",
          borderBottom: "1px solid #333",
        }}
      >
        <button onClick={zoomOut}>-</button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn}>+</button>

        <button onClick={() => setDebugTextLayer((value) => !value)}>
          TextLayer Debug: {debugTextLayer ? "ON" : "OFF"}
        </button>

        <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.75 }}>
          Text items: {textItems.length} / OCR pages: {ocrResults.length}
        </span>
      </div>

      {loadError && (
        <div
          style={{
            margin: 24,
            padding: 16,
            borderRadius: 8,
            background: "#300",
            color: "#fff",
            whiteSpace: "pre-wrap",
          }}
        >
          {loadError}
        </div>
      )}

      {!loadError && !pdf && (
        <div style={{ padding: 24 }}>PDFを読み込み中...</div>
      )}

      {pdf &&
        pageNumbers.map((pageNumber) => (
          <PdfPage
            key={pageNumber}
            pdf={pdf}
            pageNumber={pageNumber}
            scale={scale}
            debugTextLayer={debugTextLayer}
            onTextItems={handleTextItems}
            onOcrText={handleOcrText}
          />
        ))}
    </div>
  );
}
