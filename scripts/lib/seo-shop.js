// 쇼핑 검색 결과(data/shop/*.json, 북마클릿 캡처) 분석 — 순수 함수
// - 우리 상품 순위, 같은 중량 경쟁 가격(최저·중간값), 우리 가격 위치
// - 상위 노출 상품명 빈출 키워드 → 우리 상품명에 없는 키워드 제안
const { tokens, norm, normWeight } = require("./seo-title");

// 제목에서 총중량(kg) 추출. "1kg×3", "1kg x 3", "3kg", "500g*2" 지원. 못 읽으면 null
function parseWeightKg(title) {
  const t = String(title || "").toLowerCase().replace(/킬로그램|킬로|키로/g, "kg").replace(/그램|그람/g, "g");
  const re = /(\d+(?:\.\d+)?)\s*(kg|g)\s*(?:[x×*]\s*(\d+))?/g;
  let m, best = null;
  const seen = new Set();
  while ((m = re.exec(t))) {
    let kg = Number(m[1]) * (m[2] === "g" ? 0.001 : 1);
    if (m[3]) kg *= Number(m[3]);
    seen.add(kg);
    if (best === null || kg > best) best = kg; // "3kg(1kg×3)"처럼 여러 표기면 가장 큰 총량
  }
  return best;
}
// "3kg 5kg 10kg"처럼 중량 옵션이 여러 개인 제목: 표시 가격이 가장 작은 옵션 기준이라 같은 중량 비교에서 제외
function isMultiWeight(title) {
  const t = String(title || "").toLowerCase().replace(/킬로그램|킬로|키로/g, "kg");
  const ws = new Set();
  const re = /(\d+(?:\.\d+)?)\s*kg(?!\s*[x×*])/g;
  let m;
  while ((m = re.exec(t))) ws.add(Number(m[1]));
  return ws.size >= 2;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const STOP = new Set(["국내산", "국산", "무료배송", "당일발송", "당일출고", "산지직송", "농장직송", "직송", "특가", "세일", "할인", "선물", "선물용", "선물세트", "세트", "박스", "택배", "개", "입", "개입", "봉", "팩", "kg", "g"]);

// 토큰 정규화: 숫자·단위만 있는 토큰 제외, 1글자 제외
function keywordTokens(title) {
  return tokens(title)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length >= 2 && !/^\d+(kg|g|개|입|봉|팩|구|과|호|번)?$/.test(t) && !STOP.has(t));
}

function isOurs(item, storeNames) {
  const m = norm(item.mallName || item.mall || "");
  return storeNames.some((n) => n && m.includes(norm(n)));
}

// one keyword capture: { keyword, items:[{rank,title,lprice|price,mallName|mall}] }
function analyzeKeyword(cap, opts) {
  const { storeNames, targetKg, ourPrice, topN = 20, ourTitle = "" } = opts;
  const all = (cap.items || []).map((it, i) => ({
    screenRank: it.rank || i + 1,
    title: it.title || "",
    price: Number(it.lprice ?? it.price) || 0,
    mall: it.mallName || it.mall || "",
    kg: parseWeightKg(it.title),
    multi: isMultiWeight(it.title),
    ours: isOurs(it, storeNames),
    ad: Boolean(it.ad),
  }));
  // 광고 소재는 자연 순위에서 제외하고 따로 센다 (광고를 돌리면 우리 광고가 먼저 보여 자연 순위를 가리기 때문)
  const items = all.filter((it) => !it.ad).map((it, i) => ({ ...it, rank: i + 1 }));
  const ads = all.filter((it) => it.ad).map((it, i) => ({ ...it, rank: i + 1 }));
  const top = items.slice(0, topN);
  const ours = items.filter((it) => it.ours);
  const ourRank = ours.length ? ours[0].rank : null;
  const ourAd = ads.find((it) => it.ours);
  const ourAdRank = ourAd ? ourAd.rank : null;

  const sameWt = top.filter((it) => !it.ours && !it.multi && it.price > 0 && targetKg != null && it.kg != null && Math.abs(it.kg - targetKg) < 0.01);
  const multiCount = top.filter((it) => !it.ours && it.multi).length;
  const excluded = top.filter((it) => !it.ours && !sameWt.includes(it)).length;
  const prices = sameWt.map((it) => it.price);
  const minP = prices.length ? Math.min(...prices) : null;
  const medP = prices.length ? median(prices) : null;
  let pricePos = null; // 우리 가격이 경쟁 가격 중 몇 번째로 싼지 (1 = 최저)
  let vsMedian = null;
  if (ourPrice && prices.length) {
    pricePos = prices.filter((p) => p < ourPrice).length + 1;
    vsMedian = Math.round(((ourPrice - medP) / medP) * 1000) / 10;
  }

  // 상위 노출 상품명 빈출 키워드
  const freq = {};
  for (const it of top) if (!it.ours) for (const t of new Set(keywordTokens(it.title))) freq[t] = (freq[t] || 0) + 1;
  const compCount = top.filter((it) => !it.ours).length;
  const nt = norm(ourTitle);
  const topTokens = Object.entries(freq)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, 15)
    .map(([token, count]) => ({ token, count, share: compCount ? Math.round((count / compCount) * 100) : 0, inOurTitle: nt.includes(norm(token)) }));
  const suggestions = topTokens.filter((t) => !t.inOurTitle && t.share >= 25).map((t) => t.token);

  const avgTitleLen = compCount ? Math.round(top.filter((it) => !it.ours).reduce((a, it) => a + [...it.title].length, 0) / compCount) : null;
  const wtShare = top.length ? Math.round((top.filter((it) => it.kg != null && targetKg != null && Math.abs(it.kg - targetKg) < 0.01).length / top.length) * 100) : null;

  return {
    keyword: cap.keyword, total: items.length, adCount: ads.length, topN: top.length, ourRank, ourAdRank, ourMall: ours.length ? ours[0].mall : ourAd ? ourAd.mall : null,
    sameWeightCount: prices.length, excluded, multiCount, min: minP, median: medP, pricePos, vsMedian, avgTitleLen, weightShare: wtShare,
    topTokens, suggestions,
    top: top.map(({ rank, screenRank, title, price, mall, kg, multi, ours }) => ({ rank, screenRank, title, price, mall, kg, multi, ours })),
  };
}

module.exports = { parseWeightKg, analyzeKeyword, keywordTokens, median };
