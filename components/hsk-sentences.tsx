"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import {
  ALargeSmall,
  BookText,
  ChevronLeft,
  ChevronRight,
  Languages,
  Menu,
  Settings,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildVocabMap, segmentChinese } from "@/lib/segment-chinese";
import { loadVoices, speak } from "@/lib/speak";
import type { HskWord, ListId, Status, StatusMap } from "@/lib/hsk-lists";
import { loadTrackEnabled } from "@/lib/hsk-lists";
import {
  sentenceItemId,
  sentenceStatusKey,
  type SentenceCard,
  type SentenceItem,
  type SentenceLevel,
  type SentenceLevelGroup,
} from "@/lib/sentences";
import { useGlossPopup } from "@/components/word-gloss";

const FONT_KEY = "hsk-sentence-font-size";
const TOGGLE_KEY = "hsk-sentence-toggles";
const FONT_MIN = 16;
const FONT_MAX = 36;
const FONT_DEFAULT = 22;

type ToggleState = {
  pinyin: boolean;
  wordThai: boolean;
  sentenceThai: boolean;
  sound: boolean;
};

const DEFAULT_TOGGLES: ToggleState = {
  pinyin: true,
  wordThai: false,
  sentenceThai: false,
  sound: false,
};

function loadFontSize(): number {
  try {
    const n = Number(localStorage.getItem(FONT_KEY));
    if (Number.isFinite(n) && n >= FONT_MIN && n <= FONT_MAX) return n;
  } catch {
    // ignore
  }
  return FONT_DEFAULT;
}

function saveFontSize(n: number) {
  try {
    localStorage.setItem(FONT_KEY, String(n));
  } catch {
    // ignore
  }
}

function loadToggles(): ToggleState {
  try {
    const raw = localStorage.getItem(TOGGLE_KEY);
    if (!raw) return { ...DEFAULT_TOGGLES };
    const parsed = JSON.parse(raw) as Partial<ToggleState>;
    return {
      pinyin: parsed.pinyin ?? DEFAULT_TOGGLES.pinyin,
      wordThai: parsed.wordThai ?? DEFAULT_TOGGLES.wordThai,
      sentenceThai: parsed.sentenceThai ?? DEFAULT_TOGGLES.sentenceThai,
      sound: parsed.sound ?? DEFAULT_TOGGLES.sound,
    };
  } catch {
    return { ...DEFAULT_TOGGLES };
  }
}

function saveToggles(state: ToggleState) {
  try {
    localStorage.setItem(TOGGLE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function loadSentenceStatus(level: SentenceLevel): StatusMap {
  try {
    const saved = localStorage.getItem(sentenceStatusKey(level));
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function saveSentenceStatus(level: SentenceLevel, map: StatusMap) {
  try {
    localStorage.setItem(sentenceStatusKey(level), JSON.stringify(map));
  } catch {
    // ignore
  }
}

function cardStatus(card: SentenceCard, statusMap: StatusMap): Status | "neutral" {
  const statuses = card.sentences.map(
    (_, i) => statusMap[sentenceItemId(card.id, i)] ?? "neutral",
  );
  if (statuses.every((s) => s === "known")) return "known";
  if (statuses.every((s) => s === "unknown")) return "unknown";
  return "neutral";
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

export function HskSentencesView({
  groups,
  wordsByList,
  activeLevel,
  onSelectLevel,
}: {
  groups: SentenceLevelGroup[];
  wordsByList: Record<ListId, HskWord[]>;
  activeLevel: number | null;
  onSelectLevel: (level: number | null) => void;
}) {
  const active = groups.find((g) => g.level === activeLevel) ?? null;
  const vocab = useMemo(() => buildVocabMap(wordsByList), [wordsByList]);

  const [showPinyin, setShowPinyin] = useState(DEFAULT_TOGGLES.pinyin);
  const [showWordThai, setShowWordThai] = useState(DEFAULT_TOGGLES.wordThai);
  const [showSentenceThai, setShowSentenceThai] = useState(
    DEFAULT_TOGGLES.sentenceThai,
  );
  const [showSound, setShowSound] = useState(DEFAULT_TOGGLES.sound);
  const [togglesReady, setTogglesReady] = useState(false);
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(FONT_DEFAULT);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const storySwipeStart = useRef<{ x: number; y: number } | null>(null);
  const storyScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadVoices();
    setFontSize(loadFontSize());
    const toggles = loadToggles();
    setShowPinyin(toggles.pinyin);
    setShowWordThai(toggles.wordThai);
    setShowSentenceThai(toggles.sentenceThai);
    setShowSound(toggles.sound);
    setTogglesReady(true);
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.onvoiceschanged = () => loadVoices();
  }, []);

  useEffect(() => {
    if (!togglesReady) return;
    saveToggles({
      pinyin: showPinyin,
      wordThai: showWordThai,
      sentenceThai: showSentenceThai,
      sound: showSound,
    });
  }, [togglesReady, showPinyin, showWordThai, showSentenceThai, showSound]);

  useEffect(() => {
    if (!active) return;
    setStatusMap(loadSentenceStatus(active.level));
    setOpenCardId(null);
  }, [active?.level]);

  function changeFontSize(next: number) {
    const clamped = Math.min(FONT_MAX, Math.max(FONT_MIN, next));
    setFontSize(clamped);
    saveFontSize(clamped);
  }

  function markStoryAndAdvance(card: SentenceCard, status: Status) {
    if (!active || !loadTrackEnabled()) return;
    setStatusMap((prev) => {
      const next = { ...prev };
      for (let i = 0; i < card.sentences.length; i++) {
        next[sentenceItemId(card.id, i)] = status;
      }
      saveSentenceStatus(active.level, next);
      return next;
    });
    const cardPos = active.cards.findIndex((c) => c.id === card.id);
    const nextCard = cardPos >= 0 ? active.cards[cardPos + 1] : null;
    if (nextCard) {
      setOpenCardId(nextCard.id);
      return;
    }
    setOpenCardId(null);
  }

  const openCard = active?.cards.find((c) => c.id === openCardId) ?? null;

  function moveStory(direction: -1 | 1) {
    if (!active || !openCard) return;
    const current = active.cards.findIndex((card) => card.id === openCard.id);
    const target = active.cards[current + direction];
    if (!target) return;

    setOpenCardId(target.id);
    requestAnimationFrame(() => {
      storyScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function handleStoryTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (settingsOpen) return;
    const target = event.target as Element;
    if (target.closest('[role="dialog"], input, textarea, select')) return;

    const touch = event.touches[0];
    if (!touch) return;
    storySwipeStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleStoryTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = storySwipeStart.current;
    storySwipeStart.current = null;
    if (!start || settingsOpen) return;

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

    moveStory(deltaX < 0 ? 1 : -1);
  }

  const navBtn =
    "flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-lg border px-0.5 py-1.5 text-[9px] font-medium leading-tight transition-colors sm:gap-1 sm:px-1.5 sm:py-2 sm:text-xs [-webkit-tap-highlight-color:transparent] [&_svg]:pointer-events-none [&_svg]:size-[18px] sm:[&_svg]:size-5 [&_svg]:shrink-0";
  const navBtnOff =
    "border-border bg-background text-foreground hover:bg-muted";
  const navBtnOn =
    "border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-200 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200";

  const settingsPanel = settingsOpen ? (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={() => setSettingsOpen(false)}
    >
      <div
        role="dialog"
        aria-labelledby="sentence-settings-title"
        className="w-full max-w-sm rounded-2xl border border-border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="sentence-settings-title"
          className="text-lg font-semibold tracking-tight"
        >
          ตั้งค่า
        </h2>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">ขนาดอักษร</span>
            <span className="tabular-nums text-muted-foreground">
              {fontSize}px
            </span>
          </div>
          <input
            type="range"
            min={FONT_MIN}
            max={FONT_MAX}
            step={1}
            value={fontSize}
            aria-label="ขนาดอักษร"
            onChange={(e) => changeFontSize(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-sky-600 touch-manipulation"
          />
          <div className="mt-4 text-center">
            <span
              className="font-medium leading-none text-foreground"
              style={{ fontSize: `${fontSize}px` }}
            >
              你好
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(false)}
          className="mt-5 h-11 w-full rounded-xl border border-border text-sm font-semibold hover:bg-muted"
        >
          ปิด
        </button>
      </div>
    </div>
  ) : null;

  if (active && openCard) {
    const storyStatus = cardStatus(openCard, statusMap);

    return (
      <div
        className="flex h-dvh touch-pan-y flex-col overflow-hidden bg-background"
        onTouchStart={handleStoryTouchStart}
        onTouchEnd={handleStoryTouchEnd}
        onTouchCancel={() => {
          storySwipeStart.current = null;
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0 truncate text-sm text-muted-foreground">
            เรื่องที่ {openCard.index}/{active.cards.length}
            <span className="ml-1.5 text-xs font-medium">
              · HSK {active.level}
            </span>
            <span className="ml-1.5 text-xs">
              · ปัดซ้ายขวาเพื่อเปลี่ยนเรื่อง
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted touch-manipulation"
          >
            <Settings className="size-4 shrink-0" />
            <span>ขนาดอักษร</span>
          </button>
        </div>

        <div
          ref={storyScrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <div className="mx-auto w-full max-w-xl px-4 py-5 sm:px-6">
            <div className="mb-5">
              <StoryTitle
                title={openCard.title}
                titleThai={openCard.titleThai}
                vocab={vocab}
                showPinyin={showPinyin}
                showWordThai={showWordThai}
                showSentenceThai={showSentenceThai}
                fontSize={fontSize}
                large
                enableGloss
                onSpeak={showSound ? () => speak(openCard.title) : undefined}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {openCard.sentences.length} ประโยค
                {storyStatus === "known"
                  ? " · จำได้"
                  : storyStatus === "unknown"
                    ? " · จำไม่ได้"
                    : ""}
              </p>
            </div>

            <ol className="space-y-6">
              {openCard.sentences.map((item, i) => (
                <SentenceLine
                  key={`${openCard.id}-${i}`}
                  index={i + 1}
                  item={item}
                  vocab={vocab}
                  showPinyin={showPinyin}
                  showWordThai={showWordThai}
                  showSentenceThai={showSentenceThai}
                  showSound={showSound}
                  fontSize={fontSize}
                />
              ))}
            </ol>
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto grid w-full max-w-xl grid-cols-2 gap-2 px-3 pt-2 sm:px-4">
            <button
              type="button"
              onClick={() => markStoryAndAdvance(openCard, "unknown")}
              className="rounded-xl border-2 border-rose-400 bg-rose-50 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 active:bg-rose-200 dark:border-rose-600 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-950 touch-manipulation [-webkit-tap-highlight-color:transparent]"
            >
              จำไม่ได้
            </button>
            <button
              type="button"
              onClick={() => markStoryAndAdvance(openCard, "known")}
              className="rounded-xl border-2 border-emerald-400 bg-emerald-50 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 active:bg-emerald-200 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-950 touch-manipulation [-webkit-tap-highlight-color:transparent]"
            >
              จำได้
            </button>
          </div>
          <div className="mx-auto grid w-full max-w-xl grid-cols-5 gap-1 px-1 py-2 sm:gap-1.5 sm:px-3 sm:py-3">
            <button
              type="button"
              onClick={() => setOpenCardId(null)}
              className={cn(navBtn, navBtnOff)}
            >
              <ChevronLeft />
              <span className="truncate">ย้อนกลับ</span>
            </button>
            <button
              type="button"
              aria-pressed={showPinyin}
              onClick={() => setShowPinyin((v) => !v)}
              className={cn(navBtn, showPinyin ? navBtnOn : navBtnOff)}
            >
              <ALargeSmall />
              <span className="truncate">พินอิน</span>
            </button>
            <button
              type="button"
              aria-pressed={showWordThai}
              onClick={() => setShowWordThai((v) => !v)}
              className={cn(navBtn, showWordThai ? navBtnOn : navBtnOff)}
            >
              <Languages />
              <span className="truncate">แปลคำ</span>
            </button>
            <button
              type="button"
              aria-pressed={showSentenceThai}
              onClick={() => setShowSentenceThai((v) => !v)}
              className={cn(navBtn, showSentenceThai ? navBtnOn : navBtnOff)}
            >
              <BookText />
              <span className="truncate">แปลประโยค</span>
            </button>
            <button
              type="button"
              aria-pressed={showSound}
              onClick={() => setShowSound((v) => !v)}
              className={cn(navBtn, showSound ? navBtnOn : navBtnOff)}
            >
              {showSound ? <Volume2 /> : <VolumeX className="opacity-70" />}
              <span className="truncate">เสียง</span>
            </button>
          </div>
        </div>
        {settingsPanel}
      </div>
    );
  }

  if (active) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
          <div className="mx-auto w-full max-w-xl px-4 py-5 sm:px-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  {active.label}
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                  {active.cards.length} เรื่อง · แตะการ์ดเพื่ออ่านทั้งเรื่อง
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted touch-manipulation"
              >
                <Settings className="size-4 shrink-0" />
                <span>ขนาดอักษร</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {active.cards.map((card) => {
                const status = cardStatus(card, statusMap);

                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => {
                      if (showSound) speak(card.title);
                      setOpenCardId(card.id);
                    }}
                    className="flex min-h-[7.5rem] flex-col rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40 sm:min-h-[8.5rem] sm:p-3.5 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                  >
                    <div className="text-[10px] font-medium text-muted-foreground">
                      เรื่องที่ {card.index} · {card.sentences.length} ประโยค
                    </div>
                    <div className="mt-1.5 min-w-0 flex-1">
                      <StoryTitle
                        title={card.title}
                        titleThai={card.titleThai}
                        vocab={vocab}
                        showPinyin={showPinyin}
                        showWordThai={showWordThai}
                        showSentenceThai={showSentenceThai}
                        fontSize={fontSize}
                      />
                    </div>
                    <div className="mt-auto flex items-center gap-1.5 pt-2 text-[10px]">
                      {status === "known" ? (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                          จำได้
                        </span>
                      ) : status === "unknown" ? (
                        <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">
                          จำไม่ได้
                        </span>
                      ) : (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          ยังไม่ทำ
                        </span>
                      )}
                      {showSound ? (
                        <Volume2 className="ml-auto size-3 shrink-0 text-muted-foreground" />
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto grid w-full max-w-xl grid-cols-5 gap-1 px-1 py-2 sm:gap-1.5 sm:px-3 sm:py-3">
            <button
              type="button"
              onClick={() => onSelectLevel(null)}
              className={cn(navBtn, navBtnOff)}
            >
              <Menu />
              <span className="truncate">เมนู</span>
            </button>
            <button
              type="button"
              aria-pressed={showPinyin}
              onClick={() => setShowPinyin((v) => !v)}
              className={cn(navBtn, showPinyin ? navBtnOn : navBtnOff)}
            >
              <ALargeSmall />
              <span className="truncate">พินอิน</span>
            </button>
            <button
              type="button"
              aria-pressed={showWordThai}
              onClick={() => setShowWordThai((v) => !v)}
              className={cn(navBtn, showWordThai ? navBtnOn : navBtnOff)}
            >
              <Languages />
              <span className="truncate">แปลคำ</span>
            </button>
            <button
              type="button"
              aria-pressed={showSentenceThai}
              onClick={() => setShowSentenceThai((v) => !v)}
              className={cn(navBtn, showSentenceThai ? navBtnOn : navBtnOff)}
            >
              <BookText />
              <span className="truncate">แปลประโยค</span>
            </button>
            <button
              type="button"
              aria-pressed={showSound}
              onClick={() => setShowSound((v) => !v)}
              className={cn(navBtn, showSound ? navBtnOn : navBtnOff)}
            >
              {showSound ? <Volume2 /> : <VolumeX className="opacity-70" />}
              <span className="truncate">เสียง</span>
            </button>
          </div>
        </div>
        {settingsPanel}
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-4 py-6 sm:px-6">
        <div className="mb-4 text-center sm:mb-5">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            รวมประโยค
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            ตัวอย่างประโยค ครอบคลุมศัพท์ HSK ทุกระดับ
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {groups.map((group) => (
            <button
              key={group.level}
              type="button"
              onClick={() => onSelectLevel(group.level)}
              className="group rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold tracking-tight sm:text-xl">
                    {group.label}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
                    {group.sentenceCount} ประโยค · {group.cards.length} เรื่อง
                  </div>
                </div>
                <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </button>
          ))}
          {[4, 5, 6].map((level) => (
            <div
              key={level}
              aria-disabled
              className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 sm:p-5"
            >
              <div className="text-lg font-semibold tracking-tight text-muted-foreground sm:text-xl">
                HSK {level}
              </div>
              <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
                Coming soon
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StoryTitle({
  title,
  titleThai,
  vocab,
  showPinyin,
  showWordThai,
  showSentenceThai,
  fontSize,
  large = false,
  enableGloss = false,
  onSpeak,
}: {
  title: string;
  titleThai?: string;
  vocab: ReturnType<typeof buildVocabMap>;
  showPinyin: boolean;
  showWordThai: boolean;
  showSentenceThai: boolean;
  fontSize: number;
  large?: boolean;
  enableGloss?: boolean;
  onSpeak?: () => void;
}) {
  const tokens = useMemo(() => segmentChinese(title, vocab), [title, vocab]);
  const showTable = showPinyin || showWordThai;
  const titlePx = large ? fontSize + 2 : Math.max(14, fontSize - 2);
  const pinyinMax = Math.max(7, Math.round(titlePx * 0.48));
  const thaiMax = Math.max(7, Math.round(titlePx * 0.5));
  const glossPx = Math.max(11, Math.round(titlePx * 0.55));
  const glossText =
    titleThai?.trim() ||
    tokens
      .filter((t) => t.isWord && t.thai)
      .map((t) => t.thai)
      .join("");
  const gloss = useGlossPopup();

  return (
    <>
      <div
        role={onSpeak ? "button" : undefined}
        tabIndex={onSpeak ? 0 : undefined}
        aria-label={onSpeak ? "อ่านชื่อเรื่อง" : undefined}
        onClick={() => {
          if (gloss.didLongPress()) return;
          onSpeak?.();
        }}
        onKeyDown={(event) => {
          if (onSpeak && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onSpeak();
          }
        }}
        className={cn(
          showTable || showSentenceThai
            ? "space-y-1.5"
            : "font-semibold leading-snug tracking-tight",
          onSpeak &&
            "cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-ring",
        )}
        style={
          !showTable && !showSentenceThai
            ? { fontSize: `${titlePx}px` }
            : undefined
        }
      >
        <div
          className={cn(
            "flex flex-wrap",
            showTable
              ? "content-end items-stretch gap-0"
              : "content-end items-end gap-x-0 gap-y-1",
          )}
        >
          {tokens.map((tok, ti) => {
            if (!tok.isWord) {
              return (
                <span
                  key={ti}
                  className={cn(
                    "inline-flex items-end font-semibold leading-none",
                    showTable
                      ? "px-[2px] pb-1.5 text-muted-foreground"
                      : "px-[1px]",
                  )}
                  style={{ fontSize: `${titlePx}px` }}
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
                    ? "-ml-px -mt-px items-stretch border border-border/40 bg-muted/15 px-1 py-1"
                    : "px-[1px]",
                  enableGloss &&
                    "select-none [-webkit-touch-callout:none] [touch-action:manipulation]",
                )}
                style={
                  showTable
                    ? {
                        minWidth: `${Math.max(
                          showWordThai ? 2.2 : 1.5,
                          tok.text.length * 1.05,
                        )}em`,
                      }
                    : undefined
                }
                {...(enableGloss
                  ? gloss.bindWord({
                      text: tok.text,
                      pinyin: tok.pinyin,
                      thai: tok.thai,
                    })
                  : {})}
              >
                {showPinyin ? (
                  <span className="pointer-events-none mb-0.5 min-h-[0.75rem] w-full">
                    <FitText
                      text={tok.pinyin || "\u00a0"}
                      maxPx={pinyinMax}
                      minPx={5}
                      lines={1}
                      className="font-medium tracking-tight text-sky-800/80 dark:text-sky-200/80"
                    />
                  </span>
                ) : null}
                <span
                  className="pointer-events-none text-center font-semibold leading-none text-foreground"
                  style={{ fontSize: `${titlePx}px` }}
                >
                  {tok.text}
                </span>
                {showWordThai ? (
                  <span className="pointer-events-none mt-0.5 min-h-[1.1rem] w-full">
                    <FitText
                      text={tok.thai || "\u00a0"}
                      maxPx={thaiMax}
                      minPx={5}
                      lines={2}
                      className="text-muted-foreground"
                    />
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
        {showSentenceThai && glossText ? (
          <p
            className="border-l-2 border-sky-300/70 pl-2 font-medium leading-snug text-foreground/80 dark:border-sky-700/70"
            style={{ fontSize: `${glossPx}px` }}
          >
            {glossText}
          </p>
        ) : null}
      </div>
      {enableGloss ? gloss.popup : null}
    </>
  );
}

function SentenceLine({
  index,
  item,
  vocab,
  showPinyin,
  showWordThai,
  showSentenceThai,
  showSound,
  fontSize,
}: {
  index: number;
  item: SentenceItem;
  vocab: ReturnType<typeof buildVocabMap>;
  showPinyin: boolean;
  showWordThai: boolean;
  showSentenceThai: boolean;
  showSound: boolean;
  fontSize: number;
}) {
  const tokens = useMemo(
    () => segmentChinese(item.chinese, vocab),
    [item.chinese, vocab],
  );
  const showTable = showPinyin || showWordThai;
  const pinyinMax = Math.max(7, Math.round(fontSize * 0.48));
  const thaiMax = Math.max(7, Math.round(fontSize * 0.5));
  const gloss = useGlossPopup();

  return (
    <li>
      <div className="flex items-start gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
          {index}
        </span>

        <div className="min-w-0 flex-1 space-y-2">
          <div
            className={cn(
              "flex flex-wrap",
              showTable
                ? "content-end items-stretch gap-0"
                : "content-end items-end gap-x-0 gap-y-2",
              showSound && "cursor-pointer",
            )}
            onClick={() => {
              if (gloss.didLongPress()) return;
              if (showSound) speak(item.chinese);
            }}
          >
            {tokens.map((tok, ti) => {
              if (!tok.isWord) {
                return (
                  <span
                    key={ti}
                    className={cn(
                      "inline-flex items-end font-medium leading-none",
                      showTable
                        ? "px-[2px] pb-2 text-muted-foreground"
                        : "px-[1px] pb-[2px]",
                    )}
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    {tok.text}
                  </span>
                );
              }

              return (
                <span
                  key={ti}
                  className={cn(
                    "relative inline-flex select-none flex-col items-center [-webkit-touch-callout:none] [touch-action:manipulation]",
                    showTable
                      ? "-ml-px -mt-px items-stretch border border-border/40 bg-muted/15 px-1.5 py-1.5"
                      : "px-[1.5px]",
                  )}
                  style={
                    showTable
                      ? {
                          minWidth: `${Math.max(
                            showWordThai ? 2.6 : 1.75,
                            tok.text.length * 1.15,
                          )}em`,
                        }
                      : undefined
                  }
                  {...gloss.bindWord({
                    text: tok.text,
                    pinyin: tok.pinyin,
                    thai: tok.thai,
                  })}
                >
                  {showPinyin ? (
                    <span className="pointer-events-none mb-0.5 min-h-[0.9rem] w-full">
                      <FitText
                        text={tok.pinyin || "\u00a0"}
                        maxPx={pinyinMax}
                        minPx={5.5}
                        lines={1}
                        className="font-medium tracking-tight text-sky-800/80 dark:text-sky-200/80"
                      />
                    </span>
                  ) : null}
                  <span
                    className="pointer-events-none text-center font-medium leading-none text-foreground"
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    {tok.text}
                  </span>
                  {showWordThai ? (
                    <span className="pointer-events-none mt-1 min-h-[1.4rem] w-full">
                      <FitText
                        text={tok.thai || "\u00a0"}
                        maxPx={thaiMax}
                        minPx={5}
                        lines={2}
                        className="text-muted-foreground"
                      />
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>

          {showSentenceThai && item.thai ? (
            <p className="border-l-2 border-sky-300/70 pl-3 text-[0.95rem] leading-relaxed text-muted-foreground dark:border-sky-700/70">
              {item.thai}
            </p>
          ) : null}
        </div>

        {showSound ? (
          <button
            type="button"
            aria-label="อ่านเสียง"
            onClick={() => speak(item.chinese)}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground touch-manipulation"
          >
            <Volume2 className="size-3.5" />
          </button>
        ) : null}
      </div>
      {gloss.popup}
    </li>
  );
}
