"use client";

import { useEffect, useRef, useState } from "react";
import { ALargeSmall, Languages, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { speak } from "@/lib/speak";
import type { HskWord } from "@/lib/hsk-lists";

type Status = "known" | "unknown";

const SWIPE_THRESHOLD = 100;
const TAP_MAX = 12;

export function HskSwipeDeck({
  word,
  pinyin,
  thai,
  status,
  index,
  total,
  showPinyin,
  showTranslation,
  showSound,
  onShowPinyinChange,
  onShowTranslationChange,
  onShowSoundChange,
  onKnown,
  onNeedLearn,
  onExit,
}: {
  word: HskWord;
  pinyin: string;
  thai: string;
  status: Status | "neutral";
  index: number;
  total: number;
  showPinyin: boolean;
  showTranslation: boolean;
  showSound: boolean;
  onShowPinyinChange: (value: boolean) => void;
  onShowTranslationChange: (value: boolean) => void;
  onShowSoundChange: (value: boolean) => void;
  onKnown: () => void;
  onNeedLearn: () => void;
  onExit: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef<"x" | "y" | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    setDx(0);
    setDragging(false);
    locked.current = null;
  }, [word.chinese, index]);

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX;
    startY.current = e.clientY;
    locked.current = null;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const mx = e.clientX - startX.current;
    const my = e.clientY - startY.current;
    if (!locked.current) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      locked.current = Math.abs(mx) >= Math.abs(my) ? "x" : "y";
    }
    if (locked.current === "y") return;
    setDx(mx);
  }

  function finishSwipe(delta: number) {
    setDragging(false);
    if (delta > SWIPE_THRESHOLD) {
      setDx(window.innerWidth);
      window.setTimeout(onKnown, 160);
    } else if (delta < -SWIPE_THRESHOLD) {
      setDx(-window.innerWidth);
      window.setTimeout(onNeedLearn, 160);
    } else {
      // Small movement = tap → play sound (when enabled)
      if (Math.abs(delta) <= TAP_MAX && showSound) {
        speak(word.chinese);
      }
      setDx(0);
    }
  }

  function onPointerUp() {
    if (!dragging) return;
    finishSwipe(dx);
  }

  const rotate = dx / 28;
  const knownOpacity = Math.min(1, Math.max(0, dx / SWIPE_THRESHOLD));
  const learnOpacity = Math.min(1, Math.max(0, -dx / SWIPE_THRESHOLD));

  const navBtn =
    "inline-flex h-11 shrink-0 touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-sm font-medium transition-colors sm:gap-2 sm:px-4 [-webkit-tap-highlight-color:transparent] [&_svg]:pointer-events-none [&_svg]:size-5";
  const navBtnOff = "border-border bg-background text-foreground hover:bg-muted";
  const navBtnOn =
    "border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-200 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200";

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-background overscroll-none">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onExit}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          Exit swipe
        </button>
        <div className="text-sm text-muted-foreground">
          {index + 1} / {total}
        </div>
      </div>

      <div className="flex flex-1 touch-none items-center justify-center overflow-hidden px-6 pb-28 pt-4">
        <div
          className="relative w-full max-w-sm select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className={cn(
              "absolute -top-2 left-4 z-10 rounded-md border-2 border-emerald-500 bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700",
              !dragging && dx === 0 && "opacity-0",
            )}
            style={{ opacity: knownOpacity }}
          >
            Known →
          </div>
          <div
            className={cn(
              "absolute -top-2 right-4 z-10 rounded-md border-2 border-rose-500 bg-rose-50 px-3 py-1 text-sm font-bold text-rose-700",
              !dragging && dx === 0 && "opacity-0",
            )}
            style={{ opacity: learnOpacity }}
          >
            ← Need learn
          </div>

          <div
            className={cn(
              "relative flex min-h-[50dvh] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border bg-slate-50 px-6 py-10 text-center shadow-lg dark:bg-slate-900",
              dragging ? "transition-none" : "transition-transform duration-200",
            )}
            style={{
              transform: `translateX(${dx}px) rotate(${rotate}deg)`,
            }}
          >
            <div
              className="absolute top-4 left-4 flex items-center gap-2"
              aria-label={
                status === "known"
                  ? "Known"
                  : status === "unknown"
                    ? "Need learn"
                    : "Not marked"
              }
            >
              <span
                className={cn(
                  "size-3 rounded-full bg-emerald-500 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900",
                  status === "known" && "size-3.5 ring-2 ring-emerald-600",
                  status !== "known" && "opacity-35",
                )}
                title="Known"
              />
              <span
                className={cn(
                  "size-3 rounded-full bg-rose-500 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900",
                  status === "unknown" && "size-3.5 ring-2 ring-rose-600",
                  status !== "unknown" && "opacity-35",
                )}
                title="Need learn"
              />
              <span
                className={cn(
                  "size-3 rounded-full bg-slate-400 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900",
                  status === "neutral" && "size-3.5 ring-2 ring-slate-500",
                  status !== "neutral" && "opacity-35",
                )}
                title="Not marked"
              />
              <span className="ml-1 text-xs font-medium text-muted-foreground">
                {status === "known"
                  ? "Known"
                  : status === "unknown"
                    ? "Need learn"
                    : "New"}
              </span>
            </div>

            <span className="text-5xl font-bold leading-tight sm:text-6xl">
              {word.chinese}
            </span>
            {showPinyin && (
              <span className="text-xl font-medium text-muted-foreground">
                {pinyin}
              </span>
            )}
            {showTranslation && (
              <span className="text-lg text-muted-foreground">{thai}</span>
            )}
            <p className="mt-6 text-xs text-muted-foreground">
              Tap = sound · Swipe right = known · Swipe left = need learn
            </p>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-[56] border-t border-border bg-background/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-nowrap items-center justify-center gap-1.5 overflow-x-auto px-3 py-3 sm:gap-3 sm:px-6">
          <button
            type="button"
            aria-pressed={showPinyin}
            aria-label="พินอิน"
            onClick={() => onShowPinyinChange(!showPinyin)}
            className={cn(navBtn, showPinyin ? navBtnOn : navBtnOff)}
          >
            <ALargeSmall className="size-5 shrink-0" />
            <span>พินอิน</span>
          </button>
          <button
            type="button"
            aria-pressed={showTranslation}
            aria-label="แปล"
            onClick={() => onShowTranslationChange(!showTranslation)}
            className={cn(navBtn, showTranslation ? navBtnOn : navBtnOff)}
          >
            <Languages className="size-5 shrink-0" />
            <span>แปล</span>
          </button>
          <button
            type="button"
            aria-pressed={showSound}
            aria-label="เสียง"
            onClick={() => onShowSoundChange(!showSound)}
            className={cn(navBtn, showSound ? navBtnOn : navBtnOff)}
          >
            {showSound ? (
              <Volume2 className="size-5 shrink-0" />
            ) : (
              <VolumeX className="size-5 shrink-0 opacity-70" />
            )}
            <span>เสียง</span>
          </button>
        </div>
      </div>
    </div>
  );
}
