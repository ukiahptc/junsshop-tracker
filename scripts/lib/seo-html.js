// 분석 결과(JSON) → docs/index.html (GitHub Pages용 단일 파일, 외부 의존 없음)
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (v, d = "-") => (v === null || v === undefined ? d : typeof v === "number" ? v.toLocaleString("ko-KR") : String(v));
const pct = (v) => (v === null || v === undefined ? "-" : (v > 0 ? "+" : "") + v + "%");
const ICON = { pass: "✓", warn: "△", fail: "✕" };

function lineChart(groups) {
  if (!groups.length) return "";
  const W = 760, H = 260, PL = 40, PR = 110, PT = 16, PB = 36;
  const dates = groups[0].data.map((d) => d.date);
  const n = dates.length;
  const x = (i) => PL + (i / Math.max(1, n - 1)) * (W - PL - PR);
  const y = (v) => PT + (1 - v / 100) * (H - PT - PB);
  const series = groups.map((g, i) => ({ name: g.name, slot: i + 1, pts: g.data.map((d, j) => [x(j), y(d.ratio), d.ratio]) }));
  const grid = [0, 25, 50, 75, 100].map((v) => `<line x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${PL - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${v}</text>`).join("");
  const ticks = [0, Math.floor((n - 1) / 2), n - 1].map((i) => `<text x="${x(i)}" y="${H - PB + 18}" class="ax" text-anchor="middle">${dates[i]?.slice(5)}</text>`).join("");
  const paths = series.map((s) => `<path d="${s.pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("")}" class="ln s${s.slot}" fill="none"/>`).join("");
  // 직접 라벨: 마지막 점 옆. 겹치면 12px씩 밀어 배치
  const lab = series.map((s) => ({ s, x: s.pts[s.pts.length - 1][0] + 6, y: s.pts[s.pts.length - 1][1] + 4 })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < lab.length; i++) if (lab[i].y - lab[i - 1].y < 13) lab[i].y = lab[i - 1].y + 13;
  const labels = lab.map((l) => `<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" class="dl">${esc(shortName(l.s.name))}</text>`).join("");
  const legend = series.map((s) => `<span class="lg"><i class="sw s${s.slot}"></i>${esc(s.name)}</span>`).join("");
  const data = JSON.stringify({ dates, series: series.map((s) => ({ name: s.name, slot: s.slot, v: s.pts.map((p) => p[2]) })), x: { PL, PR, W } });
  return `<div class="chart" data-chart='${esc(data)}'>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="품목별 검색 수요 추이">${grid}${ticks}${paths}${labels}<line class="xh" x1="0" x2="0" y1="${PT}" y2="${H - PB}" style="display:none"/></svg>
<div class="tip" style="display:none"></div>
<div class="legend">${legend}</div></div>`;
}
function shortName(n) { const t = n.replace(/^해남 /, "").replace(/^국내산 /, "").replace(/고구마/, "").split(/\s+/).filter(Boolean); return (t.length > 2 ? t.slice(-2) : t).join(" "); }

function scoreBar(score, cls) {
  return `<div class="bar"><i class="${cls}" style="width:${score}%"></i></div>`;
}

function renderHtml(R) {
  const S = R.summary;
  const tiles = [
    ["상품명 평균 점수", `${S.avgTitleScore}<small>/100</small>`, `${S.productCount}개 품목 · 등록정보 입력 ${S.registered}개`],
    ["태그 평균 점수", `${S.avgTagScore}<small>/100</small>`, "최대 10개 · 상품명과 다른 연관 검색어"],
    ["최근 7일 수요 1위", esc(S.demandLeader ? shortName(S.demandLeader) : "-"), S.trendWindow ? `트렌드 ${esc(S.trendWindow)}` : "트렌드 데이터 없음"],
    ["조치 항목", `${S.actionCounts.높음}<small> 높음</small> · ${S.actionCounts.중간}<small> 중간</small>`, S.shopDate ? `쇼핑 캡처 ${S.shopDate}` : S.manualDate ? `수동 입력 ${S.manualDate}` : "쇼핑 캡처 없음"],
  ].map(([t, v, s]) => `<div class="tile"><div class="tt">${t}</div><div class="tv">${v}</div><div class="ts">${s}</div></div>`).join("");

  const cards = R.products.map((p) => {
    const checks = (a) => a.checks.map((c) => `<li class="${c.status}"><b>${ICON[c.status]}</b><span><strong>${esc(c.label)}</strong> ${esc(c.detail)}</span><em>${c.earned}/${c.max}</em></li>`).join("");
    const d = p.demand;
    const demand = d ? `<div class="kv"><span>검색 수요</span><span>30일 평균 ${d.avg30.toFixed(1)} · 최근 7일 ${d.avg7.toFixed(1)} · 직전 7일 대비 <b class="${d.change > 0 ? "up" : d.change < 0 ? "down" : ""}">${pct(d.change)}</b> · 묶음 내 점유 ${fmt(d.share)}%</span></div>` : "";
    const shop = p.shop.length ? `<table><thead><tr><th>검색어</th><th>우리 순위</th><th>같은 중량 경쟁</th><th>최저가</th><th>중간값</th><th>우리 가격</th><th>상위 상품명에 흔한 단어</th></tr></thead><tbody>` +
      p.shop.map((r) => r.missing ? `<tr><td>${esc(r.keyword)}</td><td colspan="6" class="muted">캡처 없음</td></tr>` :
        `<tr><td>${esc(r.keyword)}</td><td>${r.ourRank === null ? `<span class="fail">${r.total}개 밖</span>` : r.ourRank + "위"}</td><td>${r.sameWeightCount}개 <span class="muted">(제외 ${r.excluded})</span></td><td>${fmt(r.min)}</td><td>${fmt(r.median)}</td><td>${r.pricePos === null ? "-" : `${r.pricePos}번째 저렴 (${pct(r.vsMedian)})`}</td><td>${r.topTokens.slice(0, 8).map((t) => `<span class="tok ${t.inOurTitle ? "in" : "out"}" title="상위 ${r.topN}개 중 ${t.share}%">${esc(t.token)} ${t.share}%</span>`).join(" ")}</td></tr>`).join("") + "</tbody></table>" : "";
    const manual = p.manual.length ? `<table><thead><tr><th>검색어</th><th>우리 순위</th><th>입력 가격</th><th>최저가</th><th>중간값</th><th>중간값 대비</th></tr></thead><tbody>` +
      p.manual.map((r) => r.missing ? `<tr><td>${esc(r.keyword)}</td><td colspan="5" class="muted">미입력</td></tr>` :
        `<tr><td>${esc(r.keyword)}</td><td>${r.rank === null ? "20위 밖" : r.rank + "위"}</td><td>${r.n}개</td><td>${fmt(r.min)}</td><td>${fmt(r.median)}</td><td>${pct(r.vsMedian)}</td></tr>`).join("") + "</tbody></table>" : "";
    return `<section class="card">
<header><h3>${p.idx}. ${esc(p.name)}</h3><span class="grade ${p.grade === "양호" ? "g1" : p.grade === "보통" ? "g2" : "g3"}">${p.grade}</span></header>
<div class="kv"><span>상품명</span><span class="title">${p.title ? esc(p.title) : '<em class="muted">미입력</em>'} <span class="muted">(${p.titleAudit.length}자)</span></span></div>
<div class="kv"><span>추적 검색어</span><span>${p.keywords.map(esc).join(" · ")}</span></div>
${demand}
<div class="two">
<div><div class="sb"><span>상품명 ${p.titleAudit.score}점</span>${scoreBar(p.titleAudit.score, "t")}</div><ul class="checks">${checks(p.titleAudit)}</ul>
<div class="kv small"><span>권장 구조</span><span>${esc(p.titleAudit.recommended) || '<em class="muted">elements 미입력</em>'}${p.titleAudit.extraTokens.length ? ` <span class="muted">· 검토 단어: ${esc(p.titleAudit.extraTokens.join(", "))}</span>` : ""}</span></div></div>
<div><div class="sb"><span>태그 ${p.tagAudit.score}점</span>${scoreBar(p.tagAudit.score, "g")}</div><ul class="checks">${checks(p.tagAudit)}</ul>
<div class="kv small"><span>태그</span><span>${p.tags.length ? p.tags.map((t) => esc(t) + (p.tagCounts?.[t] ? `<span class="muted">(${fmt(p.tagCounts[t])})</span>` : "")).join(", ") : '<em class="muted">미입력</em>'}</span></div></div>
</div>
${shop}${manual}
</section>`;
  }).join("");

  const trendTable = R.trend.groups.length ? `<table class="tbl"><thead><tr><th>품목(검색어 묶음)</th><th>30일 평균</th><th>최근 7일</th><th>직전 7일 대비</th><th>점유</th><th>최고점</th></tr></thead><tbody>` +
    R.trend.groups.map((g, i) => `<tr><td><i class="sw s${i + 1}"></i>${esc(g.name)}</td><td>${g.avg30.toFixed(1)}</td><td>${g.avg7.toFixed(1)}</td><td class="${g.change > 0 ? "up" : g.change < 0 ? "down" : ""}">${pct(g.change)}</td><td>${fmt(g.share)}%</td><td>${g.peak?.date} (${g.peak?.ratio.toFixed(1)})</td></tr>`).join("") + "</tbody></table>" : '<p class="muted">검색어트렌드 데이터가 없습니다. Actions → collect를 실행하세요.</p>';

  const actions = `<table class="tbl"><thead><tr><th>우선순위</th><th>구분</th><th>대상</th><th>내용</th></tr></thead><tbody>` +
    R.actions.map((a) => `<tr><td><span class="pr ${a.priority === "높음" ? "p1" : a.priority === "중간" ? "p2" : "p3"}">${a.priority}</span></td><td>${esc(a.kind)}</td><td>${esc(a.target)}</td><td>${esc(a.content)}</td></tr>`).join("") + "</tbody></table>";

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>준스샵스 SEO 분석</title>
<style>
:root{color-scheme:light dark;--bg:#f6f6f4;--surface:#fcfcfb;--line:#e4e3df;--ink:#0b0b0b;--ink2:#52514e;--ink3:#8a8984;
--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--good:#0ca30c;--warn:#fab219;--bad:#d03b3b;--accent:#2a78d6}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#121211;--surface:#1a1a19;--line:#2e2e2b;--ink:#f0efec;--ink2:#c3c2b7;--ink3:#8c8b84;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--accent:#3987e5}}
:root[data-theme=dark]{--bg:#121211;--surface:#1a1a19;--line:#2e2e2b;--ink:#f0efec;--ink2:#c3c2b7;--ink3:#8c8b84;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--accent:#3987e5}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:36px 0 12px}h3{font-size:16px;margin:0}
.sub{color:var(--ink2);margin:0 0 20px;font-size:13px}.sub a{color:var(--accent)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.tt{font-size:12px;color:var(--ink2)}.tv{font-size:28px;font-weight:600;line-height:1.2;margin:4px 0}.tv small{font-size:13px;font-weight:400;color:var(--ink3)}.ts{font-size:12px;color:var(--ink3)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px;margin:12px 0}
.card header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px}
.grade{font-size:12px;padding:2px 10px;border-radius:999px;border:1px solid var(--line)}.g1{color:var(--good)}.g2{color:#b07a00}.g3{color:var(--bad)}
.kv{display:grid;grid-template-columns:96px 1fr;gap:8px;font-size:14px;margin:4px 0}.kv>span:first-child{color:var(--ink2)}.kv.small{font-size:13px}.title{font-weight:600}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px}@media(max-width:720px){.two{grid-template-columns:1fr}}
.sb{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;margin-bottom:6px}.sb span{min-width:96px}
.bar{flex:1;height:8px;background:var(--line);border-radius:4px;overflow:hidden}.bar i{display:block;height:100%;border-radius:4px}.bar .t{background:var(--s1)}.bar .g{background:var(--s3)}
ul.checks{list-style:none;padding:0;margin:0}ul.checks li{display:grid;grid-template-columns:18px 1fr auto;gap:6px;font-size:13px;padding:4px 0;border-top:1px solid var(--line)}
ul.checks li b{font-weight:700}ul.checks li.pass b{color:var(--good)}ul.checks li.warn b{color:#b07a00}ul.checks li.fail b{color:var(--bad)}ul.checks li em{color:var(--ink3);font-style:normal;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}th,td{text-align:left;padding:6px 8px;border-top:1px solid var(--line);vertical-align:top}th{color:var(--ink2);font-weight:600;border-top:0;white-space:nowrap}.tbl td:nth-child(-n+3){white-space:nowrap}
.muted{color:var(--ink3)}.fail{color:var(--bad)}.up{color:var(--good)}.down{color:var(--bad)}
.tok{display:inline-block;font-size:12px;padding:1px 6px;border-radius:4px;border:1px solid var(--line);margin:1px 0}.tok.out{border-color:var(--s2);color:var(--s2)}.tok.in{color:var(--ink3)}
.pr{font-size:12px;padding:1px 8px;border-radius:999px;border:1px solid var(--line)}.p1{color:var(--bad)}.p2{color:#b07a00}.p3{color:var(--ink3)}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:middle}.s1{background:var(--s1)}.s2{background:var(--s2)}.s3{background:var(--s3)}.s4{background:var(--s4)}
.chart{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px}
.chart svg{width:100%;height:auto;display:block}.grid{stroke:var(--line);stroke-width:1}.ax{fill:var(--ink3);font-size:11px}.dl{fill:var(--ink2);font-size:11px}
.ln{stroke-width:2;stroke-linejoin:round;stroke-linecap:round}path.s1{stroke:var(--s1)}path.s2{stroke:var(--s2)}path.s3{stroke:var(--s3)}path.s4{stroke:var(--s4)}
.xh{stroke:var(--ink3);stroke-width:1;stroke-dasharray:3 3}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:var(--ink2);margin-top:8px}
.tip{position:absolute;pointer-events:none;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.12);white-space:nowrap;z-index:2}
.tip div{display:flex;gap:8px;justify-content:space-between}
.note{font-size:12px;color:var(--ink3);margin-top:8px}
</style></head><body><div class="wrap">
<h1>준스샵스 상품 SEO 분석</h1>
<p class="sub">${esc(S.date)} 생성 · 상품명·태그 진단은 config/products.json, 검색 수요는 data/trend, 순위·경쟁가는 data/shop(북마클릿 캡처) 기준 · <a href="capture.html">쇼핑 검색 캡처 도구</a></p>
<div class="tiles">${tiles}</div>
<h2>검색 수요 추이 (네이버 검색어트렌드, 품목별 추적 검색어 묶음)</h2>
${lineChart(R.trend.groups)}
${trendTable}
<p class="note">ratio는 요청 기간 내 최대 검색량을 100으로 둔 상대값. 같은 요청에 묶인 품목끼리만 비교 가능. 검색어 개별 수요는 API가 묶음 단위로만 제공.</p>
<h2>조치 항목</h2>
${actions}
<h2>품목별 진단</h2>
${cards}
</div>
<script>
document.querySelectorAll('.chart').forEach(function(ch){
  var D=JSON.parse(ch.getAttribute('data-chart')),svg=ch.querySelector('svg'),xh=svg.querySelector('.xh'),tip=ch.querySelector('.tip');
  var n=D.dates.length,W=D.x.W,PL=D.x.PL,PR=D.x.PR;
  function show(ev){var r=svg.getBoundingClientRect(),px=(ev.clientX-r.left)/r.width*W;var i=Math.round((px-PL)/(W-PL-PR)*(n-1));if(i<0||i>=n){hide();return;}
    var x=PL+i/Math.max(1,n-1)*(W-PL-PR);xh.setAttribute('x1',x);xh.setAttribute('x2',x);xh.style.display='';
    tip.innerHTML='<b>'+D.dates[i]+'</b>'+D.series.map(function(s){return '<div><span><i class="sw s'+s.slot+'"></i>'+s.name+'</span><span>'+s.v[i].toFixed(1)+'</span></div>'}).join('');
    tip.style.display='';var left=x/W*r.width+12;if(left+tip.offsetWidth>r.width)left=x/W*r.width-tip.offsetWidth-12;tip.style.left=left+'px';tip.style.top='12px';}
  function hide(){xh.style.display='none';tip.style.display='none';}
  svg.addEventListener('mousemove',show);svg.addEventListener('mouseleave',hide);svg.addEventListener('touchstart',function(e){show(e.touches[0])},{passive:true});svg.addEventListener('touchmove',function(e){show(e.touches[0])},{passive:true});
});
</script></body></html>`;
}

module.exports = { renderHtml };
