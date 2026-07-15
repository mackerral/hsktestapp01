import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function expandParenForms(chinese) {
  const m = chinese.match(/（([^）]*)）/);
  if (!m || m.index == null) return [chinese];
  const before = chinese.slice(0, m.index);
  const opt = m[1];
  const after = chinese.slice(m.index + m[0].length);
  return [
    ...expandParenForms(before + opt + after),
    ...expandParenForms(before + after),
  ];
}

function surfaceForms(chinese) {
  const forms = expandParenForms(chinese);
  const out = new Set();
  for (const form of forms) {
    if (!form) continue;
    out.add(form.replace(/\s+/g, ""));
    if (form.endsWith("儿") && form.length > 1) out.add(form.slice(0, -1));
  }
  return [...out];
}

function loadHsk1() {
  const lines = readFileSync(join(root, "HSKList/HSK1_Thai.txt"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(1);
  const entries = [];
  const formToIds = new Map();
  lines.forEach((line, i) => {
    const chinese = line.split("\t")[0];
    const id = `hsk1:${i}`;
    entries.push({ id, chinese });
    for (const form of surfaceForms(chinese)) {
      if (!formToIds.has(form)) formToIds.set(form, []);
      formToIds.get(form).push(id);
    }
  });
  const vocab = [...formToIds.keys()].sort((a, b) => b.length - a.length);
  return { entries, formToIds, vocab };
}

function parseLevel1Sentences(content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let level = null;
  const sentences = [];
  let cards = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("@level")) {
      level = Number(line.replace("@level", "").trim());
      continue;
    }
    if (line.startsWith("@card")) {
      if (level === 1) cards++;
      continue;
    }
    if (line.startsWith("@title")) continue;
    if (level === 1) {
      const pipe = line.indexOf("|");
      sentences.push(pipe >= 0 ? line.slice(0, pipe).trim() : line);
    }
  }
  return { sentences, cards };
}

function segment(text, vocab, formToIds) {
  const found = [];
  let i = 0;
  while (i < text.length) {
    if (!/[\u4e00-\u9fff]/.test(text[i])) {
      i++;
      continue;
    }
    let matched = null;
    for (const w of vocab) {
      if (text.startsWith(w, i)) {
        matched = w;
        break;
      }
    }
    if (matched) {
      found.push(...(formToIds.get(matched) ?? []));
      i += matched.length;
    } else {
      i++;
    }
  }
  return found;
}

const { entries, formToIds, vocab } = loadHsk1();
const content = readFileSync(join(root, "HSKList/sentences-hsk1.txt"), "utf8");
const { sentences, cards } = parseLevel1Sentences(content);
const seen = new Set();
for (const s of sentences) {
  for (const id of segment(s, vocab, formToIds)) seen.add(id);
}
const missing = entries.filter((w) => !seen.has(w.id));
console.log("Cards:", cards);
console.log("Sentences:", sentences.length);
console.log("Covered:", seen.size, "/", entries.length);
console.log("Missing:", missing.length);
if (missing.length) console.log(missing.map((w) => w.chinese).join("、"));
