import type { HskWord, ListId } from "@/lib/hsk-lists";
import { HSK_LISTS } from "@/lib/hsk-lists";
import { applyExtraVocab } from "@/lib/story-extra-vocab";

export type VocabEntry = {
  pinyin: string;
  thai: string;
  /** HSK level 1–6; null if not in lists (may still have pinyin/thai) */
  level: number | null;
  /** Canonical HSK list key (display / badge) */
  lemma: string;
  /** List-row ids this surface form covers, e.g. "hsk1:34" */
  entryIds: string[];
};

export type StoryToken = {
  text: string;
  pinyin: string;
  thai: string;
  level: number | null;
  lemma: string;
  entryIds: string[];
  isWord: boolean;
};

const CJK = /[\u4e00-\u9fff]/;

/** Expand 没（有） → 没 / 没有, with matching pinyin variants. */
function expandParenForms(
  chinese: string,
  pinyin: string,
): { chinese: string; pinyin: string }[] {
  const cm = chinese.match(/（([^）]*)）/);
  if (!cm || cm.index == null) {
    return [{ chinese, pinyin: cleanPinyin(pinyin) }];
  }
  const before = chinese.slice(0, cm.index);
  const opt = cm[1];
  const after = chinese.slice(cm.index + cm[0].length);

  const withOpt = expandParenForms(before + opt + after, includePinyinOpt(pinyin));
  const withoutOpt = expandParenForms(
    before + after,
    excludePinyinOpt(pinyin),
  );
  const seen = new Set<string>();
  const out: { chinese: string; pinyin: string }[] = [];
  for (const row of [...withOpt, ...withoutOpt]) {
    if (!row.chinese || seen.has(row.chinese)) continue;
    seen.add(row.chinese);
    out.push(row);
  }
  return out;
}

function includePinyinOpt(pinyin: string) {
  return cleanPinyin(pinyin.replace(/[()]/g, ""));
}

function excludePinyinOpt(pinyin: string) {
  return cleanPinyin(pinyin.replace(/\([^)]*\)/g, ""));
}

function cleanPinyin(pinyin: string) {
  return pinyin.replace(/\s+/g, " ").trim();
}

function surfaceForms(chinese: string): string[] {
  const forms = expandParenForms(chinese, "").map((f) => f.chinese);
  const out = new Set<string>();
  for (const form of forms) {
    if (!form) continue;
    out.add(form);
    if (form.endsWith("儿") && form.length > 1) out.add(form.slice(0, -1));
  }
  return [...out];
}

/**
 * Build vocab for segmentation + exact list-row coverage ids.
 * Level badge prefers the lowest HSK level when forms overlap.
 */
export function buildVocabMap(
  wordsByList: Record<ListId, HskWord[]>,
): Map<string, VocabEntry> {
  const map = new Map<string, VocabEntry>();

  // Pass 1: register every list row id onto all of its surface forms.
  for (const list of HSK_LISTS) {
    const words = wordsByList[list.id] ?? [];
    words.forEach((w, index) => {
      if (!w.chinese) return;
      const entryId = `${list.id}:${index}`;
      const forms = expandParenForms(w.chinese, w.pinyin);
      const pinyinByForm = new Map(forms.map((f) => [f.chinese, f.pinyin]));
      for (const form of surfaceForms(w.chinese)) {
        const existing = map.get(form);
        if (!existing) {
          map.set(form, {
            pinyin: pinyinByForm.get(form) ?? cleanPinyin(w.pinyin),
            thai: w.thai,
            level: list.level,
            lemma: w.chinese,
            entryIds: [entryId],
          });
        } else {
          if (!existing.entryIds.includes(entryId)) {
            existing.entryIds.push(entryId);
          }
          // Prefer lowest level for badge / lemma display.
          if (list.level < (existing.level ?? 99)) {
            existing.level = list.level;
            existing.lemma = w.chinese;
            existing.pinyin = pinyinByForm.get(form) ?? cleanPinyin(w.pinyin);
            existing.thai = w.thai;
          }
        }
      }
    });
  }

  applyExtraVocab(map);
  return map;
}

/** Longest-match dictionary segmentation for Chinese text. */
export function segmentChinese(
  text: string,
  vocab: Map<string, VocabEntry>,
  maxLen = 8,
): StoryToken[] {
  const tokens: StoryToken[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (!CJK.test(ch)) {
      let j = i + 1;
      while (j < text.length && !CJK.test(text[j])) j++;
      tokens.push({
        text: text.slice(i, j),
        pinyin: "",
        thai: "",
        level: null,
        lemma: "",
        entryIds: [],
        isWord: false,
      });
      i = j;
      continue;
    }

    let matched = false;
    const end = Math.min(text.length, i + maxLen);
    for (let len = end - i; len >= 1; len--) {
      const slice = text.slice(i, i + len);
      const entry = vocab.get(slice);
      if (entry) {
        tokens.push({
          text: slice,
          pinyin: entry.pinyin,
          thai: entry.thai,
          level: entry.level,
          lemma: entry.lemma,
          entryIds: entry.entryIds,
          isWord: true,
        });
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push({
        text: ch,
        pinyin: "",
        thai: "",
        level: null,
        lemma: ch,
        entryIds: [],
        isWord: true,
      });
      i += 1;
    }
  }
  return tokens;
}

export type StoryLevelCounts = {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
  6: number;
  unknown: number;
  total: number;
};

const LIST_LEVEL: Record<string, number> = {
  hsk1: 1,
  hsk2: 2,
  hsk3: 3,
  hsk4: 4,
  hsk5: 5,
  hsk6: 6,
};

/** Exact unique counts by HSK list row (H1 max 300, H2 max 200). */
export function countStoryLevels(
  paragraphs: string[],
  vocab: Map<string, VocabEntry>,
): StoryLevelCounts {
  const counts: StoryLevelCounts = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    unknown: 0,
    total: 0,
  };
  const seenEntries = new Set<string>();
  const seenUnknown = new Set<string>();

  for (const para of paragraphs) {
    for (const tok of segmentChinese(para, vocab)) {
      if (!tok.isWord) continue;

      if (tok.entryIds.length > 0) {
        for (const id of tok.entryIds) {
          if (seenEntries.has(id)) continue;
          seenEntries.add(id);
          const listId = id.split(":")[0];
          const level = LIST_LEVEL[listId];
          if (level) {
            counts[level as 1 | 2 | 3 | 4 | 5 | 6] += 1;
            counts.total += 1;
          }
        }
      } else {
        const key = tok.text;
        if (seenUnknown.has(key)) continue;
        seenUnknown.add(key);
        counts.unknown += 1;
        counts.total += 1;
      }
    }
  }
  return counts;
}

export function countStoriesLevels(
  stories: { paragraphs: string[] }[],
  vocab: Map<string, VocabEntry>,
): StoryLevelCounts {
  return countStoryLevels(
    stories.flatMap((s) => s.paragraphs),
    vocab,
  );
}
