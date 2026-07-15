"use client";

import { useEffect, useState } from "react";
import { HskMenu } from "@/components/hsk-menu";
import { HskChecker } from "@/components/hsk-checker";
import { QuizMenu, type QuizModeId, type QuizSettings } from "@/components/quiz-menu";
import { QuizSession } from "@/components/quiz-session";
import { HskReaderMenu, HskReaderView } from "@/components/hsk-reader";
import { cn } from "@/lib/utils";
import { resetHskStorageIfNeeded, type HskWord, type ListId } from "@/lib/hsk-lists";
import type { ChineseStory } from "@/lib/chinese-stories";

const PAGES = [
  { label: "HSK Checker", short: "HSK" },
  { label: "Quiz รวม", short: "Quiz รวม" },
  { label: "HSK Reader", short: "Reader" },
] as const;

type ActiveQuiz = {
  preset: QuizModeId;
  title: string;
  settings: QuizSettings;
  returnToList: ListId | null;
};

export function HskApp({
  wordsByList,
  stories,
}: {
  wordsByList: Record<ListId, HskWord[]>;
  stories: ChineseStory[];
}) {
  const [activeList, setActiveList] = useState<ListId | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<ActiveQuiz | null>(null);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [activeReaderSetId, setActiveReaderSetId] = useState<string | null>(null);
  // 0 = HSK Checker, 1 = Quiz, 2 = HSK Reader
  const [page, setPage] = useState(0);
  const [storageReady, setStorageReady] = useState(false);

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

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
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
      </div>

      <footer className="sticky bottom-0 z-[70] shrink-0 border-t border-border/60 bg-background/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="flex justify-center px-3 pt-3">
          <div className="flex w-full max-w-xl items-center gap-1 rounded-full border border-border bg-background px-1.5 py-1.5 shadow-sm sm:gap-2 sm:px-3 sm:py-2">
            {PAGES.map((item, i) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setPage(i)}
                className={cn(
                  "min-w-0 flex-1 rounded-full px-2 py-2.5 text-center text-xs font-medium transition-colors sm:px-3 sm:py-3 sm:text-sm",
                  page === i
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
