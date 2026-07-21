"use client";

import { useCallback, useState } from "react";
import { CustomDrillSheet } from "@/components/custom-drill-sheet";
import { HskWordMapSheet } from "@/components/hsk-word-map-sheet";
import { StrokeOrderSheet } from "@/components/stroke-order-sheet";
import { StrokeOrderSummarySheet } from "@/components/stroke-order-summary-sheet";
import type { HskWord, ListId } from "@/lib/hsk-lists";
import { formatHskLevelLabel, hskLevelsWithWords } from "@/lib/hsk-lists";

const HSK_1_9_SUPERMAP_PDF_URL =
  "https://pub-e48f991a086a412eadf434f9d6acae55.r2.dev/hsk1-9-words-visualized.pdf";
const HSK_1_9_SUPERMAP_ICON_URL =
  "https://pub-e48f991a086a412eadf434f9d6acae55.r2.dev/Screenshot%202026-07-19%20032745.jpg";

export function HskFilesView({
  wordsByList,
}: {
  wordsByList: Record<ListId, HskWord[]>;
  /** Kept for route compatibility; interactive HSK 1–9 SuperMap is hidden. */
  advancedWords?: string[];
}) {
  const [openCustomDrill, setOpenCustomDrill] = useState(false);
  const [openStrokeOrder, setOpenStrokeOrder] = useState(false);
  const [openStrokeSummary, setOpenStrokeSummary] = useState(false);
  const [openWordMap, setOpenWordMap] = useState(false);
  const [wordMapProgress, setWordMapProgress] = useState<number | null>(null);

  const strokeSummaryTitle = `${formatHskLevelLabel(
    hskLevelsWithWords(wordsByList),
  )} ลำดับขีด จัดทำโดย DreamHSK`;
  const strokeSummaryLevels = formatHskLevelLabel(
    hskLevelsWithWords(wordsByList),
  );

  const openSuperMap = () => {
    setWordMapProgress(5);
    requestAnimationFrame(() => setOpenWordMap(true));
  };

  const handleWordMapProgress = useCallback((progress: number) => {
    setWordMapProgress(progress);
    if (progress >= 100) {
      requestAnimationFrame(() => setWordMapProgress(null));
    }
  }, []);

  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-4 py-6 sm:px-6">
        <div className="mb-4 text-center sm:mb-5">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            แจกไฟล์
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            ไฟล์สำหรับดาวน์โหลด
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          <button
            type="button"
            onClick={() => setOpenCustomDrill(true)}
            className="rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40 sm:p-5"
          >
            <div className="text-lg font-semibold tracking-tight sm:text-xl">
              แบบฝึกหัดแบบเว้นช่องว่าง
            </div>
            <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
              HSK 1–6 · ซ่อนช่อง / กรองสถานะ / สุ่มลำดับ · PDF A4
            </div>
          </button>

          <button
            type="button"
            onClick={() => setOpenStrokeOrder(true)}
            className="rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40 sm:p-5"
          >
            <div className="text-lg font-semibold tracking-tight sm:text-xl">
              แบบฝึกลำดับขีด
            </div>
            <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
              HSK 1–6 · Tian Zi Ge / Mi Zi Ge · สร้าง PDF A4
            </div>
          </button>

          <button
            type="button"
            onClick={() => setOpenStrokeSummary(true)}
            className="rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40 sm:p-5"
          >
            <div className="text-lg font-semibold tracking-tight sm:text-xl">
              {strokeSummaryTitle}
            </div>
            <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {strokeSummaryLevels} · กำหนดจำนวนคำได้ · ขีดใหม่สีแดง · พินอิน/แปล
            </div>
          </button>

          <button
            type="button"
            onClick={openSuperMap}
            disabled={wordMapProgress !== null}
            className="rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40 sm:p-5"
          >
            <div className="text-lg font-semibold tracking-tight sm:text-xl">
              HSK 3.0 1-6 Words SuperMap
            </div>
            <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
              HSK 1–6 ทั้งชุดในหน้าเดียว · สีตามระดับ
            </div>
          </button>

          <a
            href={HSK_1_9_SUPERMAP_PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40 sm:p-5"
          >
            <div className="flex items-center gap-3">
              <img
                src={HSK_1_9_SUPERMAP_ICON_URL}
                alt=""
                className="size-12 shrink-0 rounded-md border border-border object-cover object-top sm:size-14"
              />
              <div className="min-w-0">
                <div className="text-lg font-semibold tracking-tight sm:text-xl">
                  HSK 3.0 1-9 Words SuperMap
                </div>
                <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  ไฟล์ PDF
                </div>
              </div>
            </div>
          </a>
        </div>
      </div>

      {openCustomDrill && (
        <CustomDrillSheet
          wordsByList={wordsByList}
          initialListId="hsk1"
          onClose={() => setOpenCustomDrill(false)}
        />
      )}

      {openStrokeOrder && (
        <StrokeOrderSheet
          wordsByList={wordsByList}
          onClose={() => setOpenStrokeOrder(false)}
        />
      )}

      {openStrokeSummary && (
        <StrokeOrderSummarySheet
          wordsByList={wordsByList}
          onClose={() => setOpenStrokeSummary(false)}
        />
      )}

      {openWordMap && (
        <HskWordMapSheet
          wordsByList={wordsByList}
          initialListId="hsk1"
          onLoadProgress={handleWordMapProgress}
          onClose={() => {
            setOpenWordMap(false);
            setWordMapProgress(null);
          }}
        />
      )}

      {wordMapProgress !== null && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-background/90 px-6 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-lg">
            <div className="mb-3 flex items-center justify-between gap-3 text-sm font-medium">
              <span>กำลังเปิด SuperMap…</span>
              <span className="tabular-nums text-muted-foreground">
                {wordMapProgress}%
              </span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="กำลังเปิด SuperMap"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={wordMapProgress}
            >
              <div
                className="h-full rounded-full bg-foreground transition-[width] duration-75"
                style={{ width: `${wordMapProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
