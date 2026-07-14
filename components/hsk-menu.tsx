"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
}: {
  wordsByList: Record<ListId, HskWord[]>;
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
    <div className="flex min-h-dvh w-full items-center justify-center px-6 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">HSK Checker</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a level to practice. Progress saves on this device.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {HSK_LISTS.map((list) => {
            const progress = getListProgress(
              wordsByList[list.id],
              statusByList[list.id],
            );

            return (
              <Link
                key={list.id}
                href={`/hsk/${list.id}`}
                className="group rounded-xl border border-border bg-background p-5 transition-colors hover:border-foreground/30 hover:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold tracking-tight">
                      {list.label}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {progress.known} / {progress.total} known
                      {progress.needReview > 0
                        ? ` · ${progress.needReview} need review`
                        : ""}
                    </div>
                  </div>
                  <ChevronRight className="mt-1 size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span className="font-medium text-foreground">
                      {progress.percent}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground transition-[width] duration-300"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
