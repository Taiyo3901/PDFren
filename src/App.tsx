import { useEffect, useRef } from "react";

import {
  GlobalWorkerOptions,
  getDocument,
} from "pdfjs-dist";

import pdfWorker from
  "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc =
  pdfWorker;

export default function App() {

  const ref =
    useRef<HTMLDivElement>(null);

  useEffect(() => {

    async function run() {

      const params =
        new URLSearchParams(window.location.search);

      const fileUrl =
        params.get("file");

      console.log(fileUrl);

      if (!fileUrl) return;

      const pdf =
        await getDocument(fileUrl)
          .promise;

      ref.current!.innerHTML = "";

      for (
        let i = 1;
        i <= pdf.numPages;
        i++
      ) {

        const page =
          await pdf.getPage(i);

        const viewport =
          page.getViewport({
            scale: 1.5,
          });

        const canvas =
          document.createElement("canvas");

        const context =
          canvas.getContext("2d");

        if (!context) continue;

        canvas.width =
          viewport.width;

        canvas.height =
          viewport.height;

        canvas.style.marginBottom =
          "20px";

        await page.render({
          canvasContext: context,
          viewport,
          canvas,
        }).promise;

        ref.current?.appendChild(canvas);
      }
    }

    run();

  }, []);

  return (
    <div
      ref={ref}
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "auto",
      }}
    />
  );
}