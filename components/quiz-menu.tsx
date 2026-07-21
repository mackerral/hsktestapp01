"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  HSK_LISTS,
  loadStatus,
  wordId,
  type HskWord,
  type ListId,
} from "@/lib/hsk-lists";

export type QuizModeId =
  | "zh-th"
  | "th-zh"
  | "zh-py"
  | "audio-zh"
  | "audio-th";
/** @deprecated use QuizModeId — kept so older imports still compile during rename */
export type QuizPresetId = QuizModeId;

export type QuizSetId = "set1" | "set2" | "set3" | "set4" | "set5" | "set6";

export type QuizStatusFilter = {
  known: boolean; // green
  unknown: boolean; // red
  neutral: boolean; // grey
};

export type QuizSettings = {
  mode: QuizModeId;
  questionCount: number | "all";
  /** Remembered when toggling back from ทั้งหมด → สุ่ม */
  lastRandomCount: number;
  levels: ListId[] | "mix";
  choiceCount: number;
  statuses: QuizStatusFilter;
  /** Hide answer choices until the learner taps to reveal them */
  hideChoicesFirst: boolean;
};

export const QUIZ_MODES: { id: QuizModeId; label: string }[] = [
  { id: "zh-th", label: "ถามจีน -- ตอบไทย" },
  { id: "th-zh", label: "ถามไทย -- ตอบจีน" },
  { id: "zh-py", label: "ถามจีน -- ตอบพินอิน" },
  { id: "audio-zh", label: "ถามเสียงจีน -- ตอบจีน" },
  { id: "audio-th", label: "ถามเสียงจีน -- ตอบไทย" },
];

const QUIZ_SETS: { id: QuizSetId; title: string; defaultMode: QuizModeId }[] = [
  { id: "set1", title: "ชุด 1", defaultMode: "zh-th" },
  { id: "set2", title: "ชุด 2", defaultMode: "th-zh" },
  { id: "set3", title: "ชุด 3", defaultMode: "zh-py" },
  { id: "set4", title: "ชุด 4", defaultMode: "audio-zh" },
  { id: "set5", title: "ชุด 5", defaultMode: "audio-th" },
  { id: "set6", title: "ชุด 6", defaultMode: "zh-py" },
];

const ALL_LEVELS = HSK_LISTS.map((l) => l.id);

function defaultSettings(mode: QuizModeId = "zh-th"): QuizSettings {
  return {
    mode,
    questionCount: 10,
    lastRandomCount: 10,
    levels: ALL_LEVELS,
    choiceCount: 4,
    statuses: { known: true, unknown: true, neutral: true },
    hideChoicesFirst: true,
  };
}

function settingsKey(id: QuizSetId) {
  return `hsk-quiz-set:${id}`;
}

function isQuizModeId(value: unknown): value is QuizModeId {
  return (
    value === "zh-th" ||
    value === "th-zh" ||
    value === "zh-py" ||
    value === "audio-zh" ||
    value === "audio-th"
  );
}

export function isAudioQuizMode(mode: QuizModeId) {
  return mode === "audio-zh" || mode === "audio-th";
}

function loadSettings(id: QuizSetId, defaultMode: QuizModeId): QuizSettings {
  const fallback = defaultSettings(defaultMode);
  try {
    const raw = localStorage.getItem(settingsKey(id));
    if (!raw) return { ...fallback, statuses: { ...fallback.statuses } };
    const parsed = { ...fallback, ...JSON.parse(raw) } as QuizSettings;
    if (!isQuizModeId(parsed.mode)) parsed.mode = defaultMode;
    if (parsed.questionCount !== "all" && typeof parsed.questionCount !== "number") {
      parsed.questionCount = fallback.questionCount;
    }
    if (typeof parsed.lastRandomCount !== "number") {
      parsed.lastRandomCount =
        typeof parsed.questionCount === "number"
          ? parsed.questionCount
          : fallback.lastRandomCount;
    }
    if (typeof parsed.hideChoicesFirst !== "boolean") {
      parsed.hideChoicesFirst = fallback.hideChoicesFirst;
    }
    return {
      ...parsed,
      statuses: { ...fallback.statuses, ...parsed.statuses },
    };
  } catch {
    return { ...fallback, statuses: { ...fallback.statuses } };
  }
}

function saveSettings(id: QuizSetId, settings: QuizSettings) {
  localStorage.setItem(settingsKey(id), JSON.stringify(settings));
}

function modeLabel(mode: QuizModeId) {
  return QUIZ_MODES.find((m) => m.id === mode)?.label ?? mode;
}

function emptySettingsMap(): Record<QuizSetId, QuizSettings> {
  return Object.fromEntries(
    QUIZ_SETS.map((s) => [s.id, defaultSettings(s.defaultMode)]),
  ) as Record<QuizSetId, QuizSettings>;
}

export function countQuizPool(
  wordsByList: Record<ListId, HskWord[]>,
  settings: QuizSettings,
): number {
  const levelIds =
    settings.levels === "mix" ? HSK_LISTS.map((l) => l.id) : settings.levels;
  let n = 0;
  for (const listId of levelIds) {
    const words = wordsByList[listId] ?? [];
    const statusMap = loadStatus(listId);
    words.forEach((w, i) => {
      const raw = statusMap[wordId(w.chinese, w.pinyin, i)];
      const s = (raw ?? "neutral") as "known" | "unknown" | "neutral";
      if (s === "known" && settings.statuses.known) n++;
      else if (s === "unknown" && settings.statuses.unknown) n++;
      else if (s === "neutral" && settings.statuses.neutral) n++;
    });
  }
  return n;
}

export function clampRandomCount(value: number, pool: number) {
  const max = Math.max(1, Math.min(50, pool));
  const min = Math.min(5, max);
  return Math.max(min, Math.min(value, max));
}

export function QuizMenu({
  wordsByList,
  onStart,
}: {
  wordsByList: Record<ListId, HskWord[]>;
  onStart: (mode: QuizModeId, title: string, settings: QuizSettings) => void;
}) {
  const [settingsBySet, setSettingsBySet] =
    useState<Record<QuizSetId, QuizSettings>>(emptySettingsMap);
  const [editing, setEditing] = useState<QuizSetId | null>(null);
  const [draft, setDraft] = useState<QuizSettings>(defaultSettings());

  useEffect(() => {
    const next = emptySettingsMap();
    for (const set of QUIZ_SETS) {
      next[set.id] = loadSettings(set.id, set.defaultMode);
    }
    setSettingsBySet(next);
  }, []);

  function openSettings(id: QuizSetId) {
    setDraft(settingsBySet[id]);
    setEditing(id);
  }

  const editingSet = QUIZ_SETS.find((s) => s.id === editing);
  const draftPoolCount = editing ? countQuizPool(wordsByList, draft) : 0;
  const randomMax = Math.max(1, Math.min(50, draftPoolCount));
  const randomMin = Math.min(5, randomMax);
  const randomValue =
    draft.questionCount === "all"
      ? randomMin
      : clampRandomCount(draft.questionCount, draftPoolCount);

  useEffect(() => {
    if (!editing || draft.questionCount === "all") return;
    if (typeof draft.questionCount !== "number") return;
    const clamped = clampRandomCount(draft.questionCount, draftPoolCount);
    if (draft.questionCount !== clamped) {
      setDraft((d) => ({ ...d, questionCount: clamped }));
    }
  }, [editing, draft.levels, draft.statuses, draftPoolCount]);

  function saveDraft() {
    if (!editing) return;
    const next = { ...draft, statuses: { ...draft.statuses } };
    if (!next.statuses.known && !next.statuses.unknown && !next.statuses.neutral) {
      next.statuses.neutral = true;
    }
    if (next.levels !== "mix" && next.levels.length === 0) {
      next.levels = [...ALL_LEVELS];
    }
    if (next.levels === "mix") {
      next.levels = [...ALL_LEVELS];
    }
    if (!isQuizModeId(next.mode)) next.mode = "zh-th";
    if (typeof next.questionCount === "number") {
      const pool = countQuizPool(wordsByList, next);
      next.questionCount = clampRandomCount(next.questionCount, pool);
      next.lastRandomCount = next.questionCount;
    }
    setSettingsBySet((prev) => ({ ...prev, [editing]: next }));
    saveSettings(editing, next);
    setEditing(null);
  }

  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-4 py-6 sm:px-6">
        <div className="mb-4 text-center sm:mb-5">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Quiz รวม
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            เลือกชุดแบบฝึกหัด
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:gap-3">
          {QUIZ_SETS.map((set) => {
            const s = settingsBySet[set.id];
            const poolCount = countQuizPool(wordsByList, s);
            const levelIds =
              s.levels === "mix" ? HSK_LISTS.map((l) => l.id) : [...s.levels];
            const levelLabel = HSK_LISTS.filter((l) => levelIds.includes(l.id))
              .map((l) => l.label)
              .join(", ");

            return (
              <div
                key={set.id}
                className="flex flex-col rounded-xl border border-border bg-background p-4 sm:p-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    {set.title}
                  </div>
                  <div className="mt-0.5 text-base font-semibold leading-snug tracking-tight sm:text-lg">
                    {modeLabel(s.mode)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="rounded-md bg-muted px-2 py-0.5">
                      {s.questionCount === "all"
                        ? `ทั้งหมด · ${poolCount}`
                        : `สุ่ม · ${s.questionCount}`}
                    </span>
                    <span className="rounded-md bg-muted px-2 py-0.5">
                      {s.choiceCount} ตัวเลือก
                    </span>
                    {s.hideChoicesFirst && (
                      <span className="rounded-md bg-muted px-2 py-0.5">
                        ซ่อน choice ก่อน
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
                      {(
                        [
                          {
                            on: s.statuses.known,
                            className: "bg-emerald-500",
                            label: "เขียว",
                          },
                          {
                            on: s.statuses.unknown,
                            className: "bg-rose-500",
                            label: "แดง",
                          },
                          {
                            on: s.statuses.neutral,
                            className: "bg-slate-400",
                            label: "เทา",
                          },
                        ] as const
                      )
                        .filter((dot) => dot.on)
                        .map((dot) => (
                          <span
                            key={dot.label}
                            title={dot.label}
                            className={cn("size-2.5 rounded-full", dot.className)}
                          />
                        ))}
                    </span>
                    <span className="rounded-md bg-muted px-2 py-0.5">
                      {levelLabel}
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-label={`ตั้งค่า ${set.title}`}
                    onClick={() => openSettings(set.id)}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-border text-sm font-medium hover:bg-muted"
                  >
                    ตั้งค่า
                  </button>
                  <Button
                    className="h-10 font-semibold"
                    onClick={() =>
                      onStart(
                        s.mode,
                        `${set.title} · ${modeLabel(s.mode)}`,
                        s,
                      )
                    }
                  >
                    เริ่ม
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 pb-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] sm:items-center sm:pb-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setEditing(null)}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-y-auto p-5 pb-3">
              <h2 className="text-lg font-semibold tracking-tight">ตั้งค่า Quiz</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {editingSet?.title} · {modeLabel(draft.mode)}
              </p>

              <div className="mt-5">
                <div className="mb-2 text-sm font-medium">โหมด</div>
                <div className="grid gap-2">
                  {QUIZ_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, mode: mode.id }))}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                        draft.mode === mode.id
                          ? "border-foreground bg-foreground text-background"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">จำนวนคำถาม</span>
                  <span className="tabular-nums text-muted-foreground">
                    {draft.questionCount === "all"
                      ? `ทั้งหมด · ${draftPoolCount}`
                      : `สุ่ม · ${randomValue}`}
                  </span>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => {
                        const pool = countQuizPool(wordsByList, d);
                        const remembered =
                          typeof d.questionCount === "number"
                            ? d.questionCount
                            : d.lastRandomCount;
                        const count = clampRandomCount(remembered, pool);
                        return {
                          ...d,
                          questionCount: count,
                          lastRandomCount: count,
                        };
                      })
                    }
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium",
                      draft.questionCount !== "all"
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    สุ่ม
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        lastRandomCount:
                          typeof d.questionCount === "number"
                            ? d.questionCount
                            : d.lastRandomCount,
                        questionCount: "all",
                      }))
                    }
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium",
                      draft.questionCount === "all"
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {draft.questionCount === "all"
                      ? `ทั้งหมด · ${draftPoolCount}`
                      : "ทั้งหมด"}
                  </button>
                </div>
                {draft.questionCount !== "all" && (
                  <>
                    <input
                      type="range"
                      min={randomMin}
                      max={randomMax}
                      step={1}
                      value={randomValue}
                      onChange={(e) =>
                        setDraft((d) => {
                          const count = clampRandomCount(
                            Number(e.target.value),
                            draftPoolCount,
                          );
                          return {
                            ...d,
                            questionCount: count,
                            lastRandomCount: count,
                          };
                        })
                      }
                      className="w-full accent-foreground"
                    />
                    <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>{randomMin}</span>
                      <span>{randomMax}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-5">
                <div className="mb-2 text-sm font-medium">ระดับ HSK</div>
                <div className="flex flex-wrap gap-2">
                  {HSK_LISTS.map((list) => {
                    const selected =
                      draft.levels === "mix" ||
                      (Array.isArray(draft.levels) &&
                        draft.levels.includes(list.id));
                    return (
                      <button
                        key={list.id}
                        type="button"
                        onClick={() => {
                          setDraft((d) => {
                            const current =
                              d.levels === "mix" ? [...ALL_LEVELS] : [...d.levels];
                            const has = current.includes(list.id);
                            const next = has
                              ? current.filter((x) => x !== list.id)
                              : [...current, list.id];
                            return {
                              ...d,
                              levels: next.length ? next : [...ALL_LEVELS],
                            };
                          });
                        }}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm font-medium",
                          selected
                            ? "border-foreground bg-foreground text-background"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        {list.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">จำนวน choice</span>
                  <span className="tabular-nums text-muted-foreground">
                    {draft.choiceCount}
                  </span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={8}
                  step={1}
                  value={draft.choiceCount}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, choiceCount: Number(e.target.value) }))
                  }
                  className="w-full accent-foreground"
                />
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  {[4, 5, 6, 7, 8].map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    hideChoicesFirst: !d.hideChoicesFirst,
                  }))
                }
                className={cn(
                  "mt-5 flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm",
                  draft.hideChoicesFirst
                    ? "border-foreground bg-accent/50"
                    : "border-border hover:bg-muted",
                )}
              >
                <span className="min-w-0">
                  <span className="block font-medium">ซ่อน choice ก่อน</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    แสดงคำถามก่อน แล้วแตะเพื่อเปิดตัวเลือก
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {draft.hideChoicesFirst ? "เปิด" : "ปิด"}
                </span>
              </button>

              <div className="mt-5">
                <div className="mb-2 text-sm font-medium">เลือกศัพท์</div>
                <div className="grid gap-2">
                  {(
                    [
                      {
                        key: "known" as const,
                        label: "เขียว · จำได้",
                        dot: "bg-emerald-500",
                      },
                      {
                        key: "unknown" as const,
                        label: "แดง · จำไม่ได้",
                        dot: "bg-rose-500",
                      },
                      {
                        key: "neutral" as const,
                        label: "เทา - ยังไม่ได้กด",
                        dot: "bg-slate-400",
                      },
                    ] as const
                  ).map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          statuses: {
                            ...d.statuses,
                            [row.key]: !d.statuses[row.key],
                          },
                        }))
                      }
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm",
                        draft.statuses[row.key]
                          ? "border-foreground bg-accent/50"
                          : "border-border opacity-60",
                      )}
                    >
                      <span className={cn("size-3.5 rounded-full", row.dot)} />
                      <span className="flex-1 font-medium">{row.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {draft.statuses[row.key] ? "ใช้" : "ปิด"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-border bg-background p-4 pt-3">
              <Button
                className="h-12 w-full text-base font-semibold"
                onClick={saveDraft}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
