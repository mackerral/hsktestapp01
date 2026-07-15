"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  getListProgress,
  HSK_LISTS,
  loadStatus,
  type HskWord,
  type ListId,
  type StatusMap,
} from "@/lib/hsk-lists";

export function HskMenu({
  wordsByList,
  onSelectList,
}: {
  wordsByList: Record<ListId, HskWord[]>;
  onSelectList: (listId: ListId) => void;
}) {
  const [statusByList, setStatusByList] = useState<Record<ListId, StatusMap>>({
    hsk1: {},
    hsk2: {},
    hsk3: {},
    hsk4: {},
    hsk5: {},
    hsk6: {},
  });

  useEffect(() => {
    setStatusByList({
      hsk1: loadStatus("hsk1"),
      hsk2: loadStatus("hsk2"),
      hsk3: loadStatus("hsk3"),
      hsk4: loadStatus("hsk4"),
      hsk5: loadStatus("hsk5"),
      hsk6: loadStatus("hsk6"),
    });
  }, []);

  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-4 py-6 sm:px-6">
        <div className="mb-4 text-center sm:mb-5">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            HSK Tracker
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Pick a level to practice
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {HSK_LISTS.map((list) => {
            const progress = getListProgress(
              wordsByList[list.id],
              statusByList[list.id],
            );

            return (
              <button
                key={list.id}
                type="button"
                onClick={() => onSelectList(list.id)}
                className="group rounded-xl border border-border bg-background px-3 py-3 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40 sm:px-4 sm:py-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-base font-semibold tracking-tight sm:text-lg">
                      {list.label}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">
                      {progress.known}/{progress.total} จำได้
                      {progress.needReview > 0
                        ? ` · ${progress.needReview} จำไม่ได้`
                        : ""}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground sm:size-5" />
                </div>

                <div className="mt-2.5">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground sm:text-[11px]">
                    <span>Progress</span>
                    <span className="font-medium text-foreground">
                      {progress.percent}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground transition-[width] duration-300"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
