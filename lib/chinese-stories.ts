import { readFile } from "fs/promises";
import path from "path";
import { cache } from "react";

export type StorySetId = "set1" | "set2";

export type ChineseStory = {
  id: string;
  title: string;
  paragraphs: string[];
  setId: StorySetId;
};

function isSeparator(line: string) {
  return /^[-—–─_]+\s*\d*\s*$/.test(line.trim());
}

function isTimestamp(line: string) {
  return /^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(line.trim());
}

/** Strip teaching notes like （＝你怎么样？） and tidy spacing. */
function cleanStoryLine(line: string) {
  return line
    .replace(/（＝[^）]*）/g, "")
    .replace(/\(=[^)]*\)/g, "")
    .replace(/第\s+(\S)/g, "第$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Speech attribution + optional quote, e.g. 妈妈问：“…”, 小明笑着说：“…”
 * Note: avoid bare 道： so 写道： is not treated as dialogue.
 */
const SPEECH_ATTR =
  /(?:[\u4e00-\u9fffA-Za-z·]{1,12})?(?:笑着|大声)?(?:说|问|回答|叫|喊|答)(?:道)?：/;
const SPEECH_TURN = new RegExp(SPEECH_ATTR.source + `[“"『「]?`, "g");
const SPEECH_BREAK = new RegExp(
  `([。！？；…”"』」，、])\\s*(?=${SPEECH_ATTR.source})`,
  "g",
);

/**
 * Force dialogue turns onto their own paragraphs:
 *   …准备旅行。妈妈问：“你的衣服在哪儿？”小明说：“我不知道。”
 * → …
 *   妈妈问：“你的衣服在哪儿？”
 *   小明说：“我不知道。”
 */
function splitSpeechParagraphs(paragraphs: string[]): string[] {
  const out: string[] = [];

  for (const raw of paragraphs) {
    let text = raw.trim();
    if (!text) continue;

    // Insert breaks before mid-paragraph speech attributions.
    text = text.replace(SPEECH_BREAK, "$1\n");

    // If a chunk still has multiple turns (e.g. no punct between),
    // split before each attribution after the first.
    for (const chunk of text.split("\n")) {
      const piece = chunk.trim();
      if (!piece) continue;

      const matches = [...piece.matchAll(SPEECH_TURN)];
      if (matches.length <= 1) {
        out.push(piece);
        continue;
      }

      let cursor = 0;
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        const start = m.index ?? 0;
        if (i === 0) {
          if (start > 0) out.push(piece.slice(0, start).trim());
          cursor = start;
          continue;
        }
        const prev = piece.slice(cursor, start).trim();
        if (prev) out.push(prev);
        cursor = start;
      }
      const last = piece.slice(cursor).trim();
      if (last) out.push(last);
    }
  }

  return out.filter(Boolean);
}

function parseStories(
  content: string,
  setId: StorySetId,
): ChineseStory[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (isSeparator(line)) {
      if (current.length) blocks.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current);

  const stories: ChineseStory[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const cleaned = blocks[i]
      .map((l) => cleanStoryLine(l))
      .filter((l) => l && !isTimestamp(l));
    if (!cleaned.length) continue;
    const [title, ...rest] = cleaned;
    const paragraphs = splitSpeechParagraphs(rest.filter(Boolean));
    if (!title) continue;
    stories.push({
      id: `${setId}-story-${i + 1}`,
      title: title.replace(/^《|》$/g, ""),
      paragraphs: paragraphs.length ? paragraphs : [title],
      setId,
    });
  }
  return stories;
}

export const getChineseStories = cache(async (): Promise<ChineseStory[]> => {
  const dir = path.join(process.cwd(), "HSKList");
  const [set1Raw, set2Raw] = await Promise.all([
    readFile(path.join(dir, "chinese story.txt"), "utf-8"),
    readFile(path.join(dir, "chinese story2.txt"), "utf-8"),
  ]);

  const set1 = parseStories(set1Raw, "set1").slice(0, 21);
  const set2 = parseStories(set2Raw, "set2");
  return [...set1, ...set2];
});
