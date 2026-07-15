/**
 * Extra glossary for story OOV (not in HSK lists as standalone keys).
 * level stays null → shown as unknown (?), but with pinyin + Thai.
 */
export const STORY_EXTRA_VOCAB: Record<
  string,
  { pinyin: string; thai: string }
> = {
  北京: { pinyin: "Běijīng", thai: "ปักกิ่ง" },
  幸好: { pinyin: "xìnghǎo", thai: "โชคดีที่" },
  李明: { pinyin: "Lǐ Míng", thai: "หลี่หมิง (ชื่อคน)" },
  李: { pinyin: "Lǐ", thai: "ลี่ (นามสกุล/ชื่อ)" },
  明: { pinyin: "míng", thai: "หมิง / สว่าง" },
  马克: { pinyin: "Mǎkè", thai: "มาร์ค (ชื่อคน)" },
  小明: { pinyin: "Xiǎomíng", thai: "เสี่ยวหมิง (ชื่อคน)" },
  小李: { pinyin: "Xiǎolǐ", thai: "เสี่ยวหลี่ (ชื่อคน)" },
  小华: { pinyin: "Xiǎohuá", thai: "เสี่ยวหัว (ชื่อคน)" },
  小莉: { pinyin: "Xiǎolì", thai: "เสี่ยวลี่ (ชื่อคน)" },
  小王: { pinyin: "Xiǎowáng", thai: "เสี่ยวหวัง (ชื่อคน)" },
  安娜: { pinyin: "Ānnà", thai: "อันนา (ชื่อคน)" },
  玛丽: { pinyin: "Mǎlì", thai: "มารี (ชื่อคน)" },
  小雅: { pinyin: "Xiǎoyǎ", thai: "เสี่ยวหยา (ชื่อคน)" },
  王先生: { pinyin: "Wáng xiānsheng", thai: "คุณหวัง" },
  李老师: { pinyin: "Lǐ lǎoshī", thai: "ครูหลี่" },
  王校长: { pinyin: "Wáng xiàozhǎng", thai: "อธิการบดีหวัง / ครูใหญ่หวัง" },
  王强: { pinyin: "Wáng Qiáng", thai: "หวังเฉียง (ชื่อคน)" },
  王林: { pinyin: "Wáng Lín", thai: "หวังหลิน (ชื่อคน)" },
  小红: { pinyin: "Xiǎohóng", thai: "เสี่ยวหง (ชื่อคน)" },
  小美: { pinyin: "Xiǎoměi", thai: "เสี่ยวเหม่ย (ชื่อคน)" },
};

export function applyExtraVocab(
  map: Map<
    string,
    {
      pinyin: string;
      thai: string;
      level: number | null;
      lemma: string;
      entryIds: string[];
    }
  >,
) {
  for (const [chinese, entry] of Object.entries(STORY_EXTRA_VOCAB)) {
    if (map.has(chinese)) continue;
    map.set(chinese, {
      pinyin: entry.pinyin,
      thai: entry.thai,
      level: null,
      lemma: chinese,
      entryIds: [],
    });
  }
}
