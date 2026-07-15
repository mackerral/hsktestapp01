"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ALargeSmall,
  Languages,
  LayoutGrid,
  Menu,
  Scaling,
  Settings,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  HSK_LISTS,
  loadStatus,
  statusStorageKey,
  wordId,
  type HskWord,
  type ListId,
  type Status,
  type StatusMap,
} from "@/lib/hsk-lists";

type OrderMode = "default" | "needReview" | "random";

function shuffledIndices(count: number, seed: number) {
  const indices = Array.from({ length: count }, (_, i) => i);
  let s = seed || 1;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

export function HskChecker({
  listId,
  words,
  onBack,
}: {
  listId: ListId;
  words: HskWord[];
  onBack: () => void;
}) {
  const listLabel = HSK_LISTS.find((l) => l.id === listId)?.label ?? listId;

  const [status, setStatus] = useState<StatusMap>({});
  const [orderMode, setOrderMode] = useState<OrderMode>("default");
  const [shuffleSeed, setShuffleSeed] = useState(1);

  const [showPinyin, setShowPinyin] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [showSound, setShowSound] = useState(true);
  const [superGrid, setSuperGrid] = useState(false);
  const [columns, setColumns] = useState(4);
  const [swipeMode, setSwipeMode] = useState(false);
  const [swipeIndex, setSwipeIndex] = useState<number | null>(null);

  const [confirmUnlearn, setConfirmUnlearn] = useState(false);
  const [showSizePanel, setShowSizePanel] = useState(false);

  useEffect(() => {
    setStatus(loadStatus(listId));
    setSwipeMode(false);
    setSwipeIndex(null);
  }, [listId]);

  const ids = useMemo(
    () => words.map((w, i) => wordId(w.chinese, w.pinyin, i)),
    [words],
  );

  const knownCount = ids.filter((id) => status[id] === "known").length;
  const reviewCount = ids.filter((id) => status[id] === "unknown").length;

  const [needReviewOrder, setNeedReviewOrder] = useState<number[]>([]);
  useEffect(() => {
    if (orderMode !== "needReview") return;
    const rank = (i: number) => {
      const s = status[ids[i]];
      if (s === "unknown") return 0;
      if (!s) return 1;
      return 2;
    };
    setNeedReviewOrder(
      words.map((_, i) => i).sort((a, b) => rank(a) - rank(b) || a - b),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- freeze against status toggles
  }, [orderMode, listId, words, ids]);

  const order = useMemo(() => {
    if (orderMode === "random") return shuffledIndices(words.length, shuffleSeed);
    if (orderMode === "needReview") {
      return needReviewOrder.length === words.length
        ? needReviewOrder
        : words.map((_, i) => i);
    }
    return words.map((_, i) => i);
  }, [words, orderMode, shuffleSeed, needReviewOrder]);

  const orderedWords = useMemo(() => order.map((i) => words[i]), [order, words]);
  const orderedIds = useMemo(() => order.map((i) => ids[i]), [order, ids]);

  function toggleWord(id: string) {
    setStatus((prev) => {
      const current = prev[id];
      const next: Status = current === "known" ? "unknown" : "known";
      const updated = { ...prev, [id]: next };
      localStorage.setItem(statusStorageKey(listId), JSON.stringify(updated));
      return updated;
    });
  }

  function setWordStatus(id: string, next: Status) {
    setStatus((prev) => {
      const updated = { ...prev, [id]: next };
      localStorage.setItem(statusStorageKey(listId), JSON.stringify(updated));
      return updated;
    });
  }

  function unlearnAll() {
    localStorage.removeItem(statusStorageKey(listId));
    setStatus({});
    setConfirmUnlearn(false);
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

  const navBtn =
    "inline-flex h-11 shrink-0 touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-sm font-medium transition-colors sm:h-11 sm:gap-2 sm:px-4 [-webkit-tap-highlight-color:transparent] [&_svg]:pointer-events-none [&_svg]:size-5";

  const navBtnOff = "border-border bg-background text-foreground hover:bg-muted";
  const navBtnOn =
    "border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-200 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200";
  const gridBtnOn =
    "border-foreground bg-foreground text-background hover:bg-foreground/90";

  return (
    <div>
      <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6 sm:py-4">
          <div>
            <div className="text-base font-semibold tracking-tight sm:text-lg">{listLabel}</div>
            <div className="text-xs text-muted-foreground sm:text-sm">
              {words.length} total · {knownCount} known · {reviewCount} need review
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={superGrid}
              aria-label="ภาพรวม"
              onClick={() => setSuperGrid((v) => !v)}
              className={cn(
                "inline-flex h-10 touch-manipulation items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors sm:h-11 sm:px-3.5 [-webkit-tap-highlight-color:transparent]",
                superGrid ? gridBtnOn : navBtnOff,
              )}
            >
              <LayoutGrid className="size-5" />
              <span>ภาพรวม</span>
            </button>
            <button
              type="button"
              aria-label="Size and swipe settings"
              onClick={() => setShowSizePanel(true)}
              className={cn(
                "inline-flex h-10 touch-manipulation items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors sm:h-11 sm:px-3.5 [-webkit-tap-highlight-color:transparent]",
                showSizePanel || swipeMode ? gridBtnOn : navBtnOff,
              )}
            >
              <Scaling className="size-5" />
              <span>ขนาด</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="default" className="h-10 gap-1.5 px-3 sm:h-11 sm:px-3.5">
                    <Settings className="size-5" />
                    จัดเรียง/ลบ
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Order</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={orderMode}
                    onValueChange={(value) => setOrderMode(value as OrderMode)}
                  >
                    <DropdownMenuRadioItem value="default">
                      Sort by order
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="needReview">
                      Sort by need review
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="random">Random</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setOrderMode("random");
                    setShuffleSeed((s) => s + 1);
                  }}
                >
                  Reshuffle
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmUnlearn(true)}
                >
                  Unlearn all words in {listLabel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {pickingStart && (
          <div className="border-t border-sky-200 bg-sky-50 px-6 py-4 text-center text-base font-semibold text-sky-900 sm:text-lg dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
            เลือกคำที่ต้องการเริ่ม swipe ;)
          </div>
        )}
      </div>

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
                  One card · swipe right known · left need learn
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={swipeMode}
                onClick={() => {
                  setSwipeMode((v) => {
                    const next = !v;
                    if (!next) {
                      setSwipeIndex(null);
                    } else {
                      setSwipeIndex(null);
                      setShowSizePanel(false);
                    }
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

            <div className="mt-5 flex justify-end">
              <Button size="sm" onClick={() => setShowSizePanel(false)}>
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
              Unlearn all words?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This clears all known / need-review marks for {listLabel}. You can&apos;t
              undo this.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmUnlearn(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={unlearnAll}>
                Unlearn all
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
          onToggle={toggleWord}
          onPick={(i) => setSwipeIndex(i)}
          showPinyin={showPinyin}
          showTranslation={showTranslation}
          showSound={showSound}
          superGrid={superGrid}
          columns={columns}
          pickMode={pickingStart}
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
          onShowPinyinChange={setShowPinyin}
          onShowTranslationChange={setShowTranslation}
          onShowSoundChange={setShowSound}
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

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-nowrap items-center justify-center gap-1.5 overflow-x-auto px-3 py-3 sm:gap-3 sm:px-6">
          <button type="button" onClick={onBack} className={cn(navBtn, navBtnOff)}>
            <Menu className="size-5 shrink-0" />
            <span>เมนู</span>
          </button>
          <div className="mx-0.5 h-8 w-px shrink-0 bg-border" />
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
          <button
            type="button"
            aria-pressed={showSound}
            aria-label="เสียง"
            onClick={() => setShowSound((v) => !v)}
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
