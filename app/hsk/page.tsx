import { getHskWords } from "@/lib/hsk";
import { HskApp } from "@/components/hsk-app";

// Prerender once at build — no per-visit server function cost.
export const dynamic = "force-static";
export const revalidate = false;

export default async function HskPage() {
  const words = await getHskWords();
  return <HskApp wordsByList={words} />;
}
