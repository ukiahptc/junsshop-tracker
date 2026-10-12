// 준스샵스 일일 수집 스크립트
// - 네이버 데이터랩 검색어트렌드 API → data/trend/YYYY-MM-DD.json
// - 네이버 쇼핑 검색 API          → data/shop/YYYY-MM-DD.json
// 외부 패키지 없음 (Node 20+ 내장 fetch 사용)

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "keywords.json"), "utf8"));

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 없습니다.");
  process.exit(1);
}

const HEADERS = {
  "X-Naver-Client-Id": CLIENT_ID,
  "X-Naver-Client-Secret": CLIENT_SECRET,
  "Content-Type": "application/json",
};

// ---------- 날짜 (KST 기준) ----------
function kstDate(offsetDays = 0) {
  const d = new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}
const TODAY = kstDate(0);

// ---------- 공통 fetch (재시도 포함) ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, options = {}, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...options, headers: { ...HEADERS, ...(options.headers || {}) } });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        await sleep(1000 * 2 ** i);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(1000 * 2 ** i);
    }
  }
  throw lastErr;
}

// ---------- 1. 데이터랩 검색어트렌드 ----------
// 품목 1개 = keywordGroup 1개(추적 검색어 묶음). 한 요청에 최대 5그룹.
// 같은 요청에 묶인 그룹끼리만 ratio 크기 비교가 가능하므로 4개 품목을 한 요청에 담는다.
async function collectTrend() {
  const endDate = kstDate(-1); // 당일은 집계 미완료라 전일까지
  const startDate = kstDate(-CONFIG.trend.days);
  const groups = CONFIG.items.map((it) => ({ groupName: it.name, keywords: it.keywords }));

  const out = { collectedAt: new Date().toISOString(), date: TODAY, startDate, endDate, timeUnit: "date", requests: [] };

  for (let i = 0; i < groups.length; i += 5) {
    const body = { startDate, endDate, timeUnit: "date", keywordGroups: groups.slice(i, i + 5) };
    try {
      const json = await request("https://openapi.naver.com/v1/datalab/search", {
        method: "POST",
        body: JSON.stringify(body),
      });
      out.requests.push({ keywordGroups: body.keywordGroups, results: json.results });
    } catch (e) {
      out.requests.push({ keywordGroups: body.keywordGroups, error: String(e.message || e) });
    }
  }
  return out;
}

// ---------- 2. 쇼핑 검색 (정확도순, 검색어별 최대 1,100개) ----------
const stripTags = (s) => String(s).replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function collectShopKeyword(keyword) {
  const { display, maxStart, sort } = CONFIG.shop;
  const items = [];
  let total = null;
  let error = null;

  for (let start = 1; start <= maxStart; start += display) {
    const url =
      "https://openapi.naver.com/v1/search/shop.json?" +
      new URLSearchParams({ query: keyword, display: String(display), start: String(start), sort });
    let json;
    try {
      json = await request(url);
    } catch (e) {
      error = `start=${start}: ${e.message || e}`;
      break;
    }
    if (total === null) total = json.total;
    for (const it of json.items || []) {
      items.push({
        rank: items.length + 1,
        title: stripTags(it.title),
        lprice: Number(it.lprice) || 0,
        mallName: it.mallName,
        productId: it.productId,
        productType: it.productType,
        link: it.link,
      });
    }
    if (!json.items || json.items.length < display) break; // 마지막 페이지
    await sleep(150); // 초당 호출 제한 완화
  }
  return { keyword, total, count: items.length, error, items };
}

async function collectShop() {
  const out = { collectedAt: new Date().toISOString(), date: TODAY, sort: CONFIG.shop.sort, keywords: [] };
  for (const it of CONFIG.items) {
    for (const kw of it.keywords) {
      const r = await collectShopKeyword(kw);
      r.item = it.name;
      out.keywords.push(r);
      console.log(`[shop] ${kw}: ${r.count}개 (total ${r.total})${r.error ? " / 오류: " + r.error : ""}`);
    }
  }
  return out;
}

// ---------- 저장 ----------
function save(kind, data) {
  const file = path.join(ROOT, "data", kind, `${TODAY}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(`saved ${path.relative(ROOT, file)}`);
}

(async () => {
  const trend = await collectTrend();
  const trendOk = trend.requests.some((r) => r.results);
  console.log(`[trend] ${trend.startDate}~${trend.endDate} ${trendOk ? "수집" : "실패"}`);
  save("trend", trend);

  const shop = await collectShop();
  const shopOk = shop.keywords.some((k) => k.count > 0);
  save("shop", shop);

  if (!trendOk && !shopOk) {
    console.error("트렌드·쇼핑 모두 수집 실패");
    process.exit(1);
  }
})();
