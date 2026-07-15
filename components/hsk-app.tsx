"use client";

import { useEffect, useState } from "react";
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
  { id: 0, label: "HSK Tracker", short: "HSK" },
  // Hidden for now: Quiz รวม (1), HSK Reader (2)
  { id: 3, label: "รวมประโยค", short: "รวมประโยค" },
  { id: 4, label: "แจกไฟล์", short: "แจกไฟล์" },
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
        {page === 3 && (
          <HskSentencesView
            groups={sentenceGroups}
            wordsByList={wordsByList}
            activeLevel={null}
            onSelectLevel={setActiveSentenceLevel}
          />
        )}
        {page === 4 && <HskFilesView />}
      </div>

      <footer className="sticky bottom-0 z-[70] shrink-0 border-t border-border/60 bg-background/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="flex justify-center px-2 pt-3 sm:px-3">
          <div className="flex w-full max-w-xl items-center gap-0.5 rounded-full border border-border bg-background px-1 py-1.5 shadow-sm sm:gap-1.5 sm:px-2 sm:py-2">
            {PAGES.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setPage(item.id);
                  if (item.id !== 3) setActiveSentenceLevel(null);
                  if (item.id !== 2) setActiveReaderSetId(null);
                }}
                className={cn(
                  "min-w-0 flex-1 rounded-full px-1 py-2.5 text-center text-[10px] font-medium leading-tight transition-colors sm:px-2 sm:py-3 sm:text-sm",
                  page === item.id
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
