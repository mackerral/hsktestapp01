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

export type GlossWord = { text: string; pinyin: string; thai: string };

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

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${word.text} ${word.pinyin} ${word.thai}`}
      onClick={onClose}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-border bg-background px-6 py-7 text-center shadow-xl"
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
        <p className="mt-5 text-xs text-muted-foreground/80">แตะเพื่อปิด</p>
      </div>
    </div>,
    document.body,
  );
}

export function useWordLongPress(onOpen: (word: GlossWord) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const resetPress = () => {
    clearTimer();
    startRef.current = null;
  };

  useEffect(() => () => clearTimer(), []);

  return {
    didLongPress: () => {
      const suppressed = suppressClickRef.current;
      suppressClickRef.current = false;
      return suppressed;
    },
    bindWord: (word: GlossWord) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        startRef.current = { x: event.clientX, y: event.clientY };
        clearTimer();
        timerRef.current = setTimeout(() => {
          suppressClickRef.current = true;
          startRef.current = null;
          timerRef.current = null;
          onOpenRef.current(word);
          try {
            navigator.vibrate?.(12);
          } catch {
            // ignore
          }
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
      onPointerUp: resetPress,
      onPointerCancel: resetPress,
      onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
        if (!suppressClickRef.current) return;
        event.stopPropagation();
        event.preventDefault();
        suppressClickRef.current = false;
      },
      onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
        event.preventDefault();
      },
    }),
  };
}

/** Hosts gloss popup state and exposes long-press binders for children. */
export function useGlossPopup() {
  const [glossWord, setGlossWord] = useState<GlossWord | null>(null);
  const longPress = useWordLongPress(setGlossWord);

  const popup: ReactNode = glossWord ? (
    <WordGlossPopup word={glossWord} onClose={() => setGlossWord(null)} />
  ) : null;

  return { ...longPress, popup, glossWord, setGlossWord };
}
