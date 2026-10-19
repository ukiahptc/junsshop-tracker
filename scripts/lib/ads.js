// 네이버 광고주센터 '소재' 보고서(xlsx) → 상품별 광고 성과
const fs = require("fs");
const path = require("path");
const { readXlsx } = require("./xlsx-lite");

const num = (v) => { if (typeof v === "number") return v; const t = String(v ?? "").replace(/[,\s원%]/g, ""); return t === "" || isNaN(Number(t)) ? null : Number(t); };

// 소재 열: "상품명,가격,카테고리,URL,네이버상품ID,스토어상품번호"
function parseCreative(s) {
  const parts = String(s || "").split(",");
  return { title: parts[0] || "", price: num(parts[1]), category: parts[2] || "", url: parts[3] || "", naverId: parts[4] || "", storeId: parts[5] || "" };
}

function loadAds(dir) {
  if (!fs.existsSync(dir)) return { files: [], latest: null };
  const files = fs.readdirSync(dir).filter((f) => /\.xlsx$/i.test(f)).sort();
  if (!files.length) return { files, latest: null };
  const file = files[files.length - 1];
  const rows = readXlsx(fs.readFileSync(path.join(dir, file)));
  const header = rows[0].map((h) => String(h).trim());
  const col = (n) => { const i = header.indexOf(n); return i >= 0 ? i : header.findIndex((h) => h.startsWith(n)); };
  const out = [];
  for (const r of rows.slice(1)) {
    const c = parseCreative(r[col("소재")]);
    if (!c.title || /결과$/.test(c.title)) continue;
    out.push({
      ...c, status: r[col("상태")] || "", bidType: r[col("입찰가 유형")] || "", bid: num(r[col("입찰가")]), quality: num(r[col("품질지수")]),
      impressions: num(r[col("노출수")]) ?? 0, clicks: num(r[col("클릭수")]) ?? 0, ctr: num(r[col("클릭률")]), cpc: num(r[col("평균 CPC")]), cost: num(r[col("총비용")]) ?? 0,
      conversions: num(r[col("총 전환수")]) ?? 0, convRate: num(r[col("총 전환율")]), revenue: num(r[col("총 전환매출액")]) ?? 0, roas: num(r[col("총 광고수익률")]),
      purchases: num(r[col("구매완료 전환수")]) ?? 0, purchaseRevenue: num(r[col("구매완료 전환매출액")]) ?? 0,
    });
  }
  const date = (file.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || null;
  return { files, latest: { file, date, creatives: out } };
}

module.exports = { loadAds, parseCreative };
