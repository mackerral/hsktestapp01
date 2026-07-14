import { notFound } from "next/navigation";
import { getHskWords } from "@/lib/hsk";
import { HskChecker } from "@/components/hsk-checker";
import { isListId } from "@/lib/hsk-lists";

export default async function HskListPage({
  params,
}: {
  params: Promise<{ list: string }>;
}) {
  const { list } = await params;
  if (!isListId(list)) notFound();

  const words = await getHskWords();

  return <HskChecker listId={list} words={words[list]} />;
}
