"use client";

import { BookOpen } from "lucide-react";

const STORY_LEVELS = [0, 1, 2, 3, 4];

export function StoryReaderMenu() {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto px-6 py-6">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Story Reader</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Read graded Chinese stories by level.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {STORY_LEVELS.map((level) => (
            <div
              key={level}
              className="rounded-xl border border-border bg-background p-5 text-left opacity-80"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold tracking-tight">
                    Level {level}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Coming soon
                  </div>
                </div>
                <BookOpen className="mt-1 size-5 text-muted-foreground" />
              </div>
              <div className="mt-4 rounded-md bg-muted px-2.5 py-1.5 text-center text-xs font-medium text-muted-foreground">
                Coming soon
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
