"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ALargeSmall,
  Languages,
  LayoutGrid,
  Menu,
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

  useEffect(() => {
    setStatus(loadStatus(listId));
  }, [listId]);

  const ids = useMemo(
    () => words.map((w, i) => wordId(w.chinese, w.pinyin, i)),
    [words],
  );

  const knownCount = ids.filter((id) => status[id] === "known").length;
  const reviewCount = ids.filter((id) => status[id] === "unknown").length;

  // Freeze need-review order when entering the mode / switching lists so
  // marking a word "known" doesn't jump it to the bottom mid-session.
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
    // status intentionally omitted — only re-sort on mode/list change
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

  function toggleWord(id: string) {
    setStatus((prev) => {
      const current = prev[id];
      const next: Status = current === "known" ? "unknown" : "known";
      const updated = { ...prev, [id]: next };
      localStorage.setItem(statusStorageKey(listId), JSON.stringify(updated));
      return updated;
    });
  }

  function unlearnAll() {
    localStorage.removeItem(statusStorageKey(listId));
    setStatus({});
  }

  const navBtn =
    "inline-flex h-12 min-w-12 touch-manipulation items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors sm:h-11 sm:min-w-14 sm:px-5 [-webkit-tap-highlight-color:transparent] [&_svg]:pointer-events-none [&_svg]:size-5";

  const navBtnOff = "border-border bg-background text-foreground hover:bg-muted";
  const navBtnOn =
    "border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-200 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200";
  const gridBtnOn =
    "border-foreground bg-foreground text-background hover:bg-foreground/90";

  return (
    <div>
      <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div>
            <div className="text-sm font-semibold tracking-tight">{listLabel}</div>
            <div className="text-xs text-muted-foreground sm:text-sm">
              {words.length} total · {knownCount} known · {reviewCount} need review
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={superGrid}
              aria-label="Toggle super grid"
              onClick={() => setSuperGrid((v) => !v)}
              className={cn(
                "inline-flex h-8 touch-manipulation items-center justify-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium transition-colors [-webkit-tap-highlight-color:transparent]",
                superGrid ? gridBtnOn : navBtnOff,
              )}
            >
              <LayoutGrid className="size-4" />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm">
                    <Settings className="size-4" />
                    Settings
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
                <DropdownMenuItem variant="destructive" onClick={unlearnAll}>
                  Unlearn all words in {listLabel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 py-6 pb-40">
        <HskWordGrid
          words={order.map((i) => words[i])}
          ids={order.map((i) => ids[i])}
          status={status}
          onToggle={toggleWord}
          showPinyin={showPinyin}
          showTranslation={showTranslation}
          showSound={showSound}
          superGrid={superGrid}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-center gap-2.5 px-4 py-3 sm:gap-3 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className={cn(navBtn, navBtnOff)}
          >
            <Menu className="size-5" />
            <span>เมนู</span>
          </button>
          <div className="mx-0.5 h-8 w-px bg-border sm:mx-1" />
          <button
            type="button"
            aria-pressed={showPinyin}
            aria-label="พินอิน"
            onClick={() => setShowPinyin((v) => !v)}
            className={cn(navBtn, showPinyin ? navBtnOn : navBtnOff)}
          >
            <ALargeSmall className="size-5" />
            <span>พินอิน</span>
          </button>
          <button
            type="button"
            aria-pressed={showTranslation}
            aria-label="แปล"
            onClick={() => setShowTranslation((v) => !v)}
            className={cn(navBtn, showTranslation ? navBtnOn : navBtnOff)}
          >
            <Languages className="size-5" />
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
              <Volume2 className="size-5" />
            ) : (
              <VolumeX className="size-5 opacity-70" />
            )}
            <span>เสียง</span>
          </button>
        </div>
      </div>
    </div>
  );
}
