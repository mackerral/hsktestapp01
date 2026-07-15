"use client";

import { useState } from "react";
import { HskMenu } from "@/components/hsk-menu";
import { HskChecker } from "@/components/hsk-checker";
import type { HskWord, ListId } from "@/lib/hsk-lists";

export function HskApp({
  wordsByList,
}: {
  wordsByList: Record<ListId, HskWord[]>;
}) {
  const [activeList, setActiveList] = useState<ListId | null>(null);

  if (!activeList) {
    return (
      <HskMenu
        wordsByList={wordsByList}
        onSelectList={setActiveList}
      />
    );
  }

  return (
    <HskChecker
      listId={activeList}
      words={wordsByList[activeList]}
      onBack={() => setActiveList(null)}
    />
  );
}
