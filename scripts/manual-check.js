// 수동 입력 CSV 검증 + 검색어·중량별 최저가/중간값 출력
// 사용: node scripts/manual-check.js [data/manual/YYYY-MM-DD.csv]  (생략 시 가장 최근 파일)
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "data", "manual");

let file = process.argv[2];
if (!file) {
  const files = fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort();
  if (!files.length) { console.log("data/manual 에 CSV 없음"); process.exit(0); }
  file = path.join(DIR, files[files.length - 1]);
}

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const toNum = (s) => { const t = String(s).replace(/[,\s원]/g, ""); return t === "" ? null : Number(t); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const rows = parseCsv(fs.readFileSync(file, "utf8"));
const header = rows[0].map((h) => h.trim());
const col = (name) => header.indexOf(name);
const priceCols = header.map((h, i) => (/^가격\d+$/.test(h) ? i : -1)).filter((i) => i >= 0);
const errors = [];
const out = [];

for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  const kw = row[col("검색어")], wt = row[col("중량")];
  const line = r + 1;
  const prices = [];
  for (const c of priceCols) {
    const v = toNum(row[c] ?? "");
    if (v === null) continue;
    if (!Number.isFinite(v) || v <= 0) { errors.push(`${line}행 ${header[c]}: 숫자가 아님 "${row[c]}"`); continue; }
    if (v < 1000 || v > 200000) errors.push(`${line}행 ${header[c]}: 범위 의심 ${v}원`);
    prices.push(v);
  }
  const rank = toNum(row[col("우리순위")] ?? "");
  if (rank !== null && (!Number.isInteger(rank) || rank < 1)) errors.push(`${line}행 우리순위: 1 이상 정수여야 함 "${row[col("우리순위")]}"`);
  const excl = toNum(row[col("비교제외수")] ?? "");
  if (excl !== null && (!Number.isInteger(excl) || excl < 0)) errors.push(`${line}행 비교제외수: 0 이상 정수여야 함`);
  out.push({ kw, wt, n: prices.length, min: prices.length ? Math.min(...prices) : null, med: prices.length ? median(prices) : null, rank });
}

console.log(`파일: ${path.relative(ROOT, file)}`);
console.log("검색어 | 중량 | 입력수 | 최저가 | 중간값 | 우리순위");
for (const o of out) {
  const f = (v) => (v === null ? "-" : v.toLocaleString("ko-KR"));
  console.log(`${o.kw} | ${o.wt} | ${o.n} | ${f(o.min)} | ${f(o.med)} | ${o.rank === null ? "-" : o.rank}`);
}
if (errors.length) {
  console.error("\n오류:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("\n검증 통과");
