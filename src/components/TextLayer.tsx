import { useEffect, useRef } from "react";
import { pdfjsLib } from "../lib/pdfjs";

type Props = {
  page: any;
  viewport: any;
  scale: number;
  onItems: (items: any[]) => void;
};

export function TextLayer({ page, viewport, scale, onItems }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const render = async () => {
      const textContent = await page.getTextContent();
      const container = ref.current!;
      container.innerHTML = "";

      const items: any[] = [];

      for (const item of textContent.items as any[]) {
        const tx = pdfjsLib.Util.transform(
          viewport.transform,
          item.transform
        );

        const x = tx[4];
        const y = tx[5];
        const height = Math.hypot(tx[2], tx[3]);
        const width = item.width * scale;

        const span = document.createElement("span");

        span.textContent = item.str;

        span.style.position = "absolute";
        span.style.left = `${x}px`;
        span.style.top = `${y - height}px`;
        span.style.fontSize = `${height}px`;
        span.style.width = `${width}px`;
        span.style.height = `${height}px`;

        span.style.whiteSpace = "pre";

        // ✅ これが超重要（コピーできるか決まる）
        span.style.color = "rgba(0,0,0,0)";
        span.style.userSelect = "text";
        span.style.pointerEvents = "auto";

        container.appendChild(span);

        items.push({
          str: item.str,
          x,
          y,
          width,
          height
        });
      }

      onItems(items);
    };

    render();
  }, [page, viewport, scale, onItems]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: viewport?.width,
        height: viewport?.height,
        zIndex: 10 // ✅ canvasより上
      }}
    />
  );
}