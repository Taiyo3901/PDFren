import { useEffect, useRef, useState } from "react";
import { TextLayer } from "./TextLayer";

type Props = {
  pdf: any;
  pageNumber: number;
  scale: number;
  onItems: (page: number, items: any[]) => void;
};

export function PdfPage({ pdf, pageNumber, scale, onItems }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [pageObj, setPageObj] = useState<any>(null);
  const [viewport, setViewport] = useState<any>(null);

  // ✅ 前のレンダリングをキャンセルするための変数
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      const page = await pdf.getPage(pageNumber);
      const vp = page.getViewport({ scale });

      setPageObj(page);
      setViewport(vp);

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = vp.width;
      canvas.height = vp.height;

      // ✅ 前の描画をキャンセル
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
      }

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: vp,
      });

      renderTaskRef.current = renderTask;

      try {
        await renderTask.promise;
      } catch (e) {
        if ((e as any)?.name !== "RenderingCancelledException") {
          console.error(e);
        }
      }
    };

    render();

    return () => {
      cancelled = true;

      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
      }
    };
  }, [pdf, pageNumber, scale]);

  return (
    <div
      style={{
        position: "relative",
        width: viewport?.width,
        height: viewport?.height,
      }}
      data-page={pageNumber}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 1,
          pointerEvents: "none",
        }}
      />

      {pageObj && viewport && (
        <TextLayer
          page={pageObj}
          viewport={viewport}
          scale={scale}
          onItems={(items) => onItems(pageNumber, items)}
        />
      )}
    </div>
  );
}