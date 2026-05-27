export function cropFormulaRegion(canvas: HTMLCanvasElement) {
  const w = canvas.width;
  const h = canvas.height;

  const cropped = document.createElement("canvas");

  // ✅ 中央部だけ切る（数式は中央に多い）
  cropped.width = w * 0.6;
  cropped.height = h * 0.4;

  const ctx = cropped.getContext("2d")!;

  ctx.drawImage(
    canvas,
    w * 0.2,
    h * 0.3,
    w * 0.6,
    h * 0.4,
    0,
    0,
    cropped.width,
    cropped.height
  );

  return cropped;
}