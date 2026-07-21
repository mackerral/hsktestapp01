"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  HSK_LISTS,
  loadStatus,
  wordId,
  type HskWord,
  type ListId,
  type StatusMap,
} from "@/lib/hsk-lists";

type GridType = "tian" | "mi";
type StatusFilter = {
  known: boolean;
  unknown: boolean;
  neutral: boolean;
};
type StrokeMap = Record<string, string[] | null>;
type WorksheetCharacter = {
  character: string;
  strokes: string[] | null;
};
type WorksheetWord = {
  chinese: string;
  pinyin: string;
  thai: string;
  characters: WorksheetCharacter[];
};
type WorksheetSection = {
  word: WorksheetWord;
  characters: WorksheetCharacter[];
  continuation: boolean;
};

const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const PREVIEW_SCALE = 0.4;
const MAX_CHARACTERS = 2500;
const MIN_CELL_SIZE = 48;
const MAX_CELL_SIZE = 92;
const CELL_GAP = 4;
const PRESET_BATCH_SIZE = 50;
const HANZI = /\p{Script=Han}/u;
const STROKE_DATA_VERSION = "2.0.1";
const STROKE_CDN =
  `https://cdn.jsdelivr.net/npm/hanzi-writer-data@${STROKE_DATA_VERSION}`;
const STROKE_MEMORY_CACHE = new Map<string, string[]>();

const PRINT_COLORS = {
  ink: "#171717",
  muted: "#737373",
  faint: "#a3a3a3",
  grid: "#9ca3af",
  guide: "#c7cbd1",
  paper: "#ffffff",
  line: "#e5e7eb",
} as const;

function cellsThatFit(cellSize: number) {
  return Math.max(
    5,
    Math.floor((A4_WIDTH_PX - 100 + CELL_GAP) / (cellSize + CELL_GAP)),
  );
}

function uniqueHanzi(value: string, limit = MAX_CHARACTERS) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const character of Array.from(value)) {
    if (!HANZI.test(character) || seen.has(character)) continue;
    seen.add(character);
    result.push(character);
    if (result.length >= limit) break;
  }
  return result;
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

/** Normalize API/CDN payload: either string[] or { strokes, medians }. */
function asStrokePaths(value: unknown): string[] | null {
  if (validStrokes(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    validStrokes((value as { strokes?: unknown }).strokes)
  ) {
    return (value as { strokes: string[] }).strokes;
  }
  return null;
}

async function loadCdnStrokes(character: string): Promise<string[] | null> {
  try {
    const response = await fetch(
      `${STROKE_CDN}/${encodeURIComponent(character)}.json`,
      { cache: "force-cache" },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { strokes?: unknown };
    return asStrokePaths(payload);
  } catch {
    return null;
  }
}

function paginateWords(
  words: WorksheetWord[],
  cellSize: number,
) {
  const pages: WorksheetSection[][] = [];
  let page: WorksheetSection[] = [];
  let usedRows = 0;
  const maxRowsPerPage = Math.max(
    7,
    Math.floor(920 / (cellSize + CELL_GAP)),
  );
  const charactersPerSection = Math.max(
    1,
    Math.floor((maxRowsPerPage - 1) / 3),
  );

  for (const word of words) {
    for (
      let index = 0;
      index < word.characters.length;
      index += charactersPerSection
    ) {
      const characters = word.characters.slice(
        index,
        index + charactersPerSection,
      );
      const cost = 1 + characters.length * 3;
      if (page.length && usedRows + cost > maxRowsPerPage) {
        pages.push(page);
        page = [];
        usedRows = 0;
      }
      page.push({
        word,
        characters,
        continuation: index > 0,
      });
      usedRows += cost;
    }
  }

  if (page.length) pages.push(page);
  return pages.length ? pages : [[]];
}

function GridFrame({
  gridType,
  cellSize,
}: {
  gridType: GridType;
  cellSize: number;
}) {
  return (
    <svg
      width={cellSize}
      height={cellSize}
      viewBox="0 0 1024 1024"
      aria-hidden
      style={{ display: "block" }}
    >
      <rect
        x="10"
        y="10"
        width="1004"
        height="1004"
        fill="#ffffff"
        stroke={PRINT_COLORS.grid}
        strokeWidth="18"
      />
      <path
        d="M 512 12 V 1012 M 12 512 H 1012"
        fill="none"
        stroke={PRINT_COLORS.guide}
        strokeWidth="10"
        strokeDasharray="30 22"
      />
      {gridType === "mi" ? (
        <path
          d="M 16 16 L 1008 1008 M 1008 16 L 16 1008"
          fill="none"
          stroke={PRINT_COLORS.guide}
          strokeWidth="10"
          strokeDasharray="30 22"
        />
      ) : null}
    </svg>
  );
}

function PracticeGrid({
  gridType,
  cellSize,
  strokes,
  fallbackCharacter,
}: {
  gridType: GridType;
  cellSize: number;
  strokes?: string[];
  fallbackCharacter?: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        boxSizing: "border-box",
        width: cellSize,
        height: cellSize,
        flex: `0 0 ${cellSize}px`,
        backgroundColor: PRINT_COLORS.paper,
      }}
    >
      <GridFrame gridType={gridType} cellSize={cellSize} />

      {strokes?.length ? (
        <svg
          width={cellSize}
          height={cellSize}
          viewBox="0 0 1024 1024"
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "block",
            pointerEvents: "none",
          }}
        >
          <g transform="translate(0 900) scale(1 -1)">
            {strokes.map((path, index) => (
              <path
                key={`${index}-${path.slice(0, 18)}`}
                d={path}
                fill={PRINT_COLORS.ink}
              />
            ))}
          </g>
        </svg>
      ) : null}

      {!strokes?.length && fallbackCharacter ? (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: PRINT_COLORS.faint,
            fontSize: Math.round(cellSize * 0.64),
            fontFamily:
              '"KaiTi", "Kaiti SC", "STKaiti", "Microsoft YaHei", serif',
          }}
        >
          {fallbackCharacter}
        </span>
      ) : null}
    </div>
  );
}

function CharacterRows({
  item,
  gridType,
  cellSize,
  cellsPerRow,
}: {
  item: WorksheetCharacter;
  gridType: GridType;
  cellSize: number;
  cellsPerRow: number;
}) {
  const rowStyle = {
    display: "flex",
    gap: CELL_GAP,
    width: cellsPerRow * cellSize + (cellsPerRow - 1) * CELL_GAP,
  } as const;
  const strokeCounts = item.strokes?.length
    ? item.strokes.length <= cellsPerRow
      ? Array.from({ length: item.strokes.length }, (_, index) => index + 1)
      : Array.from({ length: cellsPerRow }, (_, index) =>
          Math.max(
            1,
            Math.ceil(((index + 1) / cellsPerRow) * item.strokes!.length),
          ),
        ).filter((count, index, values) => values.indexOf(count) === index)
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: CELL_GAP }}>
      <div style={rowStyle}>
        {Array.from({ length: cellsPerRow }, (_, index) => {
          const strokeCount = strokeCounts[index] ?? 0;
          return (
            <PracticeGrid
              key={`guide-${index}`}
              gridType={gridType}
              cellSize={cellSize}
              strokes={
                strokeCount ? item.strokes?.slice(0, strokeCount) : undefined
              }
              fallbackCharacter={
                !item.strokes?.length && index === 0
                  ? item.character
                  : undefined
              }
            />
          );
        })}
      </div>
      {[0, 1].map((row) => (
        <div key={`blank-row-${row}`} style={rowStyle}>
          {Array.from({ length: cellsPerRow }, (_, index) => (
            <PracticeGrid
              key={`blank-${row}-${index}`}
              gridType={gridType}
              cellSize={cellSize}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function WordSection({
  section,
  gridType,
  cellSize,
  cellsPerRow,
}: {
  section: WorksheetSection;
  gridType: GridType;
  cellSize: number;
  cellsPerRow: number;
}) {
  return (
    <section
      style={{
        breakInside: "avoid",
        borderBottom: `1px solid ${PRINT_COLORS.line}`,
        paddingBottom: 9,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 7,
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            fontFamily:
              '"KaiTi", "Kaiti SC", "STKaiti", "Microsoft YaHei", serif',
          }}
        >
          {section.word.chinese}
        </span>
        {section.continuation ? (
          <span style={{ marginLeft: "auto", fontSize: 9, color: PRINT_COLORS.faint }}>
            ต่อ
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {section.characters.map((item, index) => (
          <CharacterRows
            key={`${item.character}-${index}`}
            item={item}
            gridType={gridType}
            cellSize={cellSize}
            cellsPerRow={cellsPerRow}
          />
        ))}
      </div>
    </section>
  );
}

function A4StrokePage({
  sections,
  pageIndex,
  pageCount,
  gridType,
  cellSize,
  cellsPerRow,
}: {
  sections: WorksheetSection[];
  pageIndex: number;
  pageCount: number;
  gridType: GridType;
  cellSize: number;
  cellsPerRow: number;
}) {
  return (
    <div
      data-stroke-a4-page
      style={{
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
        padding: "34px 50px 28px",
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
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>
            แบบฝึกลำดับขีดภาษาจีน
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 10,
              color: PRINT_COLORS.muted,
            }}
          >
            ตัวเต็ม → เพิ่มขีดทีละขั้น → ช่องว่างสำหรับฝึกเขียน
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            color: PRINT_COLORS.muted,
            textAlign: "right",
          }}
        >
          <div>{gridType === "tian" ? "田字格" : "米字格"}</div>
          <div style={{ marginTop: 2 }}>
            หน้า {pageIndex + 1}/{pageCount}
          </div>
        </div>
      </header>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          flex: 1,
        }}
      >
        {sections.map((section, index) => (
          <WordSection
            key={`${pageIndex}-${index}-${section.word.chinese}`}
            section={section}
            gridType={gridType}
            cellSize={cellSize}
            cellsPerRow={cellsPerRow}
          />
        ))}
      </div>

      <footer
        style={{
          marginTop: "auto",
          paddingTop: 8,
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

function A4BlankPage({
  pageIndex,
  pageCount,
  gridType,
  cellSize,
  cellsPerRow,
}: {
  pageIndex: number;
  pageCount: number;
  gridType: GridType;
  cellSize: number;
  cellsPerRow: number;
}) {
  const rowCount = Math.max(
    6,
    Math.floor(970 / (cellSize + CELL_GAP)),
  );
  return (
    <div
      data-stroke-a4-page
      style={{
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
        padding: "34px 50px 28px",
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
          justifyContent: "space-between",
          marginBottom: 12,
          borderBottom: `1px solid ${PRINT_COLORS.ink}`,
          paddingBottom: 8,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700 }}>
          หน้าฝึกเขียนอิสระ
        </span>
        <span style={{ fontSize: 10, color: PRINT_COLORS.muted }}>
          หน้า {pageIndex + 1}/{pageCount}
        </span>
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: CELL_GAP }}>
        {Array.from({ length: rowCount }, (_, row) => (
          <div key={row} style={{ display: "flex", gap: CELL_GAP }}>
            {Array.from({ length: cellsPerRow }, (_, column) => (
              <PracticeGrid
                key={`${row}-${column}`}
                gridType={gridType}
                cellSize={cellSize}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StrokeOrderSheet({
  wordsByList,
  onClose,
}: {
  wordsByList: Record<ListId, HskWord[]>;
  onClose: () => void;
}) {
  const [selectedPresetWords, setSelectedPresetWords] =
    useState<HskWord[] | null>(null);
  const [worksheetWords, setWorksheetWords] = useState<WorksheetWord[]>([]);
  const [cellSize, setCellSize] = useState(72);
  const [gridType, setGridType] = useState<GridType>("tian");
  const [includeBlankPages, setIncludeBlankPages] = useState(true);
  const [presetListId, setPresetListId] = useState<ListId | null>(null);
  const [presetBatch, setPresetBatch] = useState(0);
  const [presetStatuses, setPresetStatuses] = useState<StatusFilter>({
    known: true,
    unknown: true,
    neutral: true,
  });
  const [presetStatusMap, setPresetStatusMap] = useState<StatusMap>({});
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!presetListId) {
      setPresetStatusMap({});
      return;
    }
    setPresetStatusMap(loadStatus(presetListId));
  }, [presetListId]);

  const selectedCharacters = useMemo(
    () =>
      uniqueHanzi(
        (selectedPresetWords ?? []).map((word) => word.chinese).join(""),
      ),
    [selectedPresetWords],
  );
  const cellsPerRow = cellsThatFit(cellSize);
  const contentPages = useMemo(
    () => paginateWords(worksheetWords, cellSize),
    [worksheetWords, cellSize],
  );
  const totalPageCount =
    contentPages.length * (includeBlankPages ? 2 : 1);
  const missingCount = new Set(
    worksheetWords.flatMap((word) =>
      word.characters
        .filter((item) => !item.strokes)
        .map((item) => item.character),
    ),
  ).size;
  const presetWords = useMemo(
    () => (presetListId ? wordsByList[presetListId] ?? [] : []),
    [presetListId, wordsByList],
  );
  const presetStatusCounts = useMemo(() => {
    const counts = { known: 0, unknown: 0, neutral: 0 };
    presetWords.forEach((word, index) => {
      const status = presetStatusMap[wordId(word.chinese, word.pinyin, index)];
      if (status === "known") counts.known++;
      else if (status === "unknown") counts.unknown++;
      else counts.neutral++;
    });
    return counts;
  }, [presetWords, presetStatusMap]);
  const presetBatchCount = Math.ceil(presetWords.length / PRESET_BATCH_SIZE);
  const filteredPresetWords = useMemo(() => {
    const start = presetBatch * PRESET_BATCH_SIZE;
    return presetWords.slice(start, start + PRESET_BATCH_SIZE).filter((word, offset) => {
      const index = start + offset;
      const status = presetStatusMap[wordId(word.chinese, word.pinyin, index)];
      if (status === "known") return presetStatuses.known;
      if (status === "unknown") return presetStatuses.unknown;
      return presetStatuses.neutral;
    });
  }, [presetWords, presetStatusMap, presetStatuses, presetBatch]);
  const presetCharacterCount = useMemo(
    () =>
      uniqueHanzi(
        filteredPresetWords.map((word) => word.chinese).join(""),
      ).length,
    [filteredPresetWords],
  );

  function togglePresetStatus(key: keyof StatusFilter) {
    setPresetStatuses((previous) => {
      const next = { ...previous, [key]: !previous[key] };
      return next.known || next.unknown || next.neutral ? next : previous;
    });
    setSelectedPresetWords(null);
    setWorksheetWords([]);
  }

  function selectPresetList(listId: ListId) {
    setPresetListId(listId);
    setPresetBatch(0);
    setSelectedPresetWords(null);
    setWorksheetWords([]);
  }

  function selectPresetBatch(batch: number) {
    setPresetBatch(batch);
    setSelectedPresetWords(null);
    setWorksheetWords([]);
  }

  function applyPreset() {
    setSelectedPresetWords(filteredPresetWords);
  }

  async function generate() {
    if (!selectedPresetWords?.length || !selectedCharacters.length || loading) {
      return;
    }
    const sourceWords = selectedPresetWords;
    setLoading(true);
    setLoadProgress(0);
    setError(null);
    try {
      let loadedCount = 0;
      const nextMap: StrokeMap = {};

      for (const character of selectedCharacters) {
        const cached = STROKE_MEMORY_CACHE.get(character);
        if (cached) {
          nextMap[character] = cached;
          loadedCount++;
        }
      }
      if (loadedCount) {
        setLoadProgress(
          Math.round((loadedCount / selectedCharacters.length) * 85),
        );
      }

      const needLocal = selectedCharacters.filter(
        (character) => !nextMap[character],
      );
      const localBatches = chunk(needLocal, 80);
      for (let index = 0; index < localBatches.length; index++) {
        const batch = localBatches[index];
        const response = await fetch("/api/strokes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characters: batch }),
        });
        if (!response.ok) {
          throw new Error("โหลดข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ");
        }
        const payload = (await response.json()) as { data?: Record<string, unknown> };
        for (const character of batch) {
          const paths = asStrokePaths(payload.data?.[character]);
          if (paths) nextMap[character] = paths;
        }
        loadedCount += batch.length;
        setLoadProgress(
          Math.round((loadedCount / selectedCharacters.length) * 85),
        );
      }

      const needCdn = selectedCharacters.filter(
        (character) => !nextMap[character],
      );
      if (needCdn.length) {
        let cdnCompleted = 0;
        const cdnEntries = await mapWithConcurrency(
          needCdn,
          12,
          async (character) => {
            const entry = [
              character,
              await loadCdnStrokes(character),
            ] as const;
            cdnCompleted++;
            setLoadProgress(
              85 + Math.round((cdnCompleted / needCdn.length) * 15),
            );
            return entry;
          },
        );
        for (const [character, strokes] of cdnEntries) {
          if (strokes) nextMap[character] = strokes;
        }
      }

      for (const [character, strokes] of Object.entries(nextMap)) {
        if (strokes) STROKE_MEMORY_CACHE.set(character, strokes);
      }

      setWorksheetWords(
        sourceWords.map((word) => ({
          chinese: word.chinese,
          pinyin: word.pinyin,
          thai: word.thai,
          characters: Array.from(word.chinese)
            .filter((character) => HANZI.test(character))
            .map((character) => ({
              character,
              strokes: nextMap[character] ?? null,
            })),
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
      if (!pagesRef.current) throw new Error("เตรียมหน้า PDF ไม่สำเร็จ");
      const nodes = Array.from(
        pagesRef.current.querySelectorAll<HTMLElement>(
          "[data-stroke-a4-page]",
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

      pdf.save("hsk-stroke-order-worksheet.pdf");
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
      aria-labelledby="stroke-order-title"
    >
      <header className="shrink-0 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-3">
          <div>
            <h2
              id="stroke-order-title"
              className="text-lg font-semibold tracking-tight"
            >
              แบบฝึกลำดับขีด
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              SVG สะสมขีดทีละช่อง · Tian Zi Ge / Mi Zi Ge · PDF A4
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
            <div className="text-sm font-medium">Preset คำศัพท์ HSK</div>
            <p className="mt-1 text-xs text-muted-foreground">
              เลือกระดับ แล้วกำหนดจำนวนคำและสถานะที่ต้องการ
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground/80">
              โหลดจากเซิร์ฟเวอร์ก่อน · ใช้ jsDelivr CDN เป็น fallback
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {HSK_LISTS.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => selectPresetList(list.id)}
                  className={cn(
                    "rounded-lg border px-2 py-2.5 text-sm font-medium",
                    presetListId === list.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {list.label}
                </button>
              ))}
            </div>

            {presetListId ? (
              <div className="mt-4 space-y-4 border-t border-border pt-4">
                <div>
                  <div className="text-xs font-medium">จำนวนคำ</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {Array.from(
                      { length: presetBatchCount },
                      (_, batch) => {
                        const start = batch * PRESET_BATCH_SIZE + 1;
                        const end = Math.min(
                          (batch + 1) * PRESET_BATCH_SIZE,
                          presetWords.length,
                        );
                        return (
                      <button
                        key={batch}
                        type="button"
                        onClick={() => selectPresetBatch(batch)}
                        className={cn(
                          "rounded-lg border px-3 py-2.5 text-sm font-medium",
                          presetBatch === batch
                            ? "border-foreground bg-accent"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        คำที่ {start}–{end}
                      </button>
                        );
                      },
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium">สถานะคำ</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {([
                      ["known", "จำได้", "bg-emerald-500"],
                      ["unknown", "จำไม่ได้", "bg-rose-500"],
                      ["neutral", "ยังไม่ได้กด", "bg-slate-400"],
                    ] as const).map(([key, label, dot]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => togglePresetStatus(key)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm",
                          presetStatuses[key]
                            ? "border-foreground bg-accent/50"
                            : "border-border opacity-55",
                        )}
                      >
                        <span className={cn("size-3 rounded-full", dot)} />
                        <span className="min-w-0 flex-1">{label}</span>
                        <span className="text-xs text-muted-foreground">
                          {presetStatusCounts[key]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={applyPreset}
                  disabled={!filteredPresetWords.length}
                  className="w-full rounded-lg border border-foreground bg-foreground px-3 py-3 text-sm font-semibold text-background disabled:opacity-40"
                >
                  ใช้ {filteredPresetWords.length} คำ ·{" "}
                  {presetCharacterCount} ตัวอักษร
                </button>
                {selectedPresetWords?.length ? (
                  <p className="text-xs text-muted-foreground">
                    เลือกแล้ว {selectedPresetWords.length} คำ ·{" "}
                    {selectedCharacters.length} ตัวอักษร
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="grid gap-5 rounded-xl border border-border p-4 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium">รูปแบบช่อง</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([
                  ["tian", "田字格"],
                  ["mi", "米字格"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGridType(value)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-sm font-medium",
                      gridType === value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">ขนาดช่อง</span>
                <span className="tabular-nums text-muted-foreground">
                  {cellSize}px · {cellsPerRow} ช่อง/แถว
                </span>
              </div>
              <input
                type="range"
                min={MIN_CELL_SIZE}
                max={MAX_CELL_SIZE}
                step={4}
                value={cellSize}
                onChange={(event) => setCellSize(Number(event.target.value))}
                className="mt-4 h-2 w-full accent-foreground"
                aria-label="ขนาดช่อง"
              />
              <div className="mt-2 text-[10px] text-muted-foreground">
                เต็มแถวอัตโนมัติตามขนาดช่อง
              </div>
            </div>

            <div className="sm:col-span-2">
              <button
                type="button"
                role="switch"
                aria-checked={includeBlankPages}
                onClick={() => setIncludeBlankPages((value) => !value)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border px-3 py-3 text-sm font-medium",
                  includeBlankPages
                    ? "border-foreground bg-accent/50"
                    : "border-border hover:bg-muted",
                )}
              >
                <span>เพิ่มหน้าฝึกว่างหลังทุกหน้า</span>
                <span className="text-xs text-muted-foreground">
                  {includeBlankPages ? "เปิด" : "ปิด"}
                </span>
              </button>
            </div>
          </section>

          <Button
            className="h-12 w-full gap-2 text-base font-semibold"
            onClick={generate}
            disabled={loading || !selectedPresetWords?.length}
          >
            {loading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <RefreshCw className="size-5" />
            )}
            {loading
              ? `กำลังโหลดข้อมูลขีด… ${loadProgress}%`
              : "สร้าง Worksheet"}
          </Button>

          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}

          {worksheetWords.length ? (
            <>
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">
                    {includeBlankPages
                      ? "พรีวิวหน้าคำศัพท์ + หน้าฝึกว่าง"
                      : "พรีวิวหน้าคำศัพท์"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {worksheetWords.length} คำ · {totalPageCount} หน้า
                    {missingCount ? ` · ไม่พบ ${missingCount}` : ""}
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-border bg-neutral-200/80 p-3">
                  <div
                    className="mx-auto overflow-hidden"
                    style={{
                      width: A4_WIDTH_PX * PREVIEW_SCALE,
                      height:
                        A4_HEIGHT_PX *
                          PREVIEW_SCALE *
                          (includeBlankPages ? 2 : 1) +
                        (includeBlankPages ? 10 : 0),
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 16,
                        width: A4_WIDTH_PX,
                        transform: `scale(${PREVIEW_SCALE})`,
                        transformOrigin: "top left",
                      }}
                    >
                      <div style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.14)" }}>
                        <A4StrokePage
                          sections={contentPages[0] ?? []}
                          pageIndex={0}
                          pageCount={totalPageCount}
                          gridType={gridType}
                          cellSize={cellSize}
                          cellsPerRow={cellsPerRow}
                        />
                      </div>
                      {includeBlankPages ? (
                        <div
                          style={{
                            boxShadow: "0 1px 4px rgba(0,0,0,0.14)",
                          }}
                        >
                          <A4BlankPage
                            pageIndex={1}
                            pageCount={totalPageCount}
                            gridType={gridType}
                            cellSize={cellSize}
                            cellsPerRow={cellsPerRow}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              <Button
                className="h-12 w-full gap-2 text-base font-semibold"
                onClick={downloadPdf}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Download className="size-5" />
                )}
                {busy ? "กำลังสร้าง PDF…" : "ดาวน์โหลด PDF (A4)"}
              </Button>
            </>
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
            {contentPages.map((page, pageIndex) => {
              const contentPageIndex = includeBlankPages
                ? pageIndex * 2
                : pageIndex;
              return (
              <div key={`export-pair-${pageIndex}`}>
                <A4StrokePage
                  sections={page}
                  pageIndex={contentPageIndex}
                  pageCount={totalPageCount}
                  gridType={gridType}
                  cellSize={cellSize}
                  cellsPerRow={cellsPerRow}
                />
                {includeBlankPages ? (
                  <A4BlankPage
                    pageIndex={contentPageIndex + 1}
                    pageCount={totalPageCount}
                    gridType={gridType}
                    cellSize={cellSize}
                    cellsPerRow={cellsPerRow}
                  />
                ) : null}
              </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
