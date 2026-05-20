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

      const page =
        await pdf.getPage(1);

      const viewport =
        page.getViewport({
          scale: 1.5,
        });

      const canvas =
        document.createElement("canvas");

      const context =
        canvas.getContext("2d");

      if (!context) return;

      canvas.width =
        viewport.width;

      canvas.height =
        viewport.height;

      await page.render({
        canvasContext: context,
        viewport,
        canvas,
      }).promise;

      ref.current?.appendChild(canvas);

      console.log("render done");
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