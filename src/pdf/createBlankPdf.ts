import { degrees, PDFDocument } from "pdf-lib";

type PdfBytesInput = ArrayBuffer | Uint8Array;

const A4_PORTRAIT = {
  width: 595.28,
  height: 841.89,
};

function toUint8Array(bytes: PdfBytesInput): Uint8Array {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }

  return new Uint8Array(bytes);
}

async function loadPdf(bytes: PdfBytesInput): Promise<PDFDocument> {
  return await PDFDocument.load(toUint8Array(bytes), {
    ignoreEncryption: true,
  });
}

export async function createBlankPdf(params?: {
  width?: number;
  height?: number;
  pageCount?: number;
  title?: string;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  const width = params?.width ?? A4_PORTRAIT.width;
  const height = params?.height ?? A4_PORTRAIT.height;
  const pageCount = Math.max(1, Math.floor(params?.pageCount ?? 1));

  for (let index = 0; index < pageCount; index += 1) {
    pdfDoc.addPage([width, height]);
  }

  pdfDoc.setTitle(params?.title ?? "Blank PDF");

  return await pdfDoc.save();
}

export async function addBlankPdfPage(
  pdfBytes: PdfBytesInput,
  params?: {
    width?: number;
    height?: number;
    copySizeFromLastPage?: boolean;
  }
): Promise<Uint8Array> {
  const pdfDoc = await loadPdf(pdfBytes);
  const pages = pdfDoc.getPages();

  let width = params?.width ?? A4_PORTRAIT.width;
  let height = params?.height ?? A4_PORTRAIT.height;

  if (params?.copySizeFromLastPage !== false && pages.length > 0) {
    const lastPage = pages[pages.length - 1];
    width = lastPage.getWidth();
    height = lastPage.getHeight();
  }

  pdfDoc.addPage([width, height]);

  return await pdfDoc.save();
}

export async function rotateBlankPdfPage(
  pdfBytes: PdfBytesInput,
  pageNumber: number,
  rotationDegrees = 90
): Promise<Uint8Array> {
  const pdfDoc = await loadPdf(pdfBytes);
  const pages = pdfDoc.getPages();

  const targetIndex = Math.min(
    Math.max(0, Math.floor(pageNumber) - 1),
    Math.max(0, pages.length - 1)
  );

  const page = pages[targetIndex];

  if (!page) {
    return await pdfDoc.save();
  }

  const currentRotation = page.getRotation().angle;
  const nextRotation = ((currentRotation + rotationDegrees) % 360 + 360) % 360;

  page.setRotation(degrees(nextRotation));

  return await pdfDoc.save();
}

/**
 * 互換用エイリアス。
 * Sidebar側で rotatePdfPage という名前で import している場合にも対応。
 */
export const rotatePdfPage = rotateBlankPdfPage;