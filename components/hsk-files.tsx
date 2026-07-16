"use client";

import { useCallback, useState } from "react";
import { CustomDrillSheet } from "@/components/custom-drill-sheet";
import { HskWordMapSheet } from "@/components/hsk-word-map-sheet";
import type { HskWord, ListId } from "@/lib/hsk-lists";

export function HskFilesView({
  wordsByList,
}: {
  wordsByList: Record<ListId, HskWord[]>;
}) {
  const [openCustomDrill, setOpenCustomDrill] = useState(false);
  const [openWordMap, setOpenWordMap] = useState(false);
  const [wordMapProgress, setWordMapProgress] = useState<number | null>(null);

  const openSuperMap = () => {
    setWordMapProgress(5);
    // Let the loading overlay paint before mounting the large map.
    requestAnimationFrame(() => setOpenWordMap(true));
  };

  const handleWordMapProgress = useCallback((progress: number) => {
    setWordMapProgress(progress);
    if (progress >= 100) {
      // Keep 100% visible for one painted frame, then reveal the finished map.
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
        </div>
      </div>

      {openCustomDrill && (
        <CustomDrillSheet
          wordsByList={wordsByList}
          initialListId="hsk1"
          onClose={() => setOpenCustomDrill(false)}
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
