import { readFileSync } from "fs";

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
function loadList(file, prefix) {
  const lines = readFileSync(`HSKList/${file}`, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(1);
  const entries = [];
  const formToIds = new Map();
  lines.forEach((line, i) => {
    const chinese = line.split("\t")[0];
    const id = `${prefix}:${i}`;
    entries.push({ id, chinese });
    for (const form of surfaceForms(chinese)) {
      if (!formToIds.has(form)) formToIds.set(form, []);
      formToIds.get(form).push(id);
    }
  });
  return { entries, formToIds };
}

const h1 = loadList("HSK1_Thai.txt", "hsk1");
const h2 = loadList("HSK2_Thai.txt", "hsk2");
const formToIds = new Map();
for (const [f, ids] of h1.formToIds) formToIds.set(f, [...ids]);
for (const [f, ids] of h2.formToIds) {
  if (!formToIds.has(f)) formToIds.set(f, []);
  formToIds.get(f).push(...ids);
}
const vocab = [...formToIds.keys()].sort((a, b) => b.length - a.length);

function parseLevel(content, want) {
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
      if (level === want) cards++;
      continue;
    }
    if (line.startsWith("@title")) continue;
    if (level === want) {
      const p = line.indexOf("|");
      sentences.push(p >= 0 ? line.slice(0, p).trim() : line);
    }
  }
  return { sentences, cards };
}

function analyze(text) {
  const ids = [];
  const unk = [];
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
      ids.push(...(formToIds.get(matched) || []));
      i += matched.length;
    } else {
      unk.push(text[i]);
      i++;
    }
  }
  return { ids, unk };
}

const content = readFileSync("HSKList/sentences-hsk2.txt", "utf8");
const { sentences, cards } = parseLevel(content, 2);
const seenH2 = new Set();
const unkChars = new Set();
for (const s of sentences) {
  const { ids, unk } = analyze(s);
  for (const id of ids) if (id.startsWith("hsk2:")) seenH2.add(id);
  for (const u of unk) unkChars.add(u);
}
const missing = h2.entries.filter((w) => !seenH2.has(w.id));
console.log("Cards:", cards);
console.log("Sentences:", sentences.length);
console.log("HSK2 covered:", seenH2.size, "/", h2.entries.length);
console.log("Unknown CJK:", [...unkChars].join("") || "(none)");
console.log("Missing:", missing.length);
if (missing.length) console.log(missing.map((w) => w.chinese).join("、"));
