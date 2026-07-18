"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  HSK_LISTS,
  type HskWord,
  type ListId,
} from "@/lib/hsk-lists";

type MapLevelId = ListId | "hsk7to9";
type LevelTone = { bg: string; ink: string; label: string };
type ColorPalette = Record<MapLevelId, LevelTone>;
type ShadeId = "rainbow" | "earthtone";

const SHADE_OPTIONS: {
  id: ShadeId;
  label: string;
  hint: string;
}[] = [
  { id: "rainbow", label: "Rainbow pastel", hint: "เหลือง → ม่วง" },
  { id: "earthtone", label: "Earthtone pastel", hint: "โทนดิน อ่านง่าย" },
];

const PALETTES: Record<ShadeId, ColorPalette> = {
  rainbow: {
    hsk1: { bg: "#fef0c8", ink: "#3d3420", label: "HSK 1" },
    hsk2: { bg: "#ffe0d4", ink: "#4a2e24", label: "HSK 2" },
    hsk3: { bg: "#f5d6d8", ink: "#4a2428", label: "HSK 3" },
    hsk4: { bg: "#d5ebf0", ink: "#243a42", label: "HSK 4" },
    hsk5: { bg: "#d6e0f2", ink: "#243048", label: "HSK 5" },
    hsk6: { bg: "#e8daf2", ink: "#3a2850", label: "HSK 6" },
    hsk7to9: { bg: "#e8e8ea", ink: "#3a3a40", label: "HSK 7–9" },
  },
  earthtone: {
    hsk1: { bg: "#f2e2b8", ink: "#4a3c1e", label: "HSK 1" }, // sand / wheat
    hsk2: { bg: "#e8c4a0", ink: "#4a3220", label: "HSK 2" }, // clay / terracotta
    hsk3: { bg: "#d9b8a8", ink: "#4a2e28", label: "HSK 3" }, // dusty rose clay
    hsk4: { bg: "#c5d4b8", ink: "#2e3c28", label: "HSK 4" }, // sage / olive
    hsk5: { bg: "#b8c8d4", ink: "#283848", label: "HSK 5" }, // slate blue-gray
    hsk6: { bg: "#d0c0b0", ink: "#3c3028", label: "HSK 6" }, // taupe / mushroom
    hsk7to9: { bg: "#e6e4e1", ink: "#3c3a38", label: "HSK 7–9" }, // soft gray
  },
};

type MapItem = {
  chinese: string;
  listId: MapLevelId;
};

/**
 * Layout:
 *   [1 | 4……]  4 beside 1, more columns
 *   [2 | 5   ]
 *   [3 | 5   ]  5 beside 2+3
 *   [6………...]  6 under everything
 */
const PAGE_W = 3200;
const PAD = 10;
const PREVIEW_SCALE = 0.2;
/** Same square cell for every word (like the reference PDF). */
const CELL = 32;

function ProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{clamped}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
      >
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

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

/** Uniform 1–2 char = 1 cell; 3+ char = 2 cells (single-line). */
function cellSpan(chinese: string) {
  return Array.from(chinese).length >= 3 ? 2 : 1;
}

function rowSpanSum(row: MapItem[], cols: number) {
  const c = Math.max(1, cols);
  return row.reduce((s, it) => s + Math.min(cellSpan(it.chinese), c), 0);
}

/** Pack items into rows using 1- or 2-cell spans. */
function packRows(items: MapItem[], cols: number): MapItem[][] {
  const c = Math.max(1, cols);
  const rows: MapItem[][] = [];
  let row: MapItem[] = [];
  let used = 0;
  for (const item of items) {
    const span = Math.min(cellSpan(item.chinese), c);
    if (used > 0 && used + span > c) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(item);
    used += span;
    if (used >= c) {
      rows.push(row);
      row = [];
      used = 0;
    }
  }
  if (row.length) rows.push(row);
  return rows.length ? rows : [[]];
}

/** Split items into exactly n rows by mass (rows stretch to full width). */
function packIntoNRows(items: MapItem[], cols: number, nRows: number): MapItem[][] {
  if (!items.length) return [[]];
  const n = Math.max(1, Math.min(nRows, items.length));
  if (n === 1) return [items];

  const c = Math.max(1, cols);
  const masses = items.map((it) => Math.min(cellSpan(it.chinese), c));
  const total = masses.reduce((a, b) => a + b, 0) || 1;
  const target = total / n;

  const rows: MapItem[][] = Array.from({ length: n }, () => []);
  let rowIdx = 0;
  let massInRow = 0;

  for (let i = 0; i < items.length; i++) {
    const remainingItems = items.length - i;
    const remainingRows = n - rowIdx;

    if (rowIdx < n - 1 && rows[rowIdx]!.length > 0) {
      // Keep one item for each remaining row (including current).
      if (remainingItems < remainingRows) {
        // shouldn't happen
      } else if (remainingItems === remainingRows) {
        rowIdx += 1;
        massInRow = 0;
      } else if (massInRow >= target) {
        rowIdx += 1;
        massInRow = 0;
      }
    }

    rows[rowIdx]!.push(items[i]!);
    massInRow += masses[i]!;
  }

  return rows.filter((r) => r.length > 0);
}

/**
 * Avoid a lonely last row (1–2 leftover cells stretched alone).
 * Absorb sparse leftovers into fewer full-width rows.
 */
function packRowsNoLonely(items: MapItem[], cols: number): MapItem[][] {
  let rows = packRows(items, cols);
  const c = Math.max(1, cols);
  const lonelyThreshold = Math.max(2, Math.floor(c * 0.35));

  while (rows.length >= 2) {
    const last = rows[rows.length - 1]!;
    const lastMass = rowSpanSum(last, c);
    const lonely = last.length <= 2 || lastMass <= lonelyThreshold;
    if (!lonely) break;
    const next = packIntoNRows(items, c, rows.length - 1);
    if (next.length >= rows.length) break;
    rows = next;
  }
  return rows;
}

function rowsForItems(items: MapItem[], cols: number) {
  return Math.max(1, packRowsNoLonely(items, cols).length);
}

function emptyUnitsInLastRow(items: MapItem[], cols: number) {
  const rows = packRowsNoLonely(items, cols);
  const last = rows[rows.length - 1] ?? [];
  const used = rowSpanSum(last, cols);
  const c = Math.max(1, cols);
  // After no-lonely pack, last row is usually full; report leftover if any.
  return used === 0 || used >= c ? 0 : c - used;
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
  7: [
    [1, 1, 1],
    [0, 0, 1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
};

function rowsForLevel(items: MapItem[], cols: number) {
  return rowsForItems(items, cols);
}

function emptyInLastRow(items: MapItem[], cols: number) {
  return emptyUnitsInLastRow(items, cols);
}

type ColLayout = {
  totalCols: number;
  /** Shared left rail width for HSK 1, 2, 3. */
  colsL: number;
  /** Right of 1 — same width as cols5 (no side gap). */
  cols4: number;
  /** Right of 2+3. */
  cols5: number;
  /** Full width under everything. */
  cols6: number;
};

/**
 * Pick colsL + colsR so:
 *   rows(4) ≈ rows(1), rows(5) ≈ rows(2)+rows(3)
 * Same colsR for 4 and 5 → no empty strip beside them.
 * Adjusts 1/2/3 column count until 4/5 fit cleanly.
 */
function pickColLayout(
  items1: MapItem[],
  items2: MapItem[],
  items3: MapItem[],
  items4: MapItem[],
  items5: MapItem[],
  items6: MapItem[],
): ColLayout {
  const COL_STEP = 5;
  const maxFit = Math.floor((PAGE_W - PAD * 2) / CELL);
  const pageCols = Math.max(30, Math.floor(maxFit / COL_STEP) * COL_STEP);

  let best: ColLayout = {
    totalCols: pageCols,
    colsL: 10,
    cols4: pageCols - 10,
    cols5: pageCols - 10,
    cols6: pageCols,
  };
  let bestScore = Number.POSITIVE_INFINITY;

  // Try many left widths — adjust 1/2/3 cols until 4/5 row counts match.
  for (let colsL = COL_STEP; colsL <= pageCols - COL_STEP; colsL += COL_STEP) {
    const h1 = rowsForLevel(items1, colsL);
    const h23 =
      rowsForLevel(items2, colsL) + rowsForLevel(items3, colsL);

    for (
      let colsR = COL_STEP;
      colsR <= pageCols - colsL;
      colsR += COL_STEP
    ) {
      const h4 = rowsForLevel(items4, colsR);
      const h5 = rowsForLevel(items5, colsR);
      const topGap = Math.abs(h1 - h4);
      const midGap = Math.abs(h23 - h5);

      const totalCols = colsL + colsR;
      const empty4 = emptyInLastRow(items4, colsR);
      const empty5 = emptyInLastRow(items5, colsR);

      // Primary: match rows by tuning 1/2/3 cols. Then cut leftover empty cells.
      const score =
        topGap * 1000 +
        midGap * 1000 +
        empty4 * 3 +
        empty5 * 3 +
        colsL * 0.4 -
        colsR * 0.15;

      if (score < bestScore) {
        bestScore = score;
        best = {
          totalCols,
          colsL,
          cols4: colsR,
          cols5: colsR,
          cols6: totalCols,
        };
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
  colors,
  stretch = true,
}: {
  listId: MapLevelId;
  items: MapItem[];
  cols: number;
  /** Exact pixel height to fill — row heights grow to match (no white). */
  height: number;
  colors: ColorPalette;
  /** When false, keep square CELL row height (width still fills — no empty cells). */
  stretch?: boolean;
}) {
  const width = cols * CELL;
  const levelNum =
    listId === "hsk7to9" ? 7 : Number(listId.replace("hsk", "")) || 1;
  const pattern = DIGIT_PIXELS[levelNum] ?? DIGIT_PIXELS[1];
  // Absorb sparse last rows so we never leave blank padded cells.
  const packed = packRowsNoLonely(items, cols);
  const rowCount = Math.max(1, packed.length);
  const rowHeight = stretch ? height / rowCount : CELL;

  const tone = colors[listId];
  const line =
    tone.ink === "#ffffff" ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.22)";

  // White digit near top-left (col 1, row 1).
  const digitOriginCol = 1;
  const digitOriginRow = 1;

  function isDigitPixel(col: number, row: number) {
    const dr = row - digitOriginRow;
    const dc = col - digitOriginCol;
    if (dr < 0 || dc < 0 || dr >= DIGIT_H || dc >= DIGIT_W) return false;
    return pattern[dr]?.[dc] === 1;
  }

  return (
    <div
      style={{
        boxSizing: "border-box",
        width,
        // Always fill allocated height — leftover uses level color (no white donut).
        height,
        backgroundColor: tone.bg,
        overflow: "hidden",
        alignSelf: stretch ? undefined : "flex-start",
      }}
      title={colors[listId].label}
    >
      {packed.map((rowItems, rowIdx) => {
        const spans = rowItems.map((it) =>
          Math.min(cellSpan(it.chinese), cols),
        );
        const spanSum = spans.reduce((a, b) => a + b, 0) || 1;
        // Always stretch across the row — never render empty pad cells.
        const unitW = width / spanSum;

        let colCursor = 0;
        return (
          <div
            key={`${listId}-row-${rowIdx}`}
            style={{
              display: "flex",
              width,
              height: rowHeight,
            }}
          >
            {rowItems.map((item, i) => {
              const span = spans[i]!;
              const cellW = unitW * span;
              const col = Math.min(
                cols - 1,
                Math.floor(((colCursor + span * 0.5) * cols) / spanSum),
              );
              colCursor += span;
              const digit = isDigitPixel(col, rowIdx);
              const n = Array.from(item.chinese).length;
              const singleLine = n >= 3 || cellW >= Math.max(CELL, n * 14 + 8);
              return (
                <div
                  data-map-cell
                  key={`${listId}-${item.chinese}-${rowIdx}-${i}`}
                  style={{
                    boxSizing: "border-box",
                    position: "relative",
                    width: cellW,
                    flexShrink: 0,
                    height: rowHeight,
                    borderRight: `1px solid ${digit ? "rgba(255,255,255,0.18)" : line}`,
                    borderBottom: `1px solid ${digit ? "rgba(255,255,255,0.18)" : line}`,
                    backgroundColor: digit ? tone.ink : tone.bg,
                    overflow: "hidden",
                    clipPath: "inset(0)",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    paddingTop: 2,
                  }}
                  title={`${tone.label} · ${item.chinese}`}
                >
                  <WordGlyphs
                    chinese={item.chinese}
                    color={digit ? "#ffffff" : tone.ink}
                    singleLine={singleLine}
                    cellW={cellW}
                    cellH={rowHeight}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function WordGlyphs({
  chinese,
  color,
  singleLine = false,
  cellW = CELL,
  cellH = CELL,
}: {
  chinese: string;
  color: string;
  singleLine?: boolean;
  cellW?: number;
  cellH?: number;
}) {
  const chars = Array.from(chinese);
  const n = chars.length;
  const w = Math.max(1, cellW);
  const h = Math.max(1, cellH);
  const fontFamily =
    '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Segoe UI", sans-serif';

  // 3+ char always single-line in a wide (2-cell) box.
  const useLine = singleLine || n >= 3;

  if (useLine) {
    const byWidth = Math.floor((w - 4) / Math.max(n, 1));
    // 3-char: compact but +1 vs prior; 4+: also compact. Both sit slightly toward the top.
    const heightFactor = n === 3 ? 0.48 : n >= 4 ? 0.55 : 0.72;
    const maxSize = n === 3 ? 12 : n >= 4 ? 12 : 16;
    const byHeight = Math.floor(h * heightFactor);
    let lineSize = Math.max(8, Math.min(maxSize, byWidth, byHeight));
    if (n === 3) lineSize = Math.min(maxSize, lineSize + 1);
    const topPad = n >= 3 ? 1 : 2;
    return (
      <div
        data-map-glyphs={n}
        style={{
          boxSizing: "border-box",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: topPad,
          textAlign: "center",
          whiteSpace: "nowrap",
          fontSize: lineSize,
          fontWeight: 600,
          lineHeight: 1,
          color,
          fontFamily,
          letterSpacing: 0,
        }}
      >
        <span
          data-map-glyph
          style={{
            display: "block",
            fontSize: lineSize,
            fontWeight: 600,
            color,
            fontFamily,
            lineHeight: 1,
            textAlign: "center",
          }}
        >
          {chinese}
        </span>
      </div>
    );
  }

  const place = (
    ch: string,
    key: number,
    leftPct: string,
    topPct: string,
    widthPct: string,
    heightPct: string,
    fontSize: number,
  ) => (
    <div
      key={key}
      data-map-glyph
      style={{
        boxSizing: "border-box",
        position: "absolute",
        left: leftPct,
        top: topPct,
        width: widthPct,
        height: heightPct,
        overflow: "hidden",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 2,
        textAlign: "center",
        fontSize,
        fontWeight: 600,
        lineHeight: 1,
        color,
        fontFamily,
      }}
    >
      {ch}
    </div>
  );

  if (n <= 1) {
    // Fixed to CELL so stretched rows (e.g. HSK 3) match other levels.
    const fontSize = Math.max(10, Math.floor(CELL * 0.4));
    return (
      <div
        data-map-glyphs={n}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: 2,
        }}
      >
        {place(chars[0] ?? "", 0, "0%", "0%", "100%", "100%", fontSize)}
      </div>
    );
  }

  // 2 char → side by side; size from CELL so it stays consistent across levels
  const fontSize = Math.max(10, Math.floor((CELL / 2) * 0.78));
  return (
    <div
      data-map-glyphs={n}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {place(chars[0], 0, "0%", "0%", "50%", "100%", fontSize)}
      {place(chars[1], 1, "50%", "0%", "50%", "100%", fontSize)}
    </div>
  );
}

function VisualizedPage({
  byLevel,
  advancedItems,
  colors,
}: {
  byLevel: Record<ListId, MapItem[]>;
  advancedItems: MapItem[];
  colors: ColorPalette;
}) {
  const { totalCols, colsL, cols4, cols5, cols6 } = pickColLayout(
    byLevel.hsk1,
    byLevel.hsk2,
    byLevel.hsk3,
    byLevel.hsk4,
    byLevel.hsk5,
    byLevel.hsk6,
  );

  const r1 = rowsForLevel(byLevel.hsk1, colsL);
  const r2 = rowsForLevel(byLevel.hsk2, colsL);
  const r3 = rowsForLevel(byLevel.hsk3, colsL);
  const r6 = rowsForLevel(byLevel.hsk6, cols6);
  const r7to9 = rowsForLevel(advancedItems, totalCols);

  const r23 = r2 + r3;
  // Heights driven by left side: 4 matches 1, 5 matches 2+3.
  const topRows = r1;
  const midRows = r23;
  const bodyRows = topRows + midRows + r6 + r7to9;
  const bodyH = bodyRows * CELL;

  const topH = topRows * CELL;
  const midH = midRows * CELL;
  const h6H = r6 * CELL;
  const h7to9H = r7to9 * CELL;

  const h1H = topH;
  const h4H = topH;
  const h2H = midH * (r2 / Math.max(1, r23));
  const h3H = midH * (r3 / Math.max(1, r23));
  const h5H = midH;

  const wL = colsL * CELL;

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
          HSK 3.0 1-{advancedItems.length ? "9" : "6"} Words SuperMap
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
                  backgroundColor: colors[list.id].bg,
                  display: "inline-block",
                }}
              />
              {list.label}
              <span style={{ color: "#737373", fontWeight: 500 }}>
                {byLevel[list.id].length}
              </span>
            </span>
          ))}
          {advancedItems.length ? (
            <span
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
                  backgroundColor: colors.hsk7to9.bg,
                  display: "inline-block",
                }}
              />
              HSK 7–9
              <span style={{ color: "#737373", fontWeight: 500 }}>
                {advancedItems.length}
              </span>
            </span>
          ) : null}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: totalCols * CELL,
          height: bodyH,
          gap: 0,
        }}
      >
        {/* Row: 1 | 4 — same height (4 rows match 1) */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            height: topH,
            gap: 0,
          }}
        >
          <LevelBlock
            listId="hsk1"
            items={byLevel.hsk1}
            cols={colsL}
            height={h1H}
            colors={colors}
          />
          <LevelBlock
            listId="hsk4"
            items={byLevel.hsk4}
            cols={cols4}
            height={h4H}
            colors={colors}
            stretch
          />
        </div>

        {/* Row: 2+3 | 5 — same height (5 rows match 2+3) */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            height: midH,
            gap: 0,
          }}
        >
          <div
            style={{
              width: wL,
              height: midH,
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}
          >
            <LevelBlock
              listId="hsk2"
              items={byLevel.hsk2}
              cols={colsL}
              height={h2H}
              colors={colors}
            />
            <LevelBlock
              listId="hsk3"
              items={byLevel.hsk3}
              cols={colsL}
              height={h3H}
              colors={colors}
            />
          </div>
          <LevelBlock
            listId="hsk5"
            items={byLevel.hsk5}
            cols={cols5}
            height={h5H}
            colors={colors}
            stretch
          />
        </div>

        {/* Full width: 6 under everything */}
        <LevelBlock
          listId="hsk6"
          items={byLevel.hsk6}
          cols={cols6}
          height={h6H}
          colors={colors}
          stretch={false}
        />
        {advancedItems.length ? (
          <LevelBlock
            listId="hsk7to9"
            items={advancedItems}
            cols={totalCols}
            height={h7to9H}
            colors={colors}
            stretch={false}
          />
        ) : null}
      </div>
    </div>
  );
}

export function HskWordMapSheet({
  wordsByList,
  advancedWords = [],
  onLoadProgress,
  onClose,
}: {
  wordsByList: Record<ListId, HskWord[]>;
  advancedWords?: string[];
  initialListId?: ListId;
  onLoadProgress?: (progress: number) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageH, setPageH] = useState(1800);
  const [renderedLevelCount, setRenderedLevelCount] = useState(1);
  const [shadeId, setShadeId] = useState<ShadeId>("rainbow");
  const [shadeProgress, setShadeProgress] = useState<number | null>(null);
  const [pdfProgress, setPdfProgress] = useState<number | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const previewMeasureRef = useRef<HTMLDivElement>(null);
  const shadeRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const colors = PALETTES[shadeId];
  const shadeBusy = shadeProgress !== null;

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
  const advancedItems = useMemo<MapItem[]>(
    () =>
      advancedWords
        .map(cleanChinese)
        .filter(Boolean)
        .map((chinese) => ({ chinese, listId: "hsk7to9" as const }))
        .sort(
          (a, b) =>
            Array.from(a.chinese).length - Array.from(b.chinese).length ||
            a.chinese.localeCompare(b.chinese, "zh"),
        ),
    [advancedWords],
  );
  const hasAdvanced = advancedItems.length > 0;
  const renderStageCount = HSK_LISTS.length + (hasAdvanced ? 1 : 0);

  // Render one additional HSK level per browser frame. Progress now represents
  // real map DOM/layout work rather than elapsed time.
  const byLevel = useMemo(() => {
    if (renderedLevelCount >= HSK_LISTS.length) return baseByLevel;

    const map = {} as Record<ListId, MapItem[]>;
    HSK_LISTS.forEach((list, index) => {
      map[list.id] = index < renderedLevelCount ? baseByLevel[list.id] : [];
    });
    return map;
  }, [baseByLevel, renderedLevelCount]);
  const visibleAdvancedItems =
    hasAdvanced && renderedLevelCount >= renderStageCount ? advancedItems : [];

  const total = useMemo(
    () =>
      HSK_LISTS.reduce(
        (sum, list) => sum + baseByLevel[list.id].length,
        advancedItems.length,
      ),
    [advancedItems.length, baseByLevel],
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

    let nextFrame = 0;
    let readyFrame = 0;
    const levelProgress = Math.round(
      (renderedLevelCount / renderStageCount) * 95,
    );
    if (!initialLoadDoneRef.current) {
      onLoadProgress?.(levelProgress);
    }
    if (shadeRefreshingRef.current) {
      setShadeProgress(Math.max(8, levelProgress));
    }

    if (renderedLevelCount < renderStageCount) {
      nextFrame = requestAnimationFrame(() => {
        setRenderedLevelCount((count) =>
          Math.min(renderStageCount, count + 1),
        );
      });
    } else {
      // Two frames ensure the complete preview and hidden PDF page have painted.
      nextFrame = requestAnimationFrame(() => {
        readyFrame = requestAnimationFrame(() => {
          if (!initialLoadDoneRef.current) {
            onLoadProgress?.(100);
            initialLoadDoneRef.current = true;
          }
          if (shadeRefreshingRef.current) {
            shadeRefreshingRef.current = false;
            setShadeProgress(100);
            setTimeout(() => setShadeProgress(null), 280);
          }
        });
      });
    }

    return () => {
      ro.disconnect();
      cancelAnimationFrame(nextFrame);
      cancelAnimationFrame(readyFrame);
    };
  }, [
    byLevel,
    onLoadProgress,
    renderStageCount,
    renderedLevelCount,
  ]);

  function selectShade(next: ShadeId) {
    if (next === shadeId || shadeBusy || busy) return;
    shadeRefreshingRef.current = true;
    setShadeId(next);
    setRenderedLevelCount(1);
    setShadeProgress(8);
  }

  async function downloadPdf() {
    if (!pageRef.current || busy || shadeBusy) return;
    setBusy(true);
    setPdfProgress(5);
    setError(null);
    let tick: ReturnType<typeof setInterval> | null = null;
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      setPdfProgress(12);

      const node = pageRef.current.querySelector<HTMLElement>("[data-map-page]");
      if (!node) throw new Error("ไม่มีหน้าที่จะพิมพ์");

      const width = node.offsetWidth;
      const height = node.scrollHeight;
      setPdfProgress(20);

      tick = setInterval(() => {
        setPdfProgress((value) => {
          if (value == null || value >= 72) return value;
          return value + 2;
        });
      }, 180);

      const canvas = await html2canvas(node, {
        scale: 2,
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
          element.style.overflow = "hidden";
          element.style.height = "auto";
          element.style.fontFamily =
            '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Segoe UI", sans-serif';

          // Mild PDF-only shrink so canvas CJK does not spill; keep multi-char readable.
          element.querySelectorAll<HTMLElement>("[data-map-cell]").forEach((cell) => {
            cell.style.overflow = "hidden";
            cell.style.clipPath = "inset(0)";
            cell.style.display = "flex";
            cell.style.alignItems = "flex-start";
            cell.style.justifyContent = "center";
            cell.style.paddingTop = "2px";
          });
          element.querySelectorAll<HTMLElement>("[data-map-glyphs]").forEach((wrap) => {
            wrap.style.overflow = "hidden";
            wrap.style.display = "flex";
            wrap.style.alignItems = "flex-start";
            wrap.style.justifyContent = "center";
            const count = Number(wrap.getAttribute("data-map-glyphs") || "1");
            wrap.style.paddingTop = count >= 3 ? "1px" : "2px";
            wrap.style.width = "100%";
            wrap.style.height = "100%";
          });
          element.querySelectorAll<HTMLElement>("[data-map-glyph]").forEach((g) => {
            const fs = parseFloat(g.style.fontSize) || 10;
            const parent = g.closest("[data-map-glyphs]");
            const count = Number(parent?.getAttribute("data-map-glyphs") || "1");
            // Shrink 3-char more in PDF; keep 3/4-char top-aligned.
            const factor =
              count === 3 ? 0.88 : count >= 4 ? 0.94 : count === 2 ? 0.96 : 0.92;
            g.style.fontSize = `${Math.max(7, fs * factor)}px`;
            g.style.fontWeight = "600";
            g.style.lineHeight = "1";
            g.style.transform = "none";
            if (count >= 3) {
              g.style.alignSelf = "flex-start";
            }
          });
        },
      });

      if (tick) {
        clearInterval(tick);
        tick = null;
      }
      setPdfProgress(78);

      const img = canvas.toDataURL("image/jpeg", 0.92);
      setPdfProgress(88);
      const pdfW = 420;
      const pdfH = Math.max(1, Math.round((pdfW * height) / width));
      const pdf = new jsPDF({
        orientation: pdfW >= pdfH ? "landscape" : "portrait",
        unit: "mm",
        format: [pdfW, pdfH],
        compress: true,
      });
      pdf.addImage(img, "JPEG", 0, 0, pdfW, pdfH, undefined, "FAST");
      setPdfProgress(96);
      pdf.save(
        hasAdvanced
          ? "hsk1-9-words-visualized.pdf"
          : "hsk1-6-words-visualized.pdf",
      );
      setPdfProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้าง PDF ไม่สำเร็จ");
    } finally {
      if (tick) clearInterval(tick);
      setBusy(false);
      setTimeout(() => setPdfProgress(null), 350);
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
              HSK 3.0 1-{hasAdvanced ? "9" : "6"} Words SuperMap
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              HSK 1–{hasAdvanced ? "9" : "6"} ในหน้าเดียว · {total} คำ
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
            <div className="mb-2 text-sm font-medium">Shade สี</div>
            <div className="grid grid-cols-2 gap-2">
              {SHADE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => selectShade(option.id)}
                  disabled={shadeBusy || busy}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left disabled:opacity-50",
                    shadeId === option.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <span className="block text-sm font-medium">
                    {option.label}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-[10px]",
                      shadeId === option.id
                        ? "text-background/75"
                        : "text-muted-foreground",
                    )}
                  >
                    {option.hint}
                  </span>
                  <span className="mt-2 flex gap-1">
                    {HSK_LISTS.map((list) => (
                      <span
                        key={list.id}
                        className="size-3 rounded-sm border border-black/10"
                        style={{
                          backgroundColor: PALETTES[option.id][list.id].bg,
                        }}
                      />
                    ))}
                    {hasAdvanced ? (
                      <span
                        className="size-3 rounded-sm border border-black/10"
                        style={{
                          backgroundColor:
                            PALETTES[option.id].hsk7to9.bg,
                        }}
                      />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
            {shadeBusy ? (
              <div className="mt-3">
                <ProgressBar
                  value={shadeProgress ?? 0}
                  label="กำลังเปลี่ยน shade…"
                />
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap gap-2">
              {HSK_LISTS.map((list) => {
                const tone = colors[list.id];
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
              {hasAdvanced ? (
                <span className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium">
                  <span
                    className="size-3.5 rounded-sm"
                    style={{ backgroundColor: colors.hsk7to9.bg }}
                  />
                  HSK 7–9
                  <span className="text-muted-foreground">
                    {advancedItems.length}
                  </span>
                </span>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex justify-center">
              <Button
                type="button"
                onClick={downloadPdf}
                disabled={busy || shadeBusy || total === 0}
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
            {pdfProgress !== null ? (
              <ProgressBar
                value={pdfProgress}
                label="กำลังสร้างไฟล์ PDF"
              />
            ) : null}
            {error && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
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
                  <VisualizedPage
                    byLevel={byLevel}
                    advancedItems={visibleAdvancedItems}
                    colors={colors}
                  />
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
        <VisualizedPage
          byLevel={byLevel}
          advancedItems={visibleAdvancedItems}
          colors={colors}
        />
      </div>
    </div>
  );
}
