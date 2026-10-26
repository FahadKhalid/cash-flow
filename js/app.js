/**
 * Cash Flow: personal finance planner and guide.
 *
 * A single-page app with no build step and no runtime dependencies.
 * Data lives in the browser (localStorage). Optional sync uses the user's own
 * Google Drive app folder. Nothing is ever sent to a server we control.
 *
 * Sections (search for "/* ----------"):
 *   1. Constants, state and helpers
 *   2. SVG chart engine
 *   3. Data model: defaults, sample-data cleanup, sanitizer, migration
 *   4. Calculations: aggregation, zakat, projection
 *   5. Rendering (only the visible tab is rendered)
 *   6. Grow assets coach, Rich Dad view, goals, net worth history
 *   7. Profiles
 *   8. Google Drive sync (offline first, per-section merge)
 *   9. Settings, backup and restore
 *  10. Portfolio, investments, spending check-up
 *  11. Learn: 10-step path, lessons, Islamic wisdom, mindsets, games, quizzes
 *  12. UI: navigation, toasts, theme, controls, boot
 *
 * Conventions: S is the current profile's state; render() redraws the visible tab;
 * change() saves (debounced) and schedules sync. All user text goes through
 * textContent, never innerHTML, to prevent injection.
 */
"use strict";

const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const KEYS = ["income", "extra", "passive", "expenses"], KL = { income: "Salary", extra: "Extra income", passive: "Passive income", expenses: "Expenses" };
const now = new Date(), ck = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
const DEF = { v: 2, currency: "EUR", log: {},
  assets: { cash: 0, emergency: 0, stocks: 0, gold: 0 }, zakat: { goldPrice: 0 },
  proj: { years: 20, incomeGrowth: 3, inflation: 2.5, stockReturn: 7, goldReturn: 5 },
  alloc: { emMonths: 6, stocks: 50, gold: 15, housing: 20, travel: 10, other: 5 },
  bs: { assets: [], liab: [] },
  goals: [], port: [], inv: [], coach: {}, nwHist: {}, learn: { done: {}, read: {}, purpose: "", quiz: {}, games: {} }, demoClean: 1 };
const PRE = { safe: { stocks: 30, gold: 25, housing: 30, travel: 10, other: 5 }, bal: { stocks: 50, gold: 15, housing: 20, travel: 10, other: 5 }, grow: { stocks: 65, gold: 10, housing: 15, travel: 5, other: 5 } };
const AL = [["stocks", "Stocks / ETFs", "--green"], ["gold", "Gold", "--gold"], ["housing", "House fund", "--sky"], ["travel", "Travel", "--plum"], ["other", "Learning & other", "--sand"]];
const PAL = ["var(--rose)", "var(--sky)", "var(--plum)", "var(--sand)", "var(--muted)", "#4F9C9C", "#A0507A", "#8C6D4F"], cv = v => `var(${v})`;
let S = structuredClone(DEF), V = "m", NY = now.getFullYear(), NM = now.getMonth() + 1, saveT = null, ANIM = true;
const $ = id => document.getElementById(id);
const sum = l => (l || []).reduce((s, x) => s + (+x.a || 0), 0);
const FMTC = {};
const nf = (c, o) => { const k = c + JSON.stringify(o); if (!FMTC[k])
  try {
    FMTC[k] = new Intl.NumberFormat(undefined, { style: "currency", currency: c, ...o });
  }
  catch {
    FMTC[k] = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", ...o });
  } return FMTC[k]; };
const fmt = v => nf(S.currency, { maximumFractionDigits: 0 }).format(Number.isFinite(+v) ? +v : 0);
const short = v => nf(S.currency, { notation: "compact", maximumFractionDigits: 1 }).format(Number.isFinite(+v) ? +v : 0);
const get = (o, p) => p.split(".").reduce((x, k) => x?.[k], o), put = (o, p, v) => { const k = p.split("."); k.slice(0, -1).reduce((x, y) => x[y], o)[k.at(-1)] = v; };
const logged = () => Object.keys(S.log).sort();
const RM = matchMedia("(prefers-reduced-motion:reduce)").matches;
/* ---------- tiny SVG chart engine (no internet needed) ---------- */
const NS = "http://www.w3.org/2000/svg";
function sv(t, a, p) { const e = document.createElementNS(NS, t); for (const k in a)
  e.setAttribute(k, a[k]); p && p.append(e); return e; }
function ticks(min, max, n = 5) {
  if (max === min)
    max = min + 1;
  const raw = (max - min) / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p, st = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  const lo = Math.floor(min / st) * st, hi = Math.ceil(max / st) * st, t = [];
  for (let v = lo; v <= hi + st / 2; v += st)
    t.push(+v.toFixed(6));
  return t;
}
class Ch {
  constructor(id, type) {
    this.type = type;
    this.el = $(id).parentElement;
    this.el.classList.add("ch");
    this.el.innerHTML = '<div class="lg"></div><div class="cv"><div class="tip"></div></div>';
    [this.lg, this.cv] = this.el.children;
    this.tip = this.cv.firstChild;
    this.w = 0;
    new ResizeObserver(() => this.cfg && this.draw(false)).observe(this.cv);
  }
  set(cfg) { this.cfg = cfg; this.draw(ANIM); }
  draw(anim) {
    const W = this.cv.clientWidth, H = this.cv.clientHeight;
    if (!W || !H) {
      this.w = 0;
      return;
    }
    anim = !RM && (anim || !this.w);
    this.w = W;
    this.cv.querySelector("svg")?.remove();
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}` });
    this.cv.prepend(svg);
    this.type === "pie" ? this.pie(svg, W, H, anim) : this.xy(svg, W, H, anim);
  }
  legend(items) { this.lg.innerHTML = ""; items.forEach(([l, c]) => { const s = document.createElement("span"); s.innerHTML = `<i style="background:${c}"></i>`; s.append(l); this.lg.append(s); }); }
  showTip(html, x, y, W) {
    this.tip.innerHTML = html;
    this.tip.classList.add("on");
    const tw = this.tip.offsetWidth;
    this.tip.style.left = Math.max(0, Math.min(W - tw, x > W / 2 ? x - tw - 12 : x + 12)) + "px";
    this.tip.style.top = Math.max(0, y) + "px";
  }
  pie(svg, W, H, anim) {
    const { labels, values, colors } = this.cfg, tot = values.reduce((s, v) => s + Math.max(0, v), 0);
    this.legend(labels.map((l, i) => [l, colors[i]]).filter((_, i) => values[i] > 0));
    const r = Math.min(W, H) / 2 - 12, sw = r * .34, cx = W / 2, cy = H / 2, R = r - sw / 2, C = 2 * Math.PI * R;
    sv("circle", { cx, cy, r: R, fill: "none", stroke: "var(--line)", "stroke-width": sw }, svg);
    let acc = 0;
    values.forEach((v, i) => {
      if (v <= 0 || !tot)
        return;
      const len = C * v / tot;
      const c = sv("circle", { cx, cy, r: R, fill: "none", stroke: colors[i], "stroke-width": sw, "stroke-dashoffset": -acc, transform: `rotate(-90 ${cx} ${cy})`, class: "arc" }, svg);
      const fin = `${Math.max(0, len - 1.5)} ${C}`;
      c.style.strokeDasharray = anim ? `0 ${C}` : fin;
      if (anim)
        requestAnimationFrame(() => requestAnimationFrame(() => c.style.strokeDasharray = fin));
      c.onpointermove = e => { const b = this.cv.getBoundingClientRect(); this.showTip(`<b></b><br>${fmt(v)} · ${Math.round(v / tot * 100)}%`, e.clientX - b.left, e.clientY - b.top - 40, W); this.tip.firstChild.textContent = labels[i]; };
      c.onpointerleave = () => this.tip.classList.remove("on");
      acc += len;
    });
    const t = sv("text", { x: cx, y: cy + 5, "text-anchor": "middle", class: "ctr-t" }, svg);
    t.textContent = tot ? short(tot) : "No data";
  }
  xy(svg, W, H, anim) {
    const { labels, series, stacked } = this.cfg, n = labels.length;
    this.legend(series.map(s => [s.label, s.color]));
    const L = 58, R = 8, T = 8, B = 22, pw = W - L - R, ph = H - T - B, all = [];
    for (let i = 0; i < n; i++) {
      let s = 0;
      series.forEach(x => { const v = +x.data[i] || 0; all.push(v); if (stacked && x.kind !== "line")
        s += Math.max(0, v); });
      all.push(s);
    }
    const tk = ticks(Math.min(0, ...all), Math.max(0, ...all)), t0 = tk[0], t1 = tk.at(-1), y = v => T + ph * (1 - (v - t0) / (t1 - t0)), band = pw / Math.max(1, n), xc = i => L + band * (i + .5);
    tk.forEach(v => { sv("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--line)" }, svg); const t = sv("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end" }, svg); t.textContent = short(v); });
    const lw = Math.max(...labels.map(l => String(l).length)) * 6.5 + 8, stp = Math.max(1, Math.ceil(n * lw / pw));
    labels.forEach((l, i) => { if (i % stp)
      return; const t = sv("text", { x: xc(i), y: H - 6, "text-anchor": "middle" }, svg); t.textContent = l; });
    const bars = series.filter(s => s.kind === "bar"), cum = Array(n).fill(0);
    bars.forEach((s, j) => s.data.forEach((v, i) => {
      if (v == null)
        return;
      v = +v;
      let x, w, top, h;
      if (stacked) {
        w = band * .6;
        x = xc(i) - w / 2;
        top = y(cum[i] + Math.max(0, v));
        h = y(cum[i]) - top;
        cum[i] += Math.max(0, v);
      }
      else {
        const gw = band * .75;
        w = gw / bars.length;
        x = xc(i) - gw / 2 + j * w + 1;
        w -= 2;
        top = y(Math.max(v, 0));
        h = Math.abs(y(v) - y(0));
      }
      const r = sv("rect", { x, y: top, width: Math.max(0, w), height: Math.max(0, h), rx: 3, fill: s.color }, svg);
      if (anim) {
        r.classList.add("bar-in");
        r.style.animationDelay = i * 25 + "ms";
      }
    }));
    const ac = Array(n).fill(0);
    series.filter(s => s.kind === "area").forEach(s => {
      const top = s.data.map((v, i) => ac[i] + (+v || 0)), pts = top.map((v, i) => `${xc(i)},${y(v)}`), bot = ac.map((v, i) => `${xc(i)},${y(v)}`).reverse();
      const p = sv("polygon", { points: [...pts, ...bot].join(" "), fill: s.color, "fill-opacity": .35 }, svg);
      sv("polyline", { points: pts.join(" "), fill: "none", stroke: s.color, "stroke-width": 2 }, svg);
      if (anim)
        p.classList.add("fade");
      top.forEach((v, i) => ac[i] = v);
    });
    series.filter(s => s.kind === "line").forEach(s => {
      let d = "", pen = false;
      s.data.forEach((v, i) => { if (v == null) {
        if (!s.span)
          pen = false;
        return;
      } d += (pen ? "L" : "M") + xc(i) + "," + y(+v); pen = true; });
      const p = sv("path", { d, fill: "none", stroke: s.color, "stroke-width": s.width || 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      if (s.dash)
        p.setAttribute("stroke-dasharray", s.dash);
      else if (anim) {
        p.setAttribute("pathLength", 1);
        p.classList.add("draw");
      }
      s.data.forEach((v, i) => { if (v != null && n <= 13)
        sv("circle", { cx: xc(i), cy: y(+v), r: 3.5, fill: s.color }, svg); });
    });
    const g = sv("line", { y1: T, y2: T + ph, stroke: "var(--muted)", "stroke-dasharray": "3 3", opacity: 0 }, svg), hit = sv("rect", { x: L, y: T, width: pw, height: ph, fill: "transparent" }, svg);
    hit.onpointermove = e => {
      const b = svg.getBoundingClientRect(), px = (e.clientX - b.left) * W / b.width, i = Math.max(0, Math.min(n - 1, Math.floor((px - L) / band)));
      g.setAttribute("x1", xc(i));
      g.setAttribute("x2", xc(i));
      g.setAttribute("opacity", 1);
      this.showTip(`<b>${labels[i]}</b>` + series.map(s => `<br><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color}"></i> ${s.label}: ${s.data[i] == null ? "–" : fmt(+s.data[i])}`).join(""), xc(i) * b.width / W, T, b.width);
    };
    hit.onpointerleave = () => { g.setAttribute("opacity", 0); this.tip.classList.remove("on"); };
  }
}
/* ---------- data ---------- */
const DEMO_M = JSON.stringify({ income: [{ n: "Salary (net)", a: 4500 }], extra: [{ n: "Freelance", a: 600 }, { n: "Agency", a: 400 }], passive: [{ n: "Dividends", a: 50 }], expenses: [{ n: "Rent", a: 1300 }, { n: "Food", a: 500 }, { n: "Transport", a: 120 }, { n: "Utilities & phone", a: 220 }, { n: "Family support", a: 400 }, { n: "Other", a: 300 }], sadaqah: 100, zakatPaid: 0 });
const DEMO_G = { "Emergency fund top-up": 15000, "Umrah": 5000, "House down payment": 60000 };
function cleanDemo(o) {
  const sm = l => (Array.isArray(l) ? l : []).reduce((t, x) => t + (+(x && x.a) || 0), 0), nm = l => (Array.isArray(l) ? l : []).map(x => String(x && x.n || "").trim().toLowerCase()).sort().join("|");
  const isDemoMonth = m => m && sm(m.income) === 4500 && sm(m.extra) === 1000 && sm(m.passive) === 50 && sm(m.expenses) === 2840 && +m.sadaqah === 100 && !+m.zakatPaid && nm(m.income) === "salary (net)" && nm(m.extra) === "agency|freelance";
  let removed = 0;
  Object.keys(o.log || {}).forEach(k => { if (isDemoMonth(o.log[k])) {
    delete o.log[k];
    removed++;
  } });
  const A = o.assets || {};
  if (+A.cash === 8000 && +A.emergency === 5000 && +A.stocks === 6000 && +A.gold === 3000) {
    o.assets = { cash: 0, emergency: 0, stocks: 0, gold: 0 };
    if (+o.zakat?.goldPrice === 95)
      o.zakat.goldPrice = 0;
    o.nwHist = {};
    removed++;
  }
  const G0 = (o.goals || []).length;
  o.goals = (o.goals || []).filter(g => !(g && DEMO_G[String(g.n || "").trim()] === +g.t));
  if (o.goals.length < G0)
    removed++;
  if (o.bs) {
    o.bs.assets = (o.bs.assets || []).filter(x => !(x && x.n === "Rental property, business, app…" && !+x.v));
    o.bs.liab = (o.bs.liab || []).filter(x => !(x && x.n === "Car loan" && !+x.v && !+x.p));
  }
  if (removed && !Object.keys(o.log || {}).length && !(o.port || []).length && !(o.inv || []).length) {
    o.learn = o.learn || {};
    o.learn.done = {};
    o.nwHist = {};
  }
  o.demoClean = 1;
  return removed;
}
/* ---------- data sanitizer: every field gets the right type and range ---------- */
const nz = v => { const n = typeof v === "string" && v.trim() === "" ? 0 : +v; return Number.isFinite(n) ? n : 0; }, cl = (v, a, b) => Math.min(b, Math.max(a, nz(v))), st = v => v == null ? "" : String(v).slice(0, 300), isO = v => v && typeof v === "object" && !Array.isArray(v);
const rows = a => (Array.isArray(a) ? a : []).filter(isO).map(x => ({ n: st(x.n), a: nz(x.a) }));
function sanitize(o) {
  try {
    new Intl.NumberFormat(undefined, { style: "currency", currency: o.currency });
  }
  catch {
    o.currency = "EUR";
  }
  if (typeof o.currency !== "string")
    o.currency = "EUR";
  const L = {};
  if (isO(o.log))
    for (const k in o.log) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(k) || !isO(o.log[k]))
        continue;
      const m = o.log[k];
      L[k] = { income: rows(m.income), extra: rows(m.extra), passive: rows(m.passive), expenses: rows(m.expenses), sadaqah: nz(m.sadaqah), zakatPaid: nz(m.zakatPaid) };
    }
  o.log = L;
  const A = isO(o.assets) ? o.assets : {};
  o.assets = { cash: nz(A.cash), emergency: nz(A.emergency), stocks: nz(A.stocks), gold: nz(A.gold) };
  o.zakat = { goldPrice: Math.max(0, nz(isO(o.zakat) ? o.zakat.goldPrice : 0)) };
  const P = isO(o.proj) ? o.proj : {}, D = DEF.proj;
  o.proj = { years: Math.round(cl(P.years ?? D.years, 1, 60)) || D.years, incomeGrowth: cl(P.incomeGrowth ?? D.incomeGrowth, -50, 100), inflation: cl(P.inflation ?? D.inflation, -50, 100), stockReturn: cl(P.stockReturn ?? D.stockReturn, -50, 100), goldReturn: cl(P.goldReturn ?? D.goldReturn, -50, 100) };
  const Al = isO(o.alloc) ? o.alloc : {}, DA = DEF.alloc;
  o.alloc = { emMonths: cl(Al.emMonths ?? DA.emMonths, 0, 60) };
  ["stocks", "gold", "housing", "travel", "other"].forEach(k => o.alloc[k] = cl(Al[k] ?? DA[k], 0, 100));
  const bs = isO(o.bs) ? o.bs : {};
  o.bs = { assets: (Array.isArray(bs.assets) ? bs.assets : []).filter(isO).map(x => ({ n: st(x.n), v: nz(x.v) })), liab: (Array.isArray(bs.liab) ? bs.liab : []).filter(isO).map(x => ({ n: st(x.n), v: nz(x.v), p: nz(x.p) })) };
  o.goals = (Array.isArray(o.goals) ? o.goals : []).filter(isO).map(g => ({ id: st(g.id) || uid(), n: st(g.n), ic: typeof g.ic === "string" && g.ic.length < 8 ? g.ic : "🎯", t: Math.max(0, nz(g.t)), s: Math.max(0, nz(g.s)), d: /^\d{4}-(0[1-9]|1[0-2])$/.test(g.d) ? g.d : "" }));
  o.port = (Array.isArray(o.port) ? o.port : []).filter(isO).map(a => ({ id: st(a.id) || uid(), type: AT[a.type] ? a.type : "other", n: st(a.n), v: nz(a.v), buy: nz(a.buy), bd: /^\d{4}-\d{2}$/.test(a.bd) ? a.bd : "", own: a.own == null || a.own === "" ? 100 : cl(a.own, 0, 100), inc: nz(a.inc), cost: nz(a.cost), g: cl(a.g, -100, 100), lo: Math.max(0, nz(a.lo)), lp: Math.max(0, nz(a.lp)), zk: !!a.zk, notes: st(a.notes) }));
  const Le = isO(o.learn) ? o.learn : {};
  o.learn = { done: isO(Le.done) ? Le.done : {}, read: isO(Le.read) ? Le.read : {}, purpose: st(Le.purpose).slice(0, 1000), quiz: isO(Le.quiz) ? Le.quiz : {}, games: isO(Le.games) ? Le.games : {}, mind: typeof Le.mind === "string" ? Le.mind : undefined };
  const H = {};
  if (isO(o.nwHist))
    for (const k in o.nwHist)
      if (/^\d{4}-\d{2}$/.test(k))
        H[k] = nz(o.nwHist[k]);
  o.nwHist = H;
  o.inv = (Array.isArray(o.inv) ? o.inv : []).filter(isO).map(h => ({ id: st(h.id) || uid(), type: INVT[h.type] ? h.type : "other", n: st(h.n), tx: (Array.isArray(h.tx) ? h.tx : []).filter(t => isO(t) && ["buy", "sell", "val", "div"].includes(t.k)).map(t => ({ k: t.k, amt: Math.max(0, nz(t.amt)), u: Math.max(0, nz(t.u)), pct: cl(t.pct, 0, 100), d: /^\d{4}-(0[1-9]|1[0-2])$/.test(t.d) ? t.d : "2000-01" })) })).filter(h => h.tx.length);
  const Co = {};
  if (isO(o.coach))
    for (const k in o.coach)
      Co[k] = Math.max(0, nz(o.coach[k]));
  o.coach = Co;
  o.port.forEach(a => { const h = {}; if (isO(a.hist))
    for (const k in a.hist)
      if (/^\d{4}-\d{2}$/.test(k))
        h[k] = nz(a.hist[k]); a.hist = h; });
  o.mt = isO(o.mt) ? o.mt : {};
  o.del = isO(o.del) ? o.del : {};
  return o;
}
function migrate(p) {
  if (!isO(p))
    p = {};
  if (!p.log && Array.isArray(p.income)) {
    const m = {};
    KEYS.forEach(k => m[k] = (p[k] || []).map(x => ({ n: x.n, a: x.a })));
    m.sadaqah = p.giving?.sadaqah || 0;
    m.zakatPaid = p.giving?.zakatPaid || 0;
    p.log = { [ck(now.getFullYear(), now.getMonth() + 1)]: m };
    KEYS.forEach(k => delete p[k]);
    delete p.giving;
  }
  p = { ...p };
  delete p.exportedAt;
  delete p.app;
  const o = sanitize(Object.assign(structuredClone(DEF), p));
  cleanDemo(o);
  o.goals.forEach(g => g.id = g.id || uid());
  o.port = o.port || [];
  o.port.forEach(a => a.id = a.id || uid());
  if (o.bs && o.bs.assets && o.bs.assets.length) {
    o.bs.assets.filter(x => +x.v > 0).forEach(x => o.port.push({ id: uid(), type: "other", n: x.n || "Asset", v: +x.v, buy: 0, bd: "", own: 100, inc: 0, cost: 0, g: 0, lo: 0, lp: 0, zk: false, notes: "" }));
    o.bs.assets = [];
  }
  o.mt = o.mt || {};
  o.del = o.del || {};
  return o;
}
function rangeKeys() {
  if (V === "a")
    return logged();
  const ms = V === "m" ? [NM] : V === "q" ? [0, 1, 2].map(i => Math.floor((NM - 1) / 3) * 3 + 1 + i) : [...Array(12)].map((_, i) => i + 1);
  return ms.map(m => ck(NY, m)).filter(k => S.log[k]);
}
function agg(keys) {
  const r = { inc: 0, ext: 0, pas: 0, exp: 0, sad: 0, zp: 0, n: keys.length, cat: {} };
  keys.forEach(k => {
    const e = S.log[k];
    r.inc += sum(e.income);
    r.ext += sum(e.extra);
    r.pas += sum(e.passive);
    r.exp += sum(e.expenses);
    r.sad += +e.sadaqah || 0;
    r.zp += +e.zakatPaid || 0;
    (e.expenses || []).forEach(x => { const n = (x.n || "Unnamed").trim(); r.cat[n] = (r.cat[n] || 0) + (+x.a || 0); });
  });
  r.tin = r.inc + r.ext + r.pas;
  r.give = r.sad + r.zp;
  r.sv = r.tin - r.exp - r.give;
  r.rate = r.tin ? r.sv / r.tin : 0;
  return r;
}
function base() { const k = logged().slice(-6), a = agg(k), n = k.length || 1; return { n: k.length, act: (a.inc + a.ext) / n, pas: a.pas / n, exp: a.exp / n, sad: a.sad / n, sv: (a.tin - a.exp - a.sad) / n }; }
function zakatNow() { const A = S.assets, w = (+A.cash || 0) + (+A.emergency || 0) + (+A.stocks || 0) + (+A.gold || 0) + portTot().zk, nis = 85 * (+S.zakat.goldPrice || 0), gp = +S.zakat.goldPrice > 0; return { w, nis, gp, due: gp && w >= nis ? w * .025 : 0 }; }
function project(b) {
  const P = S.proj, a = S.alloc, N = Math.max(1, Math.min(60, +P.years || 1));
  let cash = +S.assets.cash || 0, em = +S.assets.emergency || 0, st = +S.assets.stocks || 0, gd = +S.assets.gold || 0, hs = 0, act = b.act, pas = b.pas, exp = b.exp, sad = b.sad, free = null;
  const rows = [], tot = AL.reduce((s, [k]) => s + (+a[k] || 0), 0) || 1, PV = (S.port || []).map(x => { const p = pa(x); return { v: p.val, g: +x.g || 0, lo: p.lo, lp: p.lp }; });
  for (let y = 1; y <= N; y++) {
    PV.forEach(x => { x.v *= 1 + x.g / 100; x.lo = Math.max(0, x.lo - x.lp * 12); });
    const ast = PV.reduce((s, x) => s + x.v - x.lo, 0);
    const w = cash + em + st + gd, z = +S.zakat.goldPrice > 0 && w >= 85 * S.zakat.goldPrice ? w * .025 : 0;
    let s = (act + pas - exp - sad) * 12 - z;
    const toEm = Math.min(Math.max(0, (+a.emMonths || 0) * exp - em), Math.max(0, s));
    em += toEm;
    s -= toEm;
    if (s > 0) {
      st += s * a.stocks / tot;
      gd += s * a.gold / tot;
      hs += s * a.housing / tot;
      cash += s * a.other / tot;
    }
    else
      cash += s;
    st *= 1 + P.stockReturn / 100;
    gd *= 1 + P.goldReturn / 100;
    act *= 1 + P.incomeGrowth / 100;
    exp *= 1 + P.inflation / 100;
    sad *= 1 + P.inflation / 100;
    const pi = st * .04 / 12 + pas;
    if (free === null && pi >= exp + sad)
      free = y;
    rows.push({ y, cash: cash + em, st, gd, hs, ast, nw: cash + em + st + gd + hs + ast, pi, exp: exp + sad });
  }
  return { rows, free };
}
const shown = {}, ctok = {};
function count(id, v, f = fmt) {
  const el = $(id);
  if (!el)
    return;
  const from = shown[id] ?? 0, tok = ctok[id] = (ctok[id] || 0) + 1;
  shown[id] = v;
  if (RM || !ANIM || !Number.isFinite(v) || from === v) {
    el.textContent = f(Number.isFinite(v) ? v : 0);
    return;
  }
  const t0 = performance.now();
  (function tick(t) { if (ctok[id] !== tok)
    return; const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3); el.textContent = f(from + (v - from) * e); if (k < 1)
    requestAnimationFrame(tick); })(t0);
}
const navLabel = () => V === "m" ? `${MN[NM - 1]} ${NY}` : V === "q" ? `Q${Math.floor((NM - 1) / 3) + 1} ${NY}` : V === "y" ? `${NY}` : "All time";
/* ---------- render ---------- */
let C;
function render() {
  $("navL").textContent = navLabel();
  $("prev").disabled = $("next").disabled = V === "a";
  backupLbl();
  S.nwHist = S.nwHist || {};
  S.nwHist[ck(now.getFullYear(), now.getMonth() + 1)] = Math.round(netWorth());
  const T = document.querySelector(".tab.on")?.id || "ov", b = base();
  let pjc = null;
  const PJ = () => pjc || (pjc = project(b));
  if (T === "lg")
    renderStrip();
  else if (T === "zk")
    renderZakat();
  else if (T === "pj" || T === "al")
    renderPlan(b, PJ());
  else if (T === "gr") {
    renderGrow(b, PJ());
    renderCoach();
  }
  else if (T === "rd")
    renderRD(b);
  else if (T === "go")
    updGoals(b);
  else if (T === "as")
    renderPort();
  else if (T === "lr")
    renderLearn();
  if (T !== "ov")
    return;
  renderCoach();
  $("ovWel").hidden = logged().length > 0;
  trustUI();
  const keys = rangeKeys(), r = agg(keys), n = r.n || 1, cov = r.exp + r.sad ? r.pas / (r.exp + r.sad) : 0, pj = PJ();
  $("ringP").style.strokeDashoffset = 465 * (1 - Math.min(1, cov));
  $("ringP").style.opacity = cov > 0.005 ? 1 : 0;
  count("ringV", cov * 100, v => Math.round(v) + "%");
  if (!keys.length) {
    $("heroT").textContent = `Nothing logged for ${navLabel()}`;
    $("heroP").textContent = "Tap Months to add it, or use the welcome steps above.";
  }
  else {
    $("heroT").textContent = cov >= 1 ? "You're out of the rat race" : "Your way out of the rat race";
    $("heroP").textContent = `${navLabel()}: you saved ${fmt(r.sv)} of ${fmt(r.tin)}${r.n > 1 ? ` across ${r.n} months (${fmt(r.sv / n)} a month)` : ""}. ` +
      (pj.free ? `At your recent pace you reach freedom in ${now.getFullYear() + pj.free}.` : `Freedom isn't reached within ${S.proj.years} years yet.`);
  }
  count("sIn", r.tin);
  count("sEx", r.exp);
  count("sGv", r.give);
  count("sSv", r.sv);
  count("sRt", r.rate * 100, v => Math.round(v) + "%");
  $("sSv").className = r.sv >= 0 ? "pos" : "neg";
  let lab, rows;
  const ys = [...new Set(logged().map(k => k.slice(0, 4)))];
  if (V === "a") {
    lab = ys;
    rows = ys.map(y => agg(logged().filter(k => k.startsWith(y))));
    $("trendT").textContent = "Year by year";
  }
  else {
    lab = MN;
    rows = MN.map((_, i) => S.log[ck(NY, i + 1)] ? agg([ck(NY, i + 1)]) : null);
    $("trendT").textContent = `Month by month, ${NY}`;
  }
  C.tr.set({ labels: lab, series: [{ label: "Income", kind: "bar", color: cv("--sky"), data: rows.map(x => x ? x.tin : null) },
      { label: "Expenses + giving", kind: "bar", color: cv("--rose"), data: rows.map(x => x ? x.exp + x.give : null) },
      { label: "Saved", kind: "line", span: true, width: 3, color: cv("--green"), data: rows.map(x => x ? x.sv : null) }] });
  const cats = Object.entries(r.cat).sort((a, b) => b[1] - a[1]);
  const pl = [...cats.map(c => c[0]), "Sadaqah", "Zakat"], pv = [...cats.map(c => c[1]), r.sad, r.zp], pc = [...cats.map((_, i) => PAL[i % 8]), cv("--sand"), cv("--gold")];
  if (r.sv > 0) {
    pl.push("Saved");
    pv.push(r.sv);
    pc.push(cv("--green"));
  }
  C.pie.set({ labels: pl, values: pv, colors: pc });
  $("catT").innerHTML = `<tr><th>Category</th><th>Total</th><th>Per month</th><th>Share</th></tr>` + (cats.length ? cats.map(([, v]) => `<tr><td class="rk"></td><td data-l="Total">${fmt(v)}</td><td data-l="Per month">${fmt(v / n)}</td><td data-l="Share">${r.exp ? Math.round(v / r.exp * 100) : 0}%</td></tr>`).join("") : `<tr><td colspan="4">No expenses logged in this period.</td></tr>`);
  [...$("catT").querySelectorAll("tr")].slice(1).forEach((tr, i) => { if (cats[i])
    tr.firstChild.textContent = cats[i][0]; });
  $("yrT").innerHTML = `<tr><th>Year</th><th>Months</th><th>Income</th><th>Expenses</th><th>Giving</th><th>Saved</th><th>Rate</th></tr>` +
    ys.map(y => { const a = agg(logged().filter(k => k.startsWith(y))); return `<tr><td data-l="Year" class="rk">${y}</td><td data-l="Months">${a.n}</td><td data-l="Income">${fmt(a.tin)}</td><td data-l="Expenses">${fmt(a.exp)}</td><td data-l="Giving">${fmt(a.give)}</td><td data-l="Saved" class="${a.sv >= 0 ? "pos" : "neg"}">${fmt(a.sv)}</td><td data-l="Rate">${Math.round(a.rate * 100)}%</td></tr>`; }).join("");
  renderNWH();
  renderLearn();
}
function renderStrip() {
  $("mStrip").innerHTML = "";
  MN.forEach((m, i) => {
    const k = ck(NY, i + 1), e = S.log[k], bt = document.createElement("button");
    bt.className = (e ? "" : "empty ") + (i + 1 === NM ? "on" : "");
    bt.innerHTML = `${m}<small></small>`;
    bt.querySelector("small").textContent = e ? short(agg([k]).sv) : "+";
    bt.setAttribute("aria-label", `${m} ${NY}`);
    bt.onclick = () => { NM = i + 1; ANIM = true; render(); renderEditor(); };
    $("mStrip").append(bt);
  });
}
function renderEditor() {
  const k = ck(NY, NM), e = S.log[k], box = $("mEdit");
  box.innerHTML = "";
  if (!e) {
    const prev = logged().filter(x => x < k).at(-1) || logged().at(-1);
    box.innerHTML = `<div class="panel empty-box"><h2>${MN[NM - 1]} ${NY} has no entry yet</h2><div class="ctrls"></div></div>`;
    const c = box.querySelector(".ctrls");
    if (prev) {
      const b1 = Object.assign(document.createElement("button"), { className: "btn", textContent: `Copy from ${MN[+prev.slice(5) - 1]} ${prev.slice(0, 4)}` });
      b1.onclick = () => { S.log[k] = structuredClone(S.log[prev]); S.log[k].zakatPaid = 0; renderEditor(); change(true); };
      c.append(b1);
    }
    const b2 = Object.assign(document.createElement("button"), { className: "btn ghost", textContent: "Start empty" });
    b2.onclick = () => { S.log[k] = { income: [{ n: "Salary", a: 0 }], extra: [], passive: [], expenses: [{ n: "Rent", a: 0 }], sadaqah: 0, zakatPaid: 0 }; renderEditor(); change(true); };
    c.append(b2);
    return;
  }
  const g = document.createElement("div");
  g.className = "grid g2";
  box.append(g);
  KEYS.forEach(key => { const p = document.createElement("div"); p.className = "panel"; p.innerHTML = `<h2>${KL[key]}</h2>`; g.append(p); rowsEd(p, e, key); if (key === "passive" && (S.port || []).some(x => pa(x).op > 0)) {
    const fb = Object.assign(document.createElement("button"), { className: "btn ghost sm", textContent: "↻ Fill from my assets" });
    fb.style.marginTop = "10px";
    fb.onclick = () => { e.passive = (S.port || []).map(x => [x, pa(x)]).filter(([, q]) => q.op > 0).map(([x, q]) => ({ n: x.n || q.t.n, a: Math.round(q.op) })); renderEditor(); change(true); toast("✓ Passive income filled from your assets"); };
    p.append(fb);
  } });
  const gv = document.createElement("div");
  gv.className = "panel";
  gv.innerHTML = `<h2>Giving this month</h2>`;
  [["sadaqah", "Sadaqah"], ["zakatPaid", "Zakat paid"]].forEach(([f, l]) => {
    const d = document.createElement("div");
    d.className = "field";
    d.innerHTML = `<label>${l}</label>`;
    const i = Object.assign(document.createElement("input"), { type: "number", value: e[f] || 0 });
    i.oninput = () => { e[f] = +i.value || 0; change(); };
    d.append(i);
    gv.append(d);
  });
  const del = Object.assign(document.createElement("button"), { className: "btn danger", textContent: `Delete ${MN[NM - 1]} ${NY}` });
  del.style.marginTop = "8px";
  del.onclick = () => { if (confirm(`Delete the entry for ${MN[NM - 1]} ${NY}?`)) {
    delete S.log[k];
    renderEditor();
    change(true);
  } };
  gv.append(del);
  g.append(gv);
}
function rowsEd(p, e, key) {
  const box = document.createElement("div");
  p.append(box);
  const draw = () => {
    box.innerHTML = "";
    e[key].forEach((it, i) => {
      const r = document.createElement("div");
      r.className = "row";
      const nm = Object.assign(document.createElement("input"), { value: it.n, placeholder: "Name" });
      nm.setAttribute("aria-label", "Name");
      const v = Object.assign(document.createElement("input"), { type: "number", value: it.a });
      v.setAttribute("aria-label", "Amount");
      const x = Object.assign(document.createElement("button"), { textContent: "×" });
      x.setAttribute("aria-label", "Remove " + (it.n || "row"));
      nm.oninput = () => { it.n = nm.value; change(); };
      v.oninput = () => { it.a = +v.value || 0; tot(); change(); };
      x.onclick = () => { e[key].splice(i, 1); draw(); change(); };
      r.append(nm, v, x);
      box.append(r);
    });
    const add = Object.assign(document.createElement("button"), { className: "add", textContent: "Add row" });
    add.onclick = () => { e[key].push({ n: "", a: 0 }); draw(); box.querySelectorAll(".row input")[e[key].length * 2 - 2].focus(); change(); };
    const t = document.createElement("div");
    t.className = "total";
    const tot = () => t.innerHTML = `<span>Total</span><span>${fmt(sum(e[key]))}</span>`;
    tot();
    box.append(add, t);
  };
  draw();
}
function renderZakat() {
  invSync();
  const z = zakatNow(), ya = agg(logged().filter(k => k.startsWith(String(NY))));
  $("zkT").textContent = `Zakat ${NY}`;
  $("zW").textContent = fmt(z.w);
  $("zN").textContent = fmt(z.nis);
  $("zD").textContent = !z.gp ? "Enter gold price" : z.due ? fmt(z.due) : "Below nisab";
  $("zP").textContent = fmt(ya.zp);
  $("zR").textContent = fmt(Math.max(0, z.due - ya.zp));
  $("zS").textContent = fmt(ya.sad);
  const ms = MN.map((_, i) => S.log[ck(NY, i + 1)]);
  C.give.set({ labels: MN, stacked: true, series: [{ label: "Zakat", kind: "bar", color: cv("--gold"), data: ms.map(e => e ? +e.zakatPaid || 0 : 0) }, { label: "Sadaqah", kind: "bar", color: cv("--green"), data: ms.map(e => e ? +e.sadaqah || 0 : 0) }] });
}
function renderPlan(b, pj) {
  $("pBase").textContent = b.n ? `Based on your average of the last ${b.n} logged month${b.n > 1 ? "s" : ""}: ${fmt(b.act + b.pas)} income, ${fmt(b.exp + b.sad)} spending.` : "Log a month to start the projection.";
  const R = pj.rows, last = R.at(-1), yr = now.getFullYear();
  count("pNW", last.nw);
  count("pPI", last.pi);
  $("pFY").textContent = pj.free ? `${yr + pj.free} (year ${pj.free})` : "Not yet";
  const yl = R.map(r => yr + r.y);
  C.nw.set({ labels: yl, stacked: true, series: [["Cash & emergency", "cash", "--sky"], ["Stocks", "st", "--green"], ["Gold", "gd", "--gold"], ["House fund", "hs", "--plum"], ["Property & business", "ast", "--sand"]].map(([l, k, v]) => ({ label: l, kind: "area", color: cv(v), data: R.map(r => r[k]) })) });
  C.fr.set({ labels: yl, series: [{ label: "Passive income / month", kind: "line", width: 3, color: cv("--green"), data: R.map(r => r.pi) }, { label: "Expenses / month", kind: "line", dash: "6 4", color: cv("--rose"), data: R.map(r => r.exp) }] });
  document.querySelectorAll("#yrBtns button").forEach(x => x.classList.toggle("on", +x.dataset.y === +S.proj.years));
  const a = S.alloc, tot = AL.reduce((s, [k]) => s + (+a[k] || 0), 0), z = zakatNow(), ya = agg(logged().filter(k => k.startsWith(String(yr))));
  const svv = Math.max(0, b.sv), emT = a.emMonths * b.exp, emGap = Math.max(0, emT - (+S.assets.emergency || 0)), mo = svv && emGap ? Math.ceil(emGap / svv) : 0;
  $("alT").textContent = tot + "%";
  $("alT").className = tot === 100 ? "pos" : "neg";
  AL.forEach(([k]) => { const o = $("v-" + k); if (o)
    o.textContent = `${a[k]}% · ${fmt(svv * a[k] / (tot || 1))}`; });
  $("steps").innerHTML = "";
  [["Pay zakat", z.due ? `${fmt(Math.max(0, z.due - ya.zp))} still due this year.` : "Wealth is below nisab right now.", fmt(z.due)],
    ["Fill the emergency fund", emGap ? `${fmt(emGap)} missing. About ${mo || "∞"} months if all savings go here first.` : `Done. ${a.emMonths} months of expenses covered.`, fmt(emT)],
    ["Invest the rest every month", svv ? `${fmt(svv)} per month on average, split as on the right.` : "Spending is above income. Cut expenses first.", fmt(svv)],
    ["Grow passive income", "Each dividend or rent you add moves the freedom ring.", fmt(b.pas)]]
    .forEach(([t, p, v], i) => {
    const d = document.createElement("div");
    d.className = "step";
    d.innerHTML = `<i>${i + 1}</i><div><b></b><p></p></div><b></b>`;
    d.querySelector("div b").textContent = t;
    d.querySelector("p").textContent = p;
    d.lastChild.textContent = v;
    $("steps").append(d);
  });
  C.al.set({ labels: AL.map(x => x[1]), values: AL.map(([k]) => svv * a[k] / (tot || 1)), colors: AL.map(x => cv(x[2])) });
}
/* ---------- grow assets coach ---------- */
const LESSONS = [["Assets vs liabilities", "An asset puts money into your pocket every month. A liability takes money out. A big car or house you live in is usually a liability."],
  ["Pay yourself first", "Move savings out on salary day, before spending. Spend what is left, not save what is left."],
  ["Income → assets → income", "Use salary to buy assets. Let the assets pay your expenses. That loop is the way out of the rat race."],
  ["Your skill is an asset factory", "Skills turn into products, services and businesses that earn without trading every hour for money."],
  ["Avoid riba, use barakah", "Halal growth: owning real businesses (screened stocks), gold, property, trade. Avoid interest debt and interest savings."],
  ["Watch the lifestyle creep", "When income rises, raise savings first. A higher salary with higher spending changes nothing."],
  ["Giving grows wealth", "Zakat and sadaqah are part of the plan, not what is left over. Track them like any other goal."],
  ["Time beats timing", "Invest every month, whatever the market does. Years of compounding matter more than the perfect day."]];
function renderGrow(b, pj) {
  const ks = logged().slice(-6), a = agg(ks), n = ks.length || 1, rate = a.tin ? a.sv / a.tin : 0, cov = b.exp + b.sad ? b.pas / (b.exp + b.sad) : 0;
  const emM = b.exp ? (+S.assets.emergency || 0) / b.exp : 0, inv = (+S.assets.stocks || 0) + (+S.assets.gold || 0), nw = zakatNow().w, invShare = nw ? inv / nw : 0;
  const cats = Object.entries(a.cat).sort((x, y) => y[1] - x[1]), top = cats[0];
  // score
  const sc = [["Savings rate", rate, .3, Math.round(rate * 100) + "%", "Aim 30%+"], ["Emergency fund", emM / (+S.alloc.emMonths || 6), 1, emM.toFixed(1) + " mo", "Aim " + S.alloc.emMonths + " months"],
    ["Money invested", invShare, .6, Math.round(invShare * 100) + "%", "Of your wealth"], ["Freedom", cov, 1, Math.round(cov * 100) + "%", "Passive vs spending"]];
  $("gScore").innerHTML = "";
  sc.forEach(([l, v, goal, txt, h]) => {
    const p = Math.max(0, Math.min(1, v / goal)), c = p >= 1 ? "--green" : p >= .5 ? "--gold" : "--rose";
    const d = document.createElement("div");
    d.className = "stat";
    d.innerHTML = `<span>${l}</span><b>${txt}</b><div class="meter"><i style="width:0;background:var(${c})"></i></div><span style="font-size:.78rem">${h}</span>`;
    $("gScore").append(d);
    requestAnimationFrame(() => requestAnimationFrame(() => d.querySelector(".meter i").style.width = p * 100 + "%"));
  });
  // tips
  const T = [];
  if (!ks.length)
    T.push(["📝", "Log your first month", "Everything here learns from your real numbers."]);
  if (rate < 0)
    T.push(["🚨", "You spend more than you earn", `Cut ${fmt(-a.sv / n)} a month to break even. Start with ${top ? top[0] : "your biggest expense"}.`]);
  else if (rate < .2)
    T.push(["📈", "Push savings rate to 20%", `Saving ${fmt(Math.max(0, .2 * a.tin / n - a.sv / n))} more a month gets you there.`]);
  else
    T.push(["✅", `Strong: ${Math.round(rate * 100)}% savings rate`, "Keep it. Raise it again whenever your income goes up."]);
  if (emM < (+S.alloc.emMonths || 6))
    T.push(["🛟", "Finish the emergency fund", `${fmt(Math.max(0, S.alloc.emMonths * b.exp - (+S.assets.emergency || 0)))} to go. Keep it in a separate, non-interest account.`]);
  if (top && a.exp && top[1] / a.exp > .35)
    T.push(["🔍", `${top[0]} is ${Math.round(top[1] / a.exp * 100)}% of spending`, "Your biggest lever. A 10% cut here beats cutting small things."]);
  if (invShare < .4 && emM >= (+S.alloc.emMonths || 6))
    T.push(["🏦", "Cash is sitting idle", `Only ${Math.round(invShare * 100)}% of your wealth works for you. Move savings beyond the emergency fund into halal ETFs or gold monthly.`]);
  if (a.ext / n < a.inc / n * .2)
    T.push(["🛠", "Grow extra income", `Extra income is ${fmt(a.ext / n)} a month. Turn one skill into a repeatable product or service.`]);
  if (cov < .1)
    T.push(["🌱", "Start a passive stream", `Every ${fmt(300)} of dividends or rent a month is roughly ${fmt(300 * 12 / .04)} of assets. Start small, reinvest.`]);
  $("gTips").innerHTML = "";
  T.slice(0, 5).forEach(([i, t, p]) => {
    const d = document.createElement("div");
    d.className = "tip-card";
    d.innerHTML = `<div class="ic">${i}</div><div><b></b><p></p></div>`;
    d.querySelector("b").textContent = t;
    d.querySelector("p").textContent = p;
    $("gTips").append(d);
  });
  // ladder (rendered bottom-up)
  const L = [["🛟", "Emergency fund", `${S.alloc.emMonths} months of expenses`, emM >= (+S.alloc.emMonths || 6)],
    ["📊", "Monthly investing", "Halal ETFs every month", (+S.assets.stocks || 0) >= b.exp * 6],
    ["🥇", "Gold reserve", "5–15% of wealth", nw && (+S.assets.gold || 0) / nw >= .05],
    ["🛠", "Skill income", "Extra income ≥ 20% of salary", a.ext >= a.inc * .2 && a.inc > 0],
    ["🌱", "Passive income", "Covers 25% of spending", cov >= .25],
    ["🏠", "Income property / business", "Assets that pay you monthly", cov >= .6],
    ["🕊", "Financial freedom", "Passive ≥ spending", cov >= 1]];
  const cur = L.findIndex(x => !x[3]);
  $("gLad").innerHTML = "";
  L.forEach(([i, t, s2, done], k) => {
    const d = document.createElement("div");
    d.className = "rung" + (done ? " done" : k === cur ? " now" : "");
    d.innerHTML = `<span>${i}</span><div><b></b><small></small></div><em>${done ? "Done" : k === cur ? "You are here" : ""}</em>`;
    d.querySelector("b").textContent = `${k + 1}. ${t}`;
    d.querySelector("small").textContent = s2;
    $("gLad").append(d);
  });
  // ideas
  const I = [["📊", "Dividend ETFs (Shariah-screened)", "Own pieces of real companies. Reinvest dividends until you need them."],
    ["🥇", "Physical gold", "Protects against inflation and keeps zakat simple to calculate."],
    ["💻", "Digital products", "Apps, templates, courses. Build once, sell many times."],
    ["🤖", "A service that runs without you", "Package what you do into a system with a team or automation, so it earns while you rest."],
    ["🏠", "Property or halal REITs", "Rent is classic passive income. Start with REITs if a full property is far off."],
    ["🤝", "Partnership investing (musharakah)", "Invest in a trusted small business for a profit share, not interest."]];
  $("gIdeas").innerHTML = "";
  I.forEach(([i, t, p]) => {
    const d = document.createElement("div");
    d.className = "tip-card";
    d.innerHTML = `<div class="ic">${i}</div><div><b></b><p></p></div>`;
    d.querySelector("b").textContent = t;
    d.querySelector("p").textContent = p;
    $("gIdeas").append(d);
  });
  if (!$("gLes").children.length)
    LESSONS.forEach(([t, p]) => { const d = document.createElement("div"); d.className = "lesson"; d.innerHTML = "<b></b><p></p>"; d.querySelector("b").textContent = t; d.querySelector("p").textContent = p; $("gLes").append(d); });
  whatIf(b, pj);
}
function whatIf(b, pj) {
  const cut = +$("wCut").value, ext = +$("wExt").value, pas = +$("wPas").value, yr = now.getFullYear();
  $("wCutV").textContent = fmt(cut);
  $("wExtV").textContent = fmt(ext);
  $("wPasV").textContent = fmt(pas);
  const Y = S.proj.years;
  S.proj.years = 60;
  const f1 = project(b).free, p2 = project({ ...b, exp: Math.max(0, b.exp - cut), act: b.act + ext, pas: b.pas + pas });
  S.proj.years = Y;
  const n2 = project({ ...b, exp: Math.max(0, b.exp - cut), act: b.act + ext, pas: b.pas + pas });
  $("wNow").textContent = f1 ? yr + f1 : "60+ yrs";
  $("wNew").textContent = p2.free ? yr + p2.free + (f1 && p2.free < f1 ? ` (${f1 - p2.free} yrs sooner)` : "") : "60+ yrs";
  const d = n2.rows.at(-1).nw - pj.rows.at(-1).nw;
  $("wNW").textContent = d > 0 ? `Net worth after ${S.proj.years} years: ${fmt(d)} more.` : "Move a slider to see the difference.";
}
["wCut", "wExt", "wPas"].forEach(id => $(id).oninput = () => { const b = base(); whatIf(b, project(b)); });
/* ---------- Rich Dad view ---------- */
function renderRD(b) {
  const bs = S.bs, ks = logged().slice(-6), a = agg(ks), n = ks.length || 1, tin = a.tin / n, out = (a.exp + a.give) / n;
  const PT = portTot(), assetV = (+S.assets.stocks || 0) + (+S.assets.gold || 0) + PT.val;
  const liabV = bs.liab.reduce((s, x) => s + (+x.v || 0), 0) + PT.lo, lp = bs.liab.reduce((s, x) => s + (+x.p || 0), 0) + PT.lp, pas = a.pas / n, cash = (+S.assets.cash || 0) + (+S.assets.emergency || 0);
  const nw = assetV + cash - liabV, rate = tin ? (tin - out) / tin : 0;
  let P;
  if (pas >= out * .25 || (rate >= .2 && assetV > cash && lp < tin * .1))
    P = ["Builder pattern", "Your money buys assets", "Income flows into assets, and assets send income back. Keep feeding the loop and let it grow faster than your spending.", ["fIA", "fAI", "fJ", "fIE"], "bxA"];
  else if (lp >= tin * .15)
    P = ["Comfort pattern", "Your income is buying liabilities", `${fmt(lp)} a month (${Math.round(lp / tin * 100)}% of income) goes to debt. Pay off the most expensive debt first, then send that money to assets.`, ["fJ", "fIL", "fLE", "fIE"], "bxL"];
  else if (rate < .05)
    P = ["Survival pattern", "Income goes straight to expenses", "Very little is left to buy assets right now. That can change. Pay yourself first: move a fixed amount out on salary day, even a small one.", ["fJ", "fIE"], "bxE"];
  else
    P = ["On the way", "You save. Now make savings work.", `You keep ${Math.round(rate * 100)}% of income, but most wealth is cash. Turn savings into assets every month so they start paying you.`, ["fJ", "fIE", "fIA"], "bxA"];
  bsRows("assets", $("rdA"));
  $("rdPat").textContent = P[0];
  $("rdT").textContent = P[1];
  $("rdP").textContent = P[2];
  ["fJ", "fIE", "fIA", "fAI", "fIL", "fLE"].forEach(id => { const on = P[3].includes(id); $(id).classList.toggle("on", on); on ? $(id).setAttribute("marker-end", "url(#ah)") : $(id).removeAttribute("marker-end"); });
  ["bxI", "bxE", "bxA", "bxL"].forEach(id => $(id).classList.toggle("hl", id === P[4]));
  $("dI").textContent = fmt(tin) + " / mo";
  $("dI2").textContent = `${fmt(pas)} from assets` + (PT.net > 0 && Math.abs(PT.net - pas) > 1 ? ` (expected ${fmt(PT.net)})` : "");
  $("dE").textContent = fmt(out) + " / mo";
  $("dA").textContent = fmt(assetV);
  $("dL").textContent = fmt(liabV);
  $("rdNW").textContent = fmt(nw);
  $("rdAI").textContent = fmt(pas);
  $("rdLP").textContent = fmt(lp);
  const cf = tin - out;
  $("rdCF").textContent = fmt(cf);
  $("rdCF").className = cf >= 0 ? "pos" : "neg";
}
function bsRows(key, box, fields) {
  if (key === "assets") {
    box.innerHTML = "";
    const rows = [["📊", "Stocks / ETFs", +S.assets.stocks || 0, null], ["🥇", "Gold", +S.assets.gold || 0, null], ...(S.port || []).map(x => { const p = pa(x); return [p.t.ic, x.n || p.t.n, p.val, p]; })];
    rows.forEach(([i, n, v, p]) => { const r = document.createElement("div"); r.className = "rda"; r.innerHTML = `<span>${i}</span><b></b><span>${fmt(v)}</span>${p ? `<span class="vchip ${p.vd[0]}">${p.vd[1]}</span>` : "<span></span>"}`; r.querySelector("b").textContent = n; box.append(r); });
    const m = Object.assign(document.createElement("button"), { className: "add", textContent: "Manage my assets →" });
    m.onclick = () => showTab("as");
    box.append(m);
    return;
  }
  const draw = () => {
    box.innerHTML = "";
    if (key === "assets")
      [["Stocks / ETFs", S.assets.stocks], ["Gold", S.assets.gold]].forEach(([l, v]) => {
        const r = document.createElement("div");
        r.className = "row3 ro";
        r.innerHTML = `<input disabled><input disabled><span></span><span></span>`;
        r.children[0].value = l;
        r.children[1].value = Math.round(+v || 0);
        box.append(r);
      });
    S.bs[key].forEach((it, i) => {
      const r = document.createElement("div");
      r.className = "row3";
      const nm = Object.assign(document.createElement("input"), { value: it.n, placeholder: "Name" });
      nm.setAttribute("aria-label", "Name");
      nm.oninput = () => { it.n = nm.value; change(); };
      r.append(nm);
      fields.forEach(([f, l]) => { const v = Object.assign(document.createElement("input"), { type: "number", value: it[f] || 0 }); v.setAttribute("aria-label", l); v.oninput = () => { it[f] = +v.value || 0; change(); }; r.append(v); });
      if (fields.length < 2)
        r.append(document.createElement("span"));
      const x = Object.assign(document.createElement("button"), { textContent: "×" });
      x.setAttribute("aria-label", "Remove");
      x.onclick = () => { S.bs[key].splice(i, 1); draw(); change(); };
      r.append(x);
      box.append(r);
    });
    const add = Object.assign(document.createElement("button"), { className: "add", textContent: key === "assets" ? "Add asset" : "Add liability" });
    add.onclick = () => { S.bs[key].push(key === "assets" ? { n: "", v: 0 } : { n: "", v: 0, p: 0 }); draw(); change(); };
    box.append(add);
  };
  draw();
}
/* ---------- goals ---------- */
const ICONS = ["🎯", "🏠", "🕋", "✈️", "🚗", "🛟", "💍", "🎓", "💼", "📱", "🥇"];
let GREF = [];
function goalsUI() {
  const box = $("gl");
  box.innerHTML = "";
  GREF = [];
  S.goals.forEach((g, i) => {
    const c = document.createElement("div");
    c.className = "goal";
    c.innerHTML = `<div class="top"><select aria-label="Icon">${ICONS.map(x => `<option${x === g.ic ? " selected" : ""}>${x}</option>`).join("")}</select><input aria-label="Goal name" placeholder="Goal name"><button class="gx" aria-label="Delete goal">×</button></div>
  <div class="f3"><div><label>Target</label><input type="number" data-f="t"></div><div><label>Saved so far</label><input type="number" data-f="s"></div><div><label>Deadline</label><input type="month" data-f="d"></div></div>
  <div class="gbar"><i style="width:0"></i></div><div class="gst"><span class="a"></span><span class="b"></span></div>`;
    const [sel, nm, x] = c.querySelector(".top").children;
    nm.value = g.n;
    sel.onchange = () => { g.ic = sel.value; change(); };
    nm.oninput = () => { g.n = nm.value; change(); };
    x.onclick = () => { if (confirm(`Delete goal "${g.n || "untitled"}"?`)) {
      S.goals.splice(i, 1);
      goalsUI();
      change();
    } };
    c.querySelectorAll("[data-f]").forEach(inp => { const f = inp.dataset.f; inp.value = g[f] ?? ""; inp.oninput = () => { g[f] = f === "d" ? inp.value : +inp.value || 0; change(); }; });
    GREF.push({ bar: c.querySelector(".gbar i"), a: c.querySelector(".a"), b: c.querySelector(".b") });
    box.append(c);
  });
  if (!S.goals.length)
    box.innerHTML = '<div class="panel">No goals yet. Add one: a house, Umrah, a car, travel.</div>';
}
function updGoals(b) {
  let need = 0;
  S.goals.forEach((g, i) => {
    const r = GREF[i];
    if (!r)
      return;
    const t = +g.t || 0, sv = +g.s || 0, left = Math.max(0, t - sv), pct = t ? Math.min(1, sv / t) : 0;
    const [y, m] = (g.d || "").split("-").map(Number), ml = y ? (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1)) : null;
    requestAnimationFrame(() => r.bar.style.width = pct * 100 + "%");
    r.a.textContent = `${fmt(sv)} of ${fmt(t)} · ${Math.round(pct * 100)}%`;
    let h;
    if (!left)
      h = '<span class="badge done">Reached 🎉</span>';
    else if (ml === null)
      h = "Set a deadline";
    else if (ml <= 0)
      h = '<span class="badge warn">Past deadline</span>';
    else {
      const pm = left / ml;
      need += pm;
      h = `Save <b>${fmt(pm)}</b>/mo · ${ml} mo left`;
    }
    r.b.innerHTML = h;
  });
  const sv = Math.max(0, b.sv);
  $("glSum").innerHTML = S.goals.length ? `Your goals need <b>${fmt(need)}</b> a month. You save <b>${fmt(sv)}</b> a month on average. ` + (need <= sv ? '<span class="badge ok">On track</span> The rest can go to investing.' : `<span class="badge warn">${fmt(need - sv)} short</span> Push a deadline back or raise savings.`) : "Add your first goal below.";
}
$("glAdd").onclick = () => { S.goals.push({ id: uid(), n: "", ic: "🎯", t: 1000, s: 0, d: `${now.getFullYear() + 1}-${String(now.getMonth() + 1).padStart(2, "0")}` }); goalsUI(); change(true); $("gl").lastChild.querySelector(".top input").focus(); };
/* ---------- net worth history ---------- */
function netWorth() { const A = S.assets, bs = S.bs || { liab: [] }, T = portTot(); return (+A.cash || 0) + (+A.emergency || 0) + (+A.stocks || 0) + (+A.gold || 0) + T.val - T.lo - bs.liab.reduce((s, x) => s + (+x.v || 0), 0); }
function renderNWH() {
  S.nwHist = S.nwHist || {};
  S.nwHist[ck(now.getFullYear(), now.getMonth() + 1)] = Math.round(netWorth());
  const k = Object.keys(S.nwHist).sort(), v = k.map(x => S.nwHist[x]);
  C.nwh.set({ labels: k.map(x => `${MN[+x.slice(5) - 1]} ${x.slice(2, 4)}`), series: [{ label: "Net worth", kind: "line", width: 3, color: cv("--gold"), data: v }] });
  const d = v.length > 1 ? v.at(-1) - v.at(-2) : null;
  $("nwhS").textContent = d === null ? "A snapshot is saved every month you open the app. Check back next month to see growth." : `${d >= 0 ? "Up" : "Down"} ${fmt(Math.abs(d))} since last month. Update asset values in the Zakat tab each month.`;
}
/* ---------- profiles: every person's data is kept apart ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
/* ---------- PIN lock & encryption at rest ----------
 * Profile data is encrypted in localStorage with AES-256-GCM. The key comes from the PIN
 * (PBKDF2-SHA-256, 310 000 iterations, random salt) and only exists in memory while unlocked.
 * Decrypted values are kept in MEM so the rest of the app can stay synchronous;
 * writes are encrypted in the background through a small queue.
 */
const LOCK_K = "cashflow:lock", FAIL_K = "cashflow:lockfail", PIN_MIN = 4, PIN_MAX = 5, KDF_ITER = 310000;
const ENC_KEY = /^cashflow:data:[^:]+$|^cashflow$/;
const MEM = {}, PEND = {};
let KEY = null, wq = Promise.resolve();
const te = new TextEncoder(), td = new TextDecoder();
const b64 = u => btoa(String.fromCharCode(...u));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hasCrypto = () => !!(window.crypto && crypto.subtle && window.isSecureContext);
async function deriveKey(pin, salt, iter) {
  const base = await crypto.subtle.importKey("raw", te.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function encStr(str, key = KEY) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(str)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  let s = "";
  for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return "enc1:" + btoa(s);
}
async function decStr(v, key = KEY) {
  const u = unb64(v.slice(5));
  return td.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, key, u.slice(12)));
}
function queueWrite(k) {
  wq = wq.then(async () => {
    if (!(k in PEND)) return;
    const v = PEND[k];
    delete PEND[k];
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, KEY ? await encStr(v) : v);
    } catch (e) { console.error("Cash Flow: could not save", e); }
  });
  return wq;
}
const flushWrites = () => wq;
const LS = {
  get: k => { if (KEY && ENC_KEY.test(k)) return k in MEM ? MEM[k] : null; try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { if (KEY && ENC_KEY.test(k)) { MEM[k] = v; PEND[k] = v; queueWrite(k); return true; } try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del: k => { if (KEY && ENC_KEY.test(k)) { delete MEM[k]; PEND[k] = null; queueWrite(k); return; } try { localStorage.removeItem(k); } catch { } }
};
/* fallback when Web Crypto is unavailable (file:// pages): a lock screen without encryption */
function weakHash(pin, salt) { let h = 2166136261; for (let r = 0; r < 5000; r++) for (const c of salt + pin + r) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h.toString(36); }
const lockCfg = () => { try { return JSON.parse(localStorage.getItem(LOCK_K) || "null"); } catch { return null; } };
const fails = () => { try { return JSON.parse(localStorage.getItem(FAIL_K) || "null") || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; } };
let LK = { mode: "unlock", pin: "", first: "", busy: false, onDone: null };
function lockUI() {
  const t = { set: ["Set your PIN", `Choose ${PIN_MIN}–${PIN_MAX} digits. Your data on this device is encrypted with it.`],
    confirm: ["Confirm your PIN", "Enter the same PIN again."],
    unlock: ["Enter your PIN", "Your data is locked on this device."],
    old: ["Current PIN", "Enter your current PIN to change it."] }[LK.mode];
  $("lkT").textContent = t[0];
  $("lkP").textContent = t[1];
  const len = LK.mode === "unlock" || LK.mode === "old" ? (lockCfg()?.len || PIN_MAX) : PIN_MAX;
  $("lkD").innerHTML = Array.from({ length: len }, (_, i) => `<i class="${i < LK.pin.length ? "on" : ""}"></i>`).join("");
  const showOk = LK.mode === "set" || LK.mode === "confirm";
  $("lkOk").hidden = !showOk;
  $("lkOk").disabled = LK.pin.length < PIN_MIN || LK.busy;
  $("lkForgot").hidden = LK.mode !== "unlock";
  $("lkCancel").hidden = LK.mode !== "old" && !(LK.change && (LK.mode === "set" || LK.mode === "confirm"));
  $("lkNote").hidden = LK.mode !== "set" || LK.change;
  $("lkWeak").hidden = hasCrypto();
}
function lockErr(msg) { const e = $("lkE"); e.textContent = msg; $("lkD").classList.remove("shake"); void $("lkD").offsetWidth; if (msg) $("lkD").classList.add("shake"); }
function lockKey(d) {
  if (LK.busy) return;
  const f = fails();
  if (LK.mode === "unlock" && f.until > Date.now()) return lockErr(`Too many tries. Wait ${Math.ceil((f.until - Date.now()) / 1000)} s.`);
  if (d === "back") LK.pin = LK.pin.slice(0, -1);
  else if (d === "ok") return lockSubmit();
  else if (/^\d$/.test(d) && LK.pin.length < PIN_MAX) LK.pin += d;
  lockErr("");
  lockUI();
  const need = LK.mode === "unlock" || LK.mode === "old" ? (lockCfg()?.len || PIN_MAX) : PIN_MAX;
  if (LK.pin.length === need) lockSubmit();
}
async function lockSubmit() {
  if (LK.busy || LK.pin.length < PIN_MIN) return;
  const pin = LK.pin;
  if (LK.mode === "set") { LK.first = pin; LK.pin = ""; LK.mode = "confirm"; return lockUI(); }
  if (LK.mode === "confirm") {
    if (pin !== LK.first) { LK.pin = ""; LK.first = ""; LK.mode = "set"; lockUI(); return lockErr("PINs didn't match. Try again."); }
    LK.busy = true; lockUI(); $("lkP").textContent = "Encrypting your data…";
    try { await setPin(pin); } catch (e) { LK.busy = false; LK.pin = ""; lockUI(); return lockErr("Couldn't set the PIN on this browser."); }
    LK.busy = false; LK.pin = ""; return lockDone(LK.change ? "✓ PIN changed" : "🔒 PIN set. Your data is encrypted");
  }
  LK.busy = true; lockUI(); $("lkP").textContent = "Checking…";
  const ok = await checkPin(pin);
  LK.busy = false; LK.pin = "";
  if (!ok) {
    const f = fails(); f.n++;
    if (f.n >= 5) f.until = Date.now() + Math.min(15 * 60, 30 * 2 ** (f.n - 5)) * 1000;
    localStorage.setItem(FAIL_K, JSON.stringify(f));
    lockUI();
    return lockErr(f.n >= 5 ? `Wrong PIN. Wait ${Math.round((f.until - Date.now()) / 1000)} s before trying again.` : `Wrong PIN. ${5 - f.n} ${5 - f.n === 1 ? "try" : "tries"} left before a short wait.`);
  }
  localStorage.removeItem(FAIL_K);
  if (LK.mode === "old") { LK.mode = "set"; LK.change = true; return lockUI(); }
  lockDone();
}
async function checkPin(pin) {
  const c = lockCfg();
  if (!c) return false;
  if (c.weak) return weakHash(pin, c.salt) === c.h;
  try {
    const key = await deriveKey(pin, unb64(c.salt), c.iter);
    if (await decStr(c.check, key) !== "cashflow-ok") return false;
    if (!KEY) {
      KEY = key;
      for (const k of Object.keys(localStorage)) {
        if (!ENC_KEY.test(k)) continue;
        const v = localStorage.getItem(k);
        if (v == null) continue;
        if (v.startsWith("enc1:")) { try { MEM[k] = await decStr(v); } catch { localStorage.setItem(k + ":undecryptable-" + Date.now(), v); localStorage.removeItem(k); } }
        else { MEM[k] = v; PEND[k] = v; queueWrite(k); }
      }
      await flushWrites();
    }
    return true;
  } catch { return false; }
}
async function setPin(pin) {
  const salt = crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(16)) : Uint8Array.from({ length: 16 }, () => Math.random() * 256);
  if (!hasCrypto()) { localStorage.setItem(LOCK_K, JSON.stringify({ v: 1, weak: true, salt: b64(salt), h: weakHash(pin, b64(salt)), len: pin.length })); return; }
  const key = await deriveKey(pin, salt, KDF_ITER);
  const plain = {};
  for (const k of Object.keys(localStorage)) {
    if (!ENC_KEY.test(k)) continue;
    if (KEY && k in MEM) plain[k] = MEM[k];
    else { const v = localStorage.getItem(k); if (v != null && !v.startsWith("enc1:")) plain[k] = v; }
  }
  Object.assign(plain, KEY ? MEM : {});
  await flushWrites();
  KEY = key;
  for (const k in plain) { MEM[k] = plain[k]; PEND[k] = plain[k]; queueWrite(k); }
  localStorage.setItem(LOCK_K, JSON.stringify({ v: 1, salt: b64(salt), iter: KDF_ITER, len: pin.length, check: await encStr("cashflow-ok", key) }));
  await flushWrites();
}
function lockDone(msg) {
  document.body.classList.remove("locked");
  $("lock").hidden = true;
  const cb = LK.onDone; LK.onDone = null; LK.change = false;
  if (cb) cb();
  if (msg) setTimeout(() => toast(msg), 300);
}
function showLock(mode, onDone) {
  LK = { mode, pin: "", first: "", busy: false, onDone, change: mode === "old" };
  document.body.classList.add("locked");
  $("lock").hidden = false;
  lockErr("");
  lockUI();
  setTimeout(() => $("lkPad").querySelector("button")?.focus({ preventScroll: true }), 50);
}
$("lkPad").onclick = e => { const b = e.target.closest("button"); if (b) lockKey(b.dataset.k); };
$("lkOk").onclick = () => lockKey("ok");
document.addEventListener("keydown", e => {
  if ($("lock").hidden) return;
  if (/^\d$/.test(e.key)) { e.preventDefault(); lockKey(e.key); }
  else if (e.key === "Backspace") { e.preventDefault(); lockKey("back"); }
  else if (e.key === "Enter") { e.preventDefault(); lockKey("ok"); }
});
$("lkCancel").onclick = () => { LK.onDone = null; lockDone(); };
$("lkForgot").onclick = () => {
  if (prompt("Without the PIN your data on this device can't be decrypted.\n\nType ERASE to delete all Cash Flow data on this device and start over. You can restore afterwards from a backup file or Google Drive sync.") !== "ERASE") return;
  Object.keys(localStorage).filter(k => k.startsWith("cashflow")).forEach(k => localStorage.removeItem(k));
  location.reload();
};
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (lockCfg() && hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000 && $("lock").hidden) location.reload();
});

let PROFS = [], PID = null;
const prof = () => PROFS.find(p => p.id === PID) || { id: PID, name: "Me" };
const dataKey = id => "cashflow:data:" + id;
function saveLocalRaw() { S.owner = { id: PID, name: prof().name }; return LS.set(dataKey(PID), JSON.stringify(S)); }
function saveLocal() { stamp(); return saveLocalRaw(); }
function initProfiles() {
  try {
    PROFS = JSON.parse(LS.get("cashflow:profiles") || "[]");
  }
  catch {
    PROFS = [];
  }
  if (!Array.isArray(PROFS))
    PROFS = [];
  PROFS = PROFS.filter(p => p && typeof p === "object" && p.id).map(p => ({ ...p, id: String(p.id), name: String(p.name || "Me").slice(0, 30) }));
  if (!PROFS.length) {
    const id = uid();
    PROFS = [{ id, name: "Me" }];
    const old = LS.get("cashflow");
    if (old) {
      LS.set(dataKey(id), old);
      LS.del("cashflow");
    }
    LS.set("cashflow:profiles", JSON.stringify(PROFS));
  }
  PID = LS.get("cashflow:active");
  if (!PROFS.some(p => p.id === PID))
    PID = PROFS[0].id;
}
function loadProfile(id) {
  PID = id;
  LS.set("cashflow:active", id);
  TOKEN = null;
  SNAP = null;
  LAST = null;
  clearTimeout(syncT);
  const raw = LS.get(dataKey(id));
  let parsed = {};
  if (raw)
    try {
      parsed = JSON.parse(raw);
    }
    catch {
      parsed = {};
      LS.set(dataKey(id) + ":corrupt-" + Date.now(), raw);
    }
  S = migrate(parsed);
  if (!raw)
    saveLocalRaw();
  $("profB").textContent = "👤 " + prof().name + " ▾";
  renderAll();
  stamp();
  $("save").textContent = "🔒 Saved only on this device";
  restoreToken();
  syncNow();
}
function profUI() {
  const L = $("profL");
  L.innerHTML = "";
  PROFS.forEach(p => {
    const r = document.createElement("div");
    r.className = "prow";
    const b = Object.assign(document.createElement("button"), { className: "pn" + (p.id === PID ? " on" : ""), textContent: (p.id === PID ? "✓ " : "") + p.name });
    b.onclick = () => { if (p.id !== PID) {
      clearTimeout(saveT);
      saveLocal();
      loadProfile(p.id);
    } $("profD").close(); };
    const rn = Object.assign(document.createElement("button"), { className: "gx", textContent: "✎" });
    rn.setAttribute("aria-label", "Rename " + p.name);
    rn.onclick = () => { const n = prompt("Profile name", p.name); if (n && n.trim()) {
      p.name = n.trim().slice(0, 30);
      LS.set("cashflow:profiles", JSON.stringify(PROFS));
      if (p.id === PID) {
        $("profB").textContent = "👤 " + p.name + " ▾";
        saveLocal();
      }
      profUI();
    } };
    const dl = Object.assign(document.createElement("button"), { className: "gx", textContent: "×" });
    dl.setAttribute("aria-label", "Delete " + p.name);
    dl.disabled = PROFS.length < 2;
    dl.onclick = async () => {
      if (prompt(`This permanently deletes all data of "${p.name}" on this device. Type the name to confirm:`) !== p.name)
        return;
      LS.del(dataKey(p.id));
      PROFS = PROFS.filter(x => x.id !== p.id);
      LS.set("cashflow:profiles", JSON.stringify(PROFS));
      if (p.id === PID)
        loadProfile(PROFS[0].id);
      profUI();
    };
    r.append(b, rn, dl);
    L.append(r);
  });
}
$("profB").onclick = () => { profUI(); $("profD").showModal(); };
$("profClose").onclick = () => $("profD").close();
$("profAdd").onclick = () => {
  const n = prompt("Name for the new profile");
  if (!n || !n.trim())
    return;
  clearTimeout(saveT);
  saveLocal();
  const id = uid();
  PROFS.push({ id, name: n.trim().slice(0, 30) });
  LS.set("cashflow:profiles", JSON.stringify(PROFS));
  loadProfile(id);
  $("profD").close();
};
const ownerOK = p => !p.owner || p.owner.id === PID || confirm(`This data belongs to the profile "${p.owner.name}", not "${prof().name}".\n\nLoad it into "${prof().name}" anyway? Its current data will be replaced.`);
/* ---------- Google account sync: works on every device, offline first ---------- */
// Forking? Put your own OAuth Client ID here, or paste it in the app's Sync dialog.
const GOOGLE_CLIENT_ID = "";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata", FNAME = "cashflow.json", API = "https://www.googleapis.com";
const CID = () => (GOOGLE_CLIENT_ID || LS.get("cashflow:clientId") || "").trim();
let TOKEN = null, SNAP = null, SYNCING = false, AGAIN = false, LAST = null, SST = "idle", syncT = null;
function setProf(o) { Object.assign(PROFS.find(p => p.id === PID) || {}, o); LS.set("cashflow:profiles", JSON.stringify(PROFS)); }
/* change tracking: every month, goal and section gets its own timestamp */
function sections(st) {
  const o = {};
  ["currency", "assets", "zakat", "proj", "alloc", "bs", "learn"].forEach(k => o[k] = JSON.stringify(st[k]));
  Object.keys(st.log || {}).forEach(m => o["log:" + m] = JSON.stringify(st.log[m]));
  (st.goals || []).forEach(g => o["goal:" + g.id] = JSON.stringify(g));
  (st.port || []).forEach(a => o["port:" + a.id] = JSON.stringify(a));
  (st.inv || []).forEach(a => o["inv:" + a.id] = JSON.stringify(a));
  o.coach = JSON.stringify(st.coach || {});
  return o;
}
function stamp() {
  const cur = sections(S), t = Date.now();
  S.mt = S.mt || {};
  S.del = S.del || {};
  if (SNAP) {
    for (const k in cur)
      if (cur[k] !== SNAP[k]) {
        S.mt[k] = t;
        delete S.del[k];
      }
    for (const k in SNAP)
      if (!(k in cur)) {
        S.del[k] = t;
        delete S.mt[k];
      }
  }
  for (const k in cur)
    if (S.mt[k] == null)
      S.mt[k] = 0;
  SNAP = cur;
}
function secGet(st, k) { if (k.startsWith("log:"))
  return st.log?.[k.slice(4)]; if (k.startsWith("goal:"))
  return (st.goals || []).find(g => g.id === k.slice(5)); if (k.startsWith("port:"))
  return (st.port || []).find(a => a.id === k.slice(5)); if (k.startsWith("inv:"))
  return (st.inv || []).find(a => a.id === k.slice(4)); return st[k]; }
function secSet(st, k, v) {
  v = v === undefined ? v : structuredClone(v);
  if (k.startsWith("log:")) {
    st.log = st.log || {};
    v === undefined ? delete st.log[k.slice(4)] : st.log[k.slice(4)] = v;
    return;
  }
  if (k.startsWith("goal:")) {
    st.goals = st.goals || [];
    const i = st.goals.findIndex(g => g.id === k.slice(5));
    if (v === undefined) {
      if (i >= 0)
        st.goals.splice(i, 1);
    }
    else
      i >= 0 ? st.goals[i] = v : st.goals.push(v);
    return;
  }
  if (k.startsWith("inv:")) {
    st.inv = st.inv || [];
    const i = st.inv.findIndex(a => a.id === k.slice(4));
    if (v === undefined) {
      if (i >= 0)
        st.inv.splice(i, 1);
    }
    else
      i >= 0 ? st.inv[i] = v : st.inv.push(v);
    return;
  }
  if (k.startsWith("port:")) {
    st.port = st.port || [];
    const i = st.port.findIndex(a => a.id === k.slice(5));
    if (v === undefined) {
      if (i >= 0)
        st.port.splice(i, 1);
    }
    else
      i >= 0 ? st.port[i] = v : st.port.push(v);
    return;
  }
  if (v !== undefined)
    st[k] = v;
}
function merge(L, R) {
  const M = structuredClone(L);
  M.mt = { ...(L.mt || {}) };
  M.del = { ...(L.del || {}) };
  const keys = new Set([...Object.keys(L.mt || {}), ...Object.keys(R.mt || {}), ...Object.keys(L.del || {}), ...Object.keys(R.del || {}), ...Object.keys(sections(R))]);
  keys.forEach(k => {
    const tl = L.mt?.[k] ?? (secGet(L, k) !== undefined ? 0 : -1), tr = R.mt?.[k] ?? (secGet(R, k) !== undefined ? 0 : -1), d = Math.max(L.del?.[k] ?? -1, R.del?.[k] ?? -1), t = Math.max(tl, tr);
    if (d > t) {
      secSet(M, k, undefined);
      M.del[k] = d;
      delete M.mt[k];
    }
    else if (tr > tl) {
      secSet(M, k, secGet(R, k));
      M.mt[k] = tr;
      delete M.del[k];
    }
    else if (tl >= 0) {
      M.mt[k] = tl;
      delete M.del[k];
    }
  });
  M.nwHist = { ...(R.nwHist || {}), ...(L.nwHist || {}) };
  return M;
}
const body = st => JSON.stringify(st, (k, v) => k === "owner" || k === "savedAt" ? undefined : v);
/* Google sign-in + Drive app folder */
function loadGIS() { return new Promise((res, rej) => { if (window.google?.accounts?.oauth2)
  return res(); const sc = document.createElement("script"); sc.src = "https://accounts.google.com/gsi/client"; sc.onload = res; sc.onerror = () => rej(new Error("Couldn't reach Google. Check your connection.")); document.head.append(sc); }); }
function getToken() {
  return new Promise(async (res, rej) => {
    try {
      await loadGIS();
    }
    catch (e) {
      return rej(e);
    }
    const me = PID, tc = google.accounts.oauth2.initTokenClient({ client_id: CID(), scope: SCOPE,
      callback: r => {
        if (r.error)
          return rej(new Error(r.error_description || r.error));
        if (me !== PID)
          return rej(new Error("Profile changed"));
        TOKEN = { t: r.access_token, exp: Date.now() + ((+r.expires_in || 3600) - 60) * 1000 };
        try {
          sessionStorage.setItem("cashflow:tok:" + PID, JSON.stringify(TOKEN));
        }
        catch { }
        res();
      },
      error_callback: e => rej(new Error(e.message || "Sign-in was closed")) });
    tc.requestAccessToken({ prompt: prof().g ? "" : "consent", login_hint: prof().g || undefined });
  });
}
const tokenOK = () => TOKEN && TOKEN.exp > Date.now();
function restoreToken() { TOKEN = null; try {
  const t = JSON.parse(sessionStorage.getItem("cashflow:tok:" + PID) || "null");
  if (t && t.exp > Date.now())
    TOKEN = t;
}
catch { } }
async function api(path, opt = {}) {
  const r = await fetch(API + path, { ...opt, headers: { ...(opt.headers || {}), Authorization: "Bearer " + TOKEN.t } });
  if (r.status === 401) {
    TOKEN = null;
    const e = new Error("auth");
    e.auth = 1;
    throw e;
  }
  if (!r.ok) {
    const e = new Error("Drive error " + r.status);
    e.status = r.status;
    throw e;
  }
  return r;
}
async function findFile() {
  const p = prof();
  if (p.fid)
    return p.fid;
  const j = await (await api(`/drive/v3/files?spaces=appDataFolder&fields=files(id)&q=${encodeURIComponent(`name='${FNAME}'`)}`)).json();
  const id = j.files?.[0]?.id || null;
  if (id)
    setProf({ fid: id });
  return id;
}
const download = async (id) => (await api(`/drive/v3/files/${id}?alt=media`)).json();
async function upload(id, txt) {
  if (id)
    return api(`/upload/drive/v3/files/${id}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: txt });
  const bd = "cf" + uid(), meta = JSON.stringify({ name: FNAME, parents: ["appDataFolder"] });
  const r = await api(`/upload/drive/v3/files?uploadType=multipart&fields=id`, { method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + bd },
    body: `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${txt}\r\n--${bd}--` });
  setProf({ fid: (await r.json()).id });
}
function status(st) {
  SST = st;
  const b = $("syncB"), tm = LAST ? new Date(LAST).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const tx = { idle: "Sync devices", ok: `Synced ${tm}`, syncing: "Syncing…", offline: "Offline · saved here", signin: "Tap to sync", error: "Sync failed · retry" }[st];
  b.querySelector(".tx").textContent = tx;
  b.dataset.st = st;
  b.setAttribute("aria-label", "Sync: " + tx);
  b.title = tx;
  if ($("syncD").open)
    syncUI();
}
function scheduleSync(ms = 2000) { clearTimeout(syncT); if (prof().g)
  syncT = setTimeout(syncNow, ms); }
async function syncNow() {
  if (!CID() || !prof().g)
    return status("idle");
  if (!navigator.onLine)
    return status("offline");
  if (!tokenOK())
    return status("signin");
  if (SYNCING) {
    AGAIN = true;
    return;
  }
  SYNCING = true;
  status("syncing");
  const me = PID;
  try {
    stamp();
    let id = await findFile(), remote = null;
    if (id) {
      try {
        remote = await download(id);
      }
      catch (e) {
        if (e.status !== 404)
          throw e;
        setProf({ fid: null });
        id = await findFile();
        remote = id ? await download(id) : null;
      }
    }
    if (me !== PID)
      throw new Error("Profile changed");
    if (remote && remote.log) {
      const M = merge(S, remote);
      M.owner = S.owner;
      if (body(M) !== body(S)) {
        S = M;
        SNAP = sections(S);
        saveLocalRaw();
        ANIM = false;
        renderAll();
      }
    }
    if (!remote || body(S) !== body(remote))
      await upload(id, body(S));
    LAST = Date.now();
    status("ok");
  }
  catch (e) {
    status(e.auth ? "signin" : navigator.onLine ? "error" : "offline");
  }
  SYNCING = false;
  if (AGAIN) {
    AGAIN = false;
    syncNow();
  }
}
async function connectGoogle() {
  try {
    await getToken();
    const email = (await (await api("/drive/v3/about?fields=user(emailAddress)")).json()).user.emailAddress;
    const other = PROFS.find(p => p.id !== PID && p.g === email);
    if (other) {
      TOKEN = null;
      alert(`${email} is already linked to the profile "${other.name}" on this device.\n\nEach profile needs its own Google account so data never mixes.`);
      return;
    }
    if (prof().g && prof().g !== email) {
      if (!confirm(`This profile is linked to ${prof().g}.\nSwitch it to ${email}?`)) {
        TOKEN = null;
        return;
      }
      setProf({ fid: null, synced: false });
    }
    setProf({ g: email });
    const id = await findFile();
    if (id && !prof().synced) {
      const R = await download(id), n = Object.keys(R.log || {}).length;
      if (confirm(`Found your Cash Flow data in Google Drive (${n} month${n === 1 ? "" : "s"}).\n\nOK = use the Drive data on this device\nCancel = combine it with the data on this device`)) {
        S = migrate(R);
        SNAP = sections(S);
        saveLocalRaw();
        renderAll();
      }
    }
    setProf({ synced: true });
    await syncNow();
  }
  catch (e) {
    alert("Couldn't connect: " + e.message);
    status(prof().g ? "signin" : "idle");
  }
}
function syncUI() {
  const d = $("syncC"), p = prof(), file = location.protocol === "file:";
  if (file)
    d.innerHTML = `<p class="hint">Google sign-in needs the app to be opened from <b>http://localhost</b> or an <b>https</b> address, not a double-clicked file.</p>`;
  else if (!CID())
    d.innerHTML = `<p class="hint">Sync keeps your data the same on every device (Mac, phone, any browser). It needs a free Google OAuth Client ID, a one-time setup explained in the README.</p>
  <label for="cidI" style="font-size:.85rem">Google OAuth Client ID</label><input id="cidI" style="width:100%;margin:6px 0 10px" placeholder="1234…apps.googleusercontent.com"><button class="btn" id="cidS">Save</button>`;
  else if (!p.g)
    d.innerHTML = `<p class="hint">Sign in to sync profile <b></b>. Your data goes into a private, hidden app folder in your own Google Drive that only Cash Flow can see.</p>
  <div class="ctrls"><button class="btn" id="gIn">Sign in with Google</button><button class="btn ghost" id="cidR">Change Client ID</button></div>`;
  else
    d.innerHTML = `<div class="kv"><span>Profile</span><b></b></div><div class="kv"><span>Google account</span><b id="sEm"></b></div>
  <div class="kv"><span>Status</span><b id="sSt"></b></div><p class="hint" style="margin-top:10px">Changes save on this device first and sync whenever internet is available. Edits from different devices are merged month by month.</p>
  <div class="ctrls"><button class="btn" id="sNow">Sync now</button><button class="btn danger" id="sOff">Disconnect</button></div>`;
  d.querySelectorAll("b:not([id])").forEach(x => x.textContent = p.name);
  if ($("sEm"))
    $("sEm").textContent = p.g;
  if ($("sSt"))
    $("sSt").textContent = $("syncB").querySelector(".tx").textContent;
  if ($("cidS"))
    $("cidS").onclick = () => { const v = $("cidI").value.trim(); if (!/\.apps\.googleusercontent\.com$/.test(v))
      return alert("That doesn't look like a Client ID. It ends with .apps.googleusercontent.com"); LS.set("cashflow:clientId", v); syncUI(); };
  if ($("cidR"))
    $("cidR").onclick = () => { if (GOOGLE_CLIENT_ID)
      return alert("The Client ID is set inside index.html."); LS.del("cashflow:clientId"); syncUI(); };
  if ($("gIn"))
    $("gIn").onclick = () => { $("syncD").close(); connectGoogle(); };
  if ($("sNow"))
    $("sNow").onclick = async () => { if (!tokenOK())
      try {
        await getToken();
      }
      catch (e) {
        return alert(e.message);
      } syncNow(); };
  if ($("sOff"))
    $("sOff").onclick = () => {
      if (!confirm(`Stop syncing "${p.name}" on this device? Data stays here and in Drive.`))
        return;
      try {
        TOKEN && google.accounts.oauth2.revoke(TOKEN.t);
      }
      catch { }
      TOKEN = null;
      try {
        sessionStorage.removeItem("cashflow:tok:" + PID);
      }
      catch { }
      setProf({ g: null, fid: null, synced: false });
      status("idle");
    };
}
$("syncB").onclick = async () => {
  if (SST === "signin" && CID() && prof().g) {
    try {
      await getToken();
      syncNow();
    }
    catch (e) {
      alert(e.message);
    }
    return;
  }
  if (SST === "error" || SST === "offline")
    syncNow();
  syncUI();
  $("syncD").showModal();
};
$("syncX").onclick = () => $("syncD").close();
addEventListener("online", () => syncNow());
addEventListener("offline", () => prof().g && status("offline"));
document.addEventListener("visibilitychange", () => { if (!document.hidden)
  syncNow(); });
setInterval(() => { if (!document.hidden && prof().g)
  syncNow(); }, 60000);
/* ---------- settings: where the data lives ---------- */
function env() {
  const u = navigator.userAgent, ua = navigator.userAgentData;
  const os = /iPhone|iPad|iPod/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1) ? "iOS" : /Android/.test(u) ? "Android" : /Mac/.test(u) ? "Mac" : /Win/.test(u) ? "Windows" : /Linux|CrOS/.test(u) ? "Linux" : "device";
  const br = /Edg\//.test(u) ? "Edge" : /SamsungBrowser/.test(u) ? "Samsung Internet" : /OPR\//.test(u) ? "Opera" : /Firefox|FxiOS/.test(u) ? "Firefox" : /Chrome|CriOS/.test(u) ? (ua?.brands?.some(b => /Brave/.test(b.brand)) ? "Brave" : "Chrome") : /Safari/.test(u) ? "Safari" : "your browser";
  return { os, br, mobile: os === "iOS" || os === "Android" };
}
function diskPaths(e) {
  const o = location.origin, P = [];
  const cr = { Chrome: ["Google/Chrome", "Google\\Chrome", "google-chrome"], Edge: ["Microsoft Edge", "Microsoft\\Edge", "microsoft-edge"], Brave: ["BraveSoftware/Brave-Browser", "BraveSoftware\\Brave-Browser", "BraveSoftware/Brave-Browser"] }[e.br];
  if (e.mobile)
    return { note: `On ${e.os}, ${e.br} keeps website data in its own private storage. No app or file browser can open it. Use <b>Export backup</b> to get a file you can see in ${e.os === "iOS" ? "the Files app" : "your Downloads folder"}.`, P };
  if (cr) {
    if (e.os === "Mac")
      P.push(["Folder", `~/Library/Application Support/${cr[0]}/Default/Local Storage/leveldb`]);
    if (e.os === "Windows")
      P.push(["Folder", `%LOCALAPPDATA%\\${cr[1]}\\User Data\\Default\\Local Storage\\leveldb`]);
    if (e.os === "Linux")
      P.push(["Folder", `~/.config/${cr[2]}/Default/Local Storage/leveldb`]);
    P.push(["See it in the browser", `${e.br === "Edge" ? "edge" : "chrome"}://settings/content/all?searchSubpage=${encodeURIComponent(location.host)}`]);
    return { note: `If you use another ${e.br} profile, replace <b>Default</b> with <b>Profile 1</b>, <b>Profile 2</b>, … The files are a browser database, not readable on their own. To look at your data: press <b>${e.os === "Mac" ? "⌥⌘I" : "F12"}</b> → <b>Application</b> → <b>Local Storage</b> → <b>${o}</b>.`, P };
  }
  if (e.br === "Safari") {
    P.push(["Folder", "~/Library/Containers/com.apple.Safari/Data/Library/WebKit/WebsiteData"]);
    return { note: `Manage it in <b>Safari → Settings → Privacy → Manage Website Data</b> and search for <b>${location.hostname}</b>. ⚠ Safari can delete website data you haven't opened for 7 days, so export backups often or use sync.`, P };
  }
  if (e.br === "Firefox") {
    P.push(["Find your profile folder", "about:profiles"]);
    return { note: `Inside your Firefox profile folder → <b>storage/default</b> → the folder named after <b>${o.replace("://", "+++")}</b>.`, P };
  }
  return { note: "Stored inside your browser's website data for this address.", P };
}
async function settingsUI() {
  const e = env(), p = prof();
  $("wDev").textContent = e.mobile ? "📱" : e.os === "Mac" ? "💻" : "🖥️";
  $("wWhat").textContent = `On this ${{ Mac: "Mac", iOS: "iPhone / iPad", Android: "Android phone", Windows: "Windows PC", Linux: "Linux computer" }[e.os] || "device"}, inside ${e.br}`;
  $("wSub").textContent = "Not in the cloud, not on any server. Only this browser on this device can read it.";
  $("wAddr").textContent = location.protocol === "file:" ? "Opened as a file" : location.host;
  $("wProf").textContent = p.name + (PROFS.length > 1 ? ` (${PROFS.length} profiles on this device)` : "");
  let n = 0;
  try {
    for (const k of Object.keys(localStorage))
      if (k.startsWith("cashflow"))
        n += (k.length + (localStorage.getItem(k) || "").length) * 2;
  }
  catch { }
  $("wSize").textContent = n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB";
  let per = null;
  try {
    per = await navigator.storage?.persisted?.();
  }
  catch { }
  $("wPers").textContent = per ? "Yes ✓" : per === false ? "Not guaranteed, keep backups" : "Unknown";
  $("wDrive").textContent = p.g ? `Synced · ${p.g}` : "Not connected";
  const d = diskPaths(e), box = $("wPath");
  box.innerHTML = "";
  d.P.forEach(([l, v]) => {
    const w = document.createElement("div");
    w.innerHTML = `<small style="color:var(--muted)">${l}</small><div class="path"><code></code><button>Copy</button></div>`;
    w.querySelector("code").textContent = v;
    w.querySelector("button").onclick = ev => { navigator.clipboard?.writeText(v).then(() => { ev.target.textContent = "Copied ✓"; setTimeout(() => ev.target.textContent = "Copy", 1500); }); };
    box.append(w);
  });
  const nt = document.createElement("p");
  nt.className = "hint";
  nt.style.marginTop = "8px";
  nt.innerHTML = d.note;
  box.append(nt);
  if (p.g) {
    const g = document.createElement("p");
    g.className = "hint";
    g.innerHTML = `<b>Google Drive copy:</b> a hidden app folder in ${p.g.replace(/</g, "")}'s Drive. It doesn't show in your file list. To see or delete it: <b>drive.google.com → ⚙️ Settings → Manage apps → Cash Flow</b>.`;
    box.append(g);
  }
  const t = +LS.get(bkKey()) || 0;
  $("wBk").textContent = t ? `Last backup: ${new Date(t).toLocaleDateString()} (${Math.floor((Date.now() - t) / 864e5)} days ago).` : "No backup yet. A backup is one file with everything: months, goals, assets, debts and settings.";
  $("wDl").textContent = `Backups are saved to ${e.os === "iOS" ? "Files app → Downloads (or where Safari asks)" : e.os === "Android" ? "your Downloads folder (Files app)" : "your Downloads folder"}. Move that file to the new device and choose Import backup there.`;
  $("wSync").textContent = p.g ? `Profile "${p.name}" syncs with ${p.g}. Data is identical on every device you sign in on.` : "Keep the same data on your phone and computer automatically. Not needed if you prefer local only.";
}
$("wipeB").onclick = () => {
  const n = prof().name;
  if (prompt(`This erases ALL data of "${n}" on this device: months, assets, goals, settings.\n\nType ERASE to confirm:`) !== "ERASE")
    return;
  S = migrate({});
  SNAP = null;
  saveLocalRaw();
  stamp();
  LS.del(bkKey());
  $("setD").close();
  renderAll();
  showTab("ov");
  toast("✓ Fresh start. All values are 0");
};
$("setB").onclick = () => { $("verL").textContent = "Cash Flow version " + APP_VERSION; settingsUI(); setTheme(LS.get("cashflow:theme") || "auto"); $("setD").showModal(); };
$("setX").onclick = () => $("setD").close();
$("setSync").onclick = () => { $("setD").close(); syncUI(); $("syncD").showModal(); };
function sliders() {
  $("sliders").innerHTML = "";
  AL.forEach(([k, l]) => {
    const d = document.createElement("div");
    d.className = "slider";
    d.innerHTML = `<div><span>${l}</span><span id="v-${k}"></span></div><input type="range" min="0" max="100" step="5" aria-label="${l}">`;
    const r = d.querySelector("input");
    r.value = S.alloc[k];
    r.oninput = () => { S.alloc[k] = +r.value; change(); };
    $("sliders").append(d);
  });
}
function bind() { document.querySelectorAll("[data-b]").forEach(el => { el.value = get(S, el.dataset.b); el.oninput = () => { put(S, el.dataset.b, +el.value || 0); change(); }; }); }
function renderAll() { ANIM = true; goalsUI(); S.bs = S.bs || structuredClone(DEF.bs); bsRows("assets", $("rdA"), [["v", "Value"]]); bsRows("liab", $("rdL"), [["v", "Owed"], ["p", "Per month"]]); sliders(); bind(); $("cur").value = S.currency; render(); renderEditor(); }
/* ---------- save, backup ---------- */
function change(anim = false) {
  ANIM = anim;
  S.savedAt = Date.now();
  render();
  clearTimeout(saveT);
  $("save").textContent = "Saving…";
  saveT = setTimeout(() => { if (saveLocal()) {
    $("save").textContent = "🔒 Saved only on this device";
    scheduleSync();
  }
  else
    $("save").textContent = "Couldn't save. Export a backup."; }, 400);
}
const bkKey = () => "cashflow:lastBackup:" + PID;
function backupLbl() {
  const t = +LS.get(bkKey()) || 0, d = t ? Math.floor((Date.now() - t) / 864e5) : null, b = $("exp"), synced = !!prof().g;
  const warn = !synced && (d === null ? logged().length >= 2 : d >= 30);
  b.textContent = warn ? (d === null ? "⚠ Export backup" : `⚠ Backup ${d} days old`) : "Export backup";
  b.title = t ? `Last backup: ${new Date(t).toLocaleDateString()}` : "No backup yet";
  b.style.color = warn ? "var(--rose)" : "";
  b.style.borderColor = warn ? "var(--rose)" : "";
  const sb = $("setB");
  sb.classList.toggle("warn", warn);
  sb.querySelector(".badge-dot").hidden = !warn;
  sb.setAttribute("aria-label", warn ? "Settings, backup needed" : "Settings");
}
$("exp").onclick = () => {
  const out = { ...structuredClone(S), exportedAt: Date.now(), app: "Cash Flow" };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
  a.download = `cashflow-${prof().name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  LS.set(bkKey(), String(Date.now()));
  backupLbl();
  if ($("setD").open)
    settingsUI();
  toast("✓ Backup saved to Downloads");
};
$("imp").onclick = () => $("impF").click();
$("impF").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f)
    return;
  let p;
  try {
    p = JSON.parse(await f.text());
    if (!p || typeof p !== "object" || !p.log)
      throw 0;
  }
  catch {
    return alert("That file isn't a Cash Flow backup. Choose a .json file made with Export backup.");
  }
  const n = Object.keys(p.log).length, g = (p.goals || []).length, when = p.exportedAt ? new Date(p.exportedAt).toLocaleDateString() : "unknown date", who = p.owner?.name;
  const other = who && who !== prof().name;
  if (!confirm(`Backup${who ? ` of "${who}"` : ""} from ${when}: ${n} month${n === 1 ? "" : "s"}, ${g} goal${g === 1 ? "" : "s"}.\n\n` + (other ? `⚠ This looks like another person's data. ` : "") + `Replace ALL data of the profile "${prof().name}" on this device with it?`))
    return;
  delete p.exportedAt;
  delete p.app;
  S = migrate(p);
  renderAll();
  change(true);
  LS.set(bkKey(), String(Date.now()));
  backupLbl();
  toast(`✓ Restored ${n} months and ${g} goals`);
};
navigator.storage?.persist?.().catch(() => { });
/* ---------- PORTFOLIO: everything you own ---------- */
const AT = {
  plot: { g: "Property", ic: "🏞️", n: "Plot / land", inc: "Lease income", cost: "Tax & upkeep", gr: 4, tip: "Land holds value but pays nothing unless leased or developed." },
  rental: { g: "Property", ic: "🏘️", n: "Rental home / flat", inc: "Rent", cost: "Maintenance, tax, management", gr: 3, tip: "Classic Rich Dad asset when rent beats all costs." },
  shop: { g: "Property", ic: "🏪", n: "Shop / commercial", inc: "Rent", cost: "Maintenance, tax, management", gr: 3, tip: "Commercial rent is often higher, with longer contracts." },
  home: { g: "Property", ic: "🏡", n: "Home I live in", inc: "Income (if any)", cost: "Upkeep, tax, insurance", gr: 3, tip: "Gives security, but for cash flow it usually takes money out." },
  biz: { g: "Business", ic: "🏢", n: "Company / business", inc: "Your profit or dividends", cost: "Costs you personally pay", gr: 5, tip: "A business that runs without you is the B in the Cashflow Quadrant." },
  partner: { g: "Business", ic: "🤝", n: "Partnership (musharakah)", inc: "Your profit share", cost: "Your share of costs", gr: 3, tip: "Halal profit-and-loss sharing instead of interest." },
  app: { g: "Digital", ic: "📱", n: "App", inc: "Revenue (subscriptions, ads, sales)", cost: "Servers, store fees, tools", gr: 0, tip: "Build once, earn many times. Keep costs low." },
  web: { g: "Digital", ic: "🌐", n: "Website / SaaS", inc: "Revenue", cost: "Hosting, tools, ads", gr: 0, tip: "Recurring revenue makes it valuable and sellable." },
  eprod: { g: "Digital", ic: "📘", n: "E-book, course, template", inc: "Sales", cost: "Platform fees, ads", gr: 0, tip: "Your knowledge turned into an asset." },
  content: { g: "Digital", ic: "🎥", n: "YouTube / content channel", inc: "Ads & sponsors", cost: "Tools, editing", gr: 0, tip: "Old videos keep earning while you sleep." },
  vehicle: { g: "Other", ic: "🚗", n: "Vehicle", inc: "Income (e.g. rental)", cost: "Fuel, insurance, repairs", gr: -15, tip: "Usually a liability: it loses value and costs money monthly." },
  other: { g: "Other", ic: "💎", n: "Other", inc: "Monthly income", cost: "Monthly costs", gr: 0, tip: "" }
};
const AGRP = ["Property", "Business", "Digital", "Other"];
function pa(a) {
  const t = AT[a.type] || AT.other, o = Math.max(0, Math.min(100, +a.own || 0)) / 100, val = (+a.v || 0) * o, inc = (+a.inc || 0) * o, cost = (+a.cost || 0) * o, lp = +a.lp || 0, lo = +a.lo || 0;
  const op = inc - cost, net = op - lp, eq = val - lo, yld = val ? op * 12 / val : 0, coc = eq > 0 ? net * 12 / eq : 0, buy = (+a.buy || 0) * o, roi = buy ? (val - buy) / buy : null;
  const vd = net > 0.5 ? ["asset", "Asset", `Puts ${fmt(net)} a month in your pocket`] : net < -0.5 ? ["liab", "Liability", `Takes ${fmt(-net)} a month out of your pocket`] : ["store", "Store of value", val ? "Holds value but pays you nothing yet" : "Add its value"];
  return { t, val, inc, cost, op, net, lp, lo, eq, yld, coc, roi, vd };
}
function portTot() {
  const r = { val: 0, inc: 0, cost: 0, net: 0, lo: 0, lp: 0, op: 0, zk: 0, grp: {} };
  (S.port || []).forEach(a => { const p = pa(a); r.val += p.val; r.inc += p.inc; r.cost += p.cost; r.net += p.net; r.op += p.op; r.lo += p.lo; r.lp += p.lp; if (a.zk)
    r.zk += p.val; r.grp[p.t.g] = (r.grp[p.t.g] || 0) + p.val; });
  return r;
}
function pickType() {
  const d = $("atD"), c = $("atC");
  c.innerHTML = "";
  AGRP.forEach(g => {
    const h = document.createElement("h3");
    h.className = "atg";
    h.textContent = g;
    c.append(h);
    const w = document.createElement("div");
    w.className = "atgrid";
    Object.entries(AT).filter(([, t]) => t.g === g).forEach(([k, t]) => {
      const b = document.createElement("button");
      b.innerHTML = `<b>${t.ic}</b><span></span>`;
      b.querySelector("span").textContent = t.n;
      b.onclick = () => { d.close(); editAsset({ id: uid(), type: k, n: "", v: 0, buy: 0, bd: "", own: 100, inc: 0, cost: 0, g: t.gr, lo: 0, lp: 0, zk: false, notes: "" }, true); };
      w.append(b);
    });
    c.append(w);
  });
  d.showModal();
}
function editAsset(a0, isNew) {
  const a = structuredClone(a0), t = AT[a.type] || AT.other, d = $("assetD"), c = $("assetC");
  const F = (k, l, ty = "number", ph = "", extra = "") => `<div class="af"><label for="af-${k}">${l}</label><input id="af-${k}" data-k="${k}" type="${ty}" placeholder="${ph}" ${extra}></div>`;
  c.innerHTML = `<div class="ah"><span class="li big">${t.ic}</span><div><small>${t.g}</small><h2>${isNew ? "New: " : ""}${t.n}</h2></div></div>
  <p class="hint">${t.tip}</p>
  <div class="af full"><label for="af-n">Name</label><input id="af-n" data-k="n" placeholder="e.g. ${({ plot: "Plot near the city", rental: "2-room flat, city centre", shop: "Shop on Main Street", home: "Our home", biz: "My agency", partner: "Bakery partnership", app: "Habit tracker app", web: "SaaS dashboard", eprod: "Kotlin course", content: "YouTube channel", vehicle: "Car", other: "Asset" })[a.type]}"></div>
  <div class="agrid">${F("v", "Value today")}${F("own", "Your ownership %", "number", "100", 'min="0" max="100"')}${F("inc", t.inc + " / month")}${F("cost", t.cost + " / month")}
  ${F("buy", "Purchase price / money put in")}${F("bd", "Bought / started", "month")}${F("lo", "Loan still owed (your share)")}${F("lp", "Loan payment / month")}${F("g", "Value growth % / year", "number", "", 'step="0.5"')}</div>
  <label class="tg"><input type="checkbox" id="af-zk" data-k="zk"><span>Include its value in zakat</span></label>
  <p class="note">Turn on for things you hold to sell (trade goods, a plot bought for resale, business stock). Rental property, your home and things you use aren't zakatable on their value; saved rent is counted in your cash. Ask a scholar for your case.</p>
  <div class="af full"><label for="af-notes">Notes</label><input id="af-notes" data-k="notes" type="text" placeholder="Tenant, contract end, platform…"></div>
  <div class="verdict" id="avd"></div>
  <div class="ctrls" style="margin-top:12px"><button class="btn" id="aSave">${isNew ? "Add asset" : "Save"}</button><button class="btn ghost" id="aCancel">Cancel</button>${isNew ? "" : '<button class="btn danger" id="aDel">Delete</button>'}</div>`;
  c.querySelectorAll("[data-k]").forEach(i => {
    const k = i.dataset.k;
    if (i.type === "checkbox")
      i.checked = !!a[k];
    else
      i.value = a[k] ?? "";
    i.oninput = i.onchange = () => { a[k] = i.type === "checkbox" ? i.checked : i.type === "number" ? (i.value === "" ? 0 : +i.value) : i.value; upd(); };
  });
  const upd = () => {
    const p = pa(a);
    $("avd").className = "verdict " + p.vd[0];
    $("avd").innerHTML = `<div class="vh"><b>${p.vd[1]}</b><span>${p.vd[2]}</span></div><div class="vg">
   <div><small>Net cash flow</small><b class="${p.net >= 0 ? "pos" : "neg"}">${fmt(p.net)}/mo</b></div><div><small>Your equity</small><b>${fmt(p.eq)}</b></div>
   <div><small>Net yield</small><b>${(p.yld * 100).toFixed(1)}%</b></div><div><small>${p.roi === null ? "Cash-on-cash" : "Value gain"}</small><b>${p.roi === null ? (p.coc * 100).toFixed(1) + "%" : (p.roi >= 0 ? "+" : "") + (p.roi * 100).toFixed(0) + "%"}</b></div></div>`;
  };
  upd();
  $("aSave").onclick = () => { if (!a.n.trim())
    a.n = t.n; a.hist = a.hist || {}; if (!isNew && +a0.v !== +a.v || isNew)
    a.hist[curM()] = +a.v || 0; S.port = S.port || []; const i = S.port.findIndex(x => x.id === a.id); i >= 0 ? S.port[i] = a : S.port.push(a); d.close(); change(true); renderPort(); toast(isNew ? "✓ Asset added" : "✓ Saved"); };
  $("aCancel").onclick = () => d.close();
  if ($("aDel"))
    $("aDel").onclick = () => { if (!confirm(`Delete "${a.n || t.n}"?`))
      return; S.port = S.port.filter(x => x.id !== a.id); d.close(); change(true); renderPort(); toast("Asset deleted"); };
  d.showModal();
  if (isNew)
    setTimeout(() => $("af-n").focus(), 50);
}
function renderPort() {
  if (!$("asList"))
    return;
  invSync();
  renderInv();
  const T = portTot(), P = S.port || [], inv = (+S.assets.stocks || 0) + (+S.assets.gold || 0);
  count("asV", T.val + inv);
  count("asN", T.net);
  $("asN").className = T.net >= 0 ? "pos" : "neg";
  count("asL", T.lo);
  $("asY").textContent = T.val ? (T.op * 12 / T.val * 100).toFixed(1) + "%" : "–";
  const box = $("asList");
  box.innerHTML = "";
  if (!P.length) {
    box.innerHTML = `<div class="panel empty-box"><div style="font-size:2.4rem">🏗️</div><h2>Add what you own</h2><p class="hint">Plots, rental flats, shops, your company, apps, websites, e-books… See which ones are real assets.</p><button class="btn" id="asEmpty">Add your first asset</button></div>`;
    $("asEmpty").onclick = pickType;
  }
  AGRP.forEach(g => {
    const its = P.filter(a => (AT[a.type] || AT.other).g === g);
    if (!its.length)
      return;
    const sub = its.reduce((s, a) => s + pa(a).net, 0), h = document.createElement("div");
    h.className = "agh";
    h.innerHTML = `<h3></h3><span class="${sub >= 0 ? "pos" : "neg"}">${fmt(sub)}/mo</span>`;
    h.querySelector("h3").textContent = g;
    box.append(h);
    const w = document.createElement("div");
    w.className = "acards";
    its.forEach(a => {
      const p = pa(a), b = document.createElement("button");
      b.className = "acard";
      b.innerHTML = `<span class="li">${p.t.ic}</span><span class="at"><b></b><small></small></span><span class="am"><b>${fmt(p.val)}</b><small class="${p.net >= 0 ? "pos" : "neg"}">${p.net >= 0 ? "+" : ""}${fmt(p.net)}/mo</small></span><span class="vchip ${p.vd[0]}">${p.vd[1]}</span>`;
      b.querySelector(".at b").textContent = a.n || p.t.n;
      b.querySelector(".at small").textContent = `${p.t.n}${+a.own < 100 ? ` · ${+a.own}% yours` : ""}${p.val && p.op > 0 ? ` · ${(p.yld * 100).toFixed(1)}% yield` : ""}`;
      b.onclick = () => editAsset(a, false);
      w.append(b);
    });
    box.append(w);
  });
  // charts
  const parts = [["Property", "--sky"], ["Business", "--gold"], ["Digital", "--plum"], ["Other", "--muted"]].map(([g, c]) => [g, T.grp[g] || 0, `var(${c})`]);
  parts.push(["Stocks / ETFs", +S.assets.stocks || 0, "var(--green)"], ["Gold", +S.assets.gold || 0, "var(--sand)"], ["Cash", (+S.assets.cash || 0) + (+S.assets.emergency || 0), "var(--line)"]);
  C.as.set({ labels: parts.map(x => x[0]), values: parts.map(x => x[1]), colors: parts.map(x => x[2]) });
  const top = P.map(a => [a.n || AT[a.type].n, pa(a)]).sort((x, y) => y[1].net - x[1].net).slice(0, 8);
  C.ai.set({ labels: top.map(x => x[0].length > 12 ? x[0].slice(0, 11) + "…" : x[0]), series: [{ label: "Income", kind: "bar", color: "var(--green)", data: top.map(x => x[1].inc) }, { label: "Costs + loan", kind: "bar", color: "var(--rose)", data: top.map(x => x[1].cost + x[1].lp) }, { label: "Net", kind: "line", color: "var(--gold)", width: 3, data: top.map(x => x[1].net) }] });
  // insights
  const tips = [];
  const b = base();
  const best = P.map(a => [a, pa(a)]).filter(x => x[1].val > 0 && x[1].op > 0).sort((x, y) => y[1].yld - x[1].yld)[0];
  if (best)
    tips.push(["🏆", `Best performer: ${best[0].n || best[1].t.n}`, `${(best[1].yld * 100).toFixed(1)}% net yield. Could you buy or build another like it?`]);
  P.filter(a => pa(a).vd[0] === "liab").slice(0, 2).forEach(a => { const p = pa(a); tips.push(["⚠️", `${a.n || p.t.n} costs you ${fmt(-p.net)}/mo`, a.type === "home" || a.type === "vehicle" ? "Normal for things you use. Just don't count it as an income asset." : "Raise income, cut costs or consider selling. Rich Dad: buy assets, not liabilities."]); });
  P.filter(a => a.type === "plot" && pa(a).inc === 0).slice(0, 1).forEach(a => tips.push(["🌾", `${a.n || "Your plot"} earns nothing`, "Ideas: lease it for farming, parking or storage, or develop it into a rental."]));
  if (!P.some(a => AT[a.type]?.g === "Digital"))
    tips.push(["💡", "No digital assets yet", "Your skills can become an app, course or template that sells while you sleep."]);
  if (b.exp && T.net > 0)
    tips.push(["🕊", `Your assets cover ${Math.round(T.net / (b.exp + b.sad) * 100)}% of your spending`, "Every new asset moves you closer to leaving the rat race."]);
  $("asTips").innerHTML = "";
  tips.slice(0, 4).forEach(([i, t, p]) => { const d = document.createElement("div"); d.className = "tip-card"; d.innerHTML = `<div class="ic">${i}</div><div><b></b><p></p></div>`; d.querySelector("b").textContent = t; d.querySelector("p").textContent = p; $("asTips").append(d); });
  if (!tips.length)
    $("asTips").innerHTML = '<p class="hint">Add assets to see insights.</p>';
}
$("asAdd").onclick = pickType;
$("invAdd").onclick = newInv;
$("invD").addEventListener("click", e => { if (e.target === $("invD"))
  $("invD").close(); });
$("ovSave").onclick = () => showTab("gr");
$("coachUse").onclick = () => { const tot = coachScan().reduce((s, x) => s + x.save, 0); const w = $("wCut"); w.max = Math.max(+w.max, Math.ceil(tot / 25) * 25); w.value = Math.round(tot / 25) * 25; w.dispatchEvent(new Event("input")); w.closest(".panel").scrollIntoView({ behavior: "smooth", block: "center" }); toast("Moved your possible savings into What if…"); };
$("atX").onclick = () => $("atD").close();
["atD", "assetD"].forEach(id => $(id).addEventListener("click", e => { if (e.target === $(id))
  $(id).close(); }));
/* ---------- INVESTMENTS: buy / sell / update value, no monthly typing ---------- */
const INVT = { stock: ["📈", "Stocks / ETF", "shares"], fund: ["🧺", "Mutual / index fund", "units"], gold: ["🥇", "Gold", "grams"], silver: ["🥈", "Silver", "grams"], crypto: ["🪙", "Crypto", "coins"], other: ["💼", "Other investment", "units"] };
const curM = () => ck(now.getFullYear(), now.getMonth() + 1);
function invCalc(h) {
  let units = 0, cost = 0, value = 0, real = 0, div = 0, inv = 0;
  const hist = {};
  [...(h.tx || [])].map((t, i) => [t, i]).sort((a, b) => a[0].d < b[0].d ? -1 : a[0].d > b[0].d ? 1 : a[1] - b[1]).forEach(([t]) => {
    if (t.k === "buy") {
      units += t.u || 0;
      cost += t.amt;
      value += t.amt;
      inv += t.amt;
    }
    else if (t.k === "sell") {
      const f = units > 0 && t.u ? Math.min(1, t.u / units) : Math.min(1, (t.pct || 0) / 100);
      const cp = cost * f;
      real += t.amt - cp;
      cost -= cp;
      value = Math.max(0, value * (1 - f));
      units = Math.max(0, units - (t.u || units * f));
    }
    else if (t.k === "val")
      value = t.amt;
    else if (t.k === "div")
      div += t.amt;
    hist[t.d] = value;
  });
  const gain = value - cost;
  return { units, cost, value, real, div, inv, gain, pct: cost > 0 ? gain / cost : 0, hist };
}
function invSync() {
  const L = S.inv || [];
  if (!L.length)
    return;
  let st = 0, gd = 0, hasS = 0, hasG = 0;
  L.forEach(h => { const v = invCalc(h).value; if (h.type === "gold" || h.type === "silver") {
    gd += v;
    hasG = 1;
  }
  else {
    st += v;
    hasS = 1;
  } });
  if (hasS)
    S.assets.stocks = Math.round(st);
  if (hasG)
    S.assets.gold = Math.round(gd);
  ["a-st", "a-gd"].forEach((id, i) => { const el = $(id); if (!el)
    return; const lock = i ? hasG : hasS; el.disabled = !!lock; el.title = lock ? "Calculated from My assets → Investments" : ""; if (lock)
    el.value = i ? S.assets.gold : S.assets.stocks; });
}
function spark(hist) {
  const k = Object.keys(hist).sort(), v = k.map(x => hist[x]);
  if (v.length < 2)
    return "";
  const mn = Math.min(...v), mx = Math.max(...v), W = 120, H = 34;
  const pts = v.map((y, i) => `${(i / (v.length - 1) * W).toFixed(1)},${(H - 2 - (mx === mn ? .5 : (y - mn) / (mx - mn)) * (H - 4)).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${v.at(-1) >= v[0] ? "var(--green)" : "var(--rose)"}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function renderInv() {
  const box = $("invList");
  if (!box)
    return;
  const L = S.inv || [];
  box.innerHTML = "";
  if (!L.length) {
    box.innerHTML = '<p class="hint" style="margin:0">Track stocks, funds, gold and crypto: add what you bought, update the value whenever you check, record sales. No monthly typing.</p>';
    return;
  }
  let tv = 0, tc = 0;
  L.forEach(h => { const c = invCalc(h); tv += c.value; tc += c.cost; });
  const sum = document.createElement("div");
  sum.className = "invsum";
  sum.innerHTML = `<span>Value <b>${fmt(tv)}</b></span><span>Invested <b>${fmt(tc)}</b></span><span>Gain <b class="${tv - tc >= 0 ? "pos" : "neg"}">${tv - tc >= 0 ? "+" : ""}${fmt(tv - tc)} (${tc ? ((tv - tc) / tc * 100).toFixed(1) : 0}%)</b></span>`;
  box.append(sum);
  const w = document.createElement("div");
  w.className = "acards";
  L.forEach(h => {
    const c = invCalc(h), t = INVT[h.type] || INVT.other, b = document.createElement("button");
    b.className = "acard inv";
    b.innerHTML = `<span class="li">${t[0]}</span><span class="at"><b></b><small>${t[1]}${c.units ? ` · ${+c.units.toFixed(4)} ${t[2]}` : ""}</small></span><span class="am"><b>${fmt(c.value)}</b><small class="${c.gain >= 0 ? "pos" : "neg"}">${c.gain >= 0 ? "+" : ""}${fmt(c.gain)} · ${(c.pct * 100).toFixed(1)}%</small></span>${spark(c.hist)}`;
    b.querySelector(".at b").textContent = h.n || t[1];
    b.onclick = () => openInv(h.id);
    w.append(b);
  });
  box.append(w);
}
function invForm(kind, h) {
  const c = h ? invCalc(h) : null, t = h ? INVT[h.type] : null, ul = t ? t[2] : "units";
  const M = `<div class="af"><label for="iv-d">Month</label><input id="iv-d" type="month" value="${curM()}"></div>`;
  if (kind === "buy")
    return `<div class="agrid"><div class="af"><label for="iv-a">Amount invested</label><input id="iv-a" type="number" inputmode="decimal" placeholder="100000"></div><div class="af"><label for="iv-u">${ul[0].toUpperCase() + ul.slice(1)} bought (optional)</label><input id="iv-u" type="number" inputmode="decimal" placeholder="e.g. 25"></div>${M}</div><label class="tg"><input type="checkbox" id="iv-c" ${(+S.assets.cash || 0) > 0 ? "checked" : ""}><span>Paid from my cash balance</span></label>`;
  if (kind === "sell")
    return `<div class="agrid"><div class="af"><label for="iv-a">Money received</label><input id="iv-a" type="number" inputmode="decimal"></div>${c && c.units > 0 ? `<div class="af"><label for="iv-u">${ul[0].toUpperCase() + ul.slice(1)} sold (of ${+c.units.toFixed(4)})</label><input id="iv-u" type="number" inputmode="decimal"></div>` : `<div class="af"><label for="iv-p">Share sold: <b id="iv-pv">100%</b></label><input id="iv-p" type="range" min="1" max="100" value="100"></div>`}${M}</div><label class="tg"><input type="checkbox" id="iv-c" checked><span>Add the money to my cash balance</span></label>`;
  if (kind === "val")
    return `<div class="agrid"><div class="af"><label for="iv-a">Total value today</label><input id="iv-a" type="number" inputmode="decimal" placeholder="${c ? Math.round(c.value) : ""}"></div>${c && c.units > 0 ? `<div class="af"><label for="iv-pp">…or price per ${ul.replace(/s$/, "")}</label><input id="iv-pp" type="number" inputmode="decimal"></div>` : ""}${M}</div><p class="note">Update whenever you check: weekly, monthly or yearly. The history fills in by itself.</p>`;
  if (kind === "div")
    return `<div class="agrid"><div class="af"><label for="iv-a">Dividend / profit received</label><input id="iv-a" type="number" inputmode="decimal"></div>${M}</div><label class="tg"><input type="checkbox" id="iv-c" checked><span>Add to this month's passive income</span></label>`;
}
function readTx(kind, h) {
  const a = nz($("iv-a")?.value), d = $("iv-d")?.value || curM(), u = nz($("iv-u")?.value), c = $("iv-c")?.checked;
  if (kind === "val") {
    const pp = nz($("iv-pp")?.value), units = h ? invCalc(h).units : 0;
    const v = pp && units ? pp * units : a;
    if (v <= 0 && !$("iv-a").value)
      return null;
    return { tx: { k: "val", amt: Math.max(0, v), d } };
  }
  if (a <= 0)
    return null;
  if (kind === "sell") {
    const pct = $("iv-p") ? +$("iv-p").value : 0;
    if ($("iv-u") && u <= 0)
      return null;
    return { tx: { k: "sell", amt: a, u: u || 0, pct, d }, c };
  }
  return { tx: { k: kind, amt: a, u: kind === "buy" ? Math.max(0, u) : 0, d }, c };
}
function applyCash(kind, tx, c, h, n) {
  if (!c)
    return;
  if (kind === "buy")
    S.assets.cash = nz(S.assets.cash) - tx.amt;
  if (kind === "sell")
    S.assets.cash = nz(S.assets.cash) + tx.amt;
  if (kind === "div") {
    const k = tx.d;
    if (!S.log[k])
      S.log[k] = { income: [], extra: [], passive: [], expenses: [], sadaqah: 0, zakatPaid: 0 };
    S.log[k].passive.push({ n: "Dividend: " + (n || "investment"), a: tx.amt });
  }
}
function newInv() {
  const d = $("invD"), c = $("invC");
  c.innerHTML = `<h2>Add an investment</h2><div class="atgrid" id="ivT">${Object.entries(INVT).map(([k, t]) => `<button data-k="${k}"><b>${t[0]}</b><span>${t[1]}</span></button>`).join("")}</div>
 <div id="ivF" hidden><div class="af full"><label for="iv-n">Name</label><input id="iv-n" placeholder="e.g. Meezan Islamic Fund, Wahed, 24k gold"></div>${invForm("buy")}<div class="ctrls" style="margin-top:12px"><button class="btn" id="ivS">Add</button><button class="btn ghost" id="ivX">Cancel</button></div></div>`;
  let type = null;
  c.querySelector("#ivT").onclick = e => {
    const b = e.target.closest("button");
    if (!b)
      return;
    type = b.dataset.k;
    c.querySelectorAll("#ivT button").forEach(x => x.classList.toggle("on", x === b));
    $("ivF").hidden = false;
    c.querySelector("label[for=iv-u]").textContent = `${INVT[type][2][0].toUpperCase() + INVT[type][2].slice(1)} bought (optional)`;
    $("iv-n").focus();
  };
  $("ivX").onclick = () => d.close();
  $("ivS").onclick = () => { const r = readTx("buy"); if (!r) {
    toast("Enter the amount you invested");
    return;
  } const h = { id: uid(), type, n: $("iv-n").value.trim(), tx: [r.tx] }; S.inv = S.inv || []; S.inv.push(h); applyCash("buy", r.tx, r.c, h, h.n); invSync(); d.close(); change(true); renderPort(); toast("✓ Investment added"); };
  d.showModal();
}
function openInv(id) {
  const h = (S.inv || []).find(x => x.id === id);
  if (!h)
    return;
  const d = $("invD"), c = $("invC"), t = INVT[h.type] || INVT.other, k = invCalc(h);
  const lbl = { buy: "Bought", sell: "Sold", val: "Value updated", div: "Dividend" };
  c.innerHTML = `<div class="ah"><span class="li big">${t[0]}</span><div><small>${t[1]}</small><h2></h2></div></div>
  <div class="vg ivg"><div><small>Value now</small><b>${fmt(k.value)}</b></div><div><small>Invested (remaining)</small><b>${fmt(k.cost)}</b></div><div><small>Unrealized gain</small><b class="${k.gain >= 0 ? "pos" : "neg"}">${k.gain >= 0 ? "+" : ""}${fmt(k.gain)} (${(k.pct * 100).toFixed(1)}%)</b></div><div><small>Realized + dividends</small><b class="${k.real + k.div >= 0 ? "pos" : "neg"}">${fmt(k.real + k.div)}</b></div></div>
  ${k.units > 0 ? `<p class="note">${+k.units.toFixed(4)} ${t[2]} · average cost ${fmt(k.cost / k.units)} per ${t[2].replace(/s$/, "")}</p>` : ""}
  <div class="chart" style="height:180px"><canvas id="cInv"></canvas></div>
  <div class="ivact"><button class="btn sm" data-a="buy">＋ Buy more</button><button class="btn ghost sm" data-a="val">↻ Update value</button><button class="btn ghost sm" data-a="sell">Sell</button><button class="btn ghost sm" data-a="div">Dividend</button></div>
  <div id="ivForm"></div>
  <h4 style="margin:16px 0 6px">History</h4><div class="txl">${[...h.tx].map((x, i) => [x, i]).sort((a, b) => a[0].d < b[0].d ? 1 : -1).map(([x, i]) => `<div class="tx"><span>${x.d}</span><span>${lbl[x.k]}${x.u ? ` · ${x.u} ${t[2]}` : x.k === "sell" && x.pct ? ` · ${x.pct}%` : ""}</span><b>${fmt(x.amt)}</b><button class="mini" data-del="${i}" aria-label="Delete entry">✕</button></div>`).join("")}</div>
  <div class="ctrls" style="margin-top:14px"><button class="btn ghost" id="ivRen">Rename</button><button class="btn danger" id="ivDel">Delete investment</button><button class="btn ghost" id="ivClose">Close</button></div>`;
  c.querySelector("h2").textContent = h.n || t[1];
  const hk = Object.keys(k.hist).sort();
  const ch = new Ch("cInv");
  ANIM = false;
  ch.set({ labels: hk.map(x => `${MN[+x.slice(5) - 1]} ${x.slice(2, 4)}`), series: [{ label: "Value", kind: "line", width: 3, color: "var(--gold)", data: hk.map(x => k.hist[x]) }] });
  c.querySelector(".ivact").onclick = e => {
    const b = e.target.closest("button");
    if (!b)
      return;
    const kind = b.dataset.a;
    $("ivForm").innerHTML = `<div class="ivf">${invForm(kind, h)}<div class="ctrls" style="margin-top:10px"><button class="btn" id="ivOk">Save</button></div></div>`;
    const p = $("iv-p");
    if (p)
      p.oninput = () => $("iv-pv").textContent = p.value + "%";
    $("iv-a").focus();
    $("ivOk").onclick = () => {
      const r = readTx(kind, h);
      if (!r) {
        toast("Please enter the amount");
        return;
      }
      if (kind === "sell" && r.tx.u > invCalc(h).units + 1e-9) {
        toast("You can't sell more than you hold");
        return;
      }
      h.tx.push(r.tx);
      applyCash(kind, r.tx, r.c, h, h.n);
      if (kind === "sell" && invCalc(h).value <= 0.5 && invCalc(h).units <= 1e-9)
        toast("Fully sold. Keep it for history or delete it.");
      invSync();
      change(true);
      renderPort();
      openInv(h.id);
      toast("✓ Saved");
    };
  };
  c.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { if (h.tx.length < 2)
    return toast("Delete the investment instead"); if (!confirm("Delete this entry?"))
    return; h.tx.splice(+b.dataset.del, 1); invSync(); change(true); renderPort(); openInv(h.id); });
  $("ivRen").onclick = () => { const n = prompt("Name", h.n || ""); if (n !== null) {
    h.n = n.trim().slice(0, 80);
    change(true);
    renderPort();
    openInv(h.id);
  } };
  $("ivDel").onclick = () => { if (!confirm(`Delete "${h.n || t[1]}" and its history?`))
    return; S.inv = S.inv.filter(x => x.id !== h.id); invSync(); if (!S.inv.some(x => x.type !== "gold" && x.type !== "silver"))
    S.assets.stocks = S.assets.stocks; d.close(); change(true); renderPort(); invSync(); };
  $("ivClose").onclick = () => d.close();
  if (!d.open)
    d.showModal();
}
/* ---------- SPENDING CHECK-UP ---------- */
const COACH = [
  { k: "smoke", ic: "🚭", n: "Smoking / vaping", kw: ["smok", "cigar", "tobacco", "vape", "shisha", "hookah", "nicotine"], cut: 1, u: "day", tip: "Quitting is one of the best things you can do for your health and your wallet.", swap: "Put the savings into a gym membership or your investment fund." },
  { k: "subs", ic: "📺", n: "Subscriptions", kw: ["netflix", "spotify", "prime", "disney", "subscription", "abo", "hbo", "icloud", "youtube premium", "apple music", "streaming", "app store"], cut: .4, u: "month", tip: "Most people pay for services they rarely use.", swap: "Keep one or two, cancel the rest, and rotate every few months." },
  { k: "eat", ic: "🍔", n: "Eating out & takeaway", kw: ["restaurant", "eating out", "takeaway", "take away", "delivery", "uber eats", "lieferando", "foodpanda", "wolt", "deliveroo", "fast food", "mcdonald", "kfc", "pizza", "burger", "dining"], cut: .5, u: "week", tip: "Restaurant meals often cost 3–4× home cooking.", swap: "Cook in batches, keep eating out for special days." },
  { k: "coffee", ic: "☕", n: "Coffee & snacks out", kw: ["coffee", "starbucks", "café", "cafe", "latte", "snack", "bakery", "energy drink", "red bull", "soda"], cut: .6, u: "day", tip: "Small daily buys add up to a big yearly sum.", swap: "Make it at home or take a flask." },
  { k: "fun", ic: "🎬", n: "Cinema, outings & gaming", kw: ["cinema", "movie", "kino", "concert", "gaming", "games", "playstation", "xbox", "steam", "entertainment", "outing"], cut: .4, u: "month", tip: "Fun matters, but it should be planned, not automatic.", swap: "Set a fixed monthly fun budget and enjoy it guilt-free." },
  { k: "shop", ic: "🛍️", n: "Impulse shopping", kw: ["shopping", "clothes", "fashion", "amazon", "online shop", "shein", "temu", "aliexpress", "gadgets"], cut: .5, u: "month", tip: "Buying on impulse is the quickest way to turn salary into liabilities.", swap: "Wait 48 hours before any non-essential purchase." },
  { k: "ride", ic: "🚕", n: "Taxi & ride-hailing", kw: ["uber", "taxi", "careem", "bolt", "lyft", "indrive", "cab"], cut: .5, u: "week", tip: "Short rides are often cheaper by public transport or bike.", swap: "Use a monthly transit pass and walk short distances." },
  { k: "fees", ic: "🏦", n: "Bank fees, interest & late fees", kw: ["interest", "overdraft", "late fee", "bank fee", "penalty", "credit card"], cut: 1, u: "month", tip: "Fees and interest buy you nothing and riba is best avoided.", swap: "Pay off cards, set reminders, switch to a fee-free halal account." },
  { k: "bet", ic: "🎰", n: "Lottery & betting", kw: ["lottery", "lotto", "betting", "bet", "casino", "gamble"], cut: 1, u: "week", tip: "Designed to make you lose over time, and not permitted in Islam.", swap: "Redirect it to a small monthly investment. That's a sure win." }
];
const UMUL = { day: 30.4, week: 4.33, month: 1 };
function coachScan() {
  const ks = logged().slice(-3), n = ks.length || 1, found = {};
  ks.forEach(k => (S.log[k].expenses || []).forEach(x => { const nm = (x.n || "").toLowerCase(); const r = COACH.find(c => c.kw.some(w => nm.includes(w))); if (r && x.a > 0) {
    (found[r.k] = found[r.k] || { amt: 0, items: new Set() }).amt += x.a / n;
    found[r.k].items.add(x.n);
  } }));
  return COACH.map(c => { const man = nz((S.coach || {})[c.k]) * UMUL[c.u], det = found[c.k]?.amt || 0, m = Math.max(man, det); return { ...c, m, det, man, save: m * c.cut, items: found[c.k] ? [...found[c.k].items] : [] }; });
}
const fv10 = m => { const r = .07 / 12; return m * ((1 + r) ** 120 - 1) / r; };
function renderCoach() {
  const box = $("coach");
  if (!box)
    return;
  const R = coachScan(), hit = R.filter(x => x.m > 0), tot = hit.reduce((s, x) => s + x.save, 0);
  $("coachTot").innerHTML = tot > 0 ? `You could free up <b>${fmt(tot)}</b> a month (${fmt(tot * 12)} a year). Invested for 10 years at 7%, that's about <b>${fmt(fv10(tot))}</b>.` : "Nothing flagged yet. Name your expenses clearly in Months (e.g. \"Netflix\", \"Eating out\"), or add daily habits below.";
  $("coachUse").hidden = !(tot > 0);
  box.innerHTML = "";
  const more = document.createElement("details");
  more.className = "ccmore";
  more.innerHTML = `<summary>Check other habits (${R.filter(x => !(x.m > 0)).length})</summary><div class="ccgrid"></div>`;
  [...R].sort((a, b) => b.save - a.save).forEach(x => {
    const d = document.createElement("div");
    d.className = "cc" + (x.m > 0 ? " hit" : "");
    d.innerHTML = `<div class="cch"><span class="li">${x.ic}</span><div><b></b><small></small></div>${x.m > 0 ? `<span class="ccs">save ~${fmt(x.save)}/mo</span>` : ""}</div>
  <p class="cct"></p><p class="ccw">💡 <span></span></p><div class="ccin"><label>My spending per ${x.u}</label><input type="number" inputmode="decimal" min="0" placeholder="0" aria-label="${x.n} per ${x.u}"></div>`;
    d.querySelector("b").textContent = x.n;
    d.querySelector("small").textContent = x.m > 0 ? `${fmt(x.m)} a month${x.det ? ` · found in: ${x.items.slice(0, 3).join(", ")}` : ""}` : "Not found in your expenses";
    d.querySelector(".cct").textContent = x.tip;
    d.querySelector(".ccw span").textContent = x.swap;
    const inp = d.querySelector("input");
    inp.value = (S.coach || {})[x.k] || "";
    inp.onchange = () => { S.coach = S.coach || {}; S.coach[x.k] = Math.max(0, nz(inp.value)); change(); renderCoach(); };
    (x.m > 0 ? box : more.querySelector(".ccgrid")).append(d);
  });
  if (more.querySelector(".ccgrid").children.length)
    box.append(more);
  const ov = $("ovSave");
  if (ov) {
    ov.hidden = !(tot > 0);
    if (tot > 0)
      ov.querySelector("span").innerHTML = `💡 You could save about <b>${fmt(tot)}</b> a month on ${hit.slice(0, 2).map(x => x.n.toLowerCase()).join(" and ")}${hit.length > 2 ? " and more" : ""}.`;
  }
}
/* ---------- LEARN: the guide ---------- */
const BOOKS = { rd: ["Rich Dad Poor Dad", "Robert Kiyosaki"], cq: ["Cashflow Quadrant", "Robert Kiyosaki"], tg: ["Think and Grow Rich", "Napoleon Hill"], bb: ["The Richest Man in Babylon", "George S. Clason"], pm: ["The Psychology of Money", "Morgan Housel"], mn: ["The Millionaire Next Door", "Thomas Stanley & William Danko"], ah: ["Atomic Habits", "James Clear"], lb: ["The Little Book of Common Sense Investing", "John C. Bogle"], ii: ["The Intelligent Investor", "Benjamin Graham"] };
const bk = k => `<span class="bchip">📖 ${BOOKS[k][0]}</span>`;
function lstats() {
  const b = base(), ks = logged().slice(-6), a = agg(ks), n = ks.length || 1, tin = a.tin / n, out = (a.exp + a.give) / n, rate = tin ? (tin - out) / tin : 0;
  const emM = b.exp ? (+S.assets.emergency || 0) / b.exp : 0, lp = (S.bs?.liab || []).reduce((s, x) => s + (+x.p || 0), 0) + portTot().lp, assets = (+S.assets.stocks || 0) + (+S.assets.gold || 0) + portTot().val;
  return { b, n: ks.length, tin, out, rate, emM, lp, assets, ext: a.ext / n, pas: a.pas / n, stocks: +S.assets.stocks || 0 };
}
const STEPS = [
  { id: "why", t: "Decide your why", b: ["tg"], tab: "lr",
    idea: "Wealth starts with a burning, specific goal, not a vague wish. Hill found that people who achieved big things knew exactly what they wanted, by when, and what they would give in return.",
    why: "A clear purpose makes saving feel like a choice, not a sacrifice. When you're tempted to spend, you remember what it is for.",
    act: ["Write your purpose above: an amount, a date and what you'll do to get there", "Read it every morning and every night", "Make a plan today, even if it's imperfect. Improve it as you go"],
    chk: s => ({ ok: (S.learn.purpose || "").trim().length >= 25, note: (S.learn.purpose || "").trim().length >= 25 ? "Your purpose is written. Read it daily." : "Write your purpose statement at the top of this page." }) },
  { id: "track", t: "Know where your money goes", b: ["rd", "mn"], tab: "lg",
    idea: "Financial education starts with your own numbers. Wealthy people tend to read their income statement and balance sheet like a scoreboard. Many of us were simply never taught to.",
    why: "You can't improve what you don't measure. Self-made millionaires tend to know exactly what they spend, month after month.",
    act: ["Log this month in Monthly entries", "Log at least 3 months to see your real pattern", "Check the Overview: which category is the biggest?"],
    chk: s => ({ ok: s.n >= 3, note: `${s.n} of 3 months logged.` }) },
  { id: "payfirst", t: "Pay yourself first", b: ["bb", "rd"], tab: "lg",
    idea: "Before paying anyone else, keep a part of every income for yourself, at least one tenth. Move it on salary day, then live on the rest. The Babylon lesson is simple: a part of all you earn is yours to keep.",
    why: "If you save what's left after spending, nothing is left. If you spend what's left after saving, you always save.",
    act: ["Set up an automatic transfer on salary day", "Start with 10%, raise it by 1–2% every few months", "Aim for 20% or more"],
    chk: s => ({ ok: s.n > 0 && s.rate >= .1, note: s.n ? `Your savings rate is ${Math.round(s.rate * 100)}%. ${s.rate >= .2 ? "Excellent." : s.rate >= .1 ? "Good. Now aim for 20%." : "Goal: 10% first."}` : "Log a month first." }) },
  { id: "below", t: "Live below your means", b: ["mn", "bb", "pm"], tab: "gr",
    idea: "Research on real millionaires found most of them live in ordinary homes, drive used cars and budget carefully. Wealth is the money you don't spend: the car you didn't buy, the upgrade you skipped.",
    why: "Lifestyle creep eats raises. When income rises, raise your savings first, not your spending.",
    act: ["Find your biggest expense on the Overview", "Try the What-if slider in Grow assets: cut €100–300 and see your freedom year move", "Wait 48 hours before any non-essential purchase"], manual: 1,
    chk: s => ({ ok: false, note: "Mark done when you've cut one recurring expense." }) },
  { id: "safety", t: "Build your safety net", b: ["bb", "pm"], tab: "zk",
    idea: "Protect what you have before chasing more. An emergency fund of 3–6 months of expenses keeps a surprise from turning into debt or forced selling.",
    why: "Housel calls this room for error: the ability to survive bad luck is what lets compounding keep working.",
    act: ["Open a separate account just for emergencies (no interest, if you prefer)", "Fill it to 3 months first, then 6", "Update the value in the Zakat tab"],
    chk: s => ({ ok: s.emM >= 3, note: `Covered: ${s.emM.toFixed(1)} of 3+ months of expenses.` }) },
  { id: "debt", t: "Stop buying liabilities", b: ["rd"], tab: "rd",
    idea: "A liability takes money out of your pocket every month: car finance, credit cards, buy-now-pay-later. Many people buy liabilities believing they are assets. Builders buy assets first and let those assets pay for luxuries.",
    why: "Debt payments are income you've already spent. In Islam, interest (riba) is forbidden, another reason to avoid consumer debt.",
    act: ["List every loan in the Rich Dad view", "Pay off the most expensive one first, then roll that payment into the next", "Before buying: does this put money in my pocket or take it out?"],
    chk: s => ({ ok: s.n > 0 && s.lp <= s.tin * .1, note: s.lp ? `Debt payments: ${fmt(s.lp)}/mo (${Math.round(s.lp / (s.tin || 1) * 100)}% of income). Aim under 10%, ideally zero.` : "No debt payments. Keep it that way." }) },
  { id: "assets", t: "Learn assets vs liabilities", b: ["rd"], tab: "rd",
    idea: "The single most important rule of Rich Dad: know the difference, and buy assets. An asset puts money in your pocket (shares, rental property, a business, royalties). A liability takes money out, even if you call it an investment.",
    why: "Wealth builders focus on their asset column, so their assets pay their expenses.",
    act: ["Take the pocket test in the lessons below", "Fill in your assets in the Rich Dad view", "Look at your cash flow pattern diagram"],
    chk: s => ({ ok: s.assets > 0, note: s.assets ? `Your assets: ${fmt(s.assets)}.` : "Add your first asset." }) },
  { id: "invest", t: "Make your money multiply", b: ["bb", "lb", "pm"], tab: "al",
    idea: "Money that sits still loses value to inflation. Put it to work in assets that grow. For most people, the simplest way is to buy a broad, low-cost fund every month and hold it for decades.",
    why: "Compounding needs time more than talent. Starting 10 years earlier often matters more than investing twice as much later.",
    act: ["Choose Shariah-screened ETFs or other halal options", "Invest the same amount every month, whatever the news says", "Never sell in panic. Check your plan once a year, not daily"],
    chk: s => ({ ok: s.stocks > 0 && s.stocks >= s.b.exp, note: s.stocks ? `Invested: ${fmt(s.stocks)}. ${s.stocks >= s.b.exp ? "Good start." : "Goal: at least one month of expenses invested."}` : "Make your first investment." }) },
  { id: "earn", t: "Raise your earning power", b: ["tg", "cq", "bb"], tab: "gr",
    idea: "Specialized knowledge and skills are what the market pays for. Kiyosaki describes four ways to earn: Employee, Self-employed, Business owner, Investor. B means a system that works without your presence (team, processes, software), not a shop you have to sit in. I means your money works for you.",
    why: "Saving has a limit; earning doesn't. Each new skill can become a service, a product or a business.",
    act: ["Learn one high-value skill this year", "Turn it into income, then into a system: write the process, hire or automate", "Build a mastermind: 2–5 ambitious people you meet regularly"],
    chk: s => ({ ok: s.ext > 0, note: s.ext ? `Extra income: ${fmt(s.ext)}/mo. Now systemize it.` : "Start one extra income stream." }) },
  { id: "free", t: "Grow passive income and give", b: ["rd", "tg", "pm"], tab: "gr",
    idea: "Freedom is when the income from your assets covers your expenses. Then working becomes a choice. Persist: almost every wealthy person had setbacks and kept going.",
    why: "Zakat and sadaqah purify wealth and bring barakah. Giving reminds you that money is a tool, not the goal. Know what is enough.",
    act: ["Reinvest dividends and rent until you reach freedom", "Pay zakat on time and give regularly", "Celebrate every 10% of expenses your passive income covers"],
    chk: s => { const c = s.out ? s.pas / s.out : 0; return { ok: c >= .1, note: `Passive income covers ${Math.round(c * 100)}% of your spending. ${c >= 1 ? "You are free." : "First milestone: 10%."}` }; } }
];
const LESSONS2 = [
  { id: "lit", tp: "Financial education", ic: "🎓", t: "The subject school forgot", b: ["rd"], x: "Most of us learn to work for money, but nobody teaches what to do with it. Financial education means four skills: reading your numbers (income, expenses, assets, liabilities), understanding how money grows, knowing the risks, and making money work for you. It's not about being good at maths. It's a habit of paying attention.", try: "Open the Rich Dad view and explain your own diagram to yourself in one sentence." },
  { id: "rat", tp: "Financial education", ic: "🐀", t: "How to leave the rat race", b: ["rd"], x: "Earn, spend, get a raise, spend more, repeat. That is the rat race. Fear (of not paying bills) and desire (for more things) keep people running. The exit isn't a higher salary. It's building a column of assets whose income grows until it covers your expenses.", try: "Look at your freedom ring on the Home tab. That number is your progress out of the race." },
  { id: "quad", tp: "Financial education", ic: "🔲", t: "The four ways to earn", b: ["cq"], x: "E: Employee, you have a job. S: Self-employed, you own a job. If you stop, the income stops. B: Business owner, you own a system that runs without you. I: Investor, your money works for you. There's nothing wrong with E or S, but your hours are limited. Freedom usually comes from adding B or I.", try: "Write down which quadrant your income comes from today, and one step toward B or I." },
  { id: "sys", tp: "Financial education", ic: "⚙️", t: "A business is a system, not your presence", b: ["cq", "rd"], x: "Selling something while you sit in the shop all day is self-employment. You own a job. A real business keeps earning when you're away: clear processes, a trusted team, and automation. Tech makes this easier than ever: an app with subscriptions, a website or SaaS that serves customers 24/7, an online store with automatic delivery, a course that sells while you sleep. Your role moves from doing the work to building and improving the system.", try: "List the tasks only you can do in your work or side business. Which one could become a written process, a hire or an automation?" },
  { id: "pocket", tp: "Assets & liabilities", ic: "👛", t: "The pocket test", b: ["rd"], quiz: 1, x: "Ignore what things are called. Ask one question: does this put money into my pocket every month, or take it out? Test yourself below.", try: "Apply the pocket test to the last 3 big things you bought." },
  { id: "home", tp: "Assets & liabilities", ic: "🏠", t: "Is your home an asset?", b: ["rd"], x: "For your cash flow, the home you live in usually takes money out: rent or mortgage, repairs, taxes, insurance. It may rise in value, and it gives security, which matters. Just don't confuse it with an asset that pays you. A rental property that earns more than it costs is an asset.", try: "Count the full monthly cost of your home, not only the rent or payment." },
  { id: "riba", tp: "Assets & liabilities", ic: "⚖️", t: "Debt, interest and riba", b: ["rd"], x: "Consumer debt makes you pay more for things that lose value. Interest grows against you just like compounding grows for you. Islam forbids riba, and avoiding interest-based debt also happens to be a strong financial strategy. If you have debt, pay the most expensive first and never add new consumer debt.", try: "Add every debt to the Rich Dad view and write your debt-free date." },
  { id: "pyf", tp: "Saving", ic: "💸", t: "Pay yourself first", b: ["bb", "rd"], x: "Treat your savings like the most important bill. On salary day, move a fixed share out before you can spend it. Start with 10%. The amount matters less than the habit, because habits compound too.", try: "Set up an automatic transfer for the day after payday." },
  { id: "rate", tp: "Saving", ic: "📏", t: "Your savings rate is the real score", b: ["pm", "mn"], x: "Income doesn't make you wealthy; the gap between income and spending does. Someone earning €3,000 who saves €900 is building wealth faster than someone earning €8,000 who saves nothing. Your savings rate decides how soon you can be free.", try: "Check your savings rate on the Home tab. Can you add 2%?" },
  { id: "creep", tp: "Saving", ic: "🎈", t: "Beat lifestyle creep", b: ["mn", "pm"], x: "Each raise quietly becomes a nicer car, a bigger flat, more subscriptions. Then you need the raise. The fix: when income goes up, save at least half of the increase before your lifestyle adjusts.", try: "Decide now what share of your next raise goes to investing." },
  { id: "comp", tp: "Investing", ic: "📈", t: "Compounding: let time do the work", b: ["pm", "bb"], calc: 1, x: "Your money earns returns, and then those returns earn returns. At first it's slow; later it's a snowball. Look at what a steady monthly amount can become:", try: "Use the Projection tab to see your own snowball." },
  { id: "mfm", tp: "Investing", ic: "🔁", t: "Make money from money", b: ["rd", "bb"], x: "At first you work for money. The goal is for money to work for you. Each euro you invest can earn dividends, rent or a profit share. Reinvest those earnings and they start earning too. Rich Dad calls it the I quadrant: your money becomes your employees. Halal ways include Shariah-screened shares, rental property, musharakah partnerships and owning businesses. Avoid interest income.", try: "Use the Snowball game: see how reinvested earnings grow. Then decide your monthly 'money employee' amount." },
  { id: "index", tp: "Investing", ic: "🧺", t: "Keep it simple and low-cost", b: ["lb", "ii"], x: "Picking winning stocks is hard, even for professionals. A broad fund that owns hundreds of companies spreads the risk, and low fees leave more for you. For a halal approach, choose Shariah-screened index funds that avoid interest-based banks, alcohol, gambling and highly indebted firms.", try: "Compare the yearly fee of any fund you hold. Under 0.5% is a good sign." },
  { id: "time", tp: "Investing", ic: "⏳", t: "Time in the market beats timing", b: ["ii", "pm"], x: "Markets fall regularly, sometimes hard. People who sell in panic lock in losses; people who keep buying get assets on sale. Graham taught to treat market moods like a moody neighbour offering prices: you can use his mood, you don't have to follow it.", try: "Write down now what you'll do in the next crash: keep investing monthly." },
  { id: "div", tp: "Investing", ic: "🥇", t: "Gold, property and business", b: ["bb", "rd"], x: "Spread your wealth across different kinds of assets: funds, physical gold, property and, when ready, business. Each behaves differently in bad times. Guard against loss: never invest in what you don't understand, and be careful with promises of quick, sure profit.", try: "Check your mix in Where to put savings." },
  { id: "purpose", tp: "Mindset", ic: "🔥", t: "Definite purpose", b: ["tg"], x: "Hill's core idea: fix in your mind the exact amount you want, set a date, decide what you'll give in return, make a plan and start at once. Write it and read it aloud morning and night until it becomes part of you.", try: "Write your purpose at the top of the Learn page." },
  { id: "persist", tp: "Mindset", ic: "🧗", t: "Persistence beats talent", b: ["tg", "ah"], x: "Most people give up at the first setback. Hill studied successful people and found they kept going after failure. Clear adds the how: build small systems, like a monthly transfer, and you don't need willpower every time.", try: "Make one money habit automatic this week." },
  { id: "mm", tp: "Mindset", ic: "🤝", t: "Your mastermind", b: ["tg"], x: "Surround yourself with people who think about growth. A small group that meets regularly to share ideas, push each other and solve problems multiplies what each person can do alone.", try: "Name 2–3 people you could start a money mastermind with." },
  { id: "enough", tp: "Mindset", ic: "🧭", t: "Know what is enough", b: ["pm"], x: "The goal isn't endless more. It's control over your time. Without a sense of enough, you keep moving the finish line and risk what you have for what you don't need.", try: "Write a number: what monthly passive income would make you free?" },
  { id: "zakat", tp: "Halal finance", ic: "🕌", t: "Zakat grows wealth", b: [], x: "Zakat purifies wealth and keeps money moving in society. 2.5% of savings above nisab, held for a lunar year. Track it like any other goal; don't wait for what's left over. Sadaqah too: giving builds gratitude and barakah.", try: "Check your zakat due in the Zakat tab and set a date to pay." },
  { id: "halal", tp: "Halal finance", ic: "✅", t: "Halal investing basics", b: [], x: "Halal growth means owning real things and sharing real risk: shares of permissible businesses, physical gold you own, property and trade, profit-sharing partnerships. Avoid interest income and interest-based loans. When unsure, ask a scholar you trust.", try: "Check if your funds are Shariah-screened." }
];
const QUIZ = [["The flat you live in, with a mortgage", "l"], ["A rental flat earning more than its costs", "a"], ["A car on finance", "l"], ["Shares in a dividend ETF", "a"], ["A phone bought with buy-now-pay-later", "l"], ["An app or e-book that sells every month", "a"]];
const STORIES = [
  { ic: "🐪", n: "Abdur Rahman ibn Awf (ra)", w: "Companion of the Prophet ﷺ · Sahih al-Bukhari 2048", d: "When he arrived in Madinah with nothing, his brother in faith Sa'd ibn ar-Rabi' offered him half of his wealth. He thanked him and asked only to be shown the market. Through honest trade he became one of the wealthiest companions, and he was famous for giving huge amounts in the path of Allah.", l: "Skill, honest trade and generosity, instead of depending on others." },
  { ic: "🐫", n: "Khadijah bint Khuwaylid (ra)", w: "Merchant of Makkah · Seerah of Ibn Hisham", d: "A respected businesswoman who financed trade caravans and hired trustworthy people to trade with her capital, including the Prophet ﷺ before his prophethood. Her capital worked while others did the travelling.", l: "Capital plus trusted people is a business that works without your presence." },
  { ic: "💧", n: "Uthman ibn Affan (ra)", w: "Companion of the Prophet ﷺ · Sahih al-Bukhari 2778, Jami' at-Tirmidhi 3703", d: "The people of Madinah had to buy water from the well of Rumah. Uthman bought the well and gave it as a waqf (endowment) so everyone could drink freely. The endowment linked to his name is still serving people today, centuries later.", l: "The best asset keeps giving long after you, as sadaqah jariyah." },
  { ic: "🧹", n: "Ronald Read", w: "Gas-station attendant and janitor, Vermont", d: "Lived simply, bought shares of solid dividend-paying companies for decades and held them. When he died in 2014, his estate was worth around $8 million, mostly left to his local hospital and library.", l: "Consistency and time beat a high salary." },
  { ic: "📄", n: "Grace Groner", w: "Secretary, Illinois", d: "Bought three shares of her employer, Abbott, in 1935 for $180, never sold, and reinvested the dividends. At her death in 2010 they were worth about $7 million, which she left to her college for scholarships.", l: "Buy an asset, hold it, reinvest." },
  { ic: "🗂️", n: "Sylvia Bloom", w: "Legal secretary, New York, 67 years", d: "Quietly bought small amounts of the same stocks her bosses invested in, year after year. She left over $8 million, most of it to scholarships for students in need.", l: "Small amounts, invested regularly, become a fortune." },
  { ic: "📊", n: "Warren Buffett", w: "Investor", d: "Bought his first shares at 11. By far most of his wealth was built after his 60th birthday, because compounding needs decades to show its power.", l: "Start early and be patient." }
];
const PRINCIPLES = ["An asset puts money in your pocket. Buy those first.", "Keep a part of everything you earn. Pay yourself first.", "Your savings rate matters more than your salary.", "Write your goal, set a date, read it daily.", "Wealth is what you don't see: the money you didn't spend.", "Time in the market beats timing the market.", "Every raise: save half before your lifestyle notices.", "Protect what you have before you chase more.", "Skills are the asset nobody can take from you.", "Persistence is the difference between a wish and a result.", "Zakat doesn't reduce wealth. It purifies and blesses it.", "Know what is enough, then stop moving the finish line."];
const LEVELS = [[0, "Beginner", "🌱"], [3, "Saver", "💪"], [5, "Builder", "🧱"], [7, "Investor", "📈"], [9, "Almost free", "🚀"], [10, "Financially free", "🕊"]];
function stepState() { const s = lstats(); return STEPS.map(st => { const c = st.chk(s); return { ...st, c, done: c.ok || !!S.learn.done[st.id] }; }); }
function confetti() {
  if (RM)
    return;
  const box = document.createElement("div");
  box.className = "confetti";
  for (let i = 0; i < 70; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "%";
    p.style.background = ["var(--gold)", "var(--green)", "var(--sky)", "var(--rose)", "var(--plum)"][i % 5];
    p.style.animationDelay = Math.random() * .4 + "s";
    p.style.setProperty("--dx", (Math.random() * 2 - 1) * 120 + "px");
    p.style.setProperty("--r", Math.random() * 720 + "deg");
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 2600);
}
let LTOPIC = "All", LPREV = null;
function renderLearn() {
  S.learn = S.learn || { done: {}, read: {}, purpose: "" };
  S.learn.done = S.learn.done || {};
  S.learn.read = S.learn.read || {};
  S.learn.quiz = S.learn.quiz || {};
  S.learn.games = S.learn.games || {};
  const st = stepState(), done = st.filter(x => x.done).length, cur = st.find(x => !x.done), lv = [...LEVELS].reverse().find(l => done >= l[0]);
  if (LPREV !== null && done === LPREV + 1) {
    confetti();
    toast(`🎉 Step complete! ${done}/10`);
  }
  LPREV = done;
  // overview card
  const ov = $("ovNext");
  if (ov) {
    ov.querySelector(".nx-t").textContent = cur ? `Step ${st.indexOf(cur) + 1}: ${cur.t}` : "All 10 steps complete. Keep going!";
    ov.querySelector(".nx-n").textContent = cur ? cur.c.note : "Review your plan every month.";
    ov.querySelector(".nx-bar i").style.width = done * 10 + "%";
    ov.querySelector(".nx-p").textContent = `${done}/10 · ${lv[2]} ${lv[1]}`;
    const pr = (S.learn.purpose || "").trim();
    ov.querySelector(".nx-pur").hidden = !pr;
    ov.querySelector(".nx-pur span").textContent = pr;
  }
  $("dPrin").textContent = PRINCIPLES[Math.floor(Date.now() / 864e5) % PRINCIPLES.length];
  if (!$("lr").classList.contains("on"))
    return;
  $("lLvl").textContent = `${lv[2]} ${lv[1]}`;
  $("lCnt").textContent = `${done} of 10 steps`;
  requestAnimationFrame(() => $("lBar").style.width = done * 10 + "%");
  if (document.activeElement !== $("lPur"))
    $("lPur").value = S.learn.purpose || "";
  // steps
  const box = $("lSteps"), open = [...box.querySelectorAll("details[open]")].map(d => d.dataset.id);
  box.innerHTML = "";
  st.forEach((x, i) => {
    const d = document.createElement("details");
    d.className = "step2" + (x.done ? " done" : x === cur ? " now" : "");
    d.dataset.id = x.id;
    if (open.includes(x.id) || (!open.length && x === cur))
      d.open = true;
    d.innerHTML = `<summary><span class="num">${x.done ? "✓" : i + 1}</span><span class="st"><b></b><small></small></span><span class="tag">${x.done ? "Done" : x === cur ? "Your next step" : ""}</span></summary>
  <div class="sbody"><p class="idea"></p><p class="why"><b>Why it matters:</b> <span></span></p><div class="books">${x.b.map(bk).join("")}</div>
  <h4>Do this</h4><ul>${x.act.map(() => "<li></li>").join("")}</ul><div class="chk"><span></span></div>
  <div class="ctrls"><button class="btn sm go">Open ${({ lg: "Monthly entries", rd: "Rich Dad view", zk: "Zakat tab", al: "Savings plan", gr: "Grow assets", lr: "purpose" })[x.tab]}</button>${x.c.ok ? "" : `<button class="btn ghost sm mk">${S.learn.done[x.id] ? "Undo done" : "Mark as done"}</button>`}</div></div>`;
    d.querySelector(".st b").textContent = x.t;
    d.querySelector(".st small").textContent = x.c.note;
    d.querySelector(".idea").textContent = x.idea;
    d.querySelector(".why span").textContent = x.why;
    d.querySelectorAll("li").forEach((li, j) => li.textContent = x.act[j]);
    d.querySelector(".chk span").textContent = (x.c.ok ? "✅ " : "⏳ ") + x.c.note;
    d.querySelector(".go").onclick = () => x.tab === "lr" ? $("lPur").focus() : showTab(x.tab);
    const mk = d.querySelector(".mk");
    if (mk)
      mk.onclick = () => { S.learn.done[x.id] = !S.learn.done[x.id]; change(); };
    box.append(d);
  });
  renderPlay();
  renderWis();
  renderMind();
  // lessons
  const tps = ["All", ...new Set(LESSONS2.map(l => l.tp))];
  $("lTopics").innerHTML = "";
  tps.forEach(t => { const b = document.createElement("button"); b.textContent = t; b.className = t === LTOPIC ? "on" : ""; b.onclick = () => { LTOPIC = t; renderLearn(); }; $("lTopics").append(b); });
  const lb = $("lLessons");
  lb.innerHTML = "";
  const rd = Object.keys(S.learn.read).length;
  $("lRead").textContent = `${rd}/${LESSONS2.length} read`;
  LESSONS2.filter(l => LTOPIC === "All" || l.tp === LTOPIC).forEach(l => {
    const c = document.createElement("button");
    c.className = "lcard" + (S.learn.read[l.id] ? " rd" : "");
    c.innerHTML = `<span class="li">${l.ic}</span><span class="lt"><small></small><b></b></span><span class="lk">${S.learn.read[l.id] ? "✓" : "→"}</span>`;
    c.querySelector("small").textContent = l.tp;
    c.querySelector("b").textContent = l.t;
    c.onclick = () => openLesson(l);
    lb.append(c);
  });
  // stories + books (static, once)
  if (!$("lStories").children.length) {
    STORIES.forEach(x => {
      const c = document.createElement("div");
      c.className = "story";
      c.innerHTML = `<div class="sh"><span>${x.ic}</span><div><b></b><small></small></div></div><p></p><p class="les"></p>`;
      c.querySelector("b").textContent = x.n;
      c.querySelector("small").textContent = x.w;
      c.querySelector("p").textContent = x.d;
      c.querySelector(".les").textContent = "Lesson: " + x.l;
      $("lStories").append(c);
    });
    Object.entries(BOOKS).forEach(([k, [t, a]]) => {
      const u = STEPS.filter(s => s.b.includes(k)).map(s => STEPS.indexOf(s) + 1);
      const c = document.createElement("div");
      c.className = "book";
      c.innerHTML = `<b></b><small></small><span>${u.length ? "Steps " + u.join(", ") : "Lessons"}</span>`;
      c.querySelector("b").textContent = t;
      c.querySelector("small").textContent = a;
      $("lBooks").append(c);
    });
  }
}
function openLesson(l) {
  const d = $("lessonD"), c = $("lessonC");
  c.innerHTML = `<div class="lh"><span class="li big">${l.ic}</span><div><small></small><h2></h2></div></div><div class="books">${l.b.map(bk).join("")}</div><p class="lx"></p><div id="lExtra"></div><div class="try"><b>Try this:</b> <span></span></div>`;
  c.querySelector("small").textContent = l.tp;
  c.querySelector("h2").textContent = l.t;
  c.querySelector(".lx").textContent = l.x;
  c.querySelector(".try span").textContent = l.try;
  const ex = c.querySelector("#lExtra");
  if (l.calc) {
    const r = .07 / 12, pm = 300, fv = y => pm * ((1 + r) ** (y * 12) - 1) / r;
    ex.innerHTML = `<div class="calc">${[10, 20, 30].map(y => `<div><small>${y} years</small><b>${fmt(fv(y))}</b><span>you put in ${fmt(pm * 12 * y)}</span></div>`).join("")}</div><p class="note">${fmt(pm)} a month at an assumed 7% yearly return. Real returns vary; this shows the shape, not a promise.</p>`;
  }
  if (l.quiz) {
    let sc = 0, ans = 0;
    ex.innerHTML = `<div class="quiz"></div><p class="qres"></p>`;
    const q = ex.querySelector(".quiz");
    QUIZ.forEach(([t, k]) => {
      const r = document.createElement("div");
      r.className = "qrow";
      r.innerHTML = `<span></span><div><button data-a="a">Asset</button><button data-a="l">Liability</button></div>`;
      r.firstChild.textContent = t;
      r.onclick = e => {
        const b = e.target.closest("button");
        if (!b || r.dataset.done)
          return;
        r.dataset.done = 1;
        ans++;
        const ok = b.dataset.a === k;
        if (ok)
          sc++;
        b.classList.add(ok ? "ok" : "bad");
        if (!ok)
          r.querySelector(`[data-a="${k}"]`).classList.add("ok");
        if (ans === QUIZ.length)
          ex.querySelector(".qres").textContent = sc === QUIZ.length ? "🎉 Perfect! You think like a rich dad." : `${sc}/${QUIZ.length}. Remember: ask whether it puts money in your pocket.`;
      };
      q.append(r);
    });
  }
  const done = document.createElement("button");
  done.className = "btn";
  done.style.marginTop = "14px";
  done.textContent = S.learn.read[l.id] ? "✓ Read" : "Mark as read";
  done.onclick = () => { S.learn.read[l.id] = 1; change(); d.close(); const left = LTP(l.tp).filter(x => !S.learn.read[x.id]).length; toast(left ? `✓ Lesson complete · ${left} more to unlock the ${l.tp} quiz` : `🔓 ${l.tp} quiz unlocked!`); renderLearn(); };
  c.append(done);
  d.showModal();
}
/* ---------- Islamic wisdom & money mindsets ---------- */
const WIS = [
  ["📈", "Allah has permitted trade and forbidden riba.", "Quran, al-Baqarah 2:275", "Grow wealth through real trade and ownership, not interest."],
  ["🌾", "Spending in Allah's way is like a grain that grows seven ears, with a hundred grains in each ear.", "Quran, al-Baqarah 2:261", "Giving is an investment with the greatest return."],
  ["⚖️", "Those who, when they spend, are neither wasteful nor stingy, but take a balanced way between.", "Quran, al-Furqan 25:67", "Live below your means without being miserly."],
  ["💝", "Charity does not decrease wealth.", "Sahih Muslim 2588", "Pay zakat and give sadaqah with confidence."],
  ["🤲", "The upper hand is better than the lower hand.", "Sahih al-Bukhari 1429", "Aim to be the one who gives, not the one who needs."],
  ["🛠️", "No one has eaten better food than what he earned with his own hands. Prophet Dawud (as) ate from the work of his hands.", "Sahih al-Bukhari 2072", "Honest work and skills are honourable."],
  ["🪓", "Taking a rope and gathering firewood to sell is better for you than asking people.", "Sahih al-Bukhari 1471", "Self-reliance first. Start with what you have."],
  ["🌳", "When a person dies, their deeds end except three: ongoing charity, beneficial knowledge, or a righteous child who prays for them.", "Sahih Muslim 1631", "Build assets that keep giving, even after you."],
  ["💎", "Richness is not having many possessions. True richness is contentment of the soul.", "Sahih al-Bukhari 6446, Sahih Muslim 1051", "Know what is enough. Wealth is a trust (amanah), not the goal."]
];
const MINDS = {
  s: { ic: "🛟", n: "Survival mindset", d: "Focused on getting through this month. Very common when money is tight. It's a situation, not a character.",
    rows: [["Money goes to", "Expenses, as soon as it arrives"], ["Usual thought", "\u201cI can't afford it.\u201d"], ["A raise means", "Finally some breathing room"], ["Debt is", "Sometimes the only option"], ["Time horizon", "This month"], ["Next step", "Pay yourself first, even 5%. Build a small emergency fund."]] },
  c: { ic: "🏠", n: "Comfort mindset", d: "Works hard, earns well and wants security. Often buys liabilities that feel like assets.",
    rows: [["Money goes to", "Bigger home, car, upgrades, often on credit"], ["Usual thought", "\u201cI'll be safe if I work harder.\u201d"], ["A raise means", "A better lifestyle"], ["Debt is", "Normal: everyone has a car loan"], ["Time horizon", "The next promotion"], ["Next step", "Save half of every raise. Stop buying liabilities. Buy your first asset."]] },
  b: { ic: "🧱", n: "Builder mindset", d: "Uses income to buy assets, and lets assets pay for the lifestyle. Anyone can learn it, at any income.",
    rows: [["Money goes to", "Assets first, then lifestyle from asset income"], ["Usual thought", "\u201cHow can I afford it?\u201d"], ["A raise means", "More money to invest"], ["Debt is", "Avoided for consumption; riba avoided entirely"], ["Time horizon", "10–30 years"], ["Next step", "Build systems that work without you. Make money work for you. Give generously."]] }
};
const MQ = [["You get an unexpected €1,000. First thought?", ["Pay bills I'm behind on", "Treat myself, I earned it", "Invest it or start something"]],
  ["Your salary rises by 10%.", ["Relief, finally enough", "Upgrade my car or flat", "Raise my monthly investing"]],
  ["You want something expensive.", ["I can't afford it", "Buy it now on instalments", "How can I afford it? Buy an asset that pays for it"]],
  ["How do you see learning about money?", ["No time, too stressed", "My job is enough", "I study it regularly"]],
  ["What does your money do at night?", ["Nothing, it's already spent", "Sits in my account", "Works: dividends, rent, a business"]]];
let MSEL = "b";
function renderMind() {
  const m = MINDS[MSEL], box = $("mBody");
  if (!box)
    return;
  document.querySelectorAll("#mSeg button").forEach(b => b.classList.toggle("on", b.dataset.m === MSEL));
  box.innerHTML = `<div class="mhead"><span>${m.ic}</span><div><b>${m.n}</b><p></p></div></div>${m.rows.map(() => `<div class="kv"><span></span><b></b></div>`).join("")}`;
  box.querySelector("p").textContent = m.d;
  box.querySelectorAll(".kv").forEach((r, i) => { r.children[0].textContent = m.rows[i][0]; r.children[1].textContent = m.rows[i][1]; });
  box.classList.remove("rise");
  void box.offsetWidth;
  box.classList.add("rise");
}
function mindQuiz() {
  let i = 0;
  const sc = { s: 0, c: 0, b: 0 }, K = ["s", "c", "b"];
  const draw = () => {
    if (i >= MQ.length) {
      const top = K.reduce((a, k) => sc[k] > sc[a] ? k : a, "s"), m = MINDS[top];
      S.learn.mind = top;
      change();
      $("playC").innerHTML = `<div class="qend"><div class="big">${m.ic}</div><h2>Mostly: ${m.n}</h2><p>${m.d}</p><div class="cflesson"><p><b>Your next step:</b> ${m.rows[5][1]}</p><p>Builder answers: ${sc.b}/5. Mindsets change with small habits, one decision at a time.</p></div><div class="ctrls" style="justify-content:center"><button class="btn" id="mqC">Done</button></div></div>`;
      $("mqC").onclick = () => { $("playD").close(); MSEL = top; renderMind(); };
      return;
    }
    const [q, o] = MQ[i];
    $("playC").innerHTML = `<small class="qtop">Self-check · ${i + 1}/${MQ.length}</small><div class="qprog"><i style="width:${i / MQ.length * 100}%"></i></div><h2 class="qq"></h2><div class="qopts"></div><p class="note">No right or wrong. Just be honest with yourself.</p>`;
    $("playC").querySelector(".qq").textContent = q;
    o.map((t, j) => [t, K[j]]).sort(() => Math.random() - .5).forEach(([t, k]) => { const b = document.createElement("button"); b.textContent = t; b.onclick = () => { sc[k]++; i++; draw(); }; $("playC").querySelector(".qopts").append(b); });
  };
  openPlay("", draw);
}
function renderWis() {
  const w = $("lWis");
  if (!w || w.children.length)
    return;
  WIS.forEach(([ic, t, ref, les]) => {
    const c = document.createElement("div");
    c.className = "wis";
    c.innerHTML = `<span class="wi">${ic}</span><p class="wt"></p><small class="wr"></small><p class="wl"></p>`;
    c.querySelector(".wt").textContent = t;
    c.querySelector(".wr").textContent = ref;
    c.querySelector(".wl").textContent = les;
    w.append(c);
  });
}
/* ---------- PLAY & PRACTICE ---------- */
const TQ = {
  "Financial education": [["What is the real way out of the rat race?", ["A bigger salary", "Assets whose income covers your expenses", "Spending nothing ever", "Luck"], 1, "A raise usually gets spent. Assets that pay you are the exit."],
    ["In the Cashflow Quadrant, where do systems or money work for you?", ["E and S", "B and I", "E and I", "S and B"], 1, "Business owners own systems; investors own assets. Both earn without trading hours."],
    ["Financial education is mainly about…", ["Advanced maths", "Reading your numbers and making money work for you", "Stock tips", "Getting loans"], 1, "Know your income, expenses, assets and liabilities, then act on them."],
    ["You get a €500 monthly raise. What does the rat race do with it?", ["Invests it", "Upgrades lifestyle and spends it", "Gives it away", "Saves it all"], 1, "Lifestyle creep turns every raise into new expenses."]],
  "Assets & liabilities": [["The simplest test for an asset?", ["It's expensive", "It puts money in your pocket every month", "The bank calls it an asset", "It looks impressive"], 1, "The pocket test: money in = asset, money out = liability."],
    ["A new car on finance is usually…", ["An asset", "A liability", "Passive income", "A store of value"], 1, "Monthly payments, insurance and repairs take money out, and it loses value."],
    ["A flat earns €900 rent but costs €1,000 a month. It is…", ["An asset", "A liability", "Neutral", "Passive income"], 1, "It takes €100 a month out of your pocket. Fix costs or raise rent."],
    ["Why avoid interest-based consumer debt?", ["It's always cheap", "Interest compounds against you, and riba is forbidden", "Banks may close", "It raises your income"], 1, "Compounding works against you, and Islam prohibits riba."]],
  "Saving": [["'Pay yourself first' means…", ["Buy treats first", "Save a fixed share as soon as income arrives", "Pay bills, then save what's left", "Ask for a raise"], 1, "Move savings out on payday, then live on the rest."],
    ["A earns 3,000 and saves 900. B earns 8,000 and saves 200. Who builds wealth faster?", ["A", "B", "Same", "Can't say"], 0, "Savings rate beats income. A saves 30%, B only 2.5%."],
    ["A good emergency fund covers…", ["One week", "3 to 6 months of expenses", "5 years", "Nothing, use a credit card"], 1, "Enough to survive surprises without debt."],
    ["Best defence against lifestyle creep?", ["Save at least half of every raise", "Refuse raises", "Only cheaper food", "Use credit cards"], 0, "Lock in the extra before your lifestyle notices it."]],
  "Investing": [["Compounding means…", ["Returns earn more returns", "Fees grow", "Prices always rise", "Interest you pay"], 0, "Growth on top of growth. Slow at first, huge later."],
    ["The biggest advantage of starting early?", ["Lower taxes", "More time for compounding", "Guaranteed returns", "Easier stock picking"], 1, "Time is the engine of compounding."],
    ["The market crashes 25%. A long-term investor should usually…", ["Sell everything", "Keep investing according to the plan", "Borrow to gamble", "Stop forever"], 1, "Buying during a sale and holding is how long-term investors win."],
    ["Why do low fees matter?", ["They don't", "Fees compound against you for decades", "High fees mean better funds", "They're refunded"], 1, "1% a year can eat a big part of your final wealth."]],
  "Mindset": [["A definite purpose includes…", ["A wish", "An exact amount, a date and a plan", "A vision board only", "Telling everyone"], 1, "Specific, dated and backed by action."],
    ["A mastermind is…", ["A genius", "A small group that pushes each other forward", "A course", "A tip service"], 1, "People who share ideas and keep each other accountable."],
    ["Why does persistence matter?", ["Success is instant", "Most results come after setbacks", "Talent is enough", "It doesn't"], 1, "Those who keep going after failure are the ones who arrive."],
    ["Knowing what is 'enough' helps you…", ["Earn more", "Avoid risking what you have for what you don't need", "Spend more", "Retire later"], 1, "Without enough, the finish line keeps moving."]],
  "Halal finance": [["Zakat on savings above nisab held a lunar year is…", ["1%", "2.5%", "5%", "10%"], 1, "2.5% of zakatable wealth."],
    ["Nisab based on gold is about…", ["20 g", "85 g", "200 g", "1 kg"], 1, "85 grams of gold, about 7.5 tola."],
    ["Which is halal-friendly growth?", ["Interest savings account", "Shariah-screened shares", "Payday loan", "Gambling"], 1, "Owning real businesses that pass screening."],
    ["Musharakah is…", ["An interest loan", "A profit-and-loss sharing partnership", "Insurance", "A tax"], 1, "Partners share profit and risk, with no fixed interest."]]
};
const LTP = t => LESSONS2.filter(l => l.tp === t);
function knowStats() { const L = S.learn; return { read: Object.keys(L.read || {}).length, quiz: Object.values(L.quiz || {}).filter(v => v >= 3).length, games: Object.keys(L.games || {}).length }; }
function openPlay(html, onReady) { const d = $("playD"); $("playC").innerHTML = html; d.showModal(); onReady && onReady($("playC")); }
$("playX").onclick = () => $("playD").close();
$("playD").addEventListener("click", e => { if (e.target === $("playD"))
  $("playD").close(); });
function markGame(k, v) { S.learn.games = S.learn.games || {}; const o = S.learn.games[k]; if (o === undefined || v > o)
  S.learn.games[k] = v; change(); }
/* topic quiz */
function runQuiz(tp) {
  const Q = TQ[tp];
  let i = 0, sc = 0;
  const draw = () => {
    if (i >= Q.length) {
      const pass = sc >= 3;
      S.learn.quiz = S.learn.quiz || {};
      S.learn.quiz[tp] = Math.max(S.learn.quiz[tp] || 0, sc);
      change();
      if (pass)
        confetti();
      $("playC").innerHTML = `<div class="qend"><div class="big">${pass ? "🏅" : "📚"}</div><h2>${sc}/${Q.length}</h2><p>${pass ? `Badge earned: <b>${tp}</b>` : "Read the lessons again and retry. You need 3 of 4."}</p><div class="ctrls" style="justify-content:center"><button class="btn" id="qAgain">Try again</button><button class="btn ghost" id="qClose">Done</button></div></div>`;
      $("qAgain").onclick = () => runQuiz(tp);
      $("qClose").onclick = () => $("playD").close();
      renderLearn();
      return;
    }
    const [q, o, c, ex] = Q[i];
    $("playC").innerHTML = `<small class="qtop">${tp} quiz · ${i + 1}/${Q.length}</small><div class="qprog"><i style="width:${i / Q.length * 100}%"></i></div><h2 class="qq"></h2><div class="qopts"></div><p class="qex" hidden></p><button class="btn" id="qNext" hidden>${i + 1 < Q.length ? "Next →" : "See result"}</button>`;
    $("playC").querySelector(".qq").textContent = q;
    o.forEach((t, j) => {
      const b = document.createElement("button");
      b.textContent = t;
      b.onclick = () => {
        if ($("playC").dataset.ans)
          return;
        $("playC").dataset.ans = 1;
        b.classList.add(j === c ? "ok" : "bad");
        $("playC").querySelectorAll(".qopts button")[c].classList.add("ok");
        if (j === c)
          sc++;
        const e = $("playC").querySelector(".qex");
        e.hidden = false;
        e.textContent = (j === c ? "✅ " : "❌ ") + ex;
        $("qNext").hidden = false;
      };
      $("playC").querySelector(".qopts").append(b);
    });
    delete $("playC").dataset.ans;
    $("qNext").onclick = () => { i++; draw(); };
  };
  openPlay("", draw);
}
/* snowball */
function playSnow() {
  openPlay(`<h2>❄️ The snowball</h2><p class="hint">Move the sliders. Watch how growth overtakes what you put in.</p>
 <div class="slider"><div><span>Invest per month</span><b id="sbM"></b></div><input type="range" id="sbm" min="50" max="2000" step="50" value="300"></div>
 <div class="slider"><div><span>Years</span><b id="sbY"></b></div><input type="range" id="sby" min="1" max="40" value="25"></div>
 <div class="slider"><div><span>Yearly return</span><b id="sbR"></b></div><input type="range" id="sbr" min="0" max="12" step="0.5" value="7"></div>
 <div class="calc"><div><small>You put in</small><b id="sbIn"></b></div><div><small>Growth earned</small><b id="sbG"></b></div><div><small>Total</small><b id="sbT"></b></div></div>
 <p class="sbmsg" id="sbMsg"></p><div class="chart"><canvas id="cSnow"></canvas></div>`, () => {
    const ch = new Ch("cSnow");
    const u = () => {
      const m = +$("sbm").value, y = +$("sby").value, r = +$("sbr").value / 1200;
      $("sbM").textContent = fmt(m);
      $("sbY").textContent = y + " yrs";
      $("sbR").textContent = $("sbr").value + "%";
      const L = [], P = [], G = [];
      let bal = 0;
      for (let k = 1; k <= y; k++) {
        for (let j = 0; j < 12; j++)
          bal = bal * (1 + r) + m;
        const put = m * 12 * k;
        L.push("Y" + k);
        P.push(put);
        G.push(Math.max(0, bal - put));
      }
      const put = m * 12 * y;
      $("sbIn").textContent = fmt(put);
      $("sbG").textContent = fmt(bal - put);
      $("sbT").textContent = fmt(bal);
      const cross = G.findIndex((g, k) => g > (m * 12));
      $("sbMsg").textContent = bal > put * 2 ? `🔥 Growth is ${Math.round((bal - put) / bal * 100)}% of your total. Your money works harder than you do.` : cross >= 0 ? `From year ${cross + 1}, growth earns more each year than you add.` : "Give it more time. Compounding is slow at first.";
      ANIM = false;
      ch.set({ labels: L, stacked: true, series: [{ label: "You put in", kind: "bar", color: "var(--sky)", data: P }, { label: "Growth", kind: "bar", color: "var(--green)", data: G }] });
    };
    ["sbm", "sby", "sbr"].forEach(id => $(id).oninput = u);
    u();
    markGame("snow", 1);
  });
}
/* early vs late */
function playFriends() {
  openPlay(`<h2>👫 Early Aisha vs Late Omar</h2><p class="hint">Both invest ${fmt(200)} a month. Aisha starts at 25 and <b>stops at 35</b>. Omar starts at 35 and keeps going until 65.</p>
 <div class="slider"><div><span>Yearly return</span><b id="frR"></b></div><input type="range" id="frr" min="2" max="12" step="0.5" value="7"></div>
 <div class="calc"><div><small>Aisha put in</small><b id="frA"></b><span id="frA2"></span></div><div><small>Omar put in</small><b id="frO"></b><span id="frO2"></span></div><div><small>Winner at 65</small><b id="frW"></b></div></div>
 <div class="chart"><canvas id="cFr2"></canvas></div><p class="sbmsg" id="frMsg"></p>`, () => {
    const ch = new Ch("cFr2");
    const u = () => {
      const r = +$("frr").value / 1200;
      $("frR").textContent = $("frr").value + "%";
      let a = 0, o = 0;
      const L = [], A = [], O = [];
      for (let age = 25; age < 65; age++) {
        for (let j = 0; j < 12; j++) {
          a = a * (1 + r) + (age < 35 ? 200 : 0);
          o = o * (1 + r) + (age >= 35 ? 200 : 0);
        }
        L.push(age + 1);
        A.push(a);
        O.push(o);
      }
      $("frA").textContent = fmt(200 * 120);
      $("frA2").textContent = "→ " + fmt(a);
      $("frO").textContent = fmt(200 * 360);
      $("frO2").textContent = "→ " + fmt(o);
      $("frW").textContent = a > o ? "Aisha 🏆" : "Omar 🏆";
      $("frMsg").textContent = a > o ? `Aisha invested 3× less money and still ends with more. Time is the secret ingredient.` : `At low returns Omar's extra money wins, but Aisha still did remarkably well with only 10 years of saving.`;
      ANIM = false;
      ch.set({ labels: L, series: [{ label: "Aisha (25–35)", kind: "line", width: 3, color: "var(--gold)", data: A }, { label: "Omar (35–65)", kind: "line", width: 3, color: "var(--sky)", data: O }] });
    };
    $("frr").oninput = u;
    u();
    markGame("friends", 1);
  });
}
/* habit cost */
function playHabit() {
  openPlay(`<h2>☕ The cost of a small habit</h2><p class="hint">A daily coffee, snack or ride. What if you invested it instead?</p>
 <div class="slider"><div><span>Per day</span><b id="hbD"></b></div><input type="range" id="hbd" min="1" max="30" value="4"></div>
 <div class="calc" id="hbOut"></div><p class="sbmsg">This isn't about never enjoying anything. It's about choosing on purpose. The Millionaire Next Door habit.</p>`, () => {
    const u = () => {
      const d = +$("hbd").value, m = d * 30.4, r = .07 / 12;
      $("hbD").textContent = fmt(d);
      $("hbOut").innerHTML = [10, 20, 30].map(y => { const fv = m * ((1 + r) ** (y * 12) - 1) / r; return `<div><small>${y} years</small><b>${fmt(fv)}</b><span>spent: ${fmt(m * 12 * y)}</span></div>`; }).join("");
    };
    $("hbd").oninput = u;
    u();
    markGame("habit", 1);
  });
}
/* speed game */
const SPEED = [["Rental flat earning more than costs", "a"], ["Car on finance", "l"], ["Shariah-screened ETF", "a"], ["Phone on instalments", "l"], ["App that sells every month", "a"], ["Credit card balance", "l"], ["Online course you created", "a"], ["Bigger flat you can't afford", "l"], ["Shop unit with a tenant", "a"], ["Luxury watch on credit", "l"], ["Share in a profitable business", "a"], ["Holiday paid with a loan", "l"], ["YouTube channel with ad income", "a"], ["Gym membership you never use", "l"], ["Vending machines in a busy place", "a"], ["Buy-now-pay-later sofa", "l"], ["Dividend-paying shares", "a"], ["Second car that sits at home", "l"]];
let SPEED_TM = null;
function playSpeed() {
  clearInterval(SPEED_TM);
  let deck = [...SPEED].sort(() => Math.random() - .5).slice(0, 12), i = 0, sc = 0, st = 0, bst = 0, t = 30, tm;
  openPlay(`<h2>👛 Asset or liability?</h2><p class="hint">12 cards, 30 seconds. Pocket test: money in or money out?</p><div class="spd"><div class="spdtop"><span>⏱ <b id="spT">30</b>s</span><span>Score <b id="spS">0</b></span><span>🔥 <b id="spK">0</b></span></div>
 <div class="spcard" id="spC"></div><div class="spbtn"><button class="btn" data-a="a">💰 Asset</button><button class="btn ghost" data-a="l">💸 Liability</button></div></div>`, c => {
    const show = () => { const el = $("spC"); el.classList.remove("in"); void el.offsetWidth; el.textContent = deck[i][0]; el.classList.add("in"); };
    const end = () => {
      clearInterval(tm);
      const best = Math.max(sc, S.learn.games?.speed || 0);
      markGame("speed", sc);
      if (sc >= 10)
        confetti();
      c.querySelector(".spd").innerHTML = `<div class="qend"><div class="big">${sc >= 10 ? "🏆" : sc >= 7 ? "👏" : "📚"}</div><h2>${sc}/12</h2><p>Best streak ${bst} · Your record: ${best}</p><div class="ctrls" style="justify-content:center"><button class="btn" id="spA">Play again</button></div></div>`;
      $("spA").onclick = playSpeed;
    };
    c.querySelector(".spbtn").onclick = e => {
      const b = e.target.closest("button");
      if (!b || i >= deck.length)
        return;
      const ok = b.dataset.a === deck[i][1], el = $("spC");
      el.classList.add(ok ? "ok" : "bad");
      if (ok) {
        sc++;
        st++;
        bst = Math.max(bst, st);
      }
      else
        st = 0;
      $("spS").textContent = sc;
      $("spK").textContent = st;
      setTimeout(() => { el.classList.remove("ok", "bad"); i++; i >= deck.length ? end() : show(); }, ok ? 250 : 600);
    };
    show();
    SPEED_TM = tm = setInterval(() => { t--; if (!$("spT") || !$("playD").open)
      return clearInterval(tm); $("spT").textContent = t; if (t <= 0)
      end(); }, 1000);
  });
}
/* CASHFLOW CHALLENGE */
const CF_A = [["📊", "Halal index fund", 5000, 30, "Owns pieces of hundreds of companies."], ["🏘️", "Small rental flat (deposit)", 25000, 230, "Tenant pays rent every month."], ["🏪", "Shop unit", 60000, 540, "Long commercial lease."], ["📘", "Create an online course", 2500, 110, "Your knowledge, sold again and again."], ["📱", "Build a small app", 4000, 150, "Subscriptions every month."], ["🧺", "Laundry machines in a dorm", 9000, 120, "Coins come in while you sleep."], ["🤝", "Share in a bakery (musharakah)", 15000, 190, "Profit share, no interest."], ["🅿️", "Rent out a parking space", 6000, 70, "Low effort, steady income."]];
const CF_L = [["🚗", "New car on finance", 380, "No money down! Everyone will notice."], ["📱", "Latest phone on instalments", 60, "Only a little each month…"], ["🛋️", "Sofa on buy-now-pay-later", 90, "Pay later. Feel rich now."], ["🏙️", "Bigger flat in a fancy area", 450, "You deserve it, right?"], ["✈️", "Holiday on a credit card", 120, "Memories now, payments forever."], ["⌚", "Luxury watch on credit", 150, "It tells the time… expensively."]];
const CF_S = ["🎓", "Course that raises your salary", 3000, 250, "Specialized knowledge pays."];
function playCF() {
  const G = { yr: 1, sal: 3000, exp: 2200, cash: 4000, as: [], li: [], ev: `Year 1. You have a job, expenses and ${fmt(4000)}. Escape the rat race: make passive income cover all your monthly expenses.`, offers: [], won: 0 };
  const pas = () => G.as.reduce((s, a) => s + a.inc, 0), lp = () => G.li.reduce((s, l) => s + l.pay, 0), flow = () => G.sal + pas() - G.exp - lp();
  const deal = () => { const a = [...CF_A].sort(() => Math.random() - .5), l = [...CF_L].sort(() => Math.random() - .5); G.offers = [{ k: "a", o: a[0] }, { k: "a", o: a[1] }, { k: "l", o: l[0] }]; if (Math.random() < .35)
    G.offers.push({ k: "s", o: CF_S }); G.offers.sort(() => Math.random() - .5); };
  deal();
  const draw = () => {
    const P = pas(), need = G.exp + lp(), cov = need ? Math.min(1, P / need) : 0, c = $("playC");
    c.innerHTML = `<div class="cfh"><h2>🎲 Cashflow Challenge</h2><span class="cfy">Year ${G.yr}</span></div>
  <div class="cfbar"><div><span>Passive income covers <b>${Math.round(cov * 100)}%</b> of expenses</span><span>${fmt(P)} / ${fmt(need)}</span></div><div class="nx-bar"><i style="width:${cov * 100}%"></i></div></div>
  <p class="cfev">${G.ev}</p>
  <div class="cfgrid"><div class="cfbox"><h4>Income statement / month</h4><div class="kv"><span>Salary</span><b>${fmt(G.sal)}</b></div><div class="kv"><span>Passive income</span><b class="pos">${fmt(P)}</b></div><div class="kv"><span>Expenses</span><b>−${fmt(G.exp)}</b></div><div class="kv"><span>Debt payments</span><b class="neg">−${fmt(lp())}</b></div><div class="kv"><span>Cash flow</span><b class="${flow() >= 0 ? "pos" : "neg"}">${fmt(flow())}</b></div></div>
  <div class="cfbox"><h4>Balance sheet</h4><div class="kv"><span>💵 Cash</span><b class="${G.cash >= 0 ? "" : "neg"}">${fmt(G.cash)}</b></div>
   ${G.as.map((a, i) => `<div class="kv"><span>${a.ic} ${a.n}</span><b class="pos">+${fmt(a.inc)}<button class="mini" data-sell="${i}" title="Sell for 90%">sell</button></b></div>`).join("")}
   ${G.li.map((l, i) => `<div class="kv"><span>${l.ic} ${l.n}</span><b class="neg">−${fmt(l.pay)}<button class="mini" data-pay="${i}" title="Pay off">pay off ${fmt(l.pay * 20)}</button></b></div>`).join("")}
   ${!G.as.length && !G.li.length ? '<p class="hint">Nothing yet. Choose wisely below.</p>' : ""}</div></div>
  <h4 style="margin:14px 0 8px">This year's offers</h4><div class="cfoff">${G.offers.map((x, i) => {
      const o = x.o;
      const t = x.k === "a" ? `Costs ${fmt(o[2])} · +${fmt(o[3])}/mo` : x.k === "l" ? `No money down · −${fmt(o[2])}/mo` : `Costs ${fmt(o[2])} · salary +${fmt(o[3])}/mo`;
      const can = x.k === "l" || G.cash >= o[2];
      return `<div class="cfo ${x.k}"><b>${o[0]}</b><div><strong>${o[1]}</strong><small>${x.k === "l" ? o[3] : o[4]}</small><em>${t}</em></div><button class="btn sm ${x.k === "l" ? "ghost" : ""}" data-buy="${i}" ${can ? "" : "disabled"}>${can ? "Buy" : "Need cash"}</button></div>`;
    }).join("")}</div>
  <button class="btn cfnext" id="cfN">Next year → ${flow() >= 0 ? "+" : ""}${fmt(flow() * 12)}</button>`;
    c.querySelectorAll("[data-buy]").forEach(b => b.onclick = () => {
      const x = G.offers[+b.dataset.buy], o = x.o;
      if (x.k === "a") {
        G.cash -= o[2];
        G.as.push({ ic: o[0], n: o[1], inc: o[3], cost: o[2] });
        G.ev = `✅ You bought <b>${o[1]}</b>. It puts ${fmt(o[3])} in your pocket every month.`;
      }
      else if (x.k === "l") {
        G.li.push({ ic: o[0], n: o[1], pay: o[2] });
        G.ev = `😬 You bought <b>${o[1]}</b>. Feels great, but it takes ${fmt(o[2])} out of your pocket every month.`;
      }
      else {
        G.cash -= o[2];
        G.sal += o[3];
        G.ev = `🎓 Your skills grew. Salary +${fmt(o[3])}/mo.`;
      }
      G.offers.splice(+b.dataset.buy, 1);
      check();
    });
    c.querySelectorAll("[data-sell]").forEach(b => b.onclick = () => { const a = G.as.splice(+b.dataset.sell, 1)[0]; G.cash += Math.round(a.cost * .9); G.ev = `You sold ${a.n} for ${fmt(a.cost * .9)}. Cash now, but its income is gone.`; draw(); });
    c.querySelectorAll("[data-pay]").forEach(b => b.onclick = () => { const l = G.li[+b.dataset.pay]; if (G.cash < l.pay * 20) {
      G.ev = "Not enough cash to pay this off yet.";
      return draw();
    } G.cash -= l.pay * 20; G.li.splice(+b.dataset.pay, 1); G.ev = `🎉 ${l.n} paid off. ${fmt(l.pay)} a month is back in your pocket.`; check(); });
    $("cfN").onclick = next;
  };
  const check = () => { if (pas() >= G.exp + lp() && pas() > 0) {
    G.won = 1;
    finish();
  }
  else
    draw(); };
  const next = () => {
    G.cash += flow() * 12;
    const has = G.as.length, r = Math.random();
    if (r < .25) {
      G.sal = Math.round(G.sal * 1.04);
      G.ev = "📈 You got a raise: salary +4%. Will you spend it or invest it?";
    }
    else if (r < .45) {
      G.exp = Math.round(G.exp * 1.03);
      G.ev = "🏷️ Inflation: your expenses rose 3%. Assets that grow protect you.";
    }
    else if (r < .6) {
      G.cash -= 1500;
      G.ev = `🔧 Surprise bill: −${fmt(1500)}. ${G.cash < 0 ? "No emergency fund, so now you're in debt!" : "Good thing you had cash."}`;
    }
    else if (r < .72 && has) {
      const a = G.as[Math.floor(Math.random() * has)];
      G.cash -= a.inc * 2;
      G.ev = `🏚️ ${a.n} had a bad patch: two months without income.`;
    }
    else if (r < .84 && has) {
      G.cash += 1000;
      G.ev = `🎁 Good year! Your assets paid a ${fmt(1000)} bonus.`;
    }
    else if (r < .92) {
      G.ev = "📉 Markets fell 20% this year. Prices are on sale. Investors who keep buying win later.";
    }
    else
      G.ev = "😌 A quiet year. Your money kept working.";
    G.yr++;
    deal();
    if (G.yr > 30) {
      finish();
      return;
    }
    check();
  };
  const finish = () => {
    const c = $("playC"), yrs = G.yr;
    if (G.won) {
      confetti();
      markGame("cashflow", 100 - yrs);
    }
    c.innerHTML = `<div class="qend"><div class="big">${G.won ? "🕊️" : "🐀"}</div><h2>${G.won ? `Free in ${yrs} year${yrs > 1 ? "s" : ""}!` : "Still in the rat race after 30 years"}</h2>
  <p>${G.won ? `Your ${G.as.length} assets pay ${fmt(pas())} a month, more than all your expenses. Work is now optional.` : `Passive income: ${fmt(pas())} vs expenses ${fmt(G.exp + lp())}.`}</p>
  <div class="cflesson"><p>📊 Assets bought: <b>${G.as.length}</b> → +${fmt(pas())}/mo</p><p>💸 Liabilities bought: <b>${G.li.length}</b> → −${fmt(lp())}/mo</p>
  <p>${G.li.length ? `Without those liabilities you'd have had ${fmt(lp() * 12)} more each year to buy assets.` : "You avoided every liability. That's the Rich Dad way."}</p></div>
  <div class="ctrls" style="justify-content:center"><button class="btn" id="cfA">Play again</button><button class="btn ghost" id="cfC">Done</button></div></div>`;
    $("cfA").onclick = playCF;
    $("cfC").onclick = () => $("playD").close();
    renderLearn();
  };
  openPlay("", draw);
}
const GAMES = [["cashflow", "🎲", "Cashflow Challenge", "Buy assets, avoid liabilities, escape the rat race", playCF], ["speed", "👛", "Asset or liability?", "30-second speed game", playSpeed], ["snow", "❄️", "The snowball", "See compounding grow your money", playSnow], ["friends", "👫", "Early vs late", "Why starting early wins", playFriends], ["habit", "☕", "Cost of a habit", "Small daily spending, big future cost", playHabit]];
function renderPlay() {
  const g = $("lGames");
  if (!g)
    return;
  g.innerHTML = "";
  const G = S.learn.games || {};
  GAMES.forEach(([k, ic, t, d, fn]) => {
    const b = document.createElement("button");
    b.className = "gcard";
    const v = G[k];
    b.innerHTML = `<span class="gi">${ic}</span><b></b><small></small><em>${v === undefined ? "Play →" : k === "cashflow" ? `🏆 Best: free in ${100 - v} yrs` : k === "speed" ? `🏆 Record ${v}/12` : "✓ Explored"}</em>`;
    b.querySelector("b").textContent = t;
    b.querySelector("small").textContent = d;
    b.onclick = fn;
    g.append(b);
  });
  const q = $("lQuiz");
  q.innerHTML = "";
  Object.keys(TQ).forEach(tp => {
    const ls = LTP(tp), rd = ls.filter(l => S.learn.read[l.id]).length, open = rd >= ls.length, best = (S.learn.quiz || {})[tp];
    const b = document.createElement("button");
    b.className = "qcard" + (best >= 3 ? " won" : open ? "" : " lock");
    b.innerHTML = `<span class="gi">${best >= 3 ? "🏅" : open ? "📝" : "🔒"}</span><b></b><small>${best >= 3 ? `Badge earned · ${best}/4` : open ? (best !== undefined ? `Best ${best}/4, try again` : "Ready! 4 questions") : `Read ${ls.length - rd} more lesson${ls.length - rd > 1 ? "s" : ""} to unlock`}</small>`;
    b.querySelector("b").textContent = tp;
    b.onclick = () => { if (!open) {
      LTOPIC = tp;
      renderLearn();
      $("lTopics").scrollIntoView({ behavior: "smooth", block: "start" });
      toast(`Read the ${tp} lessons first`);
      return;
    } runQuiz(tp); };
    q.append(b);
  });
  const k = knowStats();
  $("lKnow").innerHTML = `<span>📖 ${k.read}/${LESSONS2.length} lessons</span><span>🏅 ${k.quiz}/6 badges</span><span>🎮 ${k.games}/5 games</span>`;
}
$("mSeg").onclick = e => { const b = e.target.closest("button"); if (b) {
  MSEL = b.dataset.m;
  renderMind();
} };
$("mQuizB").onclick = mindQuiz;
$("lPur").oninput = e => { S.learn.purpose = e.target.value; change(); };
$("lessonX").onclick = () => $("lessonD").close();
$("lessonD").addEventListener("click", e => { if (e.target === $("lessonD"))
  $("lessonD").close(); });
$("ovNext").querySelector("button").onclick = () => showTab("lr");
$("ovWel").onclick = e => { const b = e.target.closest("[data-go]"); if (b)
  showTab(b.dataset.go); };
/* ---------- UI: navigation, indicators, toasts, theme ---------- */
const MORE = ["as", "rd", "zk", "pj", "al", "gr"];
function moveInd() {
  const a = $("tabs").querySelector("button.on"), ind = $("tabs").querySelector(".ind");
  if (a && ind && a.offsetWidth) {
    ind.style.width = a.offsetWidth + "px";
    ind.style.transform = `translateX(${a.offsetLeft}px)`;
  }
  const v = $("view").querySelector("button.on"), pl = $("view").querySelector(".pill");
  if (v && pl && v.offsetWidth) {
    pl.style.width = v.offsetWidth + "px";
    pl.style.transform = `translateX(${v.offsetLeft}px)`;
  }
}
function showTab(t) {
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x.dataset.t === t));
  document.querySelectorAll("#bnav button").forEach(x => x.classList.toggle("on", x.dataset.t === t || (x.dataset.t === "more" && MORE.includes(t))));
  document.querySelectorAll("#moreD [data-t]").forEach(x => x.classList.toggle("on", x.dataset.t === t));
  document.querySelectorAll(".tab").forEach(s => s.classList.toggle("on", s.id === t));
  const sec = $(t);
  if (!RM)
    sec.querySelectorAll(".hero,.lhero,.panel,.stat,.goal,.months,.step2,.lcard,.story,.gcard,.qcard,.wis").forEach((el, i) => { el.classList.remove("rise"); void el.offsetWidth; el.style.animationDelay = Math.min(i, 10) * 45 + "ms"; el.classList.add("rise"); });
  $("tabs").querySelector("button.on")?.scrollIntoView({ block: "nearest", inline: "center", behavior: RM ? "auto" : "smooth" });
  if (t === "lg")
    setTimeout(() => $("mStrip").querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }), 50);
  scrollTo({ top: 0, behavior: RM ? "auto" : "smooth" });
  moveInd();
  ANIM = true;
  render();
  if (t === "lg")
    renderEditor();
}
$("tabs").onclick = e => { const b = e.target.closest("button[data-t]"); if (b)
  showTab(b.dataset.t); };
$("bnav").onclick = e => { const b = e.target.closest("button[data-t]"); if (!b)
  return; if (b.dataset.t === "more")
  return $("moreD").showModal(); showTab(b.dataset.t); };
$("moreD").onclick = e => {
  if (e.target === $("moreD"))
    return $("moreD").close();
  const b = e.target.closest("button");
  if (!b)
    return;
  $("moreD").close();
  if (b.dataset.t)
    showTab(b.dataset.t);
  else if (b.dataset.x === "set")
    $("setB").click();
  else
    $("profB").click();
};
["setD", "syncD", "profD"].forEach(id => $(id).addEventListener("click", e => { if (e.target === $(id))
  $(id).close(); }));
let toastT;
function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); }
function setTheme(th) {
  LS.set("cashflow:theme", th);
  if (th === "auto")
    delete document.documentElement.dataset.theme;
  else
    document.documentElement.dataset.theme = th;
  document.querySelectorAll("#themeS button").forEach(b => b.classList.toggle("on", b.dataset.th === th));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
}
$("themeS").onclick = e => { const b = e.target.closest("button"); if (b)
  setTheme(b.dataset.th); };
new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType !== 1)
  return; (n.matches?.('input[type=number]') ? [n] : []).concat([...n.querySelectorAll?.('input[type=number]') || []]).forEach(i => { i.inputMode = "decimal"; i.enterKeyHint = "next"; }); }))).observe(document.body, { childList: true, subtree: true });
document.querySelectorAll('input[type=number]').forEach(i => i.inputMode = "decimal");
addEventListener("resize", moveInd);
if (document.fonts)
  document.fonts.ready.then(moveInd);
$("thB").onclick = () => { const dark = matchMedia("(prefers-color-scheme:dark)").matches, cur = document.documentElement.dataset.theme || (dark ? "dark" : "light"); setTheme(cur === "dark" ? "light" : "dark"); toast(cur === "dark" ? "☀️ Light mode" : "🌙 Dark mode"); };
function trustUI() {
  const p = prof(), small = LS.get("cashflow:trustMin") === "1", t = $("trust");
  if (!t)
    return;
  t.classList.toggle("min", small);
  $("trT").textContent = p.g ? "Your data is private: this device + your own Google Drive" : "Your data stays on this device";
  $("trP").textContent = p.g ? `Stored in this browser and synced only to a private, hidden folder in ${p.g}'s Google Drive. Nobody else can see it, including us.` : "Everything you enter is saved only in this browser on this device. Nothing is uploaded, shared or sold. Not with us, not with anyone.";
  $("trX").textContent = small ? "+" : "–";
  $("trX").setAttribute("aria-label", small ? "Show details" : "Make smaller");
}
$("trX").onclick = () => { LS.set("cashflow:trustMin", LS.get("cashflow:trustMin") === "1" ? "0" : "1"); trustUI(); };
$("trMore").onclick = () => { $("setB").click(); };
const APP_VERSION = "2.8 · 16 Oct 2026";
console.info("Cash Flow " + APP_VERSION);
/* ---------- controls ---------- */
$("view").onclick = e => { const b = e.target.closest("button"); if (!b)
  return; V = b.dataset.v; document.querySelectorAll("#view button").forEach(x => x.classList.toggle("on", x === b)); moveInd(); ANIM = true; render(); };
function step(d) { const s = V === "m" ? 1 : V === "q" ? 3 : 12, t = NY * 12 + (NM - 1) + d * s; NY = Math.floor(t / 12); NM = t % 12 + 1; ANIM = true; render(); renderEditor(); }
$("prev").onclick = () => step(-1);
$("next").onclick = () => step(1);
$("yrBtns").onclick = e => { const b = e.target.closest("button"); if (!b)
  return; S.proj.years = +b.dataset.y; bind(); change(true); };
document.querySelector(".presets").onclick = e => { const b = e.target.closest("button"); if (!b)
  return; Object.assign(S.alloc, PRE[b.dataset.pr]); sliders(); change(true); };
$("cur").onchange = e => { S.currency = e.target.value; renderAll(); change(); };
C = { as: new Ch("cAs", "pie"), ai: new Ch("cAi"), nwh: new Ch("cNWH"), tr: new Ch("cTr"), pie: new Ch("cPie", "pie"), give: new Ch("cGive"), nw: new Ch("cNW"), fr: new Ch("cFR"), al: new Ch("cAl", "pie") };
setTheme(LS.get("cashflow:theme") || "auto");
function bootApp() {
initProfiles();
try {
  [...new Set([...Object.keys(localStorage), ...Object.keys(MEM)])].filter(k => /^cashflow:data:[^:]+$/.test(k)).forEach(k => { try {
    const o = JSON.parse(LS.get(k));
    if (o && typeof o === "object") {
      const before = JSON.stringify(o);
      const c = structuredClone(o);
      if (cleanDemo(c) && JSON.stringify(c) !== before)
        LS.set(k, JSON.stringify(c));
    }
  }
  catch { } });
}
catch { }
loadProfile(PID);
requestAnimationFrame(moveInd);
}
$("lockNow").onclick = () => { flushWrites().then(() => location.reload()); };
$("pinChange").onclick = () => { $("setD").close(); showLock("old", null); };
showLock(lockCfg() ? "unlock" : "set", bootApp);
