import { useEffect, useRef } from "react";
import type { PaneId, PdfTextBox } from "../types/pdf";
import { usePdfTextBoxStore } from "../store/pdfTextBoxStore";

type TextBoxLayerProps = {
  pane: PaneId;
  pageNumber: number;
  viewportWidth: number;
  viewportHeight: number;
};

function createTextBoxId(): string {
  return `textbox-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * テキストボックス選択直後に Sidebar が開き、PDF表示領域が横へ移動すると、
 * pointerup/click の座標がテキストボックス外として判定されることがあります。
 * その直後の背景クリックで selectTextBox(null) されるのを防ぐため、
 * テキストボックス操作開始後は短時間だけ背景クリック解除を抑止します。
 */
const TEXTBOX_CLICK_SUPPRESS_MS = 500;

export function TextBoxLayer({
  pane,
  pageNumber,
  viewportWidth,
  viewportHeight,
}: TextBoxLayerProps) {
  const suppressBackgroundClickUntilRef = useRef(0);

  const textBoxAddArmed = usePdfTextBoxStore((state) => state.textBoxAddArmed);
  const selectedTextBoxId = usePdfTextBoxStore((state) => state.selectedTextBoxId);
  const textBoxes = usePdfTextBoxStore((state) => state.textBoxes);
  const addTextBox = usePdfTextBoxStore((state) => state.addTextBox);
  const updateTextBox = usePdfTextBoxStore((state) => state.updateTextBox);
  const removeTextBox = usePdfTextBoxStore((state) => state.removeTextBox);
  const selectTextBox = usePdfTextBoxStore((state) => state.selectTextBox);
  const cancelTextBoxAdd = usePdfTextBoxStore((state) => state.cancelTextBoxAdd);
  const setViewportInfo = usePdfTextBoxStore((state) => state.setViewportInfo);

  useEffect(() => {
    setViewportInfo({
      pane,
      page: pageNumber,
      width: viewportWidth,
      height: viewportHeight,
    });
  }, [pane, pageNumber, viewportWidth, viewportHeight, setViewportInfo]);

  const pageTextBoxes = textBoxes.filter(
    (box) => box.pane === pane && box.page === pageNumber
  );

  const suppressBackgroundClick = () => {
    suppressBackgroundClickUntilRef.current =
      Date.now() + TEXTBOX_CLICK_SUPPRESS_MS;
  };

  const isBackgroundClickSuppressed = () => {
    return Date.now() < suppressBackgroundClickUntilRef.current;
  };

  const handleLayerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (isBackgroundClickSuppressed()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!textBoxAddArmed) {
      selectTextBox(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, viewportWidth - 220);
    const y = clamp(event.clientY - rect.top, 0, viewportHeight - 82);

    addTextBox({
      id: createTextBoxId(),
      pane,
      page: pageNumber,
      x,
      y,
      width: 220,
      height: 82,
      text: "",
      fontSize: 15,
      color: "#000000",
      textAlign: "left",
      fontWeight: "normal",
      italic: false,
      underline: false,
      backgroundColor: "transparent",
      opacity: 1,
    });
  };

  const startMove = (
    event: React.PointerEvent<HTMLDivElement>,
    box: PdfTextBox
  ) => {
    event.preventDefault();
    event.stopPropagation();

    suppressBackgroundClick();
    selectTextBox(box.id);

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startX = box.x;
    const startY = box.y;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      suppressBackgroundClick();

      const deltaX = moveEvent.clientX - startClientX;
      const deltaY = moveEvent.clientY - startClientY;

      const nextX = clamp(startX + deltaX, 0, viewportWidth - box.width);
      const nextY = clamp(startY + deltaY, 0, viewportHeight - box.height);

      updateTextBox(box.id, {
        x: nextX,
        y: nextY,
      });
    };

    const handlePointerUp = () => {
      suppressBackgroundClick();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const startResize = (
    event: React.PointerEvent<HTMLDivElement>,
    box: PdfTextBox
  ) => {
    event.preventDefault();
    event.stopPropagation();

    suppressBackgroundClick();
    selectTextBox(box.id);

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startWidth = box.width;
    const startHeight = box.height;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      suppressBackgroundClick();

      const deltaX = moveEvent.clientX - startClientX;
      const deltaY = moveEvent.clientY - startClientY;

      const nextWidth = clamp(
        startWidth + deltaX,
        72,
        Math.max(72, viewportWidth - box.x)
      );

      const nextHeight = clamp(
        startHeight + deltaY,
        34,
        Math.max(34, viewportHeight - box.y)
      );

      updateTextBox(box.id, {
        width: nextWidth,
        height: nextHeight,
      });
    };

    const handlePointerUp = () => {
      suppressBackgroundClick();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <div
      className={textBoxAddArmed ? "text-box-layer active" : "text-box-layer"}
      style={{
        position: "absolute",
        inset: 0,
        width: `${viewportWidth}px`,
        height: `${viewportHeight}px`,
        zIndex: 30,
        // 重要:
        // ページ全体でイベントを拾うのは「テキストボックス追加モード」の時だけ。
        // 通常時は親レイヤーを透過し、画像貼り付け/画像移動/画像トリミングのイベントを邪魔しない。
        pointerEvents: textBoxAddArmed ? "auto" : "none",
      }}
      onClick={handleLayerClick}
    >
      {pageTextBoxes.map((box) => {
        const selected = selectedTextBoxId === box.id;
        const hasText = box.text.trim().length > 0;
        const backgroundColor =
          box.backgroundColor && box.backgroundColor !== "transparent"
            ? box.backgroundColor
            : "transparent";

        return (
          <div
            key={box.id}
            className={selected ? "pdf-text-box selected" : "pdf-text-box"}
            style={{
              position: "absolute",
              // 親レイヤーが pointerEvents: none の時でも、
              // テキストボックス本体だけは選択・編集できるようにする。
              pointerEvents: "auto",
              left: `${box.x}px`,
              top: `${box.y}px`,
              width: `${box.width}px`,
              height: `${box.height}px`,
              border: selected || !hasText ? "1px solid #000000" : "none",
              background: backgroundColor,
              opacity: box.opacity ?? 1,
              borderRadius: "2px",
              boxSizing: "border-box",
              overflow: "visible",
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
              suppressBackgroundClick();
              selectTextBox(box.id);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              suppressBackgroundClick();
              selectTextBox(box.id);
            }}
            onClick={(event) => {
              event.stopPropagation();
              suppressBackgroundClick();
            }}
          >
            {selected && (
              <>
                <div
                  className="pdf-text-box-move-grip"
                  onPointerDown={(event) => startMove(event, box)}
                  title="ドラッグして移動"
                >
                  ⠿
                </div>

                <button
                  type="button"
                  className="pdf-text-box-delete-button"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    suppressBackgroundClick();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    suppressBackgroundClick();
                    removeTextBox(box.id);
                  }}
                  title="削除"
                >
                  ×
                </button>
              </>
            )}

            <textarea
              value={box.text}
              style={{
                width: "100%",
                height: "100%",
                resize: "none",
                border: "none",
                outline: "none",
                background: "transparent",
                color: box.color || "#000000",
                opacity: 1,
                fontWeight: box.fontWeight === "bold" ? 700 : 500,
                fontStyle: box.italic ? "italic" : "normal",
                textDecorationLine: box.underline ? "underline" : "none",
                fontSize: `${box.fontSize}px`,
                lineHeight: "1.4",
                textAlign: box.textAlign ?? "left",
                padding: "4px",
                boxSizing: "border-box",
                overflow: "hidden",
                fontFamily:
                  "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                suppressBackgroundClick();
                selectTextBox(box.id);
              }}
              onMouseDown={(event) => {
                event.stopPropagation();
                suppressBackgroundClick();
                selectTextBox(box.id);
              }}
              onClick={(event) => {
                event.stopPropagation();
                suppressBackgroundClick();
              }}
              onFocus={() => {
                suppressBackgroundClick();
                selectTextBox(box.id);
              }}
              onChange={(event) => {
                updateTextBox(box.id, {
                  text: event.target.value,
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.currentTarget.blur();
                  selectTextBox(null);
                  cancelTextBoxAdd();
                }

                if (
                  event.key === "Delete" &&
                  (event.ctrlKey || event.metaKey)
                ) {
                  event.preventDefault();
                  removeTextBox(box.id);
                }
              }}
            />

            {selected && (
              <div
                className="pdf-text-box-resize-handle"
                onPointerDown={(event) => startResize(event, box)}
                title="ドラッグしてサイズ変更"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
