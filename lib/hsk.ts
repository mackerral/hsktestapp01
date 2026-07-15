import { readFile } from "fs/promises";
import path from "path";
import { cache } from "react";

export type { HskWord } from "@/lib/hsk-lists";
import type { HskWord } from "@/lib/hsk-lists";

async function parseHskFile(filename: string): Promise<HskWord[]> {
  const filePath = path.join(process.cwd(), "HSKList", filename);
  const content = await readFile(filePath, "utf-8");
  const [, ...rows] = content
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);

  return rows.map((line) => {
    const [chinese, pinyin, pos, thai] = line.split("\t");
    return { chinese, pinyin, pos, thai };
  });
}

export const getHskWords = cache(async () => {
  const [hsk1, hsk2, hsk3, hsk4, hsk5, hsk6] = await Promise.all([
    parseHskFile("HSK1_Thai.txt"),
    parseHskFile("HSK2_Thai.txt"),
    parseHskFile("HSK3_Thai.txt"),
    parseHskFile("HSK4_Thai.txt"),
    parseHskFile("HSK5_Thai.txt"),
    parseHskFile("HSK6_Thai.txt"),
  ]);
  return { hsk1, hsk2, hsk3, hsk4, hsk5, hsk6 };
});

