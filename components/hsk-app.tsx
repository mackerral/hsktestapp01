"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { HskMenu } from "@/components/hsk-menu";
import { HskChecker } from "@/components/hsk-checker";
import { QuizMenu, type QuizModeId, type QuizSettings } from "@/components/quiz-menu";
import { QuizSession } from "@/components/quiz-session";
import { HskReaderMenu, HskReaderView } from "@/components/hsk-reader";
import { HskSentencesView } from "@/components/hsk-sentences";
import { HskFilesView } from "@/components/hsk-files";
import { cn } from "@/lib/utils";
import { resetHskStorageIfNeeded, type HskWord, type ListId } from "@/lib/hsk-lists";
import type { ChineseStory } from "@/lib/chinese-stories";
import type { SentenceLevelGroup } from "@/lib/sentences";

const PAGES = [
  { id: 0, label: "HSK Tracker", menuLabel: "HSK Tracker" },
  // Hidden for now: Quiz รวม (1), HSK Reader (2)
  { id: 3, label: "รวมประโยค", menuLabel: "ประโยค" },
  { id: 4, label: "แจกไฟล์", menuLabel: "ห้องสมุด" },
] as const;

type MainPageId = (typeof PAGES)[number]["id"];

type ActiveQuiz = {
  preset: QuizModeId;
  title: string;
  settings: QuizSettings;
  returnToList: ListId | null;
};

export function HskApp({
  wordsByList,
  stories,
  sentenceGroups,
}: {
  wordsByList: Record<ListId, HskWord[]>;
  stories: ChineseStory[];
  sentenceGroups: SentenceLevelGroup[];
}) {
  const [activeList, setActiveList] = useState<ListId | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<ActiveQuiz | null>(null);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [activeReaderSetId, setActiveReaderSetId] = useState<string | null>(null);
  const [activeSentenceLevel, setActiveSentenceLevel] = useState<number | null>(
    null,
  );
  // 0 = HSK Tracker, 1 = Quiz, 2 = HSK Reader, 3 = รวมประโยค, 4 = แจกไฟล์
  const [page, setPage] = useState(0);
  const [storageReady, setStorageReady] = useState(false);
  const [pageDirection, setPageDirection] = useState<"left" | "right">("left");
  const pageSwipeStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    resetHskStorageIfNeeded();
    setStorageReady(true);
  }, []);

  if (!storageReady) {
    return <div className="min-h-dvh bg-background" />;
  }

  if (activeQuiz) {
    return (
      <QuizSession
        preset={activeQuiz.preset}
        title={activeQuiz.title}
        settings={activeQuiz.settings}
        wordsByList={wordsByList}
        onExit={() => {
          const list = activeQuiz.returnToList;
          setActiveQuiz(null);
          if (list) {
            setActiveList(list);
            setPage(0);
          } else {
            setPage(1);
          }
        }}
      />
    );
  }

  if (activeList) {
    return (
      <HskChecker
        listId={activeList}
        words={wordsByList[activeList]}
        wordsByList={wordsByList}
        sentenceGroups={sentenceGroups}
        onBack={() => {
          setActiveList(null);
          setPage(0);
        }}
        onStartQuiz={(preset, title, settings) => {
          const list = activeList;
          setActiveList(null);
          setActiveQuiz({
            preset,
            title,
            settings,
            returnToList: list,
          });
        }}
      />
    );
  }

  const activeStory = stories.find((s) => s.id === activeStoryId) ?? null;
  if (activeStory) {
    return (
      <HskReaderView
        story={activeStory}
        wordsByList={wordsByList}
        onBack={() => {
          setActiveStoryId(null);
          setPage(2);
        }}
      />
    );
  }

  if (page === 3 && activeSentenceLevel != null) {
    return (
      <HskSentencesView
        groups={sentenceGroups}
        wordsByList={wordsByList}
        activeLevel={activeSentenceLevel}
        onSelectLevel={setActiveSentenceLevel}
      />
    );
  }

  function navigateToMainPage(nextPage: MainPageId) {
    const currentIndex = PAGES.findIndex((item) => item.id === page);
    const nextIndex = PAGES.findIndex((item) => item.id === nextPage);
    if (currentIndex === nextIndex) return;

    setPageDirection(nextIndex > currentIndex ? "left" : "right");
    setPage(nextPage);
    if (nextPage !== 3) setActiveSentenceLevel(null);
    setActiveReaderSetId(null);
  }

  function handlePageTouchStart(event: TouchEvent<HTMLDivElement>) {
    const target = event.target as Element;
    if (target.closest('[role="dialog"], input, textarea, select')) {
      pageSwipeStart.current = null;
      return;
    }

    const touch = event.touches[0];
    if (!touch) return;
    pageSwipeStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function handlePageTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = pageSwipeStart.current;
    pageSwipeStart.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (
      Math.abs(deltaX) < 60 ||
      Math.abs(deltaX) <= Math.abs(deltaY) * 1.25
    ) {
      return;
    }

    const currentIndex = PAGES.findIndex((item) => item.id === page);
    if (currentIndex < 0) return;

    const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
    const nextPage = PAGES[nextIndex];
    if (nextPage) navigateToMainPage(nextPage.id);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div
        className="min-h-0 flex-1 touch-pan-y overflow-y-auto"
        onTouchStart={handlePageTouchStart}
        onTouchEnd={handlePageTouchEnd}
        onTouchCancel={() => {
          pageSwipeStart.current = null;
        }}
      >
        <div
          key={page}
          className={cn(
            "flex min-h-full w-full items-center justify-center animate-in fade-in-0 duration-300",
            pageDirection === "left"
              ? "slide-in-from-right-8"
              : "slide-in-from-left-8",
          )}
        >
          {page === 0 && (
            <HskMenu wordsByList={wordsByList} onSelectList={setActiveList} />
          )}
          {page === 1 && (
            <QuizMenu
              wordsByList={wordsByList}
              onStart={(preset, title, settings) =>
                setActiveQuiz({
                  preset,
                  title,
                  settings,
                  returnToList: null,
                })
              }
            />
          )}
          {page === 2 && (
            <HskReaderMenu
              stories={stories}
              wordsByList={wordsByList}
              activeSetId={activeReaderSetId}
              onSelectSet={setActiveReaderSetId}
              onSelectStory={setActiveStoryId}
            />
          )}
          {page === 3 && (
            <HskSentencesView
              groups={sentenceGroups}
              wordsByList={wordsByList}
              activeLevel={null}
              onSelectLevel={setActiveSentenceLevel}
            />
          )}
          {page === 4 && <HskFilesView wordsByList={wordsByList} />}
        </div>
      </div>

      <footer className="sticky bottom-0 z-[70] shrink-0 border-t border-border/60 bg-background/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="flex justify-center px-2 pt-3">
          <div
            className="flex w-full max-w-sm items-center gap-1 rounded-full border border-border bg-background p-1.5 shadow-sm"
            role="tablist"
            aria-label="หน้าหลัก"
          >
            {PAGES.map((item) => (
              <button
                key={item.label}
                type="button"
                role="tab"
                aria-selected={page === item.id}
                aria-label={item.label}
                title={item.label}
                onClick={() => navigateToMainPage(item.id)}
                className={cn(
                  "min-w-0 flex-1 rounded-full px-3 py-2 text-center text-xs font-medium transition-all duration-200 sm:text-sm",
                  page === item.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {item.menuLabel}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
