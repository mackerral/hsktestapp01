"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ALargeSmall, BookText, ChevronLeft, ChevronRight, Languages, Menu, Underline } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChineseStory } from "@/lib/chinese-stories";
import {
  buildVocabMap,
  countStoriesLevels,
  countStoryLevels,
  segmentChinese,
} from "@/lib/segment-chinese";
import type { StoryLevelCounts } from "@/lib/segment-chinese";
import { getParagraphThai } from "@/lib/story-thai";
import type { HskWord, ListId } from "@/lib/hsk-lists";

type ReaderSet = {
  id: string;
  label: string;
  stories: ChineseStory[];
};

function LevelStatsBlock({ stats }: { stats: StoryLevelCounts }) {
  const hsk14 = stats[1] + stats[2] + stats[3] + stats[4];
  const hsk5 = stats[5];
  const hsk6 = stats[6];
  const total = stats.total || 1;
  const pct = (n: number) => Math.round((n / total) * 100);
  const bands = [
    { key: "1-4", label: "HSK 1–4", n: hsk14, color: "bg-yellow-400" },
    { key: "5", label: "HSK 5", n: hsk5, color: "bg-blue-700" },
    { key: "6", label: "HSK 6", n: hsk6, color: "bg-violet-600" },
  ] as const;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:text-xs">
        {bands.map((b) => (
          <span key={b.key} className="inline-flex items-center gap-1">
            <span className={cn("size-2 rounded-sm", b.color)} />
            <span>
              {b.label}{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {pct(b.n)}%
              </span>
            </span>
          </span>
        ))}
        {stats.unknown > 0 ? (
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-sm bg-neutral-900 dark:bg-neutral-100" />
            <span>
              ?{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {pct(stats.unknown)}%
              </span>
            </span>
          </span>
        ) : null}
      </div>

      <div className="mb-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] text-muted-foreground sm:text-[11px]">
        {HSK_LEVEL_LEGEND.map((item) => {
          const n =
            item.level === 0
              ? stats.unknown
              : stats[item.level as 1 | 2 | 3 | 4 | 5 | 6];
          if (item.level === 0 && n <= 0) return null;
          const label = item.level === 0 ? "?" : `H${item.level}`;
          return (
            <span key={item.label} className="inline-flex items-center gap-1">
              <span className={cn("size-1.5 rounded-sm", item.color)} />
              <span className="tabular-nums">
                {label}:{" "}
                <span className="font-medium text-foreground">{n}</span>
              </span>
            </span>
          );
        })}
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {HSK_LEVEL_LEGEND.map((item) => {
          const n =
            item.level === 0
              ? stats.unknown
              : stats[item.level as 1 | 2 | 3 | 4 | 5 | 6];
          if (n <= 0) return null;
          return (
            <div
              key={item.label}
              className={cn("h-full", item.color)}
              style={{ width: `${(n / total) * 100}%` }}
              title={`${item.level === 0 ? "?" : `H${item.level}`}: ${n}`}
            />
          );
        })}
      </div>
    </div>
  );
}

const HSK_LEVEL_LEGEND = [
  { level: 1, label: "1", color: "bg-yellow-400" },
  { level: 2, label: "2", color: "bg-sky-400" },
  { level: 3, label: "3", color: "bg-orange-500" },
  { level: 4, label: "4", color: "bg-red-500" },
  { level: 5, label: "5", color: "bg-blue-700" },
  { level: 6, label: "6", color: "bg-violet-600" },
  { level: 0, label: "?", color: "bg-neutral-900 dark:bg-neutral-100" },
] as const;

function levelBadgeLabel(level: number | null) {
  return level == null ? "?" : String(level);
}

function levelBadgeClass(level: number | null) {
  switch (level) {
    case 1:
      return "bg-yellow-400 text-yellow-950";
    case 2:
      return "bg-sky-400 text-sky-950";
    case 3:
      return "bg-orange-500 text-white";
    case 4:
      return "bg-red-500 text-white";
    case 5:
      return "bg-blue-700 text-white";
    case 6:
      return "bg-violet-600 text-white";
    default:
      return "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900";
  }
}

/** Shrink / grow font until the full text fits the cell (1–2 lines). */
function FitText({
  text,
  className,
  maxPx,
  minPx,
  lines = 2,
}: {
  text: string;
  className?: string;
  maxPx: number;
  minPx: number;
  lines?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !text) return;

    const fit = () => {
      const width = el.clientWidth;
      if (width <= 0) return;

      const lineHeight = 1.2;
      let lo = minPx;
      let hi = maxPx;
      let best = minPx;

      while (hi - lo > 0.15) {
        const mid = (lo + hi) / 2;
        el.style.fontSize = `${mid}px`;
        el.style.maxHeight = `${lines * mid * lineHeight}px`;
        const overflow =
          el.scrollWidth > width + 1 ||
          el.scrollHeight > lines * mid * lineHeight + 1;
        if (overflow) {
          hi = mid;
        } else {
          best = mid;
          lo = mid;
        }
      }
      el.style.fontSize = `${best}px`;
      el.style.maxHeight = `${lines * best * lineHeight}px`;
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, maxPx, minPx, lines]);

  return (
    <span
      ref={ref}
      className={cn(
        "block w-full overflow-hidden text-center leading-[1.2]",
        lines === 1 ? "whitespace-nowrap" : "break-words",
        className,
      )}
      style={{ fontSize: maxPx }}
    >
      {text}
    </span>
  );
}

function StoryBody({
  story,
  wordsByList,
  showPinyin,
  showThai,
  showParagraphThai,
  showLevels,
}: {
  story: ChineseStory;
  wordsByList: Record<ListId, HskWord[]>;
  showPinyin: boolean;
  showThai: boolean;
  showParagraphThai: boolean;
  showLevels: boolean;
}) {
  const vocab = useMemo(() => buildVocabMap(wordsByList), [wordsByList]);

  const paragraphs = useMemo(
    () => story.paragraphs.map((para) => segmentChinese(para, vocab)),
    [story.paragraphs, vocab],
  );

  const paragraphThai = useMemo(
    () => getParagraphThai(story.title, story.paragraphs.length),
    [story.title, story.paragraphs.length],
  );

  const showTable = showPinyin || showThai;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 pb-8 sm:px-6">
      <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
        {story.title}
      </h1>

      {showLevels ? (
        <div className="mb-5 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">HSK</span>
          {HSK_LEVEL_LEGEND.map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5"
            >
              <span className={cn("size-2.5 rounded-sm", item.color)} />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="space-y-8">
        {paragraphs.map((tokens, pi) => (
          <div key={pi} className="space-y-3">
            <p
              className={cn(
                "flex flex-wrap",
                showTable
                  ? "content-end items-stretch gap-0"
                  : "content-end items-end gap-x-0 gap-y-2",
              )}
            >
              {tokens.map((tok, ti) => {
                if (!tok.isWord) {
                  return (
                    <span
                      key={ti}
                      className={cn(
                        "inline-flex items-end text-[1.35rem] leading-none sm:text-[1.5rem]",
                        showTable
                          ? "px-[2px] pb-2 text-muted-foreground"
                          : "px-[1px] pb-[2px]",
                      )}
                    >
                      {tok.text}
                    </span>
                  );
                }

                return (
                  <span
                    key={ti}
                    className={cn(
                      "relative inline-flex flex-col items-center",
                      showTable
                        ? "-ml-px -mt-px items-stretch border border-border/40 bg-muted/15 px-1.5 py-1.5"
                        : "px-[1.5px]",
                      showLevels && !showTable && "pt-2.5",
                    )}
                    style={
                      showTable
                        ? {
                            minWidth: `${Math.max(
                              showThai ? 2.6 : 1.75,
                              tok.text.length * 1.15,
                            )}em`,
                          }
                        : undefined
                    }
                  >
                    {showLevels ? (
                      <span
                        className={cn(
                          "absolute right-0 top-0 z-[1] rounded-[3px] px-0.5 text-[8px] font-bold leading-none tracking-tight",
                          levelBadgeClass(tok.level),
                        )}
                      >
                        {levelBadgeLabel(tok.level)}
                      </span>
                    ) : null}
                    {showPinyin ? (
                      <span className="mb-0.5 min-h-[0.9rem] w-full">
                        <FitText
                          text={tok.pinyin || "\u00a0"}
                          maxPx={11}
                          minPx={5.5}
                          lines={1}
                          className="font-medium tracking-tight text-sky-800/80 dark:text-sky-200/80"
                        />
                      </span>
                    ) : null}
                    <span className="text-center text-[1.35rem] font-medium leading-none text-foreground sm:text-[1.5rem]">
                      {tok.text}
                    </span>
                    {showThai ? (
                      <span className="mt-1 min-h-[1.4rem] w-full">
                        <FitText
                          text={tok.thai || "\u00a0"}
                          maxPx={11}
                          minPx={5}
                          lines={2}
                          className="text-muted-foreground"
                        />
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </p>

            {showParagraphThai && paragraphThai[pi] ? (
              <p className="border-l-2 border-sky-300/70 pl-3 text-[0.95rem] leading-relaxed text-muted-foreground dark:border-sky-700/70">
                {paragraphThai[pi]}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HskReaderView({
  story,
  wordsByList,
  onBack,
}: {
  story: ChineseStory;
  wordsByList: Record<ListId, HskWord[]>;
  onBack: () => void;
}) {
  const [showPinyin, setShowPinyin] = useState(true);
  const [showThai, setShowThai] = useState(false);
  const [showParagraphThai, setShowParagraphThai] = useState(false);
  const [showLevels, setShowLevels] = useState(false);

  const navBtn =
    "inline-flex h-11 shrink-0 touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-sm font-medium transition-colors sm:px-4 [-webkit-tap-highlight-color:transparent] [&_svg]:pointer-events-none [&_svg]:size-5";
  const navBtnOff = "border-border bg-background text-foreground hover:bg-muted";
  const navBtnOn =
    "border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-200 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <StoryBody
          story={story}
          wordsByList={wordsByList}
          showPinyin={showPinyin}
          showThai={showThai}
          showParagraphThai={showParagraphThai}
          showLevels={showLevels}
        />
      </div>

      <div className="shrink-0 border-t border-border bg-background/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-nowrap items-center justify-center gap-1 overflow-x-auto px-2 py-3 sm:gap-2 sm:px-4">
          <button type="button" onClick={onBack} className={cn(navBtn, navBtnOff)}>
            <Menu className="size-5 shrink-0" />
            <span>เมนู</span>
          </button>
          <div className="mx-0.5 h-8 w-px shrink-0 bg-border" />
          <button
            type="button"
            aria-pressed={showPinyin}
            onClick={() => setShowPinyin((v) => !v)}
            className={cn(navBtn, showPinyin ? navBtnOn : navBtnOff)}
          >
            <ALargeSmall className="size-5 shrink-0" />
            <span>{showPinyin ? "ปิดพินอิน" : "เปิดพินอิน"}</span>
          </button>
          <button
            type="button"
            aria-pressed={showThai}
            onClick={() => setShowThai((v) => !v)}
            className={cn(navBtn, showThai ? navBtnOn : navBtnOff)}
          >
            <Languages className="size-5 shrink-0" />
            <span>{showThai ? "ปิดคำศัพท์" : "เปิดคำศัพท์"}</span>
          </button>
          <button
            type="button"
            aria-pressed={showParagraphThai}
            onClick={() => setShowParagraphThai((v) => !v)}
            className={cn(navBtn, showParagraphThai ? navBtnOn : navBtnOff)}
          >
            <BookText className="size-5 shrink-0" />
            <span>{showParagraphThai ? "ปิดคำแปล" : "เปิดคำแปล"}</span>
          </button>
          <button
            type="button"
            aria-pressed={showLevels}
            onClick={() => setShowLevels((v) => !v)}
            className={cn(navBtn, showLevels ? navBtnOn : navBtnOff)}
          >
            <Underline className="size-5 shrink-0" />
            <span>{showLevels ? "ซ่อน HSK" : "แสดง HSK"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function HskReaderMenu({
  stories,
  wordsByList,
  activeSetId,
  onSelectSet,
  onSelectStory,
}: {
  stories: ChineseStory[];
  wordsByList: Record<ListId, HskWord[]>;
  activeSetId: string | null;
  onSelectSet: (id: string | null) => void;
  onSelectStory: (id: string) => void;
}) {
  const vocab = useMemo(() => buildVocabMap(wordsByList), [wordsByList]);

  const sets: ReaderSet[] = useMemo(() => {
    const set1 = stories.filter((s) => s.setId === "set1");
    const set2 = stories.filter((s) => s.setId === "set2");
    return [
      { id: "set1", label: "Set one", stories: set1 },
      { id: "set2", label: "Set two", stories: set2 },
    ].filter((s) => s.stories.length > 0);
  }, [stories]);

  const setStats = useMemo(() => {
    const map = new Map<string, StoryLevelCounts>();
    for (const set of sets) {
      map.set(set.id, countStoriesLevels(set.stories, vocab));
    }
    return map;
  }, [sets, vocab]);

  const statsByStory = useMemo(() => {
    const map = new Map<string, StoryLevelCounts>();
    for (const story of stories) {
      map.set(story.id, countStoryLevels(story.paragraphs, vocab));
    }
    return map;
  }, [stories, vocab]);

  const activeSet = sets.find((s) => s.id === activeSetId) ?? null;

  if (activeSet) {
    return (
      <div className="h-full w-full overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-xl px-4 py-5 sm:px-6">
          <button
            type="button"
            onClick={() => onSelectSet(null)}
            className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            กลับเมนู
          </button>

          <div className="mb-4">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {activeSet.label}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
              {activeSet.stories.length} เรื่อง · คำไม่ซ้ำทั้งชุด{" "}
              <span className="font-semibold text-foreground">
                {setStats.get(activeSet.id)?.total ?? 0}
              </span>
            </p>
          </div>

          <div className="mb-5 rounded-xl border border-border bg-muted/20 p-3.5">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              HSK ทั้งชุด (คำไม่ซ้ำ)
            </div>
            <LevelStatsBlock stats={setStats.get(activeSet.id)!} />
          </div>

          <div className="grid gap-2.5">
            {activeSet.stories.map((story, i) => {
              const stats = statsByStory.get(story.id)!;
              return (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => onSelectStory(story.id)}
                  className="rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40 sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-muted-foreground">
                        เรื่องที่ {i + 1}
                      </div>
                      <div className="mt-0.5 text-lg font-semibold tracking-tight">
                        {story.title}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-md border border-border bg-muted/40 px-2 py-1 text-center">
                      <div className="text-base font-semibold leading-none tabular-nums">
                        {stats.total}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        คำ
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {story.paragraphs[0]}
                  </div>

                  <div className="mt-3">
                    <LevelStatsBlock stats={stats} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-4 py-6 sm:px-6">
        <div className="mb-5 text-center">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            HSK Reader
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            เลือกชุดเรื่อง
          </p>
        </div>

        <div className="grid gap-2.5">
          {sets.map((set) => {
            const stats = setStats.get(set.id)!;
            return (
              <button
                key={set.id}
                type="button"
                onClick={() => onSelectSet(set.id)}
                className="group rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold tracking-tight sm:text-xl">
                      {set.label}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                      เรื่อง 1–{set.stories.length} ·{" "}
                      <span className="font-medium text-foreground">
                        {stats.total}
                      </span>{" "}
                      คำไม่ซ้ำ
                    </div>
                  </div>
                  <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>

                <div className="mt-3">
                  <LevelStatsBlock stats={stats} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
