import { getHskAdvancedWords, getHskWords } from "@/lib/hsk";
import { getChineseStories } from "@/lib/chinese-stories";
import { getSentenceGroups } from "@/lib/get-sentences";
import { HskApp } from "@/components/hsk-app";

// Prerender once at build — no per-visit server function cost.
export const dynamic = "force-static";
export const revalidate = false;

export default async function HskPage() {
  const [words, advancedWords, stories, sentenceGroups] = await Promise.all([
    getHskWords(),
    getHskAdvancedWords(),
    getChineseStories(),
    getSentenceGroups(),
  ]);
  return (
    <HskApp
      wordsByList={words}
      advancedWords={advancedWords}
      stories={stories}
      sentenceGroups={sentenceGroups}
    />
  );
}
