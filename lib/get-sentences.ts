import { readFile } from "fs/promises";
import path from "path";
import { cache } from "react";
import { parseSentenceFile, type SentenceLevelGroup } from "@/lib/sentences";

export type { SentenceLevelGroup };

const SENTENCE_FILES = [
  "sentences-hsk1.txt",
  "sentences-hsk2.txt",
  "sentences-hsk3.txt",
] as const;

export const getSentenceGroups = cache(async (): Promise<SentenceLevelGroup[]> => {
  const dir = path.join(process.cwd(), "HSKList");
  const contents = await Promise.all(
    SENTENCE_FILES.map((name) => readFile(path.join(dir, name), "utf-8")),
  );

  const byLevel = new Map<number, SentenceLevelGroup>();
  for (const content of contents) {
    for (const group of parseSentenceFile(content)) {
      const existing = byLevel.get(group.level);
      if (!existing) {
        byLevel.set(group.level, group);
        continue;
      }
      byLevel.set(group.level, {
        ...existing,
        cards: [...existing.cards, ...group.cards].map((card, i) => ({
          ...card,
          index: i + 1,
          id: `hsk${group.level}-card-${i + 1}`,
        })),
        sentenceCount:
          existing.sentenceCount + group.sentenceCount,
      });
    }
  }

  return [1, 2, 3]
    .map((level) => byLevel.get(level))
    .filter((g): g is SentenceLevelGroup => Boolean(g));
});
