// 준스샵스 상품 SEO 분석
//  입력: config/keywords.json, config/products.json, config/seo-rules.json,
//        data/trend/*.json (검색 수요), data/shop/*.json (북마클릿 캡처, 선택), data/manual/*.csv (수동 입력, 선택)
//  출력: reports/seo/YYYY-MM-DD.md, reports/seo/latest.md, reports/seo/latest.json, docs/index.html
//  사용: node scripts/seo-analyze.js                      # 전체 분석
//        node scripts/seo-analyze.js --title "상품명 후보"   # 상품명 후보만 빠르게 진단 (1번 품목 기준, --item N 으로 변경)
// 외부 패키지 없음 (Node 20+)
const fs = require("fs");
const path = require("path");
const { auditTitle, auditTags, gradeOf, tokens, norm } = require("./lib/seo-title");
const { analyzeKeyword, median } = require("./lib/seo-shop");
const { renderHtml } = require("./lib/seo-html");

const ROOT = path.resolve(__dirname, "..");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const KW = readJson(path.join(ROOT, "config", "keywords.json"));
const PRODUCTS = readJson(path.join(ROOT, "config", "products.json"));
const RULES = readJson(path.join(ROOT, "config", "seo-rules.json"));

const args = process.argv.slice(2);
const argOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const TODAY = argOf("--date") || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const STORE_NAMES = [PRODUCTS.store?.name, ...(PRODUCTS.store?.aliases || []), "준스샵"].filter(Boolean);

// ---------- 품목 + 등록 정보 결합 ----------
function buildProducts() {
  return KW.items.map((it, i) => {
    const p = (PRODUCTS.products || []).find((x) => x.name === it.name) || {};
    return {
      idx: i + 1, name: it.name, keywords: it.keywords, weights: it.weights,
      title: p.title || "", titleUpdated: p.titleUpdated || "", ads: p.ads || [], tags: p.tags || [], tagCounts: p.tagCounts || {}, category: p.category || "", price: p.price ?? null, url: p.url || "",
      elements: p.elements || {}, registered: Boolean(p.title),
    };
  });
}

// ---------- 상품명 후보 빠른 진단 ----------
if (argOf("--title") !== null) {
  const products = buildProducts();
  const n = Number(argOf("--item") || 1);
  const base = products[n - 1];
  if (!base) { console.error(`--item ${n}: 품목이 없습니다 (1~${products.length})`); process.exit(1); }
  const t = auditTitle({ ...base, title: argOf("--title") }, RULES);
  console.log(`품목: ${base.name}\n상품명: ${t.title}\n점수: ${t.score}/100 (${gradeOf(t.score, RULES)})`);
  for (const c of t.checks) console.log(`  [${c.status === "pass" ? "O" : c.status === "warn" ? "△" : "X"}] ${c.label}: ${c.detail} (${c.earned}/${c.max})`);
  if (t.extraTokens.length) console.log(`추가 검토 키워드: ${t.extraTokens.join(", ")}`);
  process.exit(0);
}

// ---------- 검색 수요 (최신 트렌드 파일) ----------
function loadTrend() {
  const dir = path.join(ROOT, "data", "trend");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
  if (!files.length) return { file: null, groups: [], days: 0 };
  const latest = readJson(path.join(dir, files[files.length - 1]));
  const groups = [];
  for (const [ri, req] of (latest.requests || []).entries()) {
    for (const g of req.results || []) {
      const data = (g.data || []).map((d) => ({ date: d.period, ratio: d.ratio }));
      groups.push({ request: ri, name: g.title, keywords: g.keywords, data });
    }
  }
  // 요청(request) 단위로 점유율 계산 (같은 요청끼리만 비교 가능)
  const avg = (a) => (a.length ? a.reduce((s, d) => s + d.ratio, 0) / a.length : 0);
  const byReq = {};
  for (const g of groups) {
    g.avg30 = avg(g.data); g.avg7 = avg(g.data.slice(-7)); g.prev7 = avg(g.data.slice(-14, -7));
    g.change = g.prev7 ? Math.round(((g.avg7 - g.prev7) / g.prev7) * 1000) / 10 : null;
    const peak = g.data.reduce((m, d) => (d.ratio > (m?.ratio ?? -1) ? d : m), null);
    g.peak = peak; g.last = g.data[g.data.length - 1] || null;
    byReq[g.request] = (byReq[g.request] || 0) + g.avg30;
  }
  for (const g of groups) g.share = byReq[g.request] ? Math.round((g.avg30 / byReq[g.request]) * 1000) / 10 : null;
  return { file: files[files.length - 1], date: latest.date, startDate: latest.startDate, endDate: latest.endDate, groups, days: groups[0]?.data.length || 0, fileCount: files.length };
}

// ---------- 쇼핑 캡처 (data/shop/*.json) ----------
function loadShop() {
  // 파일명 "YYYY-MM-DD.json" 또는 "YYYY-MM-DD (1).json"(브라우저 중복 다운로드 이름)을 모두 읽어 날짜별로 검색어 단위 병합 (나중 파일 우선)
  const dir = path.join(ROOT, "data", "shop");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}.*\.json$/.test(f)).sort((a, b) => a.localeCompare(b, "en", { numeric: true })) : [];
  const byDate = {};
  for (const f of files) {
    const date = f.slice(0, 10);
    const json = readJson(path.join(dir, f));
    if (!byDate[date]) byDate[date] = { file: f, date, json: { ...json, keywords: [] } };
    for (const k of json.keywords || []) {
      if (!(k.items || []).length) continue;
      const prev = byDate[date].json.keywords.find((x) => x.keyword === k.keyword);
      if (prev && String(prev.capturedAt || "") > String(k.capturedAt || "")) continue; // 캡처 시각이 늦은 쪽 우선
      byDate[date].json.keywords = byDate[date].json.keywords.filter((x) => x.keyword !== k.keyword);
      byDate[date].json.keywords.push(k);
    }
  }
  const all = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  const withData = all.filter((x) => x.json.keywords.length);
  return { files, latest: withData[withData.length - 1] || null, history: withData };
}

// ---------- 수동 CSV (대체 수단) ----------
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
function loadManual() {
  const dir = path.join(ROOT, "data", "manual");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort() : [];
  const toNum = (s) => { const t = String(s ?? "").replace(/[,\s원]/g, ""); return t === "" ? null : Number(t); };
  const parsed = files.map((f) => {
    const rows = parseCsv(fs.readFileSync(path.join(dir, f), "utf8"));
    const h = rows[0].map((x) => x.trim());
    const col = (n) => h.indexOf(n);
    const priceCols = h.map((x, i) => (/^가격\d+$/.test(x) ? i : -1)).filter((i) => i >= 0);
    const entries = rows.slice(1).map((r) => {
      const prices = priceCols.map((c) => toNum(r[c])).filter((v) => v !== null && Number.isFinite(v) && v > 0);
      return { keyword: r[col("검색어")], item: r[col("품목")], weight: r[col("중량")], rank: toNum(r[col("우리순위")]), prices };
    });
    return { file: f, date: f.slice(0, 10), entries, hasData: entries.some((e) => e.prices.length || e.rank !== null) };
  });
  const withData = parsed.filter((p) => p.hasData);
  return { files, latest: withData[withData.length - 1] || null, history: withData };
}

// ---------- 분석 ----------
function analyze() {
  const products = buildProducts();
  const trend = loadTrend();
  const shop = loadShop();
  const manual = loadManual();
  const actions = [];
  const act = (priority, kind, target, content) => actions.push({ priority, kind, target, content });

  for (const p of products) {
    p.titleAudit = auditTitle(p, RULES);
    p.tagAudit = auditTags(p, RULES);
    p.grade = gradeOf(p.titleAudit.score, RULES);
    if (!p.registered) act("높음", "설정", p.name, "config/products.json에 실제 등록 상품명·태그·판매가 입력");
    for (const c of p.titleAudit.checks) {
      if (c.status === "fail") act("높음", "상품명", p.name, `${c.label}: ${c.detail}`);
      else if (c.status === "warn") act("중간", "상품명", p.name, `${c.label}: ${c.detail}`);
    }
    if (p.titleAudit.extraTokens.length) act("중간", "상품명", p.name, `추적 검색어 중 상품명에 없는 단어 검토: ${p.titleAudit.extraTokens.join(", ")} (50자 이내에서 추가 또는 태그로 보완)`);
    if (!p.tags.length) act("높음", "태그", p.name, `태그 미입력 — 상품명에 없는 연관 검색어로 ${RULES.tags.max}개까지 등록`);
    else for (const c of p.tagAudit.checks) if (c.status !== "pass") act(c.status === "fail" ? "높음" : "낮음", "태그", p.name, `${c.label}: ${c.detail}`);
    if (!p.category) act("낮음", "설정", p.name, "카테고리 미입력 — 등록 카테고리를 적으면 보고서에 표시");
    if (p.price == null) act("중간", "가격", p.name, "판매가 미입력 — 입력하면 경쟁 가격 대비 위치를 계산");

    // 검색 수요
    p.demand = trend.groups.find((g) => g.name === p.name) || null;
    if (p.demand) {
      if (p.demand.change !== null && p.demand.change >= 20) act("중간", "검색어", p.name, `최근 7일 검색량이 직전 7일보다 ${p.demand.change}% 증가 — 노출 점검·재고 확인 시점`);
      if (p.demand.change !== null && p.demand.change <= -20) act("낮음", "검색어", p.name, `최근 7일 검색량이 직전 7일보다 ${Math.abs(p.demand.change)}% 감소`);
      if (p.demand.share !== null && p.demand.share < 10) act("중간", "검색어", p.name, `추적 검색어 묶음의 검색 수요가 같은 요청 내 ${p.demand.share}%로 작음 — 검색어 교체 검토(config/keywords.json)`);
    }

    // 쇼핑 캡처
    p.shop = [];
    const targetKg = p.weights?.[0] ? Number(String(p.weights[0]).replace(/[^\d.]/g, "")) : null;
    if (shop.latest) {
      for (const kw of p.keywords) {
        const cap = (shop.latest.json.keywords || []).find((k) => k.keyword === kw);
        if (!cap || !(cap.items || []).length) { p.shop.push({ keyword: kw, missing: true }); continue; }
        const r = analyzeKeyword(cap, { storeNames: STORE_NAMES, targetKg, ourPrice: p.price, topN: KW.manual?.topN || 20, ourTitle: p.title });
        r.history = shop.history.map((h) => {
          const c = (h.json.keywords || []).find((k) => k.keyword === kw);
          if (!c || !(c.items || []).length) return { date: h.date, rank: null };
          return { date: h.date, rank: analyzeKeyword(c, { storeNames: STORE_NAMES, targetKg, topN: 1000 }).ourRank };
        });
        p.shop.push(r);
        if (r.ourRank === null) act("높음", "순위", p.name, `"${kw}" 자연 검색 결과 ${r.total}개 안에 우리 상품 없음${r.ourAdRank ? ` (광고로는 ${r.ourAdRank}번째 노출)` : ""}`);
        else if (r.ourRank > 10) act("중간", "순위", p.name, `"${kw}" 자연 ${r.ourRank}위 — 1페이지 상단(10위 안) 밖`);
        if (r.vsMedian !== null && r.vsMedian > 10) act("중간", "가격", p.name, `"${kw}" 같은 중량 경쟁 중간값보다 ${r.vsMedian}% 높음 (중간값 ${r.median.toLocaleString("ko-KR")}원)`);
        if (r.suggestions.length) act("중간", "상품명", p.name, `"${kw}" 상위 노출 상품명에 흔하지만 우리 상품명에 없는 단어: ${r.suggestions.join(", ")}`);
      }
    }

    // 수동 CSV (캡처가 없을 때만)
    p.manual = [];
    if (!shop.latest && manual.latest) {
      for (const kw of p.keywords) {
        const e = manual.latest.entries.find((x) => x.keyword === kw);
        if (!e || (!e.prices.length && e.rank === null)) { p.manual.push({ keyword: kw, missing: true }); continue; }
        const med = e.prices.length ? median(e.prices) : null;
        const r = { keyword: kw, rank: e.rank, n: e.prices.length, min: e.prices.length ? Math.min(...e.prices) : null, median: med,
          vsMedian: p.price && med ? Math.round(((p.price - med) / med) * 1000) / 10 : null };
        p.manual.push(r);
        if (r.rank === null) act("높음", "순위", p.name, `"${kw}" 상위 20개 안에 우리 상품 없음(수동 입력 기준)`);
        else if (r.rank > 10) act("중간", "순위", p.name, `"${kw}" ${r.rank}위 — 10위 안 밖(수동 입력 기준)`);
        if (r.vsMedian !== null && r.vsMedian > 10) act("중간", "가격", p.name, `"${kw}" 경쟁 중간값보다 ${r.vsMedian}% 높음`);
      }
    }
  }

  if (!shop.latest && !manual.latest) act("중간", "데이터", "전체", "쇼핑 검색 캡처가 없어 순위·경쟁 가격·상위 노출 키워드 분석을 건너뜀 — docs/capture.html의 북마클릿으로 캡처");
  if (!trend.groups.length) act("높음", "데이터", "전체", "검색어트렌드 데이터 없음 — Actions → collect 실행");

  const order = { 높음: 0, 중간: 1, 낮음: 2 };
  actions.sort((a, b) => order[a.priority] - order[b.priority]);

  const summary = {
    date: TODAY, store: PRODUCTS.store?.name || "", productCount: products.length,
    avgTitleScore: Math.round(products.reduce((s, p) => s + p.titleAudit.score, 0) / products.length),
    avgTagScore: Math.round(products.reduce((s, p) => s + p.tagAudit.score, 0) / products.length),
    registered: products.filter((p) => p.registered).length,
    demandLeader: trend.groups.length ? trend.groups.reduce((m, g) => (g.avg7 > (m?.avg7 ?? -1) ? g : m), null).name : null,
    trendWindow: trend.groups.length ? `${trend.groups[0].data[0]?.date} ~ ${trend.groups[0].last?.date}` : null,
    trendFiles: trend.fileCount || 0,
    shopDate: shop.latest?.date || null, shopFiles: shop.history.length,
    manualDate: !shop.latest && manual.latest ? manual.latest.date : null,
    actionCounts: { 높음: actions.filter((a) => a.priority === "높음").length, 중간: actions.filter((a) => a.priority === "중간").length, 낮음: actions.filter((a) => a.priority === "낮음").length },
  };
  return { summary, products, trend, actions, rules: RULES, shopLatest: shop.latest ? { date: shop.latest.date, keywords: (shop.latest.json.keywords || []).length } : null };
}

// ---------- 마크다운 보고서 ----------
const fmt = (v, d = "-") => (v === null || v === undefined ? d : typeof v === "number" ? v.toLocaleString("ko-KR") : String(v));
const mark = (s) => (s === "pass" ? "O" : s === "warn" ? "△" : "X");

function renderMd(R) {
  const S = R.summary;
  const L = [];
  L.push(`# 준스샵스 상품 SEO 분석 보고서 (${S.date})`, "");
  L.push("□ 요약");
  L.push(`○ 분석 품목: ${S.productCount}개 (등록 정보 입력 ${S.registered}개) · 상품명 평균 ${S.avgTitleScore}점 · 태그 평균 ${S.avgTagScore}점`);
  L.push(`○ 검색 수요: ${S.trendWindow ? `${S.trendWindow} (최근 7일 수요 1위: ${S.demandLeader})` : "데이터 없음"}`);
  L.push(`○ 쇼핑 검색 캡처: ${S.shopDate ? `${S.shopDate} 기준` : S.manualDate ? `없음 (수동 입력 ${S.manualDate} 사용)` : "없음"}`);
  L.push(`○ 조치 항목: 높음 ${S.actionCounts.높음} · 중간 ${S.actionCounts.중간} · 낮음 ${S.actionCounts.낮음}`, "");

  L.push("□ 품목별 상품명·태그 진단", "");
  L.push("| 품목 | 상품명 | 글자수 | 상품명 점수 | 태그 점수 | 판정 |", "|---|---|---|---|---|---|");
  for (const p of R.products) L.push(`| ${p.name} | ${p.title || "(미입력)"} | ${p.titleAudit.length} | ${p.titleAudit.score} | ${p.tagAudit.score} | ${p.grade} |`);
  L.push("");
  for (const p of R.products) {
    L.push(`### ${p.idx}. ${p.name}`);
    L.push(`- 상품명: ${p.title || "(미입력)"} — ${p.titleAudit.score}점(${p.grade})${p.titleUpdated ? ` · 변경일 ${p.titleUpdated}` : ""}`);
    for (const c of p.titleAudit.checks) L.push(`  - [${mark(c.status)}] ${c.label}: ${c.detail} (${c.earned}/${c.max})`);
    L.push(`- 권장 구조(원산지 품목 품종 등급 중량): ${p.titleAudit.recommended || "elements 미입력"}`);
    if (p.ads.length) L.push(`- 운영 중 광고: ${p.ads.map((a) => `${a.keyword} (${a.since}~${a.note ? ", " + a.note : ""})`).join(", ")}`);
    if (p.titleAudit.extraTokens.length) L.push(`- 추적 검색어 중 상품명에 없는 단어: ${p.titleAudit.extraTokens.join(", ")}`);
    const tagLabel = (t) => (p.tagCounts[t] ? `${t}(${p.tagCounts[t].toLocaleString("ko-KR")})` : t);
    L.push(`- 태그(${p.tags.length}개): ${p.tags.length ? p.tags.map(tagLabel).join(", ") : "미입력"} — ${p.tagAudit.score}점${Object.keys(p.tagCounts).length ? " · 괄호는 태그 검색 수" : ""}`);
    for (const c of p.tagAudit.checks) L.push(`  - [${mark(c.status)}] ${c.label}: ${c.detail}`);
    if (p.demand) {
      const d = p.demand;
      L.push(`- 검색 수요(추적 검색어 묶음): 30일 평균 ${d.avg30.toFixed(1)} · 최근 7일 ${d.avg7.toFixed(1)} · 직전 7일 대비 ${d.change === null ? "-" : (d.change > 0 ? "+" : "") + d.change + "%"} · 묶음 내 점유 ${fmt(d.share)}% · 최고점 ${d.peak?.date} (${d.peak?.ratio.toFixed(1)})`);
    }
    if (p.shop.length) {
      L.push("- 쇼핑 검색 캡처 분석:");
      L.push("  | 검색어 | 자연 순위 | 광고 | 같은 중량 경쟁 | 최저가 | 중간값 | 우리 가격 위치 | 상위 상품명에 흔한 단어(우리 상품명에 없음) |", "  |---|---|---|---|---|---|---|---|");
      for (const r of p.shop) {
        if (r.missing) { L.push(`  | ${r.keyword} | 캡처 없음 | | | | | | |`); continue; }
        L.push(`  | ${r.keyword} | ${r.ourRank === null ? `${r.total}개 밖` : r.ourRank + "위"} | ${r.adCount ? (r.ourAdRank ? `우리 ${r.ourAdRank}번째/${r.adCount}개` : `${r.adCount}개(우리 없음)`) : "-"} | ${r.sameWeightCount}개(제외 ${r.excluded}, 옵션형 ${r.multiCount}) | ${fmt(r.min)} | ${fmt(r.median)}${r.sameWeightCount < 3 && r.medianAll ? ` (전체 ${fmt(r.medianAll)})` : ""} | ${r.pricePos === null ? "-" : `${r.pricePos}번째로 저렴(중간값 대비 ${r.vsMedian > 0 ? "+" : ""}${r.vsMedian}%)`} | ${r.suggestions.join(", ") || "-"} |`);
      }
    }
    if (p.manual.length) {
      L.push("- 수동 입력 기준:");
      L.push("  | 검색어 | 우리 순위 | 입력 가격 수 | 최저가 | 중간값 | 중간값 대비 |", "  |---|---|---|---|---|---|");
      for (const r of p.manual) {
        if (r.missing) { L.push(`  | ${r.keyword} | 미입력 | | | | |`); continue; }
        L.push(`  | ${r.keyword} | ${r.rank === null ? "20위 밖" : r.rank + "위"} | ${r.n} | ${fmt(r.min)} | ${fmt(r.median)} | ${r.vsMedian === null ? "-" : (r.vsMedian > 0 ? "+" : "") + r.vsMedian + "%"} |`);
      }
    }
    L.push("");
  }

  if (R.trend.groups.length) {
    L.push("□ 검색 수요 비교 (네이버 검색어트렌드, 같은 요청 내 상대값)", "");
    L.push("| 품목(검색어 묶음) | 30일 평균 | 최근 7일 | 직전 7일 대비 | 점유 | 최고점 |", "|---|---|---|---|---|---|");
    for (const g of R.trend.groups) L.push(`| ${g.name} | ${g.avg30.toFixed(1)} | ${g.avg7.toFixed(1)} | ${g.change === null ? "-" : (g.change > 0 ? "+" : "") + g.change + "%"} | ${fmt(g.share)}% | ${g.peak?.date} |`);
    L.push("", "※ ratio는 요청 기간 내 최대 검색량을 100으로 둔 상대값. 검색어 개별 수요는 API가 묶음 단위로만 주므로 알 수 없음 — 검색어별 비교가 필요하면 config/keywords.json에서 검색어를 각각 별도 품목으로 분리.", "");
  }

  L.push("□ 조치 항목", "");
  L.push("| 우선순위 | 구분 | 대상 | 내용 |", "|---|---|---|---|");
  for (const a of R.actions) L.push(`| ${a.priority} | ${a.kind} | ${a.target} | ${a.content} |`);
  L.push("", `※ 생성: scripts/seo-analyze.js · 기준: config/seo-rules.json · 상품 정보: config/products.json`);
  return L.join("\n") + "\n";
}

// ---------- 실행 ----------
const R = analyze();
const outDir = path.join(ROOT, "reports", "seo");
fs.mkdirSync(outDir, { recursive: true });
const md = renderMd(R);
fs.writeFileSync(path.join(outDir, `${TODAY}.md`), md);
fs.writeFileSync(path.join(outDir, "latest.md"), md);
const slim = { ...R, products: R.products.map((p) => ({ ...p, shop: p.shop.map((r) => (r.missing ? r : { ...r, top: r.top.slice(0, 20) })) })) };
fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify(slim, null, 2) + "\n");
fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "docs", "index.html"), renderHtml(slim));
console.log(`보고서: reports/seo/${TODAY}.md, reports/seo/latest.md, reports/seo/latest.json, docs/index.html`);
console.log(`상품명 평균 ${R.summary.avgTitleScore}점 · 조치 높음 ${R.summary.actionCounts.높음} 중간 ${R.summary.actionCounts.중간} 낮음 ${R.summary.actionCounts.낮음}`);
