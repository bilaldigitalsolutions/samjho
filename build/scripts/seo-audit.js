'use strict';
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '..', '..', 'dist');
const S = /admin|questions|404/;
function g(d) { let r = []; try { for (const e of fs.readdirSync(d, {withFileTypes:true})) { const f = path.join(d, e.name); if (e.isDirectory()) r = r.concat(g(f)); else if (e.name.endsWith('.html') && !S.test(f)) r.push(f); } } catch(ex) {} return r; }
const files = g(D), P = [], I = [];
for (const f of files) {
  let h; try { h = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
  const r = f.replace(D, '').replace(/\\/g, '/').replace('/index.html', '/').replace('.html', '');
  const p = { f: r };
  const tm = h.match(/<title[^>]*>(.*?)<\/title>/is); p.t = tm ? tm[1].trim() : null; p.tl = p.t ? p.t.length : 0;
  if (!p.t) I.push({ f: r, t: 'NO_TITLE', s: 'H' });
  else if (p.tl < 30) I.push({ f: r, t: 'SHORT_TITLE', s: 'M', d: p.tl + ':' + p.t.substring(0, 40) });
  else if (p.tl > 65) I.push({ f: r, t: 'LONG_TITLE', s: 'M', d: p.tl + ':' + p.t.substring(0, 40) });
  const dm = h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i); p.d = dm ? dm[1].trim() : null; p.dl = p.d ? p.d.length : 0;
  if (!p.d) I.push({ f: r, t: 'NO_DESC', s: 'H' });
  else if (p.dl < 70) I.push({ f: r, t: 'SHORT_DESC', s: 'M', d: String(p.dl) });
  p.h1c = (h.match(/<h1[^>]*>/gi) || []).length;
  if (p.h1c === 0) I.push({ f: r, t: 'NO_H1', s: 'H' });
  else if (p.h1c > 1) I.push({ f: r, t: 'MULTI_H1', s: 'H' });
  const imgs = h.match(/<img[^>]*>/gi) || []; p.na = imgs.filter(i => !i.match(/alt=["'][^"']+["']/i)).length;
  if (p.na > 0) I.push({ f: r, t: 'NO_ALT', s: 'M', d: String(p.na) });
  p.sch = h.includes('ld+json') ? 1 : 0; p.faq = h.includes('FAQPage') ? 1 : 0;
  p.auth = h.includes('article:author') ? 1 : 0; p.og = h.includes('og:image') ? 1 : 0;
  p.test = (h.includes('Pipeline Test') || h.includes('Micro20 Test')) ? 1 : 0;
  if (p.test) I.push({ f: r, t: 'TEST_PAGE', s: 'H' });
  P.push(p);
}
const bt = {}; I.forEach(i => { bt[i.t] = (bt[i.t] || 0) + 1; });
console.log('Pages: ' + P.length + ' | Issues: ' + I.length);
Object.keys(bt).sort((a, b) => bt[b] - bt[a]).forEach(k => console.log('  ' + k + ': ' + bt[k]));
console.log('Title:' + P.filter(p => p.t).length + '/' + P.length + ' Desc:' + P.filter(p => p.d).length + '/' + P.length + ' H1:' + P.filter(p => p.h1c === 1).length + '/' + P.length + ' Schema:' + P.filter(p => p.sch).length + '/' + P.length + ' Author:' + P.filter(p => p.auth).length + '/' + P.length + ' OG:' + P.filter(p => p.og).length + '/' + P.length + ' Test:' + P.filter(p => p.test).length);
console.log('---HIGH---'); I.filter(i => i.s === 'H').forEach(i => console.log('  ' + i.t + ' | ' + i.f));
console.log('---MEDIUM---'); I.filter(i => i.s === 'M').forEach(i => console.log('  ' + i.t + ' | ' + i.f + ' | ' + i.d));
