import { getHskWords } from "@/lib/hsk";
import { HskMenu } from "@/components/hsk-menu";

export default async function HskMenuPage() {
  const words = await getHskWords();

  return <HskMenu wordsByList={words} />;
}
