"use client";

import { useEffect } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadVoices, speak } from "@/lib/speak";
import type { HskWord } from "@/lib/hsk-lists";
import { useGlossPopup } from "@/components/word-gloss";

type Status = "known" | "unknown";
type StatusMap = Record<string, Status>;

const statusStyles: Record<Status | "neutral", string> = {
  neutral: "bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800",
  known:
    "bg-emerald-50 border-emerald-400 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-600 dark:text-emerald-100 shadow-sm",
  unknown:
    "bg-rose-50 border-rose-400 text-rose-900 dark:bg-rose-950 dark:border-rose-600 dark:text-rose-100 shadow-sm",
};

/** Block highlight / drag-select on word cards (mobile + desktop). */
const cardSelectLock =
  "select-none [-webkit-user-select:none] [-webkit-touch-callout:none] [&_*]:select-none [&_*]:[-webkit-user-select:none]";

export function HskWordGrid({
  words,
  ids,
  status,
  pencilMarks = {},
  pencilMode = false,
  onWordClick,
  onPencilToggle,
  onPick,
  onHop,
  showPinyin,
  showTranslation,
  showSound,
  superGrid,
  columns = 4,
  pickMode = false,
  highlightIndex = null,
  rangeAnchorIndex = null,
}: {
  words: HskWord[];
  ids: string[];
  status: StatusMap;
  pencilMarks?: Record<string, true>;
  pencilMode?: boolean;
  onWordClick: (index: number) => void;
  onPencilToggle?: (id: string) => void;
  onPick?: (index: number) => void;
  onHop?: (index: number) => void;
  showPinyin: boolean;
  showTranslation: boolean;
  showSound: boolean;
  superGrid: boolean;
  columns?: number;
  pickMode?: boolean;
  highlightIndex?: number | null;
  rangeAnchorIndex?: number | null;
}) {
  const gloss = useGlossPopup();
  useEffect(() => {
    if (!window.speechSynthesis) return;
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const colClass =
    {
      2: "grid-cols-2",
      3: "grid-cols-3",
      4: "grid-cols-4",
      5: "grid-cols-5",
      6: "grid-cols-6",
    }[columns] ?? "grid-cols-4";

  // Fewer columns → larger type; more columns → denser type
  const typeByCol: Record<
    number,
    { card: string; zh: string; py: string; th: string }
  > = {
    2: {
      card: "min-h-28 gap-2 px-4 py-6 sm:min-h-36 sm:px-5 sm:py-8",
      zh: "text-4xl sm:text-5xl font-bold leading-tight",
      py: "text-base sm:text-lg font-medium opacity-65",
      th: "text-sm sm:text-base font-medium opacity-60",
    },
    3: {
      card: "min-h-24 gap-1.5 px-3 py-5 sm:min-h-28 sm:px-4 sm:py-6",
      zh: "text-3xl sm:text-4xl font-bold leading-tight",
      py: "text-sm sm:text-base font-medium opacity-65",
      th: "text-xs sm:text-sm font-medium opacity-60",
    },
    4: {
      card: "min-h-20 gap-1 px-2.5 py-4 sm:min-h-24 sm:px-3 sm:py-5",
      zh: "text-2xl sm:text-3xl font-bold leading-tight",
      py: "text-xs sm:text-sm font-medium opacity-65",
      th: "text-[11px] sm:text-xs font-medium opacity-60",
    },
    5: {
      card: "min-h-16 gap-1 px-2 py-3 sm:min-h-20 sm:px-2.5 sm:py-4",
      zh: "text-xl sm:text-2xl font-bold leading-tight",
      py: "text-[11px] sm:text-xs font-medium opacity-65",
      th: "text-[10px] sm:text-[11px] font-medium opacity-60",
    },
    6: {
      card: "min-h-14 gap-0.5 px-1.5 py-2.5 sm:min-h-16 sm:px-2 sm:py-3",
      zh: "text-lg sm:text-xl font-bold leading-tight",
      py: "text-[10px] sm:text-[11px] font-medium opacity-65",
      th: "text-[9px] sm:text-[10px] font-medium opacity-60",
    },
  };
  const type = typeByCol[columns] ?? typeByCol[4];

  return (
    <>
      <div
        className={cn(
          "grid gap-2 sm:gap-3",
          cardSelectLock,
          superGrid ? "grid-cols-[repeat(15,minmax(0,1fr))] gap-0.5" : colClass,
        )}
      >
        {words.map((word, i) => {
          const id = ids[i];
          const current: Status | "neutral" = status[id] ?? "neutral";
          const hasPencil = Boolean(pencilMarks[id]);
          const glossBind = gloss.bindWord({
            text: word.chinese,
            pinyin: word.pinyin,
            thai: word.thai,
            pos: word.pos,
          });

          const handleClick = () => {
            if (gloss.didLongPress()) return;
            if (pickMode && onPick) {
              onPick(i);
              return;
            }
            if (superGrid && onHop) {
              onHop(i);
              return;
            }
            if (pencilMode && onPencilToggle) {
              onPencilToggle(id);
              if (showSound) speak(word.chinese);
              return;
            }
            onWordClick(i);
          };

          if (superGrid) {
            return (
              <button
                key={id}
                type="button"
                title={`${word.chinese} · ${word.pinyin} · ${word.thai}`}
                className={cn(
                  "relative flex aspect-square touch-manipulation items-center justify-center overflow-hidden rounded-sm border [-webkit-tap-highlight-color:transparent] [touch-action:manipulation]",
                  cardSelectLock,
                  statusStyles[current],
                  pickMode && "ring-offset-2 hover:ring-2 hover:ring-sky-400",
                  pencilMode && "ring-offset-1 hover:ring-2 hover:ring-orange-400",
                  rangeAnchorIndex === i &&
                    "ring-2 ring-orange-500 ring-offset-1",
                )}
                {...glossBind}
                onClick={handleClick}
              >
                {hasPencil && (
                  <Pencil
                    className="absolute top-0.5 right-0.5 size-2.5 text-orange-600 dark:text-orange-300"
                    aria-hidden
                  />
                )}
                <span className="pointer-events-none block w-full truncate whitespace-nowrap px-0.5 text-center text-[9px] font-medium leading-none">
                  {word.chinese}
                </span>
              </button>
            );
          }

          return (
            <button
              key={id}
              type="button"
              data-word-index={i}
              className={cn(
                "relative flex touch-manipulation flex-col items-center justify-center rounded-lg border-2 text-center transition-colors duration-200 hover:shadow-lg active:brightness-95 cursor-pointer [-webkit-tap-highlight-color:transparent] [touch-action:manipulation] scroll-mt-36 scroll-mb-28",
                cardSelectLock,
                type.card,
                statusStyles[current],
                pickMode && "ring-offset-2 hover:ring-2 hover:ring-sky-400",
                pencilMode && "ring-offset-1 hover:ring-2 hover:ring-orange-300",
                highlightIndex === i && "ring-2 ring-sky-500 ring-offset-2",
              rangeAnchorIndex === i &&
                "ring-2 ring-orange-500 ring-offset-2",
            )}
            {...glossBind}
            onClick={handleClick}
          >
              {hasPencil && (
                <span
                  className="pointer-events-none absolute top-1.5 right-1.5 inline-flex size-5 items-center justify-center rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                  aria-label="ดินสอ"
                >
                  <Pencil className="size-3" aria-hidden />
                </span>
              )}
              <span className={cn("pointer-events-none", type.zh)}>
                {word.chinese}
              </span>
              {showPinyin && (
                <span className={cn("pointer-events-none", type.py)}>
                  {word.pinyin}
                </span>
              )}
              {showTranslation && (
                <span className={cn("pointer-events-none", type.th)}>
                  {word.thai}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {gloss.popup}
    </>
  );
}
