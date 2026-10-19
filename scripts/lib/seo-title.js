// 상품명·태그 SEO 진단 (순수 함수, 파일 입출력 없음)
// 기준: config/seo-rules.json. 네이버 스마트스토어 검색 노출 가이드의 일반 원칙을 규칙화한 것.
//  - 상품명 50자 이내 권장, 특수문자·홍보성 문구·동일 단어 반복 지양
//  - 핵심 검색어는 앞쪽에, 중량 등 규격 명시
//  - 태그는 10개까지, 상품명에 이미 있는 단어보다 보완 검색어 위주

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");

// 공백 기준 토큰. 괄호·쉼표·슬래시는 구분자로 취급.
function tokens(s) {
  return String(s || "")
    .toLowerCase()
    .split(/[\s,/()\[\]|·]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// 중량 표기 정규화: "3kg", "3 kg", "3KG", "3킬로", "3키로" → "3kg"
function normWeight(s) {
  return norm(s).replace(/킬로그램|킬로|키로/g, "kg").replace(/그램|그람/g, "g");
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

const DECORATIVE = /[★☆♥♡◆■●▶◀♣♠※→←↑↓✧✨✩✰✳✴❖❤\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

const SHORT = new Set(["꿀", "밤", "햇"]); // 한 글자 접두어로 허용
// text(정규화)가 token을 그대로 포함하거나, 품목 핵심어(core)로 쪼갠 조각들을 모두 포함하면 true
// 반환: "whole" | "split" | null
function coverage(text, token, core) {
  if (text.includes(token)) return "whole";
  if (!core || !token.includes(core)) return null;
  const pieces = token.split(core).filter(Boolean);
  const ok = (piece) => {
    if (text.includes(piece)) return true;
    for (let i = 1; i < piece.length; i++) {
      const a = piece.slice(0, i), b = piece.slice(i);
      if ((a.length >= 2 || SHORT.has(a)) && (b.length >= 2 || SHORT.has(b)) && text.includes(a) && ok(b)) return true;
    }
    return false;
  };
  return pieces.every(ok) ? "split" : null;
}

// ---------- 상품명 진단 ----------
// product: { title, elements:{weight,...}, keywords:[...], weights:[...] }
function auditTitle(product, rules) {
  const R = rules.title;
  const W = R.weights;
  const title = String(product.title || "").trim();
  const checks = [];
  let score = 0;
  const add = (key, label, status, detail, earned, max) => {
    checks.push({ key, label, status, detail, earned: Math.round(earned), max });
    score += earned;
  };

  // 1. 길이
  const len = [...title].length;
  if (len === 0) add("length", "길이", "fail", "상품명 미입력", 0, W.length);
  else if (len > R.hardMax) add("length", "길이", "fail", `${len}자 — 최대 ${R.hardMax}자 초과`, 0, W.length);
  else if (len > R.recommendedMax) add("length", "길이", "warn", `${len}자 — 권장 ${R.recommendedMax}자 초과`, W.length * 0.4, W.length);
  else if (len < R.recommendedMin) add("length", "길이", "warn", `${len}자 — 너무 짧음(권장 ${R.recommendedMin}~${R.recommendedMax}자)`, W.length * 0.6, W.length);
  else add("length", "길이", "pass", `${len}자 (권장 ${R.recommendedMin}~${R.recommendedMax}자)`, W.length, W.length);

  // 2. 특수문자
  const allowed = new Set([...(R.allowedSymbols || "")]);
  const badChars = [...new Set([...title].filter((ch) => {
    if (/[\p{L}\p{N}\s]/u.test(ch)) return false;
    if (allowed.has(ch)) return false;
    return true;
  }))];
  const decorative = badChars.filter((ch) => DECORATIVE.test(ch));
  if (decorative.length) add("symbols", "특수문자", "fail", `장식 기호 사용: ${decorative.join(" ")}`, 0, W.symbols);
  else if (badChars.length) add("symbols", "특수문자", "warn", `기호 사용: ${badChars.join(" ")} (허용 권장: ${R.allowedSymbols})`, W.symbols * 0.5, W.symbols);
  else add("symbols", "특수문자", "pass", "장식·특수문자 없음", W.symbols, W.symbols);

  // 3. 홍보성 문구
  const nt = norm(title);
  const promoHits = (R.promoWords || []).filter((w) => nt.includes(norm(w)));
  if (promoHits.length) add("promo", "홍보성 문구", "fail", `검색 가이드 지양 표현: ${promoHits.join(", ")}`, 0, W.promo);
  else add("promo", "홍보성 문구", "pass", "없음", W.promo, W.promo);

  // 4. 동일 단어 반복 · 유사 키워드 나열
  const tk = tokens(title);
  const counts = {};
  for (const t of tk) counts[t] = (counts[t] || 0) + 1;
  const dups = Object.entries(counts).filter(([, c]) => c > 1).map(([t, c]) => `${t}×${c}`);
  const core = norm(product.elements?.item || "").replace(/^(호박|꿀밤|꿀|밤|햇)/, "") || null; // 예: 호박고구마 → 고구마
  // 유사 키워드: 품목 핵심어를 포함하는 토큰 (핵심어가 한 글자면 "햇밤·생밤·알밤"처럼 짧은 합성어만)
  const variants = core ? [...new Set(tk.filter((t) => (core.length >= 2 ? t.includes(core) : t.endsWith(core) && t.length <= 3)))] : [];
  if (dups.length) add("duplicate", "단어 반복", "fail", `같은 단어 반복: ${dups.join(", ")}`, 0, W.duplicate);
  else if (variants.length >= R.stuffingThreshold) add("duplicate", "단어 반복", "warn", `유사 키워드 ${variants.length}개 나열(${variants.join(", ")}) — 키워드 스터핑으로 볼 수 있음`, W.duplicate * 0.5, W.duplicate);
  else add("duplicate", "단어 반복", "pass", "반복 없음", W.duplicate, W.duplicate);

  // 5. 추적 검색어 커버리지
  const kws = product.keywords || [];
  const covered = [], split = [], partial = [], missing = [];
  const ntw = normWeight(title);
  for (const kw of kws) {
    const parts = tokens(kw).map((p) => (/\d/.test(p) ? normWeight(p) : norm(p)));
    let whole = 0, bySplit = 0;
    const miss = [];
    for (const p of parts) {
      const c = coverage(ntw, p, core);
      if (c === "whole") whole++;
      else if (c === "split") bySplit++; // 예: 호풍미고구마 → 호풍미 + 고구마, 해남꿀고구마 → 해남 + 꿀 + 고구마
      else miss.push(p);
    }
    if (whole === parts.length) covered.push(kw);
    else if (whole + bySplit === parts.length) split.push(kw);
    else if (whole + bySplit) partial.push({ kw, missing: miss });
    else missing.push(kw);
  }
  const covRatio = kws.length ? (covered.length + split.length * 0.9 + partial.length * 0.5) / kws.length : 1;
  const covDetail = kws.length
    ? `${covered.length + split.length}/${kws.length} 포함` +
      (split.length ? ` · 분리 포함(붙여 쓰면 더 정확): ${split.join(", ")}` : "") +
      (partial.length ? ` · 일부: ${partial.map((p) => `${p.kw}(${p.missing.join(",")} 없음)`).join(", ")}` : "") +
      (missing.length ? ` · 미포함: ${missing.join(", ")}` : "")
    : "추적 검색어 없음";
  add("coverage", "추적 검색어 포함", covRatio >= 0.8 ? "pass" : covRatio >= 0.5 ? "warn" : "fail", covDetail, W.coverage * covRatio, W.coverage);

  // 6. 핵심 검색어 위치 (가장 먼저 등장하는 추적 검색어 토큰의 시작 위치)
  let firstPos = null;
  for (const kw of kws) {
    for (const p of tokens(kw)) {
      const i = title.toLowerCase().indexOf(p);
      if (i >= 0 && (firstPos === null || i < firstPos)) firstPos = i;
    }
  }
  if (firstPos === null) add("front", "핵심 검색어 위치", "fail", "추적 검색어가 상품명에 없음", 0, W.front);
  else if (firstPos <= R.keywordFrontChars) add("front", "핵심 검색어 위치", "pass", `${firstPos + 1}번째 글자부터 등장`, W.front, W.front);
  else add("front", "핵심 검색어 위치", "warn", `${firstPos + 1}번째 글자 — 앞쪽(${R.keywordFrontChars}자 이내) 배치 권장`, W.front * 0.5, W.front);

  // 7. 중량 표기
  const wts = (product.weights || []).map(normWeight);
  const wtHit = wts.filter((w) => ntw.includes(w));
  if (!wts.length) add("weight", "중량 표기", "pass", "기준 중량 없음", W.weight, W.weight);
  else if (wtHit.length) add("weight", "중량 표기", "pass", `${wtHit.join(", ")} 표기`, W.weight, W.weight);
  else add("weight", "중량 표기", "fail", `기준 중량(${(product.weights || []).join(", ")}) 미표기`, 0, W.weight);

  // 권장 구조: 원산지 → 품목 → 품종 → 등급 → 중량 (빈 요소는 생략)
  const el = product.elements || {};
  const recommended = ["origin", "item", "variety", "grade", "weight"].map((k) => el[k]).filter(Boolean).join(" ");
  const inText = (txt, t) => Boolean(coverage(txt, t, core));
  const extraTokens = [...new Set(kws.flatMap(tokens))]
    .filter((t) => !/\d/.test(t))
    .filter((t) => !inText(norm(recommended), norm(t)) && !inText(nt, norm(t)));

  return {
    title, length: len, score: Math.round(score), max: 100, checks,
    coverage: { covered, split, partial, missing },
    recommended, extraTokens,
  };
}

// ---------- 태그 진단 ----------
function auditTags(product, rules) {
  const R = rules.tags;
  const W = R.weights;
  const tags = (product.tags || []).map((t) => String(t).trim()).filter(Boolean);
  const checks = [];
  let score = 0;
  const add = (key, label, status, detail, earned, max) => { checks.push({ key, label, status, detail, earned: Math.round(earned), max }); score += earned; };

  if (!tags.length) {
    add("count", "태그 수", "fail", `미입력 (최대 ${R.max}개)`, 0, W.count);
    return { tags, score: 0, max: 100, checks, missingKeywords: product.keywords || [] };
  }
  if (tags.length > R.max) add("count", "태그 수", "fail", `${tags.length}개 — 최대 ${R.max}개 초과`, 0, W.count);
  else if (tags.length < Math.ceil(R.max / 2)) add("count", "태그 수", "warn", `${tags.length}개 — ${R.max}개까지 채우기 권장`, W.count * 0.6, W.count);
  else add("count", "태그 수", "pass", `${tags.length}개`, W.count, W.count);

  const badTags = tags.filter((t) => /[^\p{L}\p{N}]/u.test(t));
  const rejected = tags.filter((t) => (R.rejected || []).map(norm).includes(norm(t)));
  if (badTags.length) add("symbols", "특수문자·공백", "fail", `태그에 기호/공백: ${badTags.join(", ")}`, 0, W.symbols);
  else if (rejected.length) add("symbols", "특수문자·공백", "fail", `네이버가 거부하는 카테고리명 태그: ${rejected.join(", ")} (다른 연관어로 교체)`, 0, W.symbols);
  else add("symbols", "특수문자·공백", "pass", "없음", W.symbols, W.symbols);

  const seen = new Set(), dup = [];
  for (const t of tags) { const n = norm(t); if (seen.has(n)) dup.push(t); seen.add(n); }
  if (dup.length) add("duplicate", "중복 태그", "fail", `${dup.join(", ")}`, 0, W.duplicate);
  else add("duplicate", "중복 태그", "pass", "없음", W.duplicate, W.duplicate);

  const nt = norm(product.title);
  const overlap = tags.filter((t) => nt.includes(norm(t)));
  const ovRatio = overlap.length / tags.length;
  if (ovRatio > 0.5) add("titleOverlap", "상품명과 중복", "warn", `${overlap.length}개가 상품명에 이미 있음(${overlap.join(", ")}) — 상품명에 없는 연관 검색어로 교체 권장`, W.titleOverlap * 0.4, W.titleOverlap);
  else add("titleOverlap", "상품명과 중복", "pass", overlap.length ? `${overlap.length}개 중복(${overlap.join(", ")})` : "중복 없음", W.titleOverlap, W.titleOverlap);

  const kws = product.keywords || [];
  const allText = normWeight(product.title) + "|" + tags.map(normWeight).join("|");
  const core = norm(product.elements?.item || "").replace(/^(호박|꿀밤|꿀|밤|햇)/, "") || null;
  const missingKeywords = kws.filter((kw) => !tokens(kw).every((p) => coverage(allText, /\d/.test(p) ? normWeight(p) : norm(p), core)));
  const fillRatio = kws.length ? 1 - missingKeywords.length / kws.length : 1;
  add("keywordFill", "추적 검색어 보완", fillRatio >= 0.8 ? "pass" : "warn",
    missingKeywords.length ? `상품명·태그 어디에도 없음: ${missingKeywords.join(", ")}` : "추적 검색어 모두 상품명 또는 태그에 있음", W.keywordFill * fillRatio, W.keywordFill);

  return { tags, score: Math.round(score), max: 100, checks, missingKeywords };
}

function gradeOf(score, rules) {
  for (const g of rules.grade) if (score >= g.min) return g.label;
  return rules.grade[rules.grade.length - 1].label;
}

module.exports = { auditTitle, auditTags, gradeOf, tokens, norm, normWeight, coverage };
