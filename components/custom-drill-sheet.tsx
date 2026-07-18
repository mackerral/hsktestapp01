"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowUp, Dices, Download, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";
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

type FieldKey = "chinese" | "pinyin" | "thai";
type ColorStatus = "known" | "unknown" | "neutral";
type DrillItem = {
  word: HskWord;
  sourceIndex: number;
  color: ColorStatus;
};

type StatusFilter = {
  known: boolean;
  unknown: boolean;
  neutral: boolean;
};

const DEFAULT_STATUSES: StatusFilter = {
  known: true,
  unknown: true,
  neutral: true,
};

const STATUS_ROWS = [
  {
    key: "known" as const,
    label: "เขียว · จำได้",
    dot: "bg-emerald-500",
  },
  {
    key: "unknown" as const,
    label: "แดง · จำไม่ได้",
    dot: "bg-rose-500",
  },
  {
    key: "neutral" as const,
    label: "เทา · ยังไม่ได้กด",
    dot: "bg-slate-400",
  },
] as const;

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

const FIELDS: { key: FieldKey; label: string; short: string }[] = [
  { key: "chinese", label: "คำจีน (汉字)", short: "จีน" },
  { key: "pinyin", label: "พินอิน", short: "พินอิน" },
  { key: "thai", label: "คำแปล", short: "แปล" },
];

/** CSS px at 96dpi ≈ A4 (210×297mm). */
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const PREVIEW_SCALE = 0.38;

/** Hex-only print colors (compatible with PDF canvas export). */
const C = {
  ink: "#171717",
  muted: "#737373",
  faint: "#a3a3a3",
  line: "#e5e5e5",
  rule: "#262626",
  paper: "#ffffff",
  known: "#10b981",
  unknown: "#f43f5e",
  neutral: "#94a3b8",
} as const;

type FontPreset = {
  chinese: number;
  secondary: number;
  index: number;
  header: number;
  /** Words per A4 page when using 2 columns. */
  wordsPerPage: number;
  rowGap: number;
  rowPadY: number;
};

const FONT_S: FontPreset = {
  chinese: 13,
  secondary: 11,
  index: 9,
  header: 9,
  wordsPerPage: 48,
  rowGap: 4,
  rowPadY: 3,
};

type ColumnCount = 2 | 3;

function chunkWords<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages.length ? pages : [[]];
}

function splitColumns<T>(items: T[], columnCount: ColumnCount): T[][] {
  const size = Math.ceil(items.length / columnCount) || 1;
  return Array.from({ length: columnCount }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

function rowGridStyle(showStatus: boolean): CSSProperties {
  return {
    display: "grid",
    // Fixed chinese / pinyin tracks so pinyin starts on one vertical line.
    gridTemplateColumns: showStatus
      ? "14px 20px 2.6em 4.8em minmax(0,1fr)"
      : "20px 2.6em 4.8em minmax(0,1fr)",
    columnGap: 8,
    alignItems: "start",
  };
}

function StatusMark({ color }: { color: ColorStatus }) {
  const fill =
    color === "known"
      ? C.known
      : color === "unknown"
        ? C.unknown
        : C.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 14,
        height: 14,
      }}
      title={color}
    >
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: 999,
          backgroundColor: fill,
          display: "block",
        }}
      />
    </span>
  );
}

function FieldCell({
  value,
  show,
  fontSize,
  emphasize,
}: {
  value: string;
  show: boolean;
  fontSize: number;
  emphasize?: boolean;
}) {
  if (show) {
    return (
      <span
        style={{
          display: "block",
          minWidth: 0,
          whiteSpace: "normal",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          lineHeight: 1.45,
          paddingTop: 1,
          paddingBottom: 1,
          color: C.ink,
          fontSize,
          fontWeight: emphasize ? 600 : 400,
        }}
      >
        {value}
      </span>
    );
  }
  return (
    <span
      style={{
        display: "block",
        boxSizing: "border-box",
        width: "100%",
        height: Math.round(fontSize * 1.35),
        marginTop: 1,
      }}
      aria-hidden
    />
  );
}

function WordRow({
  item,
  index,
  show,
  font,
  showStatus,
}: {
  item: DrillItem;
  index: number;
  show: Record<FieldKey, boolean>;
  font: FontPreset;
  showStatus: boolean;
}) {
  return (
    <div
      style={{
        ...rowGridStyle(showStatus),
        borderBottom: `1px solid ${C.line}`,
        paddingTop: font.rowPadY,
        paddingBottom: font.rowPadY,
        color: C.ink,
      }}
    >
      {showStatus && <StatusMark color={item.color} />}
      <span
        style={{
          fontSize: font.index,
          lineHeight: 1.45,
          fontVariantNumeric: "tabular-nums",
          color: C.faint,
          paddingTop: 2,
        }}
      >
        {index}
      </span>
      <FieldCell
        value={item.word.chinese}
        show={show.chinese}
        fontSize={font.chinese}
        emphasize
      />
      <FieldCell
        value={item.word.pinyin}
        show={show.pinyin}
        fontSize={font.secondary}
      />
      <FieldCell
        value={item.word.thai}
        show={show.thai}
        fontSize={font.secondary}
      />
    </div>
  );
}

function A4Page({
  items,
  pageIndex,
  pageCount,
  show,
  startIndex,
  font,
  columnCount,
  listLabel,
  showStatus,
}: {
  items: DrillItem[];
  pageIndex: number;
  pageCount: number;
  show: Record<FieldKey, boolean>;
  startIndex: number;
  font: FontPreset;
  columnCount: ColumnCount;
  listLabel: string;
  showStatus: boolean;
}) {
  const columns = splitColumns(items, columnCount);
  const columnSize = Math.ceil(items.length / columnCount) || 1;
  const visibleLabel =
    FIELDS.filter((f) => show[f.key])
      .map((f) => f.short)
      .join(" · ") || "—";

  function renderColumn(col: DrillItem[], offset: number, keyPrefix: string) {
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: font.rowGap,
          }}
        >
          {col.map((item, i) => (
            <WordRow
              key={`${keyPrefix}-${startIndex + offset + i}-${item.word.chinese}`}
              item={item}
              index={startIndex + offset + i + 1}
              show={show}
              font={font}
              showStatus={showStatus}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      data-a4-page
      style={{
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
        padding: "36px 40px 32px",
        backgroundColor: C.paper,
        color: C.ink,
        overflow: "hidden",
        fontFamily:
          '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Noto Sans Thai", "Segoe UI", sans-serif',
      }}
    >
      <header
        style={{
          marginBottom: 12,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          borderBottom: `1px solid ${C.rule}`,
          paddingBottom: 10,
          flexShrink: 0,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1.4,
              color: C.ink,
            }}
          >
            HSK Tracker · {listLabel}
          </div>
          {showStatus ? (
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                lineHeight: 1.4,
                color: C.muted,
              }}
            >
              จุดสี = สถานะ
            </div>
          ) : null}
        </div>
        <div
          style={{
            textAlign: "right",
            fontSize: 11,
            lineHeight: 1.4,
            color: C.muted,
          }}
        >
          <div>แสดง: {visibleLabel}</div>
          <div style={{ marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            หน้า {pageIndex + 1}/{pageCount} · {columnCount} คอลัมน์
          </div>
        </div>
      </header>

      <div
        style={{
          display: "flex",
          flex: 1,
          gap: columnCount === 3 ? 10 : 14,
          alignItems: "flex-start",
        }}
      >
        {columns.map((col, columnIndex) => (
          <div key={`col-wrap-${columnIndex}`} style={{ display: "contents" }}>
            {columnIndex > 0 ? (
              <div
                style={{
                  width: 1,
                  alignSelf: "stretch",
                  backgroundColor: C.line,
                  flexShrink: 0,
                }}
              />
            ) : null}
            {renderColumn(col, columnIndex * columnSize, `C${columnIndex}`)}
          </div>
        ))}
      </div>

      <footer
        style={{
          marginTop: "auto",
          paddingTop: 10,
          textAlign: "center",
          fontSize: 10,
          lineHeight: 1.4,
          color: C.faint,
          flexShrink: 0,
        }}
      >
        A4 · HSK Tracker
      </footer>
    </div>
  );
}

export function CustomDrillSheet({
  wordsByList,
  initialListId = "hsk1",
  onClose,
}: {
  wordsByList: Record<ListId, HskWord[]>;
  initialListId?: ListId;
  onClose: () => void;
}) {
  const [listId, setListId] = useState<ListId>(initialListId);
  const words = wordsByList[listId] ?? [];
  const listLabel =
    HSK_LISTS.find((l) => l.id === listId)?.label ?? listId.toUpperCase();

  const [show, setShow] = useState<Record<FieldKey, boolean>>({
    chinese: true,
    pinyin: true,
    thai: false,
  });
  const [statuses, setStatuses] = useState<StatusFilter>({
    ...DEFAULT_STATUSES,
  });
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [shuffleOn, setShuffleOn] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [columnCount, setColumnCount] = useState<ColumnCount>(2);
  const [showStatusInPrint, setShowStatusInPrint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showJumpToDownload, setShowJumpToDownload] = useState(false);
  const pagesRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setStatusMap(loadStatus(listId));
    setStatuses({ ...DEFAULT_STATUSES });
    setShuffleOn(false);
  }, [listId]);

  const font = FONT_S;
  const wordsPerPage =
    columnCount === 3
      ? Math.round(font.wordsPerPage * 1.5)
      : font.wordsPerPage;
  const visibleCount = FIELDS.filter((f) => show[f.key]).length;

  const statusCounts = useMemo(() => {
    const counts = { known: 0, unknown: 0, neutral: 0 };
    words.forEach((word, index) => {
      const id = wordId(word.chinese, word.pinyin, index);
      const s = statusMap[id];
      if (s === "known") counts.known += 1;
      else if (s === "unknown") counts.unknown += 1;
      else counts.neutral += 1;
    });
    return counts;
  }, [words, statusMap]);

  const selectedItems = useMemo(() => {
    const colorOn = statuses.known || statuses.unknown || statuses.neutral;
    if (!colorOn) return [];
    const filtered: DrillItem[] = [];
    words.forEach((word, index) => {
      const id = wordId(word.chinese, word.pinyin, index);
      const s = statusMap[id];
      const color: ColorStatus =
        s === "known" ? "known" : s === "unknown" ? "unknown" : "neutral";

      let colorMatch = false;
      if (color === "known") colorMatch = statuses.known;
      else if (color === "unknown") colorMatch = statuses.unknown;
      else colorMatch = statuses.neutral;

      if (colorMatch) {
        filtered.push({
          word,
          sourceIndex: index,
          color,
        });
      }
    });
    return shuffleOn ? shuffleSeeded(filtered, shuffleSeed) : filtered;
  }, [words, statusMap, statuses, shuffleOn, shuffleSeed]);

  const pages = useMemo(
    () => chunkWords(selectedItems, wordsPerPage),
    [selectedItems, wordsPerPage],
  );

  useEffect(() => {
    const root = scrollRef.current;
    const preview = previewRef.current;
    if (!root || !preview) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowJumpToDownload(
          entry.isIntersecting && entry.intersectionRatio > 0,
        );
      },
      { root, threshold: [0, 0.05, 0.15] },
    );
    observer.observe(preview);
    return () => observer.disconnect();
  }, [selectedItems.length, pages.length, listId]);

  function scrollToDownload() {
    downloadRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  function toggle(key: FieldKey) {
    setShow((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!FIELDS.some((f) => next[f.key])) return prev;
      return next;
    });
  }

  function toggleStatus(key: keyof StatusFilter) {
    setStatuses((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.known && !next.unknown && !next.neutral) {
        return prev;
      }
      return next;
    });
  }

  function reshuffle() {
    setShuffleOn(true);
    setShuffleSeed((s) => s + 1);
  }

  const previewWord = words[0] ?? {
    chinese: "爱",
    pinyin: "ài",
    thai: "รัก",
    pos: "",
  };

  async function downloadPdf() {
    if (!pagesRef.current || busy) return;
    setBusy(true);
    setPdfProgress(0);
    setError(null);
    try {
      const nodes = Array.from(
        pagesRef.current.querySelectorAll<HTMLElement>("[data-a4-page]"),
      );
      if (!nodes.length) throw new Error("ไม่มีคำในรายการที่เลือก");

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      for (let i = 0; i < nodes.length; i++) {
        const canvas = await html2canvas(nodes[i], {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
          width: nodes[i].offsetWidth,
          height: nodes[i].offsetHeight,
          onclone: (clonedDoc, element) => {
            clonedDoc
              .querySelectorAll('style, link[rel="stylesheet"]')
              .forEach((node) => node.remove());
            element.style.color = "#171717";
            element.style.backgroundColor = "#ffffff";
            element.style.overflow = "visible";
          },
        });
        const img = canvas.toDataURL("image/jpeg", 0.95);
        if (i > 0) pdf.addPage();
        pdf.addImage(img, "JPEG", 0, 0, 210, 297, undefined, "FAST");
        setPdfProgress(Math.round(((i + 1) / nodes.length) * 100));
      }

      pdf.save(`${listId}-custom-drill.pdf`);
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
      aria-labelledby="custom-drill-title"
    >
      <div className="shrink-0 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="custom-drill-title"
              className="text-lg font-semibold tracking-tight"
            >
              แบบฝึกหัดแบบเว้นช่องว่าง
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {listLabel} · ใช้ {selectedItems.length}/{words.length} คำ · ขนาด
              A4
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

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <section className="rounded-xl border border-border p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">ระดับ HSK</span>
              <span className="text-xs text-muted-foreground">
                {listLabel} · {words.length} คำ
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {HSK_LISTS.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => setListId(list.id)}
                  className={cn(
                    "rounded-lg border px-2 py-2.5 text-center text-sm font-medium",
                    listId === list.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {list.label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border p-4">
            <div className="text-sm font-medium">เลือกส่วนที่แสดง</div>
            <p className="mt-1 text-xs text-muted-foreground">
              ส่วนที่ปิดจะกลายเป็นช่องว่างใน PDF ให้เขียนเอง (ต้องเปิดอย่างน้อย 1
              ส่วน)
            </p>

            <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5">
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                ตัวอย่าง 1 คำ
              </div>
              <div className="flex items-end gap-2 text-sm">
                {showStatusInPrint && (
                  <span
                    className="mb-0.5 size-2.5 shrink-0 rounded-full bg-emerald-500"
                    title="ตัวอย่างสถานะ"
                  />
                )}
                <span className="w-4 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  1
                </span>
                <span className="min-w-[2.5rem] font-semibold">
                  {show.chinese ? (
                    previewWord.chinese
                  ) : (
                    <span className="inline-block min-h-[1em] w-full min-w-[2rem]" />
                  )}
                </span>
                <span className="min-w-[3rem] text-muted-foreground">
                  {show.pinyin ? (
                    previewWord.pinyin
                  ) : (
                    <span className="inline-block min-h-[1em] w-full min-w-[2.5rem]" />
                  )}
                </span>
                <span className="min-w-[3rem] text-muted-foreground">
                  {show.thai ? (
                    previewWord.thai
                  ) : (
                    <span className="inline-block min-h-[1em] w-full min-w-[2.5rem]" />
                  )}
                </span>
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              {FIELDS.map((field) => (
                <button
                  key={field.key}
                  type="button"
                  onClick={() => toggle(field.key)}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm",
                    show[field.key]
                      ? "border-foreground bg-accent/50"
                      : "border-border opacity-70 hover:bg-muted",
                  )}
                >
                  <span className="font-medium">{field.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {show[field.key] ? "แสดง" : "ซ่อน"}
                  </span>
                </button>
              ))}
            </div>
            {visibleCount === 1 && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                เหลือส่วนที่แสดง 1 ส่วน — ส่วนอื่นจะเป็นช่องว่างสำหรับฝึกเขียน
              </p>
            )}
          </section>

          <section className="rounded-xl border border-border p-4">
            <div className="text-sm font-medium">เลือกศัพท์ตามสถานะ</div>
            <p className="mt-1 text-xs text-muted-foreground">
              รวมคำตามสีที่เปิดไว้ (เช่น แดง + เขียว = คำแดงและเขียวทั้งหมด)
            </p>
            <div className="mt-3 grid gap-2">
              {STATUS_ROWS.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => toggleStatus(row.key)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm",
                    statuses[row.key]
                      ? "border-foreground bg-accent/50"
                      : "border-border opacity-60",
                  )}
                >
                  <span className={cn("size-3.5 rounded-full", row.dot)} />
                  <span className="min-w-0 flex-1 font-medium">
                    {row.label}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      · {statusCounts[row.key]} คำ
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {statuses[row.key] ? "ใช้" : "ปิด"}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              เลือกแล้ว {selectedItems.length} คำ
            </p>

            <button
              type="button"
              onClick={() => setShowStatusInPrint((v) => !v)}
              className={cn(
                "mt-3 flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm",
                showStatusInPrint
                  ? "border-foreground bg-accent/50"
                  : "border-border hover:bg-muted",
              )}
            >
              <span className="min-w-0">
                <span className="block font-medium">แสดงสถานะใน PDF</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  จุดสีก่อนเลขที่
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {showStatusInPrint ? "เปิด" : "ปิด"}
              </span>
            </button>
          </section>

          <section className="rounded-xl border border-border p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">จำนวนคอลัมน์</span>
              <span className="text-xs text-muted-foreground">
                {columnCount} คอลัมน์ · ~{pages.length} หน้า
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setColumnCount(n)}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm font-medium",
                    columnCount === n
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {n} คอลัมน์
                </button>
              ))}
            </div>
          </section>

          <div ref={downloadRef} className="space-y-4">
            <section className="rounded-xl border border-border p-4">
              <div className="text-sm font-medium">ลำดับคำ</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShuffleOn(false)}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm font-medium",
                    !shuffleOn
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted",
                  )}
                >
                  ตามลำดับเดิม
                </button>
                <button
                  type="button"
                  onClick={() => setShuffleOn(true)}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium",
                    shuffleOn
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <Dices className="size-4" aria-hidden />
                  สุ่ม order
                </button>
              </div>
              {shuffleOn && (
                <button
                  type="button"
                  onClick={reshuffle}
                  className="mt-2 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted"
                >
                  <Dices className="size-4" aria-hidden />
                  สุ่มใหม่
                </button>
              )}
            </section>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                className="h-12 flex-1 gap-2 text-base font-semibold"
                onClick={downloadPdf}
                disabled={busy || selectedItems.length === 0}
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Download className="size-5" />
                )}
                {busy ? "กำลังสร้าง PDF…" : "ดาวน์โหลด PDF (A4)"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground sm:max-w-[12rem] sm:text-left">
                สร้างในเครื่อง · {selectedItems.length} คำ · ~{pages.length} หน้า
              </p>
            </div>
            {busy ? (
              <div className="space-y-1.5" aria-live="polite">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>กำลังสร้างไฟล์ PDF</span>
                  <span className="tabular-nums">{pdfProgress}%</span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="ความคืบหน้าการสร้าง PDF"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pdfProgress}
                >
                  <div
                    className="h-full rounded-full bg-foreground transition-[width] duration-300"
                    style={{ width: `${pdfProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
          {selectedItems.length === 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              ไม่มีคำตามสถานะที่เลือก — เปิดเขียว/แดง/เทาอย่างน้อยหนึ่งแบบ
            </p>
          )}
          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          )}

          <section ref={previewRef}>
            <div className="mb-2 text-sm font-medium">พรีวิว A4</div>
            {selectedItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                ยังไม่มีคำให้พรีวิว
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-neutral-200/80 p-3">
                <div
                  className="mx-auto overflow-hidden bg-transparent"
                  style={{
                    width: A4_WIDTH_PX * PREVIEW_SCALE,
                    height:
                      A4_HEIGHT_PX * PREVIEW_SCALE * pages.length +
                      Math.max(0, pages.length - 1) * 10,
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
                    {pages.map((pageItems, pageIndex) => (
                      <div
                        key={`preview-${pageIndex}`}
                        style={{
                          boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                        }}
                      >
                        <A4Page
                          items={pageItems}
                          pageIndex={pageIndex}
                          pageCount={pages.length}
                          show={show}
                          startIndex={pageIndex * wordsPerPage}
                          font={font}
                          columnCount={columnCount}
                          listLabel={listLabel}
                          showStatus={showStatusInPrint}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {showJumpToDownload && (
        <button
          type="button"
          onClick={scrollToDownload}
          className="fixed right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[90] inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-3 text-sm font-semibold shadow-lg hover:bg-muted"
        >
          <ArrowUp className="size-4" aria-hidden />
          ไปดาวน์โหลด
        </button>
      )}

      <div
        aria-hidden
        style={{
          pointerEvents: "none",
          position: "fixed",
          top: 0,
          left: -10000,
          zIndex: -1,
          backgroundColor: "#ffffff",
          color: "#171717",
        }}
      >
        <div ref={pagesRef} style={{ display: "flex", flexDirection: "column" }}>
          {pages.map((pageItems, pageIndex) => (
            <A4Page
              key={`export-${pageIndex}`}
              items={pageItems}
              pageIndex={pageIndex}
              pageCount={pages.length}
              show={show}
              startIndex={pageIndex * wordsPerPage}
              font={font}
              columnCount={columnCount}
              listLabel={listLabel}
              showStatus={showStatusInPrint}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
