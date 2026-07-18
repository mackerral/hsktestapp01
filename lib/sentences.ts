export type SentenceLevel = 1 | 2 | 3;

export type SentenceItem = {
  chinese: string;
  thai: string;
};

export type SentenceCard = {
  id: string;
  level: SentenceLevel;
  index: number;
  title: string;
  titleThai: string;
  sentences: SentenceItem[];
};

export type SentenceLevelGroup = {
  level: SentenceLevel;
  label: string;
  cards: SentenceCard[];
  sentenceCount: number;
};

type RawCard = { title: string; titleThai: string; sentences: SentenceItem[] };

const MAX_SENTENCES_PER_CARD = 8;

export function parseSentenceFile(content: string): SentenceLevelGroup[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const byLevel = new Map<SentenceLevel, RawCard[]>();
  let level: SentenceLevel | null = null;
  let current: RawCard | null = null;

  const pushCard = () => {
    if (level == null || !current?.sentences.length) return;
    const list = byLevel.get(level) ?? [];
    if (!current.title) current.title = `เรื่องที่ ${list.length + 1}`;
    list.push(current);
    byLevel.set(level, list);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("@level")) {
      pushCard();
      const n = Number(line.replace("@level", "").trim());
      if (n === 1 || n === 2 || n === 3) level = n;
      continue;
    }
    if (line.startsWith("@card")) {
      pushCard();
      current = { title: "", titleThai: "", sentences: [] };
      continue;
    }
    if (line.startsWith("@title") && current) {
      const rawTitle = line.replace("@title", "").trim();
      const pipe = rawTitle.indexOf("|");
      if (pipe >= 0) {
        current.title = rawTitle.slice(0, pipe).trim();
        current.titleThai = rawTitle.slice(pipe + 1).trim();
      } else {
        current.title = rawTitle;
        current.titleThai = "";
      }
      continue;
    }
    if (current) {
      const pipe = line.indexOf("|");
      if (pipe >= 0) {
        current.sentences.push({
          chinese: line.slice(0, pipe).trim(),
          thai: line.slice(pipe + 1).trim(),
        });
      } else {
        current.sentences.push({ chinese: line, thai: "" });
      }
      if (current.sentences.length > MAX_SENTENCES_PER_CARD) {
        current.sentences = current.sentences.slice(0, MAX_SENTENCES_PER_CARD);
      }
    }
  }
  pushCard();

  const groups: SentenceLevelGroup[] = [];
  for (const lv of [1, 2, 3] as const) {
    const cardsRaw = byLevel.get(lv) ?? [];
    const cards: SentenceCard[] = cardsRaw.map((card, i) => ({
      id: `hsk${lv}-card-${i + 1}`,
      level: lv,
      index: i + 1,
      title: card.title,
      titleThai: card.titleThai,
      sentences: card.sentences,
    }));
    groups.push({
      level: lv,
      label: `HSK ${lv}`,
      cards,
      sentenceCount: cards.reduce((n, c) => n + c.sentences.length, 0),
    });
  }
  return groups;
}

export function sentenceStatusKey(level: SentenceLevel) {
  return `hsk-sentence-status:hsk${level}`;
}

export function sentenceItemId(cardId: string, index: number) {
  return `${cardId}:${index}`;
}
