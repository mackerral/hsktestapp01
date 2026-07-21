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

/** e.g. [1,2,3,5,6] → "HSK 1-3, 5-6"; [3] → "HSK 3" */
export function formatHskLevelLabel(levels: number[]): string {
  const sorted = [...new Set(levels.filter((n) => Number.isFinite(n)))].sort(
    (a, b) => a - b,
  );
  if (!sorted.length) return "HSK";

  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let index = 1; index < sorted.length; index++) {
    const next = sorted[index];
    if (next === prev + 1) {
      prev = next;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = next;
    prev = next;
  }
  parts.push(start === prev ? `${start}` : `${start}-${prev}`);

  return `HSK ${parts.join(", ")}`;
}

export function hskLevelsWithWords(
  wordsByList: Partial<Record<ListId, HskWord[]>>,
) {
  return HSK_LISTS.filter(
    (list) => (wordsByList[list.id]?.length ?? 0) > 0,
  ).map((list) => list.level);
}

export function isListId(value: string): value is ListId {
  return HSK_LISTS.some((list) => list.id === value);
}

export function statusStorageKey(listId: ListId) {
  return `hsk-status:${listId}`;
}

export function pencilStorageKey(listId: ListId) {
  return `hsk-pencil:${listId}`;
}

const TRACK_ENABLED_KEY = "hsk-track-enabled";

/** When false, known/unknown status cannot be changed (sound still works). */
export function loadTrackEnabled(): boolean {
  try {
    const raw = localStorage.getItem(TRACK_ENABLED_KEY);
    if (raw === null) return true;
    return raw !== "0" && raw !== "false";
  } catch {
    return true;
  }
}

export function saveTrackEnabled(enabled: boolean) {
  try {
    localStorage.setItem(TRACK_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

export type PencilMap = Record<string, true>;

export function loadPencilMarks(listId: ListId): PencilMap {
  try {
    const raw = localStorage.getItem(pencilStorageKey(listId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: PencilMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (value) next[id] = true;
    }
    return next;
  } catch {
    return {};
  }
}

export function savePencilMarks(listId: ListId, marks: PencilMap) {
  localStorage.setItem(pencilStorageKey(listId), JSON.stringify(marks));
}

/** Wipe all app localStorage (status + quiz settings). Called after version bump. */
export function clearHskLocalStorage() {
  if (typeof window === "undefined") return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("hsk-") || key.startsWith("hsk"))) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) localStorage.removeItem(key);
}

const HSK_STORAGE_EPOCH = "hsk-storage-epoch";
const HSK_STORAGE_EPOCH_VALUE = "2026-07-15-reset";

/** One-shot: clear saved status/settings when epoch changes. */
export function resetHskStorageIfNeeded() {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(HSK_STORAGE_EPOCH) === HSK_STORAGE_EPOCH_VALUE) {
      return;
    }
    clearHskLocalStorage();
    localStorage.setItem(HSK_STORAGE_EPOCH, HSK_STORAGE_EPOCH_VALUE);
  } catch {
    // ignore quota / private mode
  }
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
