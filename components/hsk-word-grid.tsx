"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import type { HskWord } from "@/lib/hsk-lists";

type Status = "known" | "unknown";
type StatusMap = Record<string, Status>;

const statusStyles: Record<Status | "neutral", string> = {
  neutral: "bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800",
  known:
    "bg-emerald-50 border-emerald-400 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-600 dark:text-emerald-100 shadow-sm",
  unknown:
    "bg-rose-50 border-rose-400 text-rose-900 dark:bg-rose-950 dark:border-rose-600 dark:text-rose-100 shadow-sm",
};

/** Same approach as jamdai.com: device Web Speech API only. */
let cachedVoices: SpeechSynthesisVoice[] = [];

function loadVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  cachedVoices = window.speechSynthesis.getVoices();
}

function pickChineseVoice(): SpeechSynthesisVoice | null {
  if (!cachedVoices.length) loadVoices();
  return (
    cachedVoices.find((v) => v.lang.toLowerCase().startsWith("zh")) ?? null
  );
}

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return;

  try {
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.85;

    const voice = pickChineseVoice();
    if (voice) utterance.voice = voice;

    synth.speak(utterance);
  } catch {
    // ignore — same as jamdai
  }
}

export function HskWordGrid({
  words,
  ids,
  status,
  onToggle,
  showPinyin,
  showTranslation,
  showSound,
  superGrid,
}: {
  words: HskWord[];
  ids: string[];
  status: StatusMap;
  onToggle: (id: string) => void;
  showPinyin: boolean;
  showTranslation: boolean;
  showSound: boolean;
  superGrid: boolean;
}) {
  useEffect(() => {
    if (!window.speechSynthesis) return;
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  return (
    <div
      className={cn(
        "grid",
        superGrid
          ? "grid-cols-[repeat(15,minmax(0,1fr))] gap-0.5"
          : "grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-5 xl:grid-cols-6",
      )}
    >
      {words.map((word, i) => {
        const id = ids[i];
        const current: Status | "neutral" = status[id] ?? "neutral";

        if (superGrid) {
          return (
            <button
              key={id}
              type="button"
              title={`${word.chinese} · ${word.pinyin} · ${word.thai}`}
              onClick={() => {
                onToggle(id);
                if (showSound) speak(word.chinese);
              }}
              className={cn(
                "flex aspect-square touch-manipulation items-center justify-center overflow-hidden rounded-sm border [-webkit-tap-highlight-color:transparent]",
                statusStyles[current],
              )}
            >
              <span className="block w-full truncate whitespace-nowrap px-0.5 text-center text-[9px] font-medium leading-none">
                {word.chinese}
              </span>
            </button>
          );
        }

        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              onToggle(id);
              if (showSound) speak(word.chinese);
            }}
            className={cn(
              "flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 rounded-lg border-2 px-3 py-4 text-center transition-colors duration-200 hover:shadow-lg active:brightness-95 sm:min-h-20 sm:px-4 sm:py-5 cursor-pointer [-webkit-tap-highlight-color:transparent]",
              statusStyles[current],
            )}
          >
            <span className="text-xl font-bold sm:text-3xl leading-tight">{word.chinese}</span>
            {showPinyin && (
              <span className="text-xs font-medium opacity-65 sm:text-sm">{word.pinyin}</span>
            )}
            {showTranslation && (
              <span className="text-[11px] font-medium opacity-60 sm:text-xs">{word.thai}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
