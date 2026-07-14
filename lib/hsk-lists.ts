export type ListId = "hsk1" | "hsk2" | "hsk3" | "hsk4" | "hsk5" | "hsk6";
export type Status = "known" | "unknown";
export type StatusMap = Record<string, Status>;

export interface HskWord {
  chinese: string;
  pinyin: string;
  pos: string;
  thai: string;
}

export const HSK_LISTS: { id: ListId; label: string; level: number }[] = [
  { id: "hsk1", label: "HSK 1", level: 1 },
  { id: "hsk2", label: "HSK 2", level: 2 },
  { id: "hsk3", label: "HSK 3", level: 3 },
  { id: "hsk4", label: "HSK 4", level: 4 },
  { id: "hsk5", label: "HSK 5", level: 5 },
  { id: "hsk6", label: "HSK 6", level: 6 },
];

export function isListId(value: string): value is ListId {
  return HSK_LISTS.some((list) => list.id === value);
}

export function statusStorageKey(listId: ListId) {
  return `hsk-status:${listId}`;
}

export function loadStatus(listId: ListId): StatusMap {
  try {
    const saved = localStorage.getItem(statusStorageKey(listId));
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export function wordId(chinese: string, pinyin: string, index: number) {
  return `${chinese}-${pinyin}-${index}`;
}

export function getListProgress(
  words: { chinese: string; pinyin: string }[],
  status: StatusMap,
) {
  const total = words.length;
  let known = 0;
  let needReview = 0;
  for (let i = 0; i < words.length; i++) {
    const id = wordId(words[i].chinese, words[i].pinyin, i);
    if (status[id] === "known") known++;
    else if (status[id] === "unknown") needReview++;
  }
  const percent = total === 0 ? 0 : Math.round((known / total) * 100);
  return { total, known, needReview, percent };
}
