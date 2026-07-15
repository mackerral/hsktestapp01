import { readFileSync } from "fs";

function expandParenForms(chinese) {
  const m = chinese.match(/（([^）]*)）/);
  if (!m || m.index == null) return [chinese];
  const b = chinese.slice(0, m.index),
    o = m[1],
    a = chinese.slice(m.index + m[0].length);
  return [
    ...expandParenForms(b + o + a),
    ...expandParenForms(b + a),
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

const maps = [
  loadList("HSK1_Thai.txt", "hsk1"),
  loadList("HSK2_Thai.txt", "hsk2"),
  loadList("HSK3_Thai.txt", "hsk3"),
];
const formToIds = new Map();
for (const L of maps)
  for (const [f, ids] of L.formToIds) {
    if (!formToIds.has(f)) formToIds.set(f, []);
    formToIds.get(f).push(...ids);
  }
const vocab = [...formToIds.keys()].sort((a, b) => b.length - a.length);
const h3 = maps[2];
const content = readFileSync("HSKList/sentences-hsk3.txt", "utf8");
let level = null;
const sentences = [];
let cards = 0;
for (const raw of content.split(/\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  if (line.startsWith("@level")) {
    level = +line.replace("@level", "").trim();
    continue;
  }
  if (line.startsWith("@card")) {
    if (level === 3) cards++;
    continue;
  }
  if (line.startsWith("@title")) continue;
  if (level === 3) {
    const p = line.indexOf("|");
    sentences.push(p >= 0 ? line.slice(0, p).trim() : line);
  }
}
const seen = new Set();
const unk = new Set();
const unkSents = [];
for (const s of sentences) {
  let i = 0;
  let bad = false;
  while (i < s.length) {
    if (!/[\u4e00-\u9fff]/.test(s[i])) {
      i++;
      continue;
    }
    let m = null;
    for (const w of vocab) {
      if (s.startsWith(w, i)) {
        m = w;
        break;
      }
    }
    if (m) {
      for (const id of formToIds.get(m) || [])
        if (id.startsWith("hsk3:")) seen.add(id);
      i += m.length;
    } else {
      unk.add(s[i]);
      bad = true;
      i++;
    }
  }
  if (bad) unkSents.push(s);
}
const missing = h3.entries.filter((w) => !seen.has(w.id));
console.log("Cards", cards, "Sents", sentences.length);
console.log("Covered", seen.size, "/", h3.entries.length);
console.log("Unknown", [...unk].join("") || "(none)");
console.log(
  "Missing",
  missing.length,
  missing.map((w) => w.chinese).join("、") || "(none)",
);
unkSents.forEach((x) => console.log("UNKSENT", x));
