// 수동 입력 양식 생성: data/manual/YYYY-MM-DD.csv
// 검색어 × 중량 한 줄씩. 숫자 칸만 채우면 된다.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "keywords.json"), "utf8"));
const SLOTS = CONFIG.manual.priceSlots;

const date = process.argv[2] || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const file = path.join(ROOT, "data", "manual", `${date}.csv`);
if (fs.existsSync(file)) {
  console.log(`이미 있음: ${path.relative(ROOT, file)} (덮어쓰지 않음)`);
  process.exit(0);
}

const header = ["검색어", "품목", "중량", "우리순위", "비교제외수", ...Array.from({ length: SLOTS }, (_, i) => `가격${i + 1}`), "비고"];
const rows = [header];
for (const it of CONFIG.items) {
  for (const kw of it.keywords) {
    for (const wt of it.weights) {
      rows.push([kw, it.name, wt, "", "", ...Array(SLOTS).fill(""), ""]);
    }
  }
}
const csv = "﻿" + rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n") + "\n";
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, csv);
console.log(`생성: ${path.relative(ROOT, file)} (${rows.length - 1}행)`);
