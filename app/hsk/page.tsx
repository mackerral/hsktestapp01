import { getHskWords } from "@/lib/hsk";
import { getChineseStories } from "@/lib/chinese-stories";
import { HskApp } from "@/components/hsk-app";

// Prerender once at build — no per-visit server function cost.
export const dynamic = "force-static";
export const revalidate = false;

export default async function HskPage() {
  const [words, stories] = await Promise.all([
    getHskWords(),
    getChineseStories(),
  ]);
  return <HskApp wordsByList={words} stories={stories} />;
}
