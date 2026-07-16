"use client";

import { useState } from "react";
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
            onClick={() => setOpenWordMap(true)}
            className="rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40 sm:p-5"
          >
            <div className="text-lg font-semibold tracking-tight sm:text-xl">
              HSK Words Visualized
            </div>
            <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
              HSK 1–6 ทั้งชุดในหน้าเดียว · สีตามระดับ · สุ่มได้
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
          onClose={() => setOpenWordMap(false)}
        />
      )}
    </div>
  );
}
