"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  HSK_LISTS,
  formatHskLevelLabel,
  hskLevelsWithWords,
  type HskWord,
  type ListId,
} from "@/lib/hsk-lists";

type GridType = "plain" | "tian" | "mi";
type StrokeGlyph = {
  strokes: string[];
  medians: number[][][];
};
type StrokeMap = Record<string, StrokeGlyph | null>;
type SummaryCharacter = {
  character: string;
  strokes: string[] | null;
  medians: number[][][] | null;
};
type SummaryWord = {
  order: number;
  chinese: string;
  pinyin: string;
  thai: string;
  characters: SummaryCharacter[];
};

const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const PAGE_PAD_X = 56;
const PAGE_PAD_TOP = 34;
const PAGE_PAD_BOTTOM = 36;
const HEADER_BLOCK = 58;
const FOOTER_BLOCK = 28;
const CONTENT_WIDTH = A4_WIDTH_PX - PAGE_PAD_X * 2;
const CONTENT_HEIGHT =
  A4_HEIGHT_PX - PAGE_PAD_TOP - PAGE_PAD_BOTTOM - HEADER_BLOCK - FOOTER_BLOCK;
const PREVIEW_SCALE = 0.38;
const DEFAULT_BATCH_SIZE = 100;
const MIN_BATCH_SIZE = 10;
const DEFAULT_CELL_SIZE = 36;
const MIN_CELL_SIZE = 20;
const MAX_CELL_SIZE = 48;
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 22;
const CELL_GAP = 2;
const COLUMN_GAP = 16;
const COLUMN_COUNT = 2;
const COLUMN_WIDTH = Math.floor(
  (CONTENT_WIDTH - COLUMN_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT,
);
const HANZI = /\p{Script=Han}/u;
const STROKE_DATA_VERSION = "2.0.1";
const STROKE_CDN =
  `https://cdn.jsdelivr.net/npm/hanzi-writer-data@${STROKE_DATA_VERSION}`;
const STROKE_MEMORY_CACHE = new Map<string, StrokeGlyph>();

const PRINT_COLORS = {
  ink: "#171717",
  muted: "#737373",
  faint: "#a3a3a3",
  newStroke: "#f87171",
  strokeLineGreen: "#16a34a",
  strokeLineRed: "#fca5a5",
  strokeStart: "#15803d",
  paper: "#ffffff",
  line: "#e5e7eb",
  cellBorder: "#bdbdbd",
  grid: "#9ca3af",
  guide: "#c7cbd1",
} as const;

const GRID_OPTIONS: { id: GridType; label: string }[] = [
  { id: "plain", label: "ช่องว่าง" },
  { id: "tian", label: "田字格" },
  { id: "mi", label: "米字格" },
];

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function validStrokes(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((stroke) => typeof stroke === "string")
  );
}

function validMedians(value: unknown): value is number[][][] {
  return (
    Array.isArray(value) &&
    value.every(
      (median) =>
        Array.isArray(median) &&
        median.length > 0 &&
        median.every(
          (point) =>
            Array.isArray(point) &&
            point.length >= 2 &&
            typeof point[0] === "number" &&
            typeof point[1] === "number",
        ),
    )
  );
}

function asGlyph(value: unknown): StrokeGlyph | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { strokes?: unknown; medians?: unknown };
  if (!validStrokes(record.strokes)) return null;
  return {
    strokes: record.strokes,
    medians: validMedians(record.medians) ? record.medians : [],
  };
}

async function loadCdnGlyph(character: string): Promise<StrokeGlyph | null> {
  try {
    const response = await fetch(
      `${STROKE_CDN}/${encodeURIComponent(character)}.json`,
      { cache: "force-cache" },
    );
    if (!response.ok) return null;
    return asGlyph(await response.json());
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, items.length)) },
      worker,
    ),
  );
  return results;
}

async function loadStrokesForCharacters(
  characters: string[],
  onProgress: (value: number) => void,
) {
  const nextMap: StrokeMap = {};
  let loadedCount = 0;
  const total = Math.max(1, characters.length);

  for (const character of characters) {
    const cached = STROKE_MEMORY_CACHE.get(character);
    if (cached) {
      nextMap[character] = cached;
      loadedCount++;
    }
  }
  if (loadedCount) {
    onProgress(Math.round((loadedCount / total) * 70));
  }

  const needLocal = characters.filter(
    (character) => !nextMap[character]?.strokes?.length,
  );
  const localBatches = chunk(needLocal, 80);
  for (const batch of localBatches) {
    try {
      const response = await fetch("/api/strokes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characters: batch }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { data?: StrokeMap };
        for (const character of batch) {
          const glyph = asGlyph(payload.data?.[character]);
          if (glyph) nextMap[character] = glyph;
        }
      }
    } catch {
      // Fall through to CDN for this batch.
    }
    loadedCount += batch.length;
    onProgress(Math.round((loadedCount / total) * 70));
  }

  const needCdn = characters.filter(
    (character) => !nextMap[character]?.strokes?.length,
  );
  if (needCdn.length) {
    let cdnCompleted = 0;
    await mapWithConcurrency(needCdn, 10, async (character) => {
      const glyph = await loadCdnGlyph(character);
      if (glyph) nextMap[character] = glyph;
      cdnCompleted++;
      onProgress(70 + Math.round((cdnCompleted / needCdn.length) * 30));
      return character;
    });
  }

  for (const [character, glyph] of Object.entries(nextMap)) {
    if (glyph?.strokes?.length) STROKE_MEMORY_CACHE.set(character, glyph);
  }

  return nextMap;
}

function uniqueHanziFromWords(words: HskWord[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    for (const character of Array.from(word.chinese)) {
      if (!HANZI.test(character) || seen.has(character)) continue;
      seen.add(character);
      result.push(character);
    }
  }
  return result;
}

function characterStrokeRows(
  item: SummaryCharacter,
  cellSize: number,
  columnWidth: number,
) {
  // Stroke steps + one final full character cell.
  const strokeCount = item.strokes?.length ?? 0;
  const count = Math.max(1, strokeCount > 0 ? strokeCount + 1 : 1);
  const cellsPerRow = Math.max(
    1,
    Math.floor((columnWidth + CELL_GAP) / (cellSize + CELL_GAP)),
  );
  return Math.ceil(count / cellsPerRow);
}

/** Each character gets its own stroke row(s) — clearer and easier to paginate. */
function estimateWordHeight(
  word: SummaryWord,
  cellSize: number,
  fontSize: number,
) {
  const titleHeight = Math.ceil(fontSize * 1.35) + 4;
  const titleGap = 6;
  const charGap = 4;
  const rowBottom = 12;
  const strokeRowHeight = cellSize + CELL_GAP;

  let strokeRows = 0;
  for (const item of word.characters) {
    strokeRows += characterStrokeRows(item, cellSize, COLUMN_WIDTH);
  }

  const betweenChars = Math.max(0, word.characters.length - 1) * charGap;
  // Safety margin so content is never clipped at the page edge.
  return (
    titleHeight +
    titleGap +
    strokeRows * strokeRowHeight +
    betweenChars +
    rowBottom +
    8
  );
}

type SummaryPage = {
  left: SummaryWord[];
  right: SummaryWord[];
};

function paginateWords(
  words: SummaryWord[],
  cellSize: number,
  fontSize: number,
): SummaryPage[] {
  const pages: SummaryPage[] = [];
  let left: SummaryWord[] = [];
  let right: SummaryWord[] = [];
  let leftHeight = 0;
  let rightHeight = 0;

  const flush = () => {
    if (!left.length && !right.length) return;
    pages.push({ left, right });
    left = [];
    right = [];
    leftHeight = 0;
    rightHeight = 0;
  };

  // Fill left column top→bottom first, then right column (not left↔right).
  for (const word of words) {
    const cost = estimateWordHeight(word, cellSize, fontSize);

    if (leftHeight + cost <= CONTENT_HEIGHT) {
      left.push(word);
      leftHeight += cost;
      continue;
    }

    if (rightHeight + cost <= CONTENT_HEIGHT) {
      right.push(word);
      rightHeight += cost;
      continue;
    }

    flush();
    left.push(word);
    leftHeight = cost;
  }

  flush();
  return pages.length ? pages : [{ left: [], right: [] }];
}

function drawCellGrid(
  ctx: CanvasRenderingContext2D,
  size: number,
  gridType: GridType,
) {
  const inset = Math.max(1, size * 0.04);
  const mid = size / 2;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = PRINT_COLORS.grid;
  ctx.lineWidth = Math.max(1.5, size * 0.035);
  ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);

  if (gridType === "plain") return;

  ctx.strokeStyle = PRINT_COLORS.guide;
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.setLineDash([Math.max(2, size * 0.06), Math.max(2, size * 0.045)]);

  ctx.beginPath();
  ctx.moveTo(mid, inset);
  ctx.lineTo(mid, size - inset);
  ctx.moveTo(inset, mid);
  ctx.lineTo(size - inset, mid);
  ctx.stroke();

  if (gridType === "mi") {
    ctx.beginPath();
    ctx.moveTo(inset, inset);
    ctx.lineTo(size - inset, size - inset);
    ctx.moveTo(size - inset, inset);
    ctx.lineTo(inset, size - inset);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

function drawMedianGuide(
  ctx: CanvasRenderingContext2D,
  median: number[][],
) {
  if (median.length < 2) return;

  const lengths: number[] = [];
  let total = 0;
  for (let index = 0; index < median.length - 1; index++) {
    const [x0, y0] = median[index];
    const [x1, y1] = median[index + 1];
    const length = Math.hypot(x1 - x0, y1 - y0);
    lengths.push(length);
    total += length;
  }
  if (total <= 0) return;

  // Keep at least ~1/4 of a stroke-width so short medians still show green.
  const greenUntil = Math.min(total * 0.35, Math.max(total * 0.2, 90));

  const strokeRange = (
    color: string,
    fromDist: number,
    toDist: number,
    lineWidth: number,
  ) => {
    let traveled = 0;
    ctx.strokeStyle = color;
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    let started = false;

    for (let index = 0; index < lengths.length; index++) {
      const length = lengths[index];
      if (length <= 0) continue;
      const segStart = traveled;
      const segEnd = traveled + length;
      const [x0, y0] = median[index];
      const [x1, y1] = median[index + 1];

      const clipStart = Math.max(segStart, fromDist);
      const clipEnd = Math.min(segEnd, toDist);

      if (clipStart < clipEnd) {
        const t0 = (clipStart - segStart) / length;
        const t1 = (clipEnd - segStart) / length;
        const ax = x0 + (x1 - x0) * t0;
        const ay = y0 + (y1 - y0) * t0;
        const bx = x0 + (x1 - x0) * t1;
        const by = y0 + (y1 - y0) * t1;
        if (!started) {
          ctx.moveTo(ax, ay);
          started = true;
        } else {
          ctx.lineTo(ax, ay);
        }
        ctx.lineTo(bx, by);
      }

      traveled = segEnd;
    }

    if (started) ctx.stroke();
  };

  // Red first, then green on top (round caps previously buried the green tip).
  strokeRange(PRINT_COLORS.strokeLineRed, greenUntil, total, 55);
  strokeRange(PRINT_COLORS.strokeLineGreen, 0, greenUntil, 70);

  const [sx, sy] = median[0];
  ctx.beginPath();
  ctx.fillStyle = PRINT_COLORS.strokeStart;
  ctx.arc(sx, sy, 42, 0, Math.PI * 2);
  ctx.fill();
}

function drawStrokeCell(
  canvas: HTMLCanvasElement,
  strokes: string[],
  medians: number[][][] | null | undefined,
  step: number,
  cellSize: number,
  gridType: GridType,
  complete = false,
) {
  const safeStep = complete
    ? strokes.length
    : Math.max(1, Math.min(step, strokes.length));
  const ratio = 2;
  const px = Math.max(1, Math.round(cellSize));
  canvas.width = px * ratio;
  canvas.height = px * ratio;
  canvas.style.width = `${px}px`;
  canvas.style.height = `${px}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCellGrid(ctx, canvas.width, gridType);

  // Same as SVG: translate(0 900) scale(1 -1), then fit to cell.
  const scale = (px * ratio) / 1024;
  ctx.setTransform(scale, 0, 0, -scale, 0, 900 * scale);

  for (let index = 0; index < safeStep; index++) {
    const path = strokes[index];
    if (!path) continue;
    try {
      const isNew = !complete && index === safeStep - 1;
      ctx.fillStyle = isNew ? PRINT_COLORS.newStroke : PRINT_COLORS.ink;
      ctx.fill(new Path2D(path));
    } catch {
      // Skip malformed path data.
    }
  }

  if (!complete) {
    const activeMedian = medians?.[safeStep - 1];
    if (activeMedian?.length) {
      drawMedianGuide(ctx, activeMedian);
    }
  }
}

function SummaryStrokeCell({
  strokes,
  medians,
  step,
  cellSize,
  gridType,
  complete = false,
}: {
  strokes: string[];
  medians?: number[][][] | null;
  step: number;
  cellSize: number;
  gridType: GridType;
  complete?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const paint = (canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    if (canvas) {
      drawStrokeCell(
        canvas,
        strokes,
        medians,
        step,
        cellSize,
        gridType,
        complete,
      );
    }
  };

  useLayoutEffect(() => {
    if (canvasRef.current) {
      drawStrokeCell(
        canvasRef.current,
        strokes,
        medians,
        step,
        cellSize,
        gridType,
        complete,
      );
    }
  }, [strokes, medians, step, cellSize, gridType, complete]);

  return (
    <canvas
      ref={paint}
      aria-hidden
      style={{
        display: "block",
        width: cellSize,
        height: cellSize,
        flex: `0 0 ${cellSize}px`,
        backgroundColor: "#ffffff",
      }}
    />
  );
}

function SummaryWordRow({
  word,
  cellSize,
  fontSize,
  gridType,
}: {
  word: SummaryWord;
  cellSize: number;
  fontSize: number;
  gridType: GridType;
}) {
  const secondarySize = Math.max(8, Math.round(fontSize * 0.72));
  const numberSize = Math.max(8, Math.round(fontSize * 0.78));

  return (
    <section
      style={{
        breakInside: "avoid",
        borderBottom: `1px solid ${PRINT_COLORS.line}`,
        paddingBottom: 8,
        marginBottom: 8,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          gap: "2px 8px",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: numberSize,
            fontWeight: 600,
            lineHeight: 1.2,
            color: PRINT_COLORS.muted,
            fontVariantNumeric: "tabular-nums",
            minWidth: `${Math.ceil(numberSize * 1.6)}px`,
          }}
        >
          {word.order}.
        </span>
        <span
          style={{
            fontSize,
            fontWeight: 700,
            lineHeight: 1.2,
            fontFamily:
              '"KaiTi", "Kaiti SC", "STKaiti", "Microsoft YaHei", serif',
          }}
        >
          {word.chinese}
        </span>
        <span
          style={{
            fontSize: secondarySize,
            lineHeight: 1.3,
            color: PRINT_COLORS.muted,
          }}
        >
          {word.pinyin}
        </span>
        <span
          style={{
            fontSize: secondarySize,
            lineHeight: 1.3,
            color: PRINT_COLORS.muted,
          }}
        >
          {word.thai}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          maxWidth: COLUMN_WIDTH,
        }}
      >
        {word.characters.map((item, index) => (
          <div
            key={`${item.character}-${index}`}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: CELL_GAP,
              maxWidth: COLUMN_WIDTH,
            }}
          >
            {item.strokes?.length ? (
              <>
                {item.strokes.map((_, strokeIndex) => (
                  <SummaryStrokeCell
                    key={strokeIndex}
                    strokes={item.strokes!}
                    medians={item.medians}
                    step={strokeIndex + 1}
                    cellSize={cellSize}
                    gridType={gridType}
                  />
                ))}
                <SummaryStrokeCell
                  key="complete"
                  strokes={item.strokes}
                  medians={item.medians}
                  step={item.strokes.length}
                  cellSize={cellSize}
                  gridType={gridType}
                  complete
                />
              </>
            ) : (
              <span
                style={{
                  fontSize: secondarySize,
                  color: PRINT_COLORS.faint,
                  lineHeight: `${cellSize}px`,
                }}
              >
                {item.character}: ไม่มีข้อมูล
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function A4SummaryPage({
  page,
  pageIndex,
  pageCount,
  sheetTitle,
  cellSize,
  fontSize,
  gridType,
}: {
  page: SummaryPage;
  pageIndex: number;
  pageCount: number;
  sheetTitle: string;
  cellSize: number;
  fontSize: number;
  gridType: GridType;
}) {
  return (
    <div
      data-summary-a4-page
      style={{
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
        padding: `${PAGE_PAD_TOP}px ${PAGE_PAD_X}px ${PAGE_PAD_BOTTOM}px`,
        overflow: "hidden",
        backgroundColor: PRINT_COLORS.paper,
        color: PRINT_COLORS.ink,
        fontFamily:
          '"Microsoft YaHei", "PingFang SC", "Noto Sans Thai", "Segoe UI", sans-serif',
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 14,
          borderBottom: `1px solid ${PRINT_COLORS.ink}`,
          paddingBottom: 9,
          minHeight: HEADER_BLOCK - 14,
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>
            {sheetTitle}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 10,
              color: PRINT_COLORS.muted,
            }}
          >
            เริ่มขีดจากจุดสีเขียว
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            color: PRINT_COLORS.muted,
            textAlign: "right",
          }}
        >
          <div>ลำดับขีดสรุป</div>
          <div style={{ marginTop: 2 }}>
            หน้า {pageIndex + 1}/{pageCount}
          </div>
        </div>
      </header>

      <div
        style={{
          flex: 1,
          maxHeight: CONTENT_HEIGHT,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: `repeat(${COLUMN_COUNT}, minmax(0, 1fr))`,
          columnGap: COLUMN_GAP,
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {page.left.map((word, index) => (
            <SummaryWordRow
              key={`L-${word.order}-${word.chinese}-${index}`}
              word={word}
              cellSize={cellSize}
              fontSize={fontSize}
              gridType={gridType}
            />
          ))}
        </div>
        <div style={{ minWidth: 0 }}>
          {page.right.map((word, index) => (
            <SummaryWordRow
              key={`R-${word.order}-${word.chinese}-${index}`}
              word={word}
              cellSize={cellSize}
              fontSize={fontSize}
              gridType={gridType}
            />
          ))}
        </div>
      </div>

      <footer
        style={{
          marginTop: "auto",
          paddingTop: 8,
          minHeight: FOOTER_BLOCK - 8,
          textAlign: "center",
          color: PRINT_COLORS.faint,
          fontSize: 9,
        }}
      >
        A4 · HSK Tracker
      </footer>
    </div>
  );
}

export function StrokeOrderSummarySheet({
  wordsByList,
  onClose,
}: {
  wordsByList: Record<ListId, HskWord[]>;
  onClose: () => void;
}) {
  const [listId, setListId] = useState<ListId>(() => {
    const first = HSK_LISTS.find(
      (list) => (wordsByList[list.id]?.length ?? 0) > 0,
    );
    return first?.id ?? "hsk1";
  });
  const [batch, setBatch] = useState(0);
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);
  const [cellSize, setCellSize] = useState(DEFAULT_CELL_SIZE);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [gridType, setGridType] = useState<GridType>("tian");
  const [worksheetWords, setWorksheetWords] = useState<SummaryWord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pagesRef = useRef<HTMLDivElement>(null);

  const availableLists = useMemo(
    () =>
      HSK_LISTS.filter((list) => (wordsByList[list.id]?.length ?? 0) > 0),
    [wordsByList],
  );
  const levelWords = wordsByList[listId] ?? [];
  const maxBatchSize = Math.max(MIN_BATCH_SIZE, levelWords.length);
  const wordsPerBatch = Math.min(
    Math.max(MIN_BATCH_SIZE, batchSize),
    maxBatchSize,
  );
  const batchCount = Math.max(1, Math.ceil(levelWords.length / wordsPerBatch));
  const safeBatch = Math.min(batch, batchCount - 1);
  const batchWords = useMemo(
    () =>
      levelWords.slice(
        safeBatch * wordsPerBatch,
        safeBatch * wordsPerBatch + wordsPerBatch,
      ),
    [levelWords, safeBatch, wordsPerBatch],
  );
  const selectedCharacters = useMemo(
    () => uniqueHanziFromWords(batchWords),
    [batchWords],
  );
  const contentPages = useMemo(
    () => paginateWords(worksheetWords, cellSize, fontSize),
    [worksheetWords, cellSize, fontSize],
  );
  const missingStrokeCount = useMemo(
    () =>
      worksheetWords.reduce(
        (sum, word) =>
          sum +
          word.characters.filter((item) => !item.strokes?.length).length,
        0,
      ),
    [worksheetWords],
  );
  const levelMeta = HSK_LISTS.find((list) => list.id === listId);
  const sheetTitle = `${formatHskLevelLabel(
    levelMeta ? [levelMeta.level] : hskLevelsWithWords(wordsByList),
  )} ลำดับขีด จัดทำโดย DreamHSK`;

  async function generate() {
    if (!batchWords.length || loading) return;
    setLoading(true);
    setLoadProgress(0);
    setError(null);
    try {
      const strokeMap = await loadStrokesForCharacters(
        selectedCharacters,
        setLoadProgress,
      );
      setWorksheetWords(
        batchWords.map((word, index) => ({
          order: safeBatch * wordsPerBatch + index + 1,
          chinese: word.chinese,
          pinyin: word.pinyin,
          thai: word.thai,
          characters: Array.from(word.chinese)
            .filter((character) => HANZI.test(character))
            .map((character) => {
              const glyph = strokeMap[character];
              return {
                character,
                strokes: glyph?.strokes?.length ? glyph.strokes : null,
                medians: glyph?.medians?.length ? glyph.medians : null,
              };
            }),
        })),
      );
      setLoadProgress(100);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "โหลดข้อมูลลำดับขีดไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    if (busy || !worksheetWords.length) return;
    setBusy(true);
    setError(null);
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      // Give canvas cells a moment to paint after mount.
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!pagesRef.current) throw new Error("เตรียมหน้า PDF ไม่สำเร็จ");
      const nodes = Array.from(
        pagesRef.current.querySelectorAll<HTMLElement>(
          "[data-summary-a4-page]",
        ),
      );
      if (!nodes.length) throw new Error("ยังไม่มี worksheet ให้ดาวน์โหลด");

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        const canvas = await html2canvas(node, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
          width: node.offsetWidth,
          height: node.offsetHeight,
          onclone: (clonedDocument, clonedElement) => {
            clonedDocument
              .querySelectorAll('style, link[rel="stylesheet"]')
              .forEach((styleNode) => styleNode.remove());
            clonedElement.style.backgroundColor = "#ffffff";
            clonedElement.style.color = "#171717";
          },
        });
        const image = canvas.toDataURL("image/jpeg", 0.95);
        if (index > 0) pdf.addPage();
        pdf.addImage(image, "JPEG", 0, 0, 210, 297, undefined, "FAST");
      }

      pdf.save(`hsk-stroke-order-summary-${listId}.pdf`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "สร้าง PDF ไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stroke-summary-title"
    >
      <header className="shrink-0 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-3">
          <div>
            <h2
              id="stroke-summary-title"
              className="text-lg font-semibold tracking-tight"
            >
              {sheetTitle}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              สรุปลำดับขีด · ขีดใหม่สีแดง · กำหนดจำนวนคำได้ · PDF A4
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            กลับไปเมนู
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <section className="rounded-xl border border-border p-4">
            <div className="text-sm font-medium">เลือกระดับ HSK</div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {availableLists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => {
                    setListId(list.id);
                    setBatch(0);
                    setWorksheetWords([]);
                  }}
                  className={cn(
                    "rounded-lg border px-2 py-2.5 text-sm font-medium",
                    listId === list.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {list.label}
                </button>
              ))}
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">จำนวนคำต่อชุด</span>
                <span className="tabular-nums text-muted-foreground">
                  {wordsPerBatch} / {maxBatchSize}
                </span>
              </div>
              <input
                type="range"
                min={MIN_BATCH_SIZE}
                max={maxBatchSize}
                step={10}
                value={wordsPerBatch}
                onChange={(event) => {
                  setBatchSize(Number(event.target.value));
                  setBatch(0);
                  setWorksheetWords([]);
                }}
                className="mt-3 h-2 w-full accent-foreground"
                aria-label="จำนวนคำต่อชุด"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {[50, 100, 150, 200]
                  .filter((size) => size <= maxBatchSize)
                  .map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setBatchSize(size);
                        setBatch(0);
                        setWorksheetWords([]);
                      }}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 text-xs font-medium",
                        wordsPerBatch === size
                          ? "border-foreground bg-accent"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      {size}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => {
                    setBatchSize(maxBatchSize);
                    setBatch(0);
                    setWorksheetWords([]);
                  }}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-xs font-medium",
                    wordsPerBatch === maxBatchSize
                      ? "border-foreground bg-accent"
                      : "border-border hover:bg-muted",
                  )}
                >
                  ทั้งหมด ({maxBatchSize})
                </button>
              </div>
            </div>

            {batchCount > 1 ? (
              <div className="mt-4 border-t border-border pt-4">
                <div className="text-xs font-medium">
                  ชุดคำ (ชุดละ {wordsPerBatch} คำ)
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Array.from({ length: batchCount }, (_, index) => {
                    const start = index * wordsPerBatch + 1;
                    const end = Math.min(
                      (index + 1) * wordsPerBatch,
                      levelWords.length,
                    );
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          setBatch(index);
                          setWorksheetWords([]);
                        }}
                        className={cn(
                          "rounded-lg border px-3 py-2.5 text-sm font-medium",
                          safeBatch === index
                            ? "border-foreground bg-accent"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        คำที่ {start}–{end}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <p className="mt-4 text-xs text-muted-foreground">
              เลือกแล้ว {batchWords.length} คำ · {selectedCharacters.length}{" "}
              ตัวอักษร
            </p>

            <div className="mt-4 border-t border-border pt-4">
              <div className="text-sm font-medium">รูปแบบตาราง</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {GRID_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setGridType(option.id)}
                    className={cn(
                      "rounded-lg border px-2 py-2.5 text-sm font-medium",
                      gridType === option.id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">ขนาดช่องลำดับขีด</span>
                <span className="tabular-nums text-muted-foreground">
                  {cellSize}px
                </span>
              </div>
              <input
                type="range"
                min={MIN_CELL_SIZE}
                max={MAX_CELL_SIZE}
                step={1}
                value={cellSize}
                onChange={(event) => setCellSize(Number(event.target.value))}
                className="mt-3 h-2 w-full accent-foreground"
                aria-label="ขนาดช่องลำดับขีด"
              />
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>เล็ก</span>
                <span>ใหญ่</span>
              </div>
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">ขนาดตัวอักษร (จีน / พินอิน / แปล)</span>
                <span className="tabular-nums text-muted-foreground">
                  {fontSize}px
                </span>
              </div>
              <input
                type="range"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                step={1}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
                className="mt-3 h-2 w-full accent-foreground"
                aria-label="ขนาดตัวอักษร"
              />
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>เล็ก</span>
                <span>ใหญ่</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={generate}
                disabled={loading || !batchWords.length}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="size-4" aria-hidden />
                )}
                สร้าง worksheet
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={downloadPdf}
                disabled={busy || !worksheetWords.length}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-4" aria-hidden />
                )}
                ดาวน์โหลด PDF
              </Button>
            </div>

            {loading ? (
              <div className="mt-4 space-y-1.5" aria-live="polite">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>กำลังโหลดลำดับขีด</span>
                  <span className="tabular-nums">{loadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-[width] duration-300"
                    style={{ width: `${loadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            ) : null}
          </section>

          {worksheetWords.length ? (
            <section className="rounded-xl border border-border p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-medium">ตัวอย่าง</div>
                <div className="text-xs text-muted-foreground">
                  {worksheetWords.length} คำ · {contentPages.length} หน้า
                  {missingStrokeCount
                    ? ` · ไม่พบขีด ${missingStrokeCount}`
                    : ""}
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-neutral-200/80 p-3">
                <div
                  className="mx-auto overflow-hidden"
                  style={{
                    width: A4_WIDTH_PX * PREVIEW_SCALE,
                    height: A4_HEIGHT_PX * PREVIEW_SCALE,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      width: A4_WIDTH_PX,
                      transform: `scale(${PREVIEW_SCALE})`,
                      transformOrigin: "top left",
                    }}
                  >
                    <div style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.14)" }}>
                      <A4SummaryPage
                        page={contentPages[0] ?? { left: [], right: [] }}
                        pageIndex={0}
                        pageCount={contentPages.length}
                        sheetTitle={sheetTitle}
                        cellSize={cellSize}
                        fontSize={fontSize}
                        gridType={gridType}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {busy ? (
        <div
          aria-hidden
          style={{
            pointerEvents: "none",
            position: "fixed",
            top: 0,
            left: -10000,
            zIndex: -1,
            backgroundColor: "#ffffff",
          }}
        >
          <div ref={pagesRef}>
            {contentPages.map((page, pageIndex) => (
              <A4SummaryPage
                key={pageIndex}
                page={page}
                pageIndex={pageIndex}
                pageCount={contentPages.length}
                sheetTitle={sheetTitle}
                cellSize={cellSize}
                fontSize={fontSize}
                gridType={gridType}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
