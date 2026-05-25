import * as pdfjsLib from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = worker;

export { pdfjsLib };