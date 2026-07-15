"use client";

import { useEffect, useMemo, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadVoices, speak } from "@/lib/speak";
import {
  HSK_LISTS,
  loadStatus,
  wordId,
  type HskWord,
  type ListId,
  type StatusMap,
} from "@/lib/hsk-lists";
import type { QuizModeId, QuizSettings } from "@/components/quiz-menu";

type QuizChoice = {
  text: string;
  chinese: string;
};

type QuizItem = {
  chinese: string;
  prompt: string;
  answer: string;
  choices: QuizChoice[];
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function wordStatus(
  statusMap: StatusMap,
  word: HskWord,
  index: number,
): "known" | "unknown" | "neutral" {
  return statusMap[wordId(word.chinese, word.pinyin, index)] ?? "neutral";
}

function buildPool(
  wordsByList: Record<ListId, HskWord[]>,
  settings: QuizSettings,
): HskWord[] {
  const levelIds =
    settings.levels === "mix" ? HSK_LISTS.map((l) => l.id) : settings.levels;

  const pool: HskWord[] = [];
  for (const listId of levelIds) {
    const words = wordsByList[listId] ?? [];
    const statusMap = loadStatus(listId);
    words.forEach((w, i) => {
      const s = wordStatus(statusMap, w, i);
      if (s === "known" && settings.statuses.known) pool.push(w);
      else if (s === "unknown" && settings.statuses.unknown) pool.push(w);
      else if (s === "neutral" && settings.statuses.neutral) pool.push(w);
    });
  }
  return pool;
}

function buildQuiz(
  pool: HskWord[],
  preset: QuizModeId,
  settings: QuizSettings,
): QuizItem[] {
  if (pool.length < 2) return [];

  const uniqueKey = (w: HskWord) =>
    preset === "zh-py"
      ? w.pinyin
      : preset === "th-zh"
        ? w.chinese
        : w.thai;

  const promptOf = (w: HskWord) =>
    preset === "th-zh" ? w.thai : w.chinese;

  const answerOf = (w: HskWord) =>
    preset === "zh-th" ? w.thai : preset === "th-zh" ? w.chinese : w.pinyin;

  const count =
    settings.questionCount === "all"
      ? pool.length
      : Math.min(settings.questionCount, pool.length);
  const picked = shuffle(pool).slice(0, count);

  return picked.map((word) => {
    const answer = answerOf(word);
    const wrongPool = shuffle(
      pool.filter((w) => uniqueKey(w) !== uniqueKey(word)),
    );
    const wrongs: QuizChoice[] = [];
    for (const w of wrongPool) {
      const a = answerOf(w);
      if (a !== answer && !wrongs.some((x) => x.text === a)) {
        wrongs.push({ text: a, chinese: w.chinese });
      }
      if (wrongs.length >= settings.choiceCount - 1) break;
    }
    const choiceTarget = Math.min(settings.choiceCount, wrongs.length + 1);
    return {
      chinese: word.chinese,
      prompt: promptOf(word),
      answer,
      choices: shuffle([
        { text: answer, chinese: word.chinese },
        ...wrongs.slice(0, choiceTarget - 1),
      ]),
    };
  });
}

export function QuizSession({
  preset,
  title,
  settings,
  wordsByList,
  onExit,
}: {
  preset: QuizModeId;
  title: string;
  settings: QuizSettings;
  wordsByList: Record<ListId, HskWord[]>;
  onExit: () => void;
}) {
  const [round, setRound] = useState(0);
  const questions = useMemo(() => {
    const pool = buildPool(wordsByList, settings);
    return buildQuiz(pool, preset, settings);
  }, [wordsByList, settings, preset, round]);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [choicesVisible, setChoicesVisible] = useState(
    !settings.hideChoicesFirst,
  );

  useEffect(() => {
    if (!window.speechSynthesis) return;
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  if (questions.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <h2 className="text-xl font-semibold">ไม่มีคำเพียงพอ</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          ปรับระดับ HSK หรือสถานะคำ (เขียว/แดง/เทา) แล้วลองใหม่
        </p>
        <Button onClick={onExit}>กลับ</Button>
      </div>
    );
  }

  const q = questions[index];
  const answered = selected !== null;

  function pick(choice: QuizChoice) {
    if (selected) return;
    setSelected(choice.text);
    if (choice.text === q.answer) setScore((s) => s + 1);
    // Always pronounce the correct word, never the tapped wrong choice.
    if (soundOn) speak(q.chinese);
  }

  function next() {
    if (index >= questions.length - 1) {
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setChoicesVisible(!settings.hideChoicesFirst);
  }

  if (done) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">ผลคะแนน</h2>
        <p className="text-4xl font-bold tabular-nums">
          {score} / {questions.length}
        </p>
        <p className="text-sm text-muted-foreground">{title}</p>
        <div className="mt-2 flex gap-2">
          <Button variant="outline" onClick={onExit}>
            กลับเมนู
          </Button>
          <Button
            onClick={() => {
              setIndex(0);
              setSelected(null);
              setScore(0);
              setDone(false);
              setChoicesVisible(!settings.hideChoicesFirst);
              setRound((r) => r + 1);
            }}
          >
            เล่นอีกครั้ง
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-lg flex-col overflow-y-auto px-4 pb-8 pt-4">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="rounded-lg border border-border px-4 py-2.5 text-base font-semibold hover:bg-muted"
        >
          ออก
        </button>
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground">
            {index + 1} / {questions.length}
          </div>
          <button
            type="button"
            aria-pressed={soundOn}
            aria-label={soundOn ? "ปิดเสียง" : "เปิดเสียง"}
            onClick={() => setSoundOn((v) => !v)}
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-lg border transition-colors",
              soundOn
                ? "border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-200"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {soundOn ? (
              <Volume2 className="size-5" />
            ) : (
              <VolumeX className="size-5" />
            )}
          </button>
        </div>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground transition-[width]"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      <p className="mt-4 text-center text-xs font-medium text-muted-foreground">
        {title}
      </p>
      <div className="mt-6 flex flex-col items-center justify-center py-6 text-center sm:flex-1 sm:py-0">
        <div className="text-4xl font-bold leading-tight sm:text-5xl">{q.prompt}</div>
      </div>

      {!choicesVisible ? (
        <Button
          className="mt-6 h-14 w-full text-base font-semibold"
          onClick={() => setChoicesVisible(true)}
        >
          แตะเพื่อดูตัวเลือก
        </Button>
      ) : (
        <div
          className={cn(
            "mt-6 grid gap-2",
            q.choices.length >= 6 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {q.choices.map((choice) => {
            const isAnswer = choice.text === q.answer;
            const isPick = choice.text === selected;
            return (
              <button
                key={choice.text}
                type="button"
                disabled={answered}
                onClick={() => pick(choice)}
                className={cn(
                  "rounded-xl border-2 px-3 py-3 text-base font-medium transition-colors sm:px-4",
                  q.choices.length >= 6 ? "text-center" : "text-left",
                  !answered && "hover:bg-muted",
                  answered &&
                    isAnswer &&
                    "border-emerald-500 bg-emerald-50 text-emerald-900",
                  answered &&
                    isPick &&
                    !isAnswer &&
                    "border-rose-500 bg-rose-50 text-rose-900",
                  answered && !isAnswer && !isPick && "opacity-50",
                )}
              >
                {choice.text}
              </button>
            );
          })}
        </div>
      )}

      {answered && (
        <Button className="mt-4 h-12 w-full text-base font-semibold" onClick={next}>
          {index >= questions.length - 1 ? "ดูผลคะแนน" : "ข้อต่อไป"}
        </Button>
      )}
    </div>
  );
}
