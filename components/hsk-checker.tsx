"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ALargeSmall,
  ChevronDown,
  Dices,
  Languages,
  Menu,
  Pencil,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { speak } from "@/lib/speak";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HskWordGrid } from "@/components/hsk-word-grid";
import { HskSwipeDeck } from "@/components/hsk-swipe-deck";
import {
  countQuizPool,
  clampRandomCount,
  QUIZ_MODES,
  type QuizModeId,
  type QuizSettings,
  type QuizStatusFilter,
} from "@/components/quiz-menu";
import {
  HSK_LISTS,
  loadPencilMarks,
  loadStatus,
  loadTrackEnabled,
  savePencilMarks,
  saveTrackEnabled,
  statusStorageKey,
  wordId,
  type HskWord,
  type ListId,
  type PencilMap,
  type Status,
  type StatusMap,
} from "@/lib/hsk-lists";

type OrderMode =
  | "default"
  | "needReview"
  | "known"
  | "random"
  | "randomUnknownFirst"
  | "randomKnownFirst";

function isOrderMode(value: unknown): value is OrderMode {
  return (
    value === "default" ||
    value === "needReview" ||
    value === "known" ||
    value === "random" ||
    value === "randomUnknownFirst" ||
    value === "randomKnownFirst"
  );
}

function isRandomOrderMode(
  value: OrderMode,
): value is "random" | "randomUnknownFirst" | "randomKnownFirst" {
  return (
    value === "random" ||
    value === "randomUnknownFirst" ||
    value === "randomKnownFirst"
  );
}

function orderStorageKey(listId: ListId) {
  return `hsk-order:${listId}`;
}

function loadOrderPreference(listId: ListId): {
  mode: OrderMode;
  seed: number;
} {
  try {
    const raw = localStorage.getItem(orderStorageKey(listId));
    if (!raw) return { mode: "default", seed: 1 };
    const parsed = JSON.parse(raw) as { mode?: unknown; seed?: unknown };
    return {
      mode: isOrderMode(parsed.mode) ? parsed.mode : "default",
      seed: typeof parsed.seed === "number" && parsed.seed > 0 ? parsed.seed : 1,
    };
  } catch {
    return { mode: "default", seed: 1 };
  }
}

function saveOrderPreference(listId: ListId, mode: OrderMode, seed: number) {
  localStorage.setItem(
    orderStorageKey(listId),
    JSON.stringify({ mode, seed }),
  );
}

type BulkMarkMode = "rangeKnown" | "rangeUnknown";

const BULK_MARK_MODE_KEY = "hsk-bulk-mark-mode";
const PENCIL_ENABLED_KEY = "hsk-pencil-enabled";

function loadBulkMarkMode(): BulkMarkMode | null {
  try {
    const raw = localStorage.getItem(BULK_MARK_MODE_KEY);
    if (raw === "rangeKnown" || raw === "rangeUnknown") {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

function saveBulkMarkMode(mode: BulkMarkMode | null) {
  try {
    if (mode) localStorage.setItem(BULK_MARK_MODE_KEY, mode);
    else localStorage.removeItem(BULK_MARK_MODE_KEY);
  } catch {
    // ignore
  }
}

function loadPencilEnabled(): boolean {
  try {
    return localStorage.getItem(PENCIL_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function savePencilEnabled(enabled: boolean) {
  try {
    localStorage.setItem(PENCIL_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

const DEFAULT_TINY_STATUSES: QuizStatusFilter = {
  known: true,
  unknown: true,
  neutral: true,
};

function makeSeededRand(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function shuffleWithRand(indices: number[], rand: () => number) {
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

function shuffledIndices(count: number, seed: number) {
  return shuffleWithRand(
    Array.from({ length: count }, (_, i) => i),
    makeSeededRand(seed),
  );
}

/** Shuffle within status buckets; unknown first, then unmarked, then known. */
function shuffledUnknownFirst(
  count: number,
  seed: number,
  ids: string[],
  status: StatusMap,
) {
  const unknown: number[] = [];
  const neutral: number[] = [];
  const known: number[] = [];
  for (let i = 0; i < count; i++) {
    const s = status[ids[i]];
    if (s === "unknown") unknown.push(i);
    else if (s === "known") known.push(i);
    else neutral.push(i);
  }
  const rand = makeSeededRand(seed);
  return [
    ...shuffleWithRand(unknown, rand),
    ...shuffleWithRand(neutral, rand),
    ...shuffleWithRand(known, rand),
  ];
}

/** Shuffle within status buckets; known first, then unmarked, then unknown. */
function shuffledKnownFirst(
  count: number,
  seed: number,
  ids: string[],
  status: StatusMap,
) {
  const unknown: number[] = [];
  const neutral: number[] = [];
  const known: number[] = [];
  for (let i = 0; i < count; i++) {
    const s = status[ids[i]];
    if (s === "unknown") unknown.push(i);
    else if (s === "known") known.push(i);
    else neutral.push(i);
  }
  const rand = makeSeededRand(seed);
  return [
    ...shuffleWithRand(known, rand),
    ...shuffleWithRand(neutral, rand),
    ...shuffleWithRand(unknown, rand),
  ];
}

export function HskChecker({
  listId,
  words,
  wordsByList,
  onBack,
  onStartQuiz,
}: {
  listId: ListId;
  words: HskWord[];
  wordsByList: Record<ListId, HskWord[]>;
  onBack: () => void;
  onStartQuiz: (
    preset: QuizModeId,
    title: string,
    settings: QuizSettings,
  ) => void;
}) {
  const listLabel = HSK_LISTS.find((l) => l.id === listId)?.label ?? listId;

  const [status, setStatus] = useState<StatusMap>({});
  const [orderMode, setOrderMode] = useState<OrderMode>("default");
  const [shuffleSeed, setShuffleSeed] = useState(1);

  const [showPinyin, setShowPinyin] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [showSound, setShowSound] = useState(true);
  const [trackEnabled, setTrackEnabled] = useState(true);
  const [bulkMarkMode, setBulkMarkMode] = useState<BulkMarkMode | null>(null);
  const [pencilEnabled, setPencilEnabled] = useState(false);
  const [rangeAnchorIndex, setRangeAnchorIndex] = useState<number | null>(null);
  const [pencilMenuKey, setPencilMenuKey] = useState(0);
  const [pencilMode, setPencilMode] = useState(false);
  const [pencilInfoOpen, setPencilInfoOpen] = useState(false);
  const [pencilMarks, setPencilMarks] = useState<PencilMap>({});
  const [superGrid, setSuperGrid] = useState(false);
  const [columns, setColumns] = useState(4);
  const [swipeMode, setSwipeMode] = useState(false);
  const [swipeIndex, setSwipeIndex] = useState<number | null>(null);

  const [confirmUnlearn, setConfirmUnlearn] = useState(false);
  const [showSizePanel, setShowSizePanel] = useState(false);
  const [showTinyQuiz, setShowTinyQuiz] = useState(false);
  const [hopIndex, setHopIndex] = useState<number | null>(null);
  const [tinyMode, setTinyMode] = useState<QuizModeId>("zh-th");
  const [tinyStatuses, setTinyStatuses] = useState<QuizStatusFilter>({
    ...DEFAULT_TINY_STATUSES,
  });
  const [tinyCount, setTinyCount] = useState<number | "all">(10);
  const [tinyHideChoicesFirst, setTinyHideChoicesFirst] = useState(true);

  useEffect(() => {
    setStatus(loadStatus(listId));
    setPencilMarks(loadPencilMarks(listId));
    setTrackEnabled(loadTrackEnabled());
    setBulkMarkMode(loadBulkMarkMode());
    setPencilEnabled(loadPencilEnabled());
    setRangeAnchorIndex(null);
    setPencilMode(false);
    setPencilInfoOpen(false);
    const pref = loadOrderPreference(listId);
    setOrderMode(pref.mode);
    setShuffleSeed(pref.seed);
    setSwipeMode(false);
    setSwipeIndex(null);
    setHopIndex(null);
  }, [listId]);

  function changeOrderMode(mode: OrderMode) {
    setOrderMode(mode);
    saveOrderPreference(listId, mode, shuffleSeed);
  }

  function reshuffle() {
    const mode = isRandomOrderMode(orderMode) ? orderMode : "random";
    setOrderMode(mode);
    setShuffleSeed((s) => {
      const next = s + 1;
      saveOrderPreference(listId, mode, next);
      return next;
    });
  }

  useEffect(() => {
    if (hopIndex == null || superGrid) return;
    const frame = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-word-index="${hopIndex}"]`,
      );
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const t = window.setTimeout(() => setHopIndex(null), 1600);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(t);
    };
  }, [hopIndex, superGrid]);

  const ids = useMemo(
    () => words.map((w, i) => wordId(w.chinese, w.pinyin, i)),
    [words],
  );

  const knownCount = ids.filter((id) => status[id] === "known").length;

  const [needReviewOrder, setNeedReviewOrder] = useState<number[]>([]);
  const [knownOrder, setKnownOrder] = useState<number[]>([]);
  const [randomUnknownOrder, setRandomUnknownOrder] = useState<number[]>([]);
  const [randomKnownOrder, setRandomKnownOrder] = useState<number[]>([]);
  useEffect(() => {
    if (orderMode !== "needReview" && orderMode !== "known") return;
    const rank =
      orderMode === "needReview"
        ? (i: number) => {
            const s = status[ids[i]];
            if (s === "unknown") return 0;
            if (!s) return 1;
            return 2;
          }
        : (i: number) => {
            const s = status[ids[i]];
            if (s === "known") return 0;
            if (!s) return 1;
            return 2;
          };
    const next = words
      .map((_, i) => i)
      .sort((a, b) => rank(a) - rank(b) || a - b);
    if (orderMode === "needReview") setNeedReviewOrder(next);
    else setKnownOrder(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- freeze against status toggles
  }, [orderMode, listId, words, ids]);

  useEffect(() => {
    if (orderMode !== "randomUnknownFirst") return;
    setRandomUnknownOrder(
      shuffledUnknownFirst(words.length, shuffleSeed, ids, status),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- freeze against status toggles; reshuffle via seed
  }, [orderMode, listId, words, ids, shuffleSeed]);

  useEffect(() => {
    if (orderMode !== "randomKnownFirst") return;
    setRandomKnownOrder(
      shuffledKnownFirst(words.length, shuffleSeed, ids, status),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- freeze against status toggles; reshuffle via seed
  }, [orderMode, listId, words, ids, shuffleSeed]);

  const order = useMemo(() => {
    if (orderMode === "random") return shuffledIndices(words.length, shuffleSeed);
    if (orderMode === "randomUnknownFirst") {
      return randomUnknownOrder.length === words.length
        ? randomUnknownOrder
        : words.map((_, i) => i);
    }
    if (orderMode === "randomKnownFirst") {
      return randomKnownOrder.length === words.length
        ? randomKnownOrder
        : words.map((_, i) => i);
    }
    if (orderMode === "needReview") {
      return needReviewOrder.length === words.length
        ? needReviewOrder
        : words.map((_, i) => i);
    }
    if (orderMode === "known") {
      return knownOrder.length === words.length
        ? knownOrder
        : words.map((_, i) => i);
    }
    return words.map((_, i) => i);
  }, [
    words,
    orderMode,
    shuffleSeed,
    needReviewOrder,
    knownOrder,
    randomUnknownOrder,
    randomKnownOrder,
  ]);

  const orderedWords = useMemo(() => order.map((i) => words[i]), [order, words]);
  const orderedIds = useMemo(() => order.map((i) => ids[i]), [order, ids]);

  function toggleWord(id: string) {
    if (!trackEnabled) return;
    setStatus((prev) => {
      const current = prev[id];
      const next: Status = current === "known" ? "unknown" : "known";
      const updated = { ...prev, [id]: next };
      localStorage.setItem(statusStorageKey(listId), JSON.stringify(updated));
      return updated;
    });
  }

  function togglePencilMark(id: string) {
    setPencilMarks((prev) => {
      const updated = { ...prev };
      if (updated[id]) delete updated[id];
      else updated[id] = true;
      savePencilMarks(listId, updated);
      return updated;
    });
  }

  function setWordStatus(id: string, next: Status) {
    if (!trackEnabled) return;
    setStatus((prev) => {
      const updated = { ...prev, [id]: next };
      localStorage.setItem(statusStorageKey(listId), JSON.stringify(updated));
      return updated;
    });
  }

  function unlearnAll() {
    if (!trackEnabled) return;
    localStorage.removeItem(statusStorageKey(listId));
    setStatus({});
    setConfirmUnlearn(false);
  }

  function setTrackEnabledAndSave(next: boolean) {
    setTrackEnabled(next);
    saveTrackEnabled(next);
  }

  function setBulkMarkModeOnly(mode: BulkMarkMode) {
    setBulkMarkMode(mode);
    setRangeAnchorIndex(null);
    saveBulkMarkMode(mode);
    setPencilMenuKey((key) => key + 1);
  }

  function setPencilEnabledAndSave(next: boolean) {
    setPencilEnabled(next);
    savePencilEnabled(next);
    if (!next) {
      setRangeAnchorIndex(null);
      return;
    }
    if (!bulkMarkMode) {
      setBulkMarkModeOnly("rangeKnown");
    }
  }

  const bulkMarkActive = pencilEnabled && bulkMarkMode !== null;

  function applyStatusRange(start: number, end: number, next: Status) {
    if (!trackEnabled) return;
    setStatus((prev) => {
      const updated = { ...prev };
      for (let i = start; i <= end; i++) {
        const id = orderedIds[i];
        if (id) updated[id] = next;
      }
      localStorage.setItem(statusStorageKey(listId), JSON.stringify(updated));
      return updated;
    });
  }

  function handleWordClick(index: number) {
    const id = orderedIds[index];
    const word = orderedWords[index];
    if (!id || !word) return;

    const play = () => {
      if (showSound) speak(word.chinese);
    };

    if (bulkMarkActive) {
      if (!trackEnabled) {
        play();
        return;
      }
      if (rangeAnchorIndex === null) {
        setRangeAnchorIndex(index);
        play();
        return;
      }
      const start = Math.min(rangeAnchorIndex, index);
      const end = Math.max(rangeAnchorIndex, index);
      applyStatusRange(
        start,
        end,
        bulkMarkMode === "rangeKnown" ? "known" : "unknown",
      );
      setRangeAnchorIndex(null);
      play();
      return;
    }

    if (!trackEnabled) {
      play();
      return;
    }
    toggleWord(id);
    play();
  }

  function advanceSwipe() {
    setSwipeIndex((i) => {
      if (i == null) return null;
      if (i >= orderedWords.length - 1) return null;
      return i + 1;
    });
  }

  const pickingStart = swipeMode && swipeIndex == null;
  const swiping = swipeMode && swipeIndex != null;
  const showPencilTool = false;

  const navBtn =
    "inline-flex h-9 shrink-0 touch-manipulation items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2 text-xs font-medium transition-colors sm:h-10 sm:gap-1.5 sm:px-3 sm:text-sm [-webkit-tap-highlight-color:transparent] [&_svg]:pointer-events-none [&_svg]:size-4";
  const navIconBtn =
    "inline-flex size-9 shrink-0 touch-manipulation items-center justify-center rounded-lg border transition-colors sm:size-10 [-webkit-tap-highlight-color:transparent] [&_svg]:pointer-events-none [&_svg]:size-4";
  const navBtnOff = "border-border bg-background text-foreground hover:bg-muted";
  const navBtnOn =
    "border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-200 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200";
  const pencilBtnOn =
    "border-orange-300 bg-orange-100 text-orange-800 hover:bg-orange-200 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200";
  const gridBtnOn =
    "border-foreground bg-foreground text-background hover:bg-foreground/90";

  const tinySettings: QuizSettings = {
    mode: tinyMode,
    questionCount: tinyCount,
    lastRandomCount: typeof tinyCount === "number" ? tinyCount : 10,
    levels: [listId],
    choiceCount: 4,
    statuses: tinyStatuses,
    hideChoicesFirst: tinyHideChoicesFirst,
  };
  const tinyPoolCount = countQuizPool(wordsByList, tinySettings);
  const tinyMax = Math.max(1, Math.min(50, tinyPoolCount));
  const tinyMin = Math.min(5, tinyMax);
  const tinySliderValue =
    tinyCount === "all"
      ? tinyMin
      : clampRandomCount(tinyCount, tinyPoolCount);

  useEffect(() => {
    if (!showTinyQuiz || tinyCount === "all") return;
    if (typeof tinyCount !== "number") return;
    const clamped = clampRandomCount(tinyCount, tinyPoolCount);
    if (tinyCount !== clamped) setTinyCount(clamped);
  }, [showTinyQuiz, tinyStatuses, tinyPoolCount, tinyCount]);

  function startTinyQuiz() {
    const statuses = { ...tinyStatuses };
    if (!statuses.known && !statuses.unknown && !statuses.neutral) {
      statuses.neutral = true;
    }
    const settings: QuizSettings = {
      mode: tinyMode,
      questionCount:
        tinyCount === "all"
          ? "all"
          : clampRandomCount(
              tinyCount,
              countQuizPool(wordsByList, {
                mode: tinyMode,
                questionCount: tinyCount,
                lastRandomCount:
                  typeof tinyCount === "number" ? tinyCount : 10,
                levels: [listId],
                choiceCount: 4,
                statuses,
                hideChoicesFirst: tinyHideChoicesFirst,
              }),
            ),
      lastRandomCount: typeof tinyCount === "number" ? tinyCount : 10,
      levels: [listId],
      choiceCount: 4,
      statuses,
      hideChoicesFirst: tinyHideChoicesFirst,
    };
    const label =
      QUIZ_MODES.find((m) => m.id === tinyMode)?.label ?? tinyMode;
    setShowTinyQuiz(false);
    onStartQuiz(tinyMode, `${listLabel} · ${label}`, settings);
  }

  return (
    <div className="min-h-dvh">
      <div className="sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto w-full max-w-5xl px-3 py-3 sm:px-6 sm:py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <div className="truncate text-base font-semibold tracking-tight sm:text-lg">
                {listLabel}
              </div>
              <div className="shrink-0 text-sm font-medium text-muted-foreground sm:text-base">
                {knownCount}/{words.length} คำ
              </div>
            </div>
            <div className="flex shrink-0">
              <button
                type="button"
                aria-pressed={showSound}
                aria-label="เสียง"
                title="เสียง"
                onClick={() => setShowSound((v) => !v)}
                className={cn(navIconBtn, showSound ? navBtnOn : navBtnOff)}
              >
                {showSound ? (
                  <Volume2 className="size-5 shrink-0" />
                ) : (
                  <VolumeX className="size-5 shrink-0 opacity-70" />
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              aria-pressed={superGrid}
              aria-label="ภาพรวม"
              onClick={() => {
                setSuperGrid((v) => !v);
                setPencilMode(false);
                setPencilInfoOpen(false);
              }}
              className={cn(
                "inline-flex h-9 touch-manipulation items-center justify-center rounded-lg border px-2.5 text-xs font-semibold transition-colors sm:h-10 sm:text-sm [-webkit-tap-highlight-color:transparent]",
                superGrid ? gridBtnOn : navBtnOff,
              )}
            >
              ภาพรวม
            </button>
            <button
              type="button"
              aria-label="ขนาด"
              onClick={() => setShowSizePanel(true)}
              className={cn(
                "inline-flex h-9 touch-manipulation items-center justify-center rounded-lg border px-2.5 text-xs font-semibold transition-colors sm:h-10 sm:text-sm [-webkit-tap-highlight-color:transparent]",
                showSizePanel || swipeMode ? gridBtnOn : navBtnOff,
              )}
            >
              ขนาด
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="h-9 w-full px-2.5 text-xs font-semibold sm:h-10 sm:text-sm"
                  >
                    จัดเรียง/ลบ
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>จัดเรียง</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={orderMode}
                    onValueChange={(value) => changeOrderMode(value as OrderMode)}
                  >
                    <DropdownMenuRadioItem value="default">
                      ตามลำดับเดิม (A-Z)
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="needReview">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full bg-rose-500"
                          aria-hidden
                        />
                        ตามคำที่จำไม่ได้
                      </span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="known">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full bg-emerald-500"
                          aria-hidden
                        />
                        ตามคำที่จำได้
                      </span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="random">
                      <span className="flex items-center gap-2">
                        <Dices className="size-3.5 shrink-0" aria-hidden />
                        สุ่มทั้งหมด
                      </span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="randomUnknownFirst">
                      <span className="flex items-center gap-2">
                        <Dices className="size-3.5 shrink-0" aria-hidden />
                        <span
                          className="size-2.5 shrink-0 rounded-full bg-rose-500"
                          aria-hidden
                        />
                        สุ่มจำไม่ได้ขึ้นก่อน
                      </span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="randomKnownFirst">
                      <span className="flex items-center gap-2">
                        <Dices className="size-3.5 shrink-0" aria-hidden />
                        <span
                          className="size-2.5 shrink-0 rounded-full bg-emerald-500"
                          aria-hidden
                        />
                        สุ่มจำได้ขึ้นก่อน
                      </span>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={reshuffle}>
                  <Dices className="size-4" aria-hidden />
                  สุ่มใหม่
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmUnlearn(true)}
                >
                  ลบสถานะทั้งหมดใน {listLabel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              aria-label="Quiz"
              onClick={() => setShowTinyQuiz(true)}
              className={cn(
                "inline-flex h-9 touch-manipulation items-center justify-center rounded-lg border px-2.5 text-xs font-semibold transition-colors sm:h-10 sm:text-sm [-webkit-tap-highlight-color:transparent]",
                showTinyQuiz ? gridBtnOn : navBtnOff,
              )}
            >
              Quiz
            </button>
          </div>
        </div>
        {superGrid && !pickingStart && (
          <div className="border-t border-sky-200 bg-sky-50 px-4 py-2.5 text-center text-sm font-medium text-sky-900 sm:px-6 sm:text-base dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
            กดที่คำ เพื่อกระโดดไปที่คำนั้น
          </div>
        )}
        {pickingStart && (
          <div className="border-t border-sky-200 bg-sky-50 px-6 py-4 text-center text-base font-semibold text-sky-900 sm:text-lg dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
            เลือกคำที่ต้องการเริ่ม swipe ;)
          </div>
        )}
        {bulkMarkActive && (
          <div
            className={cn(
              "border-t px-4 py-2.5 text-center text-sm font-medium sm:px-6 sm:text-base",
              bulkMarkMode === "rangeKnown"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100",
            )}
          >
            {rangeAnchorIndex === null
              ? "เลือกใบเริ่มต้น แล้วเลือกใบสุดท้าย"
              : "เลือกใบสุดท้าย · ใบระหว่างจะเปลี่ยนสถานะทั้งหมด"}
          </div>
        )}
        {showPencilTool && pencilMode && !pickingStart && (
          <div className="border-t border-orange-200 bg-orange-50 px-4 py-2.5 text-orange-900 sm:px-6 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-100">
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm font-medium sm:text-base">
              <span>กำลังใช้ mode ดินสอ</span>
              <button
                type="button"
                aria-expanded={pencilInfoOpen}
                onClick={() => setPencilInfoOpen((v) => !v)}
                className="rounded-full border border-orange-300/80 bg-orange-100/80 px-2.5 py-0.5 text-xs font-semibold text-orange-800 hover:bg-orange-200/80 dark:border-orange-700 dark:bg-orange-900/60 dark:text-orange-100 dark:hover:bg-orange-900"
              >
                สำหรับแบบฝึกหัด {pencilInfoOpen ? "▴" : "▾"}
              </button>
            </div>
            {pencilInfoOpen && (
              <div className="mx-auto mt-2 max-w-lg rounded-lg border border-orange-200/80 bg-white/70 px-3 py-2.5 text-left text-xs font-normal leading-relaxed text-orange-950 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-50 sm:text-sm">
                <p>กดการ์ดเพื่อติด icon (มุมบนขวา)</p>
                <p className="mt-1.5">
                  คำที่มาร์คดินสอ สามารถกรองได้ใน แจกไฟล์ → แบบฝึกหัดแบบเว้นช่องว่าง
                  เพื่อสร้าง PDF เฉพาะคำที่เลือกไว้
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {showTinyQuiz && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowTinyQuiz(false)}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-y-auto p-5 pb-3">
              <h2 className="text-lg font-semibold tracking-tight">Quiz</h2>
              <p className="mt-1 text-sm text-muted-foreground">{listLabel}</p>

              <div className="mt-5">
                <div className="mb-2 text-sm font-medium">โหมด</div>
                <div className="grid gap-2">
                  {QUIZ_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setTinyMode(mode.id)}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-left text-sm font-medium",
                        tinyMode === mode.id
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
                    {tinyCount === "all"
                      ? `ทั้งหมด · ${tinyPoolCount}`
                      : `สุ่ม · ${tinySliderValue}`}
                  </span>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setTinyCount(
                        clampRandomCount(
                          typeof tinyCount === "number" ? tinyCount : 10,
                          tinyPoolCount,
                        ),
                      )
                    }
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium",
                      tinyCount !== "all"
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    สุ่ม
                  </button>
                  <button
                    type="button"
                    onClick={() => setTinyCount("all")}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium",
                      tinyCount === "all"
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {tinyCount === "all"
                      ? `ทั้งหมด · ${tinyPoolCount}`
                      : "ทั้งหมด"}
                  </button>
                </div>
                {tinyCount !== "all" && (
                  <>
                    <input
                      type="range"
                      min={tinyMin}
                      max={tinyMax}
                      step={1}
                      value={tinySliderValue}
                      onChange={(e) =>
                        setTinyCount(
                          clampRandomCount(Number(e.target.value), tinyPoolCount),
                        )
                      }
                      className="w-full accent-foreground"
                    />
                    <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>{tinyMin}</span>
                      <span>{tinyMax}</span>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setTinyHideChoicesFirst((v) => !v)}
                className={cn(
                  "mt-5 flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm",
                  tinyHideChoicesFirst
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
                  {tinyHideChoicesFirst ? "เปิด" : "ปิด"}
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
                        setTinyStatuses((s) => ({
                          ...s,
                          [row.key]: !s[row.key],
                        }))
                      }
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm",
                        tinyStatuses[row.key]
                          ? "border-foreground bg-accent/50"
                          : "border-border opacity-60",
                      )}
                    >
                      <span className={cn("size-3.5 rounded-full", row.dot)} />
                      <span className="flex-1 font-medium">{row.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {tinyStatuses[row.key] ? "ใช้" : "ปิด"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-border bg-background p-4 pt-3">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-12 flex-1 text-base font-semibold"
                  onClick={() => setShowTinyQuiz(false)}
                >
                  ยกเลิก
                </Button>
                <Button
                  className="h-12 flex-[1.4] text-base font-semibold"
                  disabled={tinyPoolCount < 2}
                  onClick={startTinyQuiz}
                >
                  {tinyPoolCount < 2
                    ? "คำไม่พอ"
                    : `เริ่ม Quiz · ${
                        tinyCount === "all" ? tinyPoolCount : tinySliderValue
                      }`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSizePanel && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="size-title"
          onClick={() => setShowSizePanel(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="size-title" className="text-lg font-semibold tracking-tight">
              Card layout
            </h2>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Max columns</span>
                <span className="tabular-nums text-muted-foreground">{columns}</span>
              </div>
              <input
                type="range"
                min={2}
                max={6}
                step={1}
                value={columns}
                disabled={swipeMode}
                onChange={(e) => setColumns(Number(e.target.value))}
                className="w-full accent-foreground disabled:opacity-40"
              />
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                {[2, 3, 4, 5, 6].map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3">
              <div>
                <div className="text-sm font-medium">Swipe mode</div>
                <div className="text-xs text-muted-foreground">
                  One card · ปัดขวา จำได้ · ปัดซ้าย จำไม่ได้
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={swipeMode}
                onClick={() => {
                  setSwipeMode((v) => {
                    const next = !v;
                    if (!next) setSwipeIndex(null);
                    else setSwipeIndex(null);
                    return next;
                  });
                }}
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                  swipeMode ? "bg-sky-500" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform",
                    swipeMode && "translate-x-5",
                  )}
                />
              </button>
            </div>

            <div className="mt-5 flex justify-stretch">
              <Button
                size="lg"
                className="h-12 w-full text-base font-semibold"
                onClick={() => setShowSizePanel(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmUnlearn && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unlearn-title"
          onClick={() => setConfirmUnlearn(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="unlearn-title" className="text-lg font-semibold tracking-tight">
              ลบสถานะทั้งหมด?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              จะล้างเครื่องหมาย จำได้ / จำไม่ได้ ของ {listLabel} ทั้งหมด
              ยกเลิกไม่ได้
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmUnlearn(false)}>
                ยกเลิก
              </Button>
              <Button variant="destructive" size="sm" onClick={unlearnAll}>
                ลบทั้งหมด
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-5xl px-6 py-6 pb-40">
        <HskWordGrid
          words={orderedWords}
          ids={orderedIds}
          status={status}
          pencilMarks={showPencilTool ? pencilMarks : {}}
          pencilMode={showPencilTool && pencilMode}
          onWordClick={handleWordClick}
          onPencilToggle={togglePencilMark}
          onPick={(i) => setSwipeIndex(i)}
          onHop={(i) => {
            setSuperGrid(false);
            setHopIndex(i);
          }}
          showPinyin={showPinyin}
          showTranslation={showTranslation}
          showSound={showSound}
          superGrid={superGrid}
          columns={columns}
          pickMode={pickingStart}
          highlightIndex={hopIndex}
          rangeAnchorIndex={rangeAnchorIndex}
        />
      </div>

      {swiping && swipeIndex != null && orderedWords[swipeIndex] && (
        <HskSwipeDeck
          word={orderedWords[swipeIndex]}
          pinyin={orderedWords[swipeIndex].pinyin}
          thai={orderedWords[swipeIndex].thai}
          status={status[orderedIds[swipeIndex]] ?? "neutral"}
          index={swipeIndex}
          total={orderedWords.length}
          showPinyin={showPinyin}
          showTranslation={showTranslation}
          showSound={showSound}
          trackEnabled={trackEnabled}
          onShowPinyinChange={setShowPinyin}
          onShowTranslationChange={setShowTranslation}
          onShowSoundChange={setShowSound}
          onTrackEnabledChange={setTrackEnabledAndSave}
          onKnown={() => {
            setWordStatus(orderedIds[swipeIndex], "known");
            advanceSwipe();
          }}
          onNeedLearn={() => {
            setWordStatus(orderedIds[swipeIndex], "unknown");
            advanceSwipe();
          }}
          onExit={() => {
            setSwipeIndex(null);
            setSwipeMode(false);
          }}
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-nowrap items-center justify-center gap-1 overflow-x-auto px-2 py-2 sm:gap-2 sm:px-4">
          <button type="button" onClick={onBack} className={cn(navBtn, navBtnOff)}>
            <Menu className="size-5 shrink-0" />
            <span>เมนู</span>
          </button>
          <div className="mx-0.5 h-6 w-px shrink-0 bg-border" />
          <button
            type="button"
            aria-pressed={showPinyin}
            aria-label="พินอิน"
            onClick={() => setShowPinyin((v) => !v)}
            className={cn(navBtn, showPinyin ? navBtnOn : navBtnOff)}
          >
            <ALargeSmall className="size-5 shrink-0" />
            <span>พินอิน</span>
          </button>
          <button
            type="button"
            aria-pressed={showTranslation}
            aria-label="แปล"
            onClick={() => setShowTranslation((v) => !v)}
            className={cn(navBtn, showTranslation ? navBtnOn : navBtnOff)}
          >
            <Languages className="size-5 shrink-0" />
            <span>แปล</span>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-pressed={pencilEnabled}
              aria-label={pencilEnabled ? "ปิดปากกา" : "เปิดปากกา"}
              title={pencilEnabled ? "ปิดปากกา" : "เปิดปากกา"}
              onClick={() => setPencilEnabledAndSave(!pencilEnabled)}
              className={cn(navBtn, pencilEnabled ? pencilBtnOn : navBtnOff)}
            >
              <Pencil className="size-5 shrink-0" />
              <span>ปากกา</span>
            </button>
            <DropdownMenu key={pencilMenuKey}>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="เลือกโหมดปากกา"
                    title="เลือกโหมดปากกา"
                    className={cn(
                      navIconBtn,
                      bulkMarkMode ? pencilBtnOn : navBtnOff,
                    )}
                  >
                    <span className="pointer-events-none flex items-center gap-0.5">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          bulkMarkMode === "rangeUnknown"
                            ? "bg-rose-500 ring-1 ring-rose-700"
                            : "bg-emerald-500 ring-1 ring-emerald-700",
                        )}
                      />
                      <ChevronDown className="size-3.5 shrink-0 opacity-70" />
                    </span>
                  </button>
                }
              />
              <DropdownMenuContent align="center" side="top" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>โหมดปากกา</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={bulkMarkMode ?? "rangeKnown"}
                    onValueChange={(value) => {
                      if (value === "rangeKnown" || value === "rangeUnknown") {
                        setBulkMarkModeOnly(value);
                      }
                    }}
                  >
                    <DropdownMenuRadioItem value="rangeKnown">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full bg-emerald-500"
                          aria-hidden
                        />
                        กดหลายใบ เขียว
                      </span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="rangeUnknown">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full bg-rose-500"
                          aria-hidden
                        />
                        กดหลายใบ แดง
                      </span>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
