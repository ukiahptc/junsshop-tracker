// 신규 품목 탐색: config/explore.json의 검색어 묶음을 NAVER API HUB 검색어트렌드로 조회
// 모든 요청에 기준 묶음(anchor)을 함께 넣어, 요청이 달라도 "기준 대비" 값으로 비교할 수 있게 한다.
// 출력: data/explore/YYYY-MM-DD.json
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "explore.json"), "utf8"));
const CLIENT_ID = process.env.NAVER_CLIENT_ID, CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) { console.error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 없음"); process.exit(1); }
const HUB = "https://naverapihub.apigw.ntruss.com";
const HEADERS = { "X-NCP-APIGW-API-KEY-ID": CLIENT_ID, "X-NCP-APIGW-API-KEY": CLIENT_SECRET, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kst = (offsetDays = 0) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const TODAY = kst(0);

async function post(body, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${HUB}/search-trend/v1/search`, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
      if (res.status === 429 || res.status >= 500) { last = new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); await sleep(1000 * 2 ** i); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } catch (e) { last = e; await sleep(1000 * 2 ** i); }
  }
  throw last;
}

(async () => {
  const out = { collectedAt: new Date().toISOString(), date: TODAY, anchor: CFG.anchor.name, windows: [] };
  for (const w of CFG.windows) {
    const endDate = kst(-1);
    const startDate = w.days ? kst(-w.days) : new Date(new Date(endDate).setMonth(new Date(endDate).getMonth() - w.months)).toISOString().slice(0, 10);
    const win = { name: w.name, timeUnit: w.timeUnit, startDate, endDate, groups: [] };
    const per = CFG.perRequest || 4;
    for (let i = 0; i < CFG.groups.length; i += per) {
      const chunk = CFG.groups.slice(i, i + per);
      const body = { startDate, endDate, timeUnit: w.timeUnit, keywordGroups: [CFG.anchor, ...chunk].map((g) => ({ groupName: g.name, keywords: g.keywords })) };
      try {
        const json = await post(body);
        const anchor = json.results.find((r) => r.title === CFG.anchor.name);
        const aMean = anchor && anchor.data.length ? anchor.data.reduce((s, d) => s + d.ratio, 0) / anchor.data.length : null;
        for (const r of json.results) {
          if (r.title === CFG.anchor.name) continue;
          win.groups.push({ name: r.title, keywords: r.keywords, request: i / per, anchorMean: aMean,
            data: r.data.map((d) => ({ period: d.period, ratio: d.ratio, rel: aMean ? Math.round((d.ratio / aMean) * 10000) / 10000 : null })) });
        }
        console.log(`[${w.name}] ${chunk.map((g) => g.name).join(", ")}: ok (기준 평균 ${aMean?.toFixed(2)})`);
      } catch (e) {
        for (const g of chunk) win.groups.push({ name: g.name, keywords: g.keywords, request: i / per, error: String(e.message || e), data: [] });
        console.log(`[${w.name}] ${chunk.map((g) => g.name).join(", ")}: 오류 ${e.message}`);
      }
      await sleep(300);
    }
    out.windows.push(win);
  }
  const file = path.join(ROOT, "data", "explore", `${TODAY}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`saved ${path.relative(ROOT, file)}`);
  if (!out.windows.some((w) => w.groups.some((g) => g.data.length))) { console.error("수집 실패"); process.exit(1); }
})();
