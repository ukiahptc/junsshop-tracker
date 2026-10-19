// 외부 패키지 없이 .xlsx 첫 시트를 2차원 배열로 읽는다 (광고주센터 보고서용 최소 구현)
const zlib = require("zlib");

function readZip(buf) {
  const files = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("zip 형식이 아님");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip 중앙 디렉터리 오류");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    const lh = off, lnlen = buf.readUInt16LE(lh + 26), lelen = buf.readUInt16LE(lh + 28);
    const start = lh + 30 + lnlen + lelen;
    const data = buf.subarray(start, start + csize);
    files[name] = method === 8 ? zlib.inflateRawSync(data) : method === 0 ? data : null;
    p += 46 + nlen + elen + clen;
  }
  return files;
}

const unesc = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

function readXlsx(buf) {
  const files = readZip(buf);
  const shared = [];
  const ss = files["xl/sharedStrings.xml"];
  if (ss) for (const m of ss.toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const sheetName = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error("시트 없음");
  const rows = [];
  for (const rm of files[sheetName].toString("utf8").matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const idx = colIndex(cm[1]), attrs = cm[2] || "", body = cm[3] || "";
      let v = "";
      const t = (attrs.match(/t="(\w+)"/) || [])[1];
      const vm = body.match(/<v>([\s\S]*?)<\/v>/);
      if (t === "s" && vm) v = shared[Number(vm[1])] ?? "";
      else if (t === "inlineStr") v = unesc([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
      else if (vm) { v = unesc(vm[1]); if (t !== "str" && v !== "" && !isNaN(Number(v))) v = Number(v); }
      row[idx] = v;
    }
    rows.push(Array.from(row, (x) => (x === undefined ? "" : x)));
  }
  return rows;
}

module.exports = { readXlsx };
