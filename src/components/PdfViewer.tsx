import { useEffect, useState } from "react";
import { pdfjsLib } from "../lib/pdfjs";
import { PdfPage } from "./PdfPage";
import { useViewerStore } from "../store/viewerStore";

export function PdfViewer() {
  const { pdfUrl, setPdfUrl, zoomIn, zoomOut, scale } = useViewerStore();

  const [pdf, setPdf] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("pdf");
    if (url) setPdfUrl(url);
  }, [setPdfUrl]);

  useEffect(() => {
    if (!pdfUrl) return;
    pdfjsLib.getDocument(pdfUrl).promise.then(setPdf);
  }, [pdfUrl]);

  const handleItems = (page: number, pageItems: any[]) => {
    pageItems.forEach((i) => (i.page = page));

    setItems((prev) => {
      const filtered = prev.filter((i) => i.page !== page);
      return [...filtered, ...pageItems];
    });
  };

  return (
    <div>
      <button onClick={zoomIn}>+</button>
      <button onClick={zoomOut}>-</button>

      {pdf &&
        Array.from({ length: pdf.numPages }).map((_, i) => (
          <PdfPage
            key={i}
            pdf={pdf}
            pageNumber={i + 1}
            scale={scale}
            onItems={handleItems}
          />
        ))}
    </div>
  );
}