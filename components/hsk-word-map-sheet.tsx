"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Dices, Download, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  HSK_LISTS,
  type HskWord,
  type ListId,
} from "@/lib/hsk-lists";

/** Colors sampled from hsk-words-visualized.pdf */
const LEVEL_COLORS: Record<
  ListId,
  { bg: string; ink: string; label: string }
> = {
  hsk1: { bg: "#f8b51e", ink: "#1a1a1a", label: "HSK 1" },
  hsk2: { bg: "#fd4f1c", ink: "#ffffff", label: "HSK 2" },
  hsk3: { bg: "#bb1718", ink: "#ffffff", label: "HSK 3" },
  hsk4: { bg: "#267f94", ink: "#ffffff", label: "HSK 4" },
  hsk5: { bg: "#1b3e76", ink: "#ffffff", label: "HSK 5" },
  hsk6: { bg: "#6a348a", ink: "#ffffff", label: "HSK 6" },
};

type MapItem = {
  chinese: string;
  listId: ListId;
};

/**
 * Layout:
 *   1 on 2 on 3 · 4 beside 123 · 5 under 1234 · 6 beside 4+5
 */
const PAGE_W = 3200;
const PAD = 10;
const PREVIEW_SCALE = 0.2;
/** Same square cell for every word (like the reference PDF). */
const CELL = 32;

/** Strip () / （）, digits, and any text inside parentheses. */
function cleanChinese(raw: string) {
  return raw
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[()（）]/g, "")
    .replace(/[0-9０-９]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function shuffleSeeded<T>(items: T[], seed: number): T[] {
  const a = [...items];
  let s = seed || 1;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Uniform cells → balance columns by word count. */
function wordMass(items: MapItem[]) {
  return items.length || 1;
}

function rowsFor(count: number, cols: number) {
  return Math.ceil(Math.max(1, count) / Math.max(1, cols));
}

/** 3×5 pixel digits — painted onto existing word cells (no reserved slots). */
const DIGIT_W = 3;
const DIGIT_H = 5;
const DIGIT_PIXELS: Record<number, number[][]> = {
  1: [
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
  2: [
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
  ],
  3: [
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  4: [
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  5: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  6: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
};

/** Same as rowsFor — digit is painted on words, not extra cells. */
function rowsForLevel(count: number, cols: number) {
  return rowsFor(count, cols);
}

function emptyInLastRow(count: number, cols: number) {
  if (count <= 0 || cols <= 0) return 0;
  const rem = count % cols;
  return rem === 0 ? 0 : cols - rem;
}

type ColLayout = {
  totalCols: number;
  cols123: number;
  cols4: number;
  colsLeft: number;
  cols6: number;
};

/** Pick column split (÷5) so section heights match — no white holes. */
function pickColLayout(
  m1: number,
  m2: number,
  m3: number,
  m4: number,
  m5: number,
  m6: number,
): ColLayout {
  const COL_STEP = 5;
  const maxFit = Math.floor((PAGE_W - PAD * 2) / CELL);
  const totalCols = Math.max(20, Math.floor(maxFit / COL_STEP) * COL_STEP);

  let best: ColLayout = {
    totalCols,
    cols123: 10,
    cols4: 10,
    colsLeft: 20,
    cols6: totalCols - 20,
  };
  let bestScore = Number.POSITIVE_INFINITY;

  for (let cols6 = COL_STEP; cols6 <= totalCols - 10; cols6 += COL_STEP) {
    const colsLeft = totalCols - cols6;
    for (
      let cols123 = COL_STEP;
      cols123 <= colsLeft - COL_STEP;
      cols123 += COL_STEP
    ) {
      const cols4 = colsLeft - cols123;
      const h123 =
        rowsForLevel(m1, cols123) +
        rowsForLevel(m2, cols123) +
        rowsForLevel(m3, cols123);
      const h4 = rowsForLevel(m4, cols4);
      const topGap = Math.abs(h123 - h4);
      const hTop = Math.max(h123, h4);
      const h5 = rowsForLevel(m5, colsLeft);
      const hLeft = hTop + h5;
      const h6 = rowsForLevel(m6, cols6);
      const sideGap = Math.abs(hLeft - h6);

      // Height match is everything — giant middle white comes from gaps here.
      const score = topGap * 100 + sideGap * 80 + emptyInLastRow(m4, cols4) * 0.01;

      if (score < bestScore) {
        bestScore = score;
        best = { totalCols, cols123, cols4, colsLeft, cols6 };
      }
    }
  }

  return best;
}

function LevelBlock({
  listId,
  items,
  cols,
  height,
}: {
  listId: ListId;
  items: MapItem[];
  cols: number;
  /** Exact pixel height to fill — row heights grow to match (no white). */
  height: number;
}) {
  const width = cols * CELL;
  const levelNum = Number(listId.replace("hsk", "")) || 1;
  const pattern = DIGIT_PIXELS[levelNum] ?? DIGIT_PIXELS[1];
  const rowCount = Math.max(1, rowsFor(items.length, cols));
  const rowHeight = height / rowCount;

  const tone = LEVEL_COLORS[listId];
  const line =
    tone.ink === "#ffffff" ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.22)";

  // Center the 3×5 digit over the filled word grid.
  const usedRows = rowCount;
  const digitOriginCol = Math.max(0, Math.floor((cols - DIGIT_W) / 2));
  const digitOriginRow = Math.max(0, Math.floor((usedRows - DIGIT_H) / 2));

  function isDigitPixel(col: number, row: number) {
    const dr = row - digitOriginRow;
    const dc = col - digitOriginCol;
    if (dr < 0 || dc < 0 || dr >= DIGIT_H || dc >= DIGIT_W) return false;
    return pattern[dr]?.[dc] === 1;
  }

  const rem = items.length % cols;
  const fullCount = rem === 0 ? items.length : items.length - rem;
  const fullItems = items.slice(0, fullCount);
  const lastItems = items.slice(fullCount);
  const fullRows = Math.floor(fullCount / cols);
  const lastCellW = lastItems.length > 0 ? width / lastItems.length : CELL;

  return (
    <div
      style={{
        boxSizing: "border-box",
        width,
        height,
        backgroundColor: "transparent",
        overflow: "hidden",
      }}
      title={LEVEL_COLORS[listId].label}
    >
      {fullItems.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, ${CELL}px)`,
            gridTemplateRows: `repeat(${fullRows}, ${rowHeight}px)`,
          }}
        >
          {fullItems.map((item, i) => {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const digit = isDigitPixel(col, row);
            return (
              <div
                key={`${listId}-${item.chinese}-${i}`}
                style={{
                  boxSizing: "border-box",
                  width: CELL,
                  height: rowHeight,
                  borderRight: `1px solid ${digit ? "rgba(0,0,0,0.2)" : line}`,
                  borderBottom: `1px solid ${digit ? "rgba(0,0,0,0.2)" : line}`,
                  backgroundColor: digit ? "#ffffff" : tone.bg,
                  overflow: "hidden",
                }}
                title={`${tone.label} · ${item.chinese}`}
              >
                <WordGlyphs
                  chinese={item.chinese}
                  color={digit ? "#000000" : tone.ink}
                />
              </div>
            );
          })}
        </div>
      )}
      {lastItems.length > 0 && (
        <div style={{ display: "flex", width, height: rowHeight }}>
          {lastItems.map((item, i) => {
            const row = fullRows;
            // Stretched last row: map to approx column for digit hit-test.
            const col = Math.min(
              cols - 1,
              Math.floor(((i + 0.5) * cols) / lastItems.length),
            );
            const digit = isDigitPixel(col, row);
            const chars = Array.from(item.chinese).length;
            const singleLine =
              lastCellW >= Math.max(CELL, chars * 14 + 8);
            return (
              <div
                key={`${listId}-${item.chinese}-last-${i}`}
                style={{
                  boxSizing: "border-box",
                  flex: "1 1 0",
                  minWidth: 0,
                  height: rowHeight,
                  borderRight: `1px solid ${digit ? "rgba(0,0,0,0.2)" : line}`,
                  borderBottom: `1px solid ${digit ? "rgba(0,0,0,0.2)" : line}`,
                  backgroundColor: digit ? "#ffffff" : tone.bg,
                  overflow: "hidden",
                }}
                title={`${tone.label} · ${item.chinese}`}
              >
                <WordGlyphs
                  chinese={item.chinese}
                  color={digit ? "#000000" : tone.ink}
                  singleLine={singleLine}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WordGlyphs({
  chinese,
  color,
  singleLine = false,
}: {
  chinese: string;
  color: string;
  singleLine?: boolean;
}) {
  const chars = Array.from(chinese);
  const n = chars.length;
  const fontSize = n <= 1 ? 15 : n === 2 ? 13 : n === 3 ? 12 : 11;

  // Stretched cell with enough width → all characters on one horizontal line.
  if (singleLine) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          whiteSpace: "nowrap",
          fontSize: n <= 2 ? 14 : 13,
          fontWeight: 600,
          lineHeight: 1,
          color,
          letterSpacing: 0,
        }}
      >
        {chinese}
      </div>
    );
  }

  const glyph = (ch: string, key: number) => (
    <span
      key={key}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        fontSize,
        fontWeight: 600,
        lineHeight: 1,
        color,
      }}
    >
      {ch}
    </span>
  );

  // 1 char → centered
  if (n <= 1) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
        }}
      >
        {glyph(chars[0] ?? "", 0)}
      </div>
    );
  }

  // 2 char → 2 columns
  if (n === 2) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          width: "100%",
          height: "100%",
        }}
      >
        {glyph(chars[0], 0)}
        {glyph(chars[1], 1)}
      </div>
    );
  }

  // 3 char → 2 on top, 3rd on new row centered
  if (n === 3) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          width: "100%",
          height: "100%",
        }}
      >
        {glyph(chars[0], 0)}
        {glyph(chars[1], 1)}
        <div
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "50%",
              height: "100%",
              fontSize,
              fontWeight: 600,
              lineHeight: 1,
              color,
            }}
          >
            {chars[2]}
          </span>
        </div>
      </div>
    );
  }

  // 4 char → 2 columns × 2 rows; longer words keep 2-col wrap
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: `repeat(${Math.ceil(n / 2)}, 1fr)`,
        width: "100%",
        height: "100%",
      }}
    >
      {chars.map((ch, i) => {
        const isLastOdd = n % 2 === 1 && i === n - 1;
        if (isLastOdd) {
          return (
            <div
              key={i}
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "50%",
                  height: "100%",
                  fontSize,
                  fontWeight: 600,
                  lineHeight: 1,
                  color,
                }}
              >
                {ch}
              </span>
            </div>
          );
        }
        return glyph(ch, i);
      })}
    </div>
  );
}

function VisualizedPage({
  byLevel,
  shuffled,
}: {
  byLevel: Record<ListId, MapItem[]>;
  shuffled: boolean;
}) {
  const m1 = wordMass(byLevel.hsk1);
  const m2 = wordMass(byLevel.hsk2);
  const m3 = wordMass(byLevel.hsk3);
  const m4 = wordMass(byLevel.hsk4);
  const m5 = wordMass(byLevel.hsk5);
  const m6 = wordMass(byLevel.hsk6);

  const { totalCols, cols123, cols4, colsLeft, cols6 } = pickColLayout(
    m1,
    m2,
    m3,
    m4,
    m5,
    m6,
  );

  const r1 = rowsForLevel(m1, cols123);
  const r2 = rowsForLevel(m2, cols123);
  const r3 = rowsForLevel(m3, cols123);
  const r123 = r1 + r2 + r3;
  const r4 = rowsForLevel(m4, cols4);
  const topRows = Math.max(r123, r4);
  const r5 = rowsForLevel(m5, colsLeft);
  const r6 = rowsForLevel(m6, cols6);
  const leftRows = topRows + r5;
  const bodyRows = Math.max(leftRows, r6);
  const bodyH = bodyRows * CELL;

  // Fill a solid rectangle — stretch shorter sections by growing row height.
  const topH = topRows * CELL;
  const h5H = (bodyRows - topRows) * CELL; // absorbs extra if right side taller
  const h6H = bodyH;

  const h1H = topH * (r1 / Math.max(1, r123));
  const h2H = topH * (r2 / Math.max(1, r123));
  const h3H = topH * (r3 / Math.max(1, r123));
  const h4H = topH;

  const w123 = cols123 * CELL;
  const w4 = cols4 * CELL;
  const wLeft = colsLeft * CELL;
  const w6 = cols6 * CELL;

  return (
    <div
      data-map-page
      style={{
        boxSizing: "border-box",
        width: PAD * 2 + totalCols * CELL,
        height: "auto",
        backgroundColor: "#ffffff",
        overflow: "visible",
        fontFamily:
          '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Segoe UI", sans-serif',
        padding: PAD,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          color: "#171717",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          HSK Tracker · Words Visualized · HSK 1–6
          {shuffled ? " · สุ่มในแต่ละระดับ" : ""}
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {HSK_LISTS.map((list) => (
            <span
              key={list.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  backgroundColor: LEVEL_COLORS[list.id].bg,
                  display: "inline-block",
                }}
              />
              {list.label}
              <span style={{ color: "#737373", fontWeight: 500 }}>
                {byLevel[list.id].length}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          width: totalCols * CELL,
          height: bodyH,
          gap: 0,
        }}
      >
        <div
          style={{
            width: wLeft,
            height: bodyH,
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              height: topH,
              gap: 0,
            }}
          >
            <div
              style={{
                width: w123,
                height: topH,
                display: "flex",
                flexDirection: "column",
                gap: 0,
              }}
            >
              <LevelBlock
                listId="hsk1"
                items={byLevel.hsk1}
                cols={cols123}
                height={h1H}
              />
              <LevelBlock
                listId="hsk2"
                items={byLevel.hsk2}
                cols={cols123}
                height={h2H}
              />
              <LevelBlock
                listId="hsk3"
                items={byLevel.hsk3}
                cols={cols123}
                height={h3H}
              />
            </div>
            <LevelBlock
              listId="hsk4"
              items={byLevel.hsk4}
              cols={cols4}
              height={h4H}
            />
          </div>
          <LevelBlock
            listId="hsk5"
            items={byLevel.hsk5}
            cols={colsLeft}
            height={h5H}
          />
        </div>

        <LevelBlock
          listId="hsk6"
          items={byLevel.hsk6}
          cols={cols6}
          height={h6H}
        />
      </div>
    </div>
  );
}

export function HskWordMapSheet({
  wordsByList,
  onClose,
}: {
  wordsByList: Record<ListId, HskWord[]>;
  initialListId?: ListId;
  onClose: () => void;
}) {
  const [shuffleOn, setShuffleOn] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageH, setPageH] = useState(1800);
  const pageRef = useRef<HTMLDivElement>(null);
  const previewMeasureRef = useRef<HTMLDivElement>(null);

  const baseByLevel = useMemo(() => {
    const map = {} as Record<ListId, MapItem[]>;
    for (const list of HSK_LISTS) {
      const items: MapItem[] = [];
      for (const word of wordsByList[list.id] ?? []) {
        const chinese = cleanChinese(word.chinese);
        if (!chinese) continue;
        items.push({ chinese, listId: list.id });
      }
      // 1-char → 2-char → 3-char → 4-char (+ longer last)
      items.sort(
        (a, b) =>
          Array.from(a.chinese).length - Array.from(b.chinese).length ||
          a.chinese.localeCompare(b.chinese, "zh"),
      );
      map[list.id] = items;
    }
    return map;
  }, [wordsByList]);

  const byLevel = useMemo(() => {
    if (!shuffleOn) return baseByLevel;
    const map = {} as Record<ListId, MapItem[]>;
    HSK_LISTS.forEach((list, i) => {
      // Keep length groups in order; shuffle only within each length.
      const byLen = new Map<number, MapItem[]>();
      for (const item of baseByLevel[list.id]) {
        const len = Array.from(item.chinese).length;
        const bucket = byLen.get(len) ?? [];
        bucket.push(item);
        byLen.set(len, bucket);
      }
      const ordered: MapItem[] = [];
      [...byLen.keys()]
        .sort((a, b) => a - b)
        .forEach((len, j) => {
          ordered.push(
            ...shuffleSeeded(byLen.get(len)!, shuffleSeed + i * 17 + j * 31),
          );
        });
      map[list.id] = ordered;
    });
    return map;
  }, [baseByLevel, shuffleOn, shuffleSeed]);

  const total = useMemo(
    () => HSK_LISTS.reduce((sum, list) => sum + byLevel[list.id].length, 0),
    [byLevel],
  );

  useLayoutEffect(() => {
    const root = previewMeasureRef.current;
    if (!root) return;
    const page = root.querySelector<HTMLElement>("[data-map-page]");
    if (!page) return;

    const update = () => setPageH(Math.max(400, page.offsetHeight));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(page);
    return () => ro.disconnect();
  }, [byLevel]);

  function reshuffle() {
    setShuffleOn(true);
    setShuffleSeed((s) => s + 1);
  }

  async function downloadPdf() {
    if (!pageRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const node = pageRef.current.querySelector<HTMLElement>("[data-map-page]");
      if (!node) throw new Error("ไม่มีหน้าที่จะพิมพ์");

      const width = node.offsetWidth;
      const height = node.scrollHeight;

      const canvas = await html2canvas(node, {
        scale: 1.5,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        onclone: (clonedDoc, element) => {
          clonedDoc
            .querySelectorAll('style, link[rel="stylesheet"]')
            .forEach((n) => n.remove());
          element.style.color = "#171717";
          element.style.backgroundColor = "#ffffff";
          element.style.overflow = "visible";
          element.style.height = "auto";
        },
      });

      const img = canvas.toDataURL("image/jpeg", 0.92);
      const pdfW = 420;
      const pdfH = Math.max(1, Math.round((pdfW * height) / width));
      const pdf = new jsPDF({
        orientation: pdfW >= pdfH ? "landscape" : "portrait",
        unit: "mm",
        format: [pdfW, pdfH],
        compress: true,
      });
      pdf.addImage(img, "JPEG", 0, 0, pdfW, pdfH, undefined, "FAST");
      pdf.save(
        shuffleOn
          ? `hsk1-6-words-visualized-random.pdf`
          : `hsk1-6-words-visualized.pdf`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้าง PDF ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-labelledby="word-map-title"
    >
      <div className="shrink-0 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-5xl items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="word-map-title"
              className="text-lg font-semibold tracking-tight"
            >
              HSK Words Visualized
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              HSK 1–6 ในหน้าเดียว · {total} คำ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            aria-label="กลับไปเมนู"
          >
            กลับไปเมนู
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-5xl space-y-4">
          <section className="rounded-xl border border-border p-4">
            <div className="text-sm font-medium">การจัดวางระดับ</div>
            <p className="mt-1 text-xs text-muted-foreground">
              1 บน 2 บน 3 · 4 ข้าง 123 · 5 ใต้ 1234 · 6 ข้าง 4 และ 5
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {HSK_LISTS.map((list) => {
                const tone = LEVEL_COLORS[list.id];
                return (
                  <span
                    key={list.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium"
                  >
                    <span
                      className="size-3.5 rounded-sm"
                      style={{ backgroundColor: tone.bg }}
                    />
                    {list.label}
                    <span className="text-muted-foreground">
                      {byLevel[list.id].length}
                    </span>
                  </span>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-border p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setShuffleOn((v) => !v)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium",
                  shuffleOn
                    ? "border-foreground bg-accent/50"
                    : "border-border hover:bg-muted",
                )}
              >
                สุ่มในแต่ละระดับ {shuffleOn ? "เปิด" : "ปิด"}
              </button>
              <button
                type="button"
                onClick={reshuffle}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted"
              >
                <Dices className="size-4" />
                สุ่มใหม่
              </button>
              <Button
                type="button"
                onClick={downloadPdf}
                disabled={busy || total === 0}
                className="h-11 gap-2 sm:min-w-[12rem]"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {busy ? "กำลังสร้าง PDF…" : "ดาวน์โหลด PDF"}
              </Button>
            </div>
            {error && (
              <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}
          </section>

          <section>
            <div className="mb-2 text-sm font-medium">พรีวิว</div>
            <div className="overflow-auto rounded-xl border border-border bg-neutral-200/80 p-3">
              <div
                className="mx-auto"
                style={{
                  width: PAGE_W * PREVIEW_SCALE,
                  height: pageH * PREVIEW_SCALE,
                }}
              >
                <div
                  ref={previewMeasureRef}
                  style={{
                    transform: `scale(${PREVIEW_SCALE})`,
                    transformOrigin: "top left",
                    width: PAGE_W,
                  }}
                >
                  <VisualizedPage byLevel={byLevel} shuffled={shuffleOn} />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div
        aria-hidden
        ref={pageRef}
        style={{
          position: "fixed",
          left: -10000,
          top: 0,
          pointerEvents: "none",
        }}
      >
        <VisualizedPage byLevel={byLevel} shuffled={shuffleOn} />
      </div>
    </div>
  );
}
