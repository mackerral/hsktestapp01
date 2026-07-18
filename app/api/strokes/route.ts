import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const MAX_CHARACTERS = 80;
const HANZI = /\p{Script=Han}/u;

type StrokeFile = {
  strokes?: unknown;
};

async function loadStrokes(character: string): Promise<string[] | null> {
  try {
    const file = path.join(
      process.cwd(),
      "node_modules",
      "hanzi-writer-data",
      `${character}.json`,
    );
    const parsed = JSON.parse(await readFile(file, "utf8")) as StrokeFile;
    if (
      !Array.isArray(parsed.strokes) ||
      !parsed.strokes.every((stroke) => typeof stroke === "string")
    ) {
      return null;
    }
    return parsed.strokes;
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
      await loadStrokes(character),
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
