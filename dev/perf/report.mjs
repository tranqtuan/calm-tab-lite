import fs from 'node:fs';
const files = process.argv.slice(2);
const med = (a) => { const b = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };
const row = (r) => ({
  'html arrives': r.nav.resp, 'JS starts': r.marks.start, settings: r.marks.settings, 'clock (mark)': r.marks.clock,
  'first paint': r.paint['first-paint'], 'FCP (date/clock)': r.paint['first-contentful-paint'], 'photo visible': r.marks.bg,
  'cards rendered': r.marks.cards, 'cards shown': r.marks['cards-shown'], ready: r.marks.ready, idle: r.marks.idle, CLS: r.cls,
  'page: html→clock painted': r.paint['first-contentful-paint'] - r.nav.resp, 'page: html→cards usable': (r.marks['cards-shown'] ?? r.marks.cards) - r.nav.resp, 'requests': r.res.length,
});
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(f));
  console.log(`\n## ${f}`);
  const sc = Object.entries(d.scenarios).filter(([, v]) => v.length);
  const keys = Object.keys(row(sc[0][1][0]));
  console.log('| metric (ms, median of ' + d.runs + ') | ' + sc.map(([k]) => k).join(' | ') + ' |');
  console.log('|---|' + sc.map(() => '---:').join('|') + '|');
  for (const k of keys) console.log(`| ${k} | ` + sc.map(([, v]) => { const m = med(v.map((r) => row(r)[k])); return m == null ? '–' : k === 'CLS' ? m.toFixed(3) : Math.round(m); }).join(' | ') + ' |');
  const sw = sc.filter(([k]) => k !== 'warm').map(([k, v]) => `${k}: sw modules ${med(v.map((r) => r.sw?.marks?.['sw:modules']))} ms`);
  console.log(sw.join(' · '));
}
