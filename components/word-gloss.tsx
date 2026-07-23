"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const LONG_PRESS_MS = 400;
const MOVE_CANCEL_PX = 12;
/** Keep mouse flag through late contextmenu after pointerup (Windows). */
const MOUSE_CONTEXT_GRACE_MS = 700;
/** Clear click-suppress after long-press so later taps are not eaten. */
const SUPPRESS_CLICK_MS = 450;

export type GlossWord = {
  text: string;
  pinyin: string;
  thai: string;
  /** Part of speech abbreviation from HSK lists (e.g. n, v, adj). */
  pos?: string;
};

const POS_THAI: Record<string, string> = {
  n: "คำนาม",
  v: "คำกริยา",
  adj: "คำคุณศัพท์",
  adv: "คำวิเศษณ์",
  pron: "สรรพนาม",
  num: "ตัวเลข",
  mw: "ลักษณนาม",
  measure: "ลักษณนาม",
  part: "คำช่วย",
  particle: "คำช่วย",
  prep: "คำบุพบท",
  conj: "คำเชื่อม",
  expr: "สำนวน",
  interj: "คำอุทาน",
  aux: "กริยาช่วย",
  pref: "อุปสรรค",
  suf: "ปัจจัย",
};

function formatPos(pos: string | undefined): string | null {
  const raw = pos?.trim();
  if (!raw) return null;
  return raw
    .split("/")
    .map((part) => {
      const key = part.trim().toLowerCase();
      const label = POS_THAI[key];
      return label ? `${label} (${key})` : part.trim();
    })
    .filter(Boolean)
    .join(" / ");
}

export function WordGlossPopup({
  word,
  onClose,
}: {
  word: GlossWord;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const posLabel = formatPos(word.pos);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-6 select-none [-webkit-user-select:none]"
      role="dialog"
      aria-modal="true"
      aria-label={`${word.text} ${word.pinyin} ${word.thai}${posLabel ? ` ${posLabel}` : ""}`}
      onClick={onClose}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-border bg-background px-6 py-7 text-center shadow-xl select-none [-webkit-user-select:none] [-webkit-touch-callout:none]"
        onClick={onClose}
      >
        <p className="text-4xl font-semibold leading-none tracking-tight text-foreground">
          {word.text}
        </p>
        <p className="mt-3 text-lg font-medium tracking-wide text-sky-800 dark:text-sky-200">
          {word.pinyin || "—"}
        </p>
        <p className="mt-2 text-base leading-snug text-muted-foreground">
          {word.thai || "—"}
        </p>
        {posLabel ? (
          <p className="mt-3 text-sm font-medium text-foreground/80">
            {posLabel}
          </p>
        ) : null}
        <p className="mt-5 text-xs text-muted-foreground/80">แตะเพื่อปิด</p>
      </div>
    </div>,
    document.body,
  );
}

export function useWordLongPress(onOpen: (word: GlossWord) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseGraceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerRef = useRef<string | null>(null);
  const openedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const clearMouseGrace = () => {
    if (mouseGraceRef.current != null) {
      clearTimeout(mouseGraceRef.current);
      mouseGraceRef.current = null;
    }
  };

  const clearSuppress = () => {
    suppressClickRef.current = false;
    if (suppressClearRef.current != null) {
      clearTimeout(suppressClearRef.current);
      suppressClearRef.current = null;
    }
  };

  const armSuppress = () => {
    suppressClickRef.current = true;
    if (suppressClearRef.current != null) {
      clearTimeout(suppressClearRef.current);
    }
    suppressClearRef.current = setTimeout(() => {
      suppressClickRef.current = false;
      suppressClearRef.current = null;
    }, SUPPRESS_CLICK_MS);
  };

  const resetPress = () => {
    clearTimer();
    startRef.current = null;
  };

  useEffect(
    () => () => {
      clearTimer();
      clearMouseGrace();
      clearSuppress();
    },
    [],
  );

  return {
    clearSuppress,
    didLongPress: () => {
      const suppressed = suppressClickRef.current;
      if (suppressed) clearSuppress();
      return suppressed;
    },
    bindWord: (word: GlossWord) => {
      const openPopup = () => {
        if (openedRef.current) return;
        openedRef.current = true;
        armSuppress();
        onOpenRef.current(word);
        try {
          navigator.vibrate?.(12);
        } catch {
          // ignore
        }
      };

      const blockContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        openPopup();
      };

      const finishPointer = (event: ReactPointerEvent<HTMLElement>) => {
        resetPress();
        if (event.pointerType === "mouse") {
          clearMouseGrace();
          mouseGraceRef.current = setTimeout(() => {
            activePointerRef.current = null;
            mouseGraceRef.current = null;
          }, MOUSE_CONTEXT_GRACE_MS);
          return;
        }
        activePointerRef.current = null;
      };

      return {
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
          if (event.pointerType === "mouse" && event.button === 2) {
            activePointerRef.current = "mouse";
            return;
          }
          if (event.button !== 0) return;

          clearMouseGrace();
          activePointerRef.current = event.pointerType;
          openedRef.current = false;
          startRef.current = { x: event.clientX, y: event.clientY };
          clearTimer();
          timerRef.current = setTimeout(() => {
            startRef.current = null;
            timerRef.current = null;
            openPopup();
          }, LONG_PRESS_MS);
        },
        onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
          const start = startRef.current;
          if (!start || timerRef.current == null) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
            resetPress();
          }
        },
        onPointerUp: finishPointer,
        onPointerCancel: finishPointer,
        onDragStart: (event: React.DragEvent<HTMLElement>) => {
          event.preventDefault();
        },
        onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
          if (!suppressClickRef.current) return;
          event.stopPropagation();
          event.preventDefault();
          clearSuppress();
        },
        onContextMenu: blockContextMenu,
        onContextMenuCapture: blockContextMenu,
      };
    },
  };
}

/** Hosts gloss popup state and exposes long-press binders for children. */
export function useGlossPopup() {
  const [glossWord, setGlossWord] = useState<GlossWord | null>(null);
  const longPress = useWordLongPress(setGlossWord);

  const closePopup = () => {
    longPress.clearSuppress();
    setGlossWord(null);
  };

  const popup: ReactNode = glossWord ? (
    <WordGlossPopup word={glossWord} onClose={closePopup} />
  ) : null;

  return { ...longPress, popup, glossWord, setGlossWord, closePopup };
}
