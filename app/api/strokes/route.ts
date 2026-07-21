import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const MAX_CHARACTERS = 80;
const HANZI = /\p{Script=Han}/u;

type StrokeFile = {
  strokes?: unknown;
  medians?: unknown;
};

type StrokeGlyph = {
  strokes: string[];
  medians: number[][][];
};

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

async function loadGlyph(character: string): Promise<StrokeGlyph | null> {
  try {
    const file = path.join(
      process.cwd(),
      "node_modules",
      "hanzi-writer-data",
      `${character}.json`,
    );
    const parsed = JSON.parse(await readFile(file, "utf8")) as StrokeFile;
    if (!validStrokes(parsed.strokes)) return null;
    return {
      strokes: parsed.strokes,
      medians: validMedians(parsed.medians) ? parsed.medians : [],
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let characters: unknown;
  try {
    ({ characters } = (await request.json()) as { characters?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(characters)) {
    return NextResponse.json(
      { error: "characters must be an array" },
      { status: 400 },
    );
  }

  const unique = Array.from(
    new Set(
      characters
        .filter(
          (character): character is string =>
            typeof character === "string" &&
            Array.from(character).length === 1 &&
            HANZI.test(character),
        )
        .slice(0, MAX_CHARACTERS),
    ),
  );

  const entries = await Promise.all(
    unique.map(async (character) => [
      character,
      await loadGlyph(character),
    ] as const),
  );

  return NextResponse.json(
    { data: Object.fromEntries(entries) },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
