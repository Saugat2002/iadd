document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', function () {
  initBib();
  try { initFK(); } catch (e) { console.error(e); }
  try { initCurriculum(); } catch (e) { console.error(e); }
  try { initExplorer(); } catch (e) { console.error(e); }
});

var NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent) {
  var n = document.createElementNS(NS, tag);
  for (var k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function rng(seed) { // small seeded PRNG (mulberry32)
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- BibTeX copy ---------- */
function initBib() {
  var btn = document.getElementById('copy-bib');
  var code = document.getElementById('bib-text');
  if (!btn || !code) return;
  btn.addEventListener('click', function () {
    var label = btn.querySelector('span');
    var done = function () {
      label.textContent = 'Copied';
      setTimeout(function () { label.textContent = 'Copy'; }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code.textContent).then(done);
    } else {
      var range = document.createRange();
      range.selectNodeContents(code);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
}

/* ---------- FK branch & resample explainer ---------- */
function initFK() {
  var svg = document.getElementById('fk-svg');
  if (!svg) return;
  var T = 20, BRANCH = 5, RES = [8, 12, 16], RESLBL = ['0.4T', '0.6T', '0.8T'], LAMBDA = 2.0;
  var LIVE = [26, 115, 232], DEADC = [201, 204, 209];
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var kSlider = document.getElementById('fk-k'), kVal = document.getElementById('fk-k-val');
  var playBtn = document.getElementById('fk-play'), stepBtn = document.getElementById('fk-step'), resetBtn = document.getElementById('fk-reset');
  var narr = document.getElementById('fk-narr');
  var narrIdx = -1;
  var W, H, L, R, PT, PB, desktop, SY;
  var sim, p = BRANCH, tw = null, raf = null;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mix(a, b, f) { return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * f); }).join(',') + ')'; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function reward(v) { var d = (v - 0.5) / 0.3; return Math.exp(-d * d); }

  function layout() {
    W = Math.max(280, Math.round(svg.getBoundingClientRect().width));
    desktop = W >= 560;
    H = desktop ? Math.round(W * 7 / 16) : Math.round(W * 0.78);
    L = 18; R = desktop ? 70 : 46; PT = 44; PB = H - 40; SY = PB - PT;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  }
  function xs(s) { return L + (W - L - R) * s / T; }
  var vlo = 0, vhi = 1;
  function ys(v) { return PT + SY * (v - vlo) / (vhi - vlo); }

  function simulate(k) {
    var r = rng(11 + k * 17);
    var prefix = [0.5], mp = [0], pv = 0, s, i;
    for (s = 1; s <= BRANCH; s++) { pv = 0.7 * pv + (r() - 0.5) * 0.05; prefix[s] = clamp(prefix[s - 1] + pv, 0.3, 0.7); mp[s] = prefix[s] - prefix[s - 1]; }
    var pos = [], vel = [], par = [], wt = [], sc = {}, src = {};
    pos[BRANCH] = []; vel[BRANCH] = []; par[BRANCH] = []; wt[BRANCH] = [];
    for (i = 0; i < k; i++) { pos[BRANCH][i] = prefix[BRANCH]; vel[BRANCH][i] = mp[BRANCH]; par[BRANCH][i] = 0; wt[BRANCH][i] = 0; }
    for (s = BRANCH + 1; s <= T; s++) {
      pos[s] = []; vel[s] = []; par[s] = []; wt[s] = [];
      for (i = 0; i < k; i++) {
        var from = src[s - 1] ? src[s - 1][i] : i;
        par[s][i] = from;
        var kick = s === BRANCH + 1 ? 0.09 : 0.065;
        var v = 0.8 * vel[s - 1][from] + (r() - 0.5) * 2 * kick;
        var x = pos[s - 1][from] + v;
        if (x < 0.08 || x > 0.92) { v = -v * 0.5; x = clamp(x, 0.08, 0.92); }
        pos[s][i] = x; vel[s][i] = v; wt[s][i] = wt[s - 1][from];
      }
      if (RES.indexOf(s) >= 0) {
        var raw = [], tot = 0;
        for (i = 0; i < k; i++) { wt[s][i] = Math.max(reward(pos[s][i]), wt[s][i]); raw[i] = Math.exp(LAMBDA * wt[s][i]); tot += raw[i]; }
        sc[s] = wt[s].slice();
        var sel = [];
        for (var j = 0; j < k; j++) {
          var u = r() * tot, acc = 0, pick = k - 1;
          for (i = 0; i < k; i++) { acc += raw[i]; if (u <= acc) { pick = i; break; } }
          sel[j] = pick;
        }
        src[s] = sel;
      }
    }
    var leaf = [];
    leaf[T] = []; for (i = 0; i < k; i++) leaf[T][i] = T;
    for (s = T - 1; s >= BRANCH; s--) {
      leaf[s] = [];
      for (i = 0; i < k; i++) {
        var m = s;
        for (j = 0; j < k; j++) if (par[s + 1][j] === i) m = Math.max(m, leaf[s + 1][j]);
        leaf[s][i] = m;
      }
    }
    var rs = pos[T].map(reward);
    vlo = 1; vhi = 0;
    prefix.forEach(function (x) { vlo = Math.min(vlo, x); vhi = Math.max(vhi, x); });
    for (s = BRANCH; s <= T; s++) pos[s].forEach(function (x) { vlo = Math.min(vlo, x); vhi = Math.max(vhi, x); });
    vlo -= 0.04; vhi += 0.04;
    return { k: k, prefix: prefix, mp: mp, pos: pos, par: par, sc: sc, src: src, leaf: leaf,
      best: rs.indexOf(Math.max.apply(null, rs)), worst: rs.indexOf(Math.min.apply(null, rs)) };
  }

  function val(s, i) { return s <= BRANCH ? sim.prefix[s] : sim.pos[s][i]; }
  function pa(s, i) { return s > BRANCH ? sim.par[s][i] : 0; }
  function slope(s, i) { return s <= 0 ? 0 : val(s, i) - val(s - 1, pa(s, i)); }
  function seg(s, i) {
    var q = pa(s, i), dx = xs(1) - xs(0);
    var a = [xs(s - 1), ys(val(s - 1, q))], b = [xs(s), ys(val(s, i))];
    return [a, [a[0] + dx / 3, a[1] + slope(s - 1, q) * SY / 3], [b[0] - dx / 3, b[1] - slope(s, i) * SY / 3], b];
  }
  function lerp(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
  function split(P, f) {
    var a = lerp(P[0], P[1], f), b = lerp(P[1], P[2], f), c = lerp(P[2], P[3], f);
    var d = lerp(a, b, f), e = lerp(b, c, f), g = lerp(d, e, f);
    return [P[0], a, d, g];
  }
  function d(P) { return 'M' + P[0][0] + ' ' + P[0][1] + ' C' + P[1][0] + ' ' + P[1][1] + ' ' + P[2][0] + ' ' + P[2][1] + ' ' + P[3][0] + ' ' + P[3][1]; }

  function narrate() {
    var idx;
    if (p < BRANCH) idx = 0;
    else if (p >= T - 0.001) idx = 4;
    else {
      idx = 1;
      for (var i = 0; i < RES.length; i++) {
        if (p >= RES[i] && p < RES[i] + 0.5) idx = 2;
        else if (p >= RES[i] + 0.5 && p < RES[i] + 3) idx = 3;
      }
    }
    if (idx !== narrIdx) {
      narrIdx = idx;
      var spans = narr.children;
      for (var j = 0; j < spans.length; j++) spans[j].className = j === idx ? 'on' : '';
    }
  }

  function draw() {
    while (svg.childNodes.length > 2) svg.removeChild(svg.lastChild);
    var k = sim.k, axisY = H - 26, i, s;
    // phase band for the shared prefix
    el('rect', { x: L, y: 28, width: xs(BRANCH) - L, height: axisY - 28, rx: 6, fill: '#5f6368', 'fill-opacity': 0.035 }, svg);
    var bl = el('text', { x: L + 8, y: axisY - 8, 'class': 'fk-axis' }, svg); bl.textContent = 'shared prefix';
    // guides with hover tooltips
    function guide(sx, label, tip) {
      var g = el('g', {}, svg);
      el('line', { x1: xs(sx), y1: 28, x2: xs(sx), y2: axisY, stroke: '#cfd2d6', 'stroke-dasharray': '2 4', 'stroke-width': 1.2 }, g);
      el('rect', { x: xs(sx) - 9, y: 6, width: 18, height: axisY - 6, fill: 'transparent' }, g).appendChild(document.createElementNS(NS, 'title')).textContent = tip;
      var t = el('text', { x: xs(sx), y: 20, 'text-anchor': 'middle', 'class': 'fk-axis strong' }, g); t.textContent = label;
      t.style.pointerEvents = 'none';
    }
    guide(BRANCH, desktop ? 'branch · t_b' : 't_b', 'Branch at t_b (the 5th denoising step): the shared state is replicated into k particles that then diverge.');
    RES.forEach(function (rs, i2) {
      guide(rs, desktop ? 'resample ' + RESLBL[i2] : RESLBL[i2],
        'Resample at step ' + rs + ' (' + RESLBL[i2] + '): particles are scored with the max potential; low-weight ones are replaced by copies of high-weight ones.');
    });
    // axis + progress
    el('line', { x1: L, y1: axisY, x2: xs(T), y2: axisY, stroke: '#dadce0', 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
    el('line', { x1: L, y1: axisY, x2: xs(clamp(p, 0, T)), y2: axisY, stroke: '#1a73e8', 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
    var a1 = el('text', { x: L, y: H - 6, 'class': 'fk-axis' }, svg); a1.textContent = desktop ? 't = T  (noise)' : 't = T';
    var a2 = el('text', { x: xs(T), y: H - 6, 'class': 'fk-axis', 'text-anchor': 'end' }, svg); a2.textContent = desktop ? 't = 0  (sample)' : 't = 0';

    // collect segments
    var items = [];
    for (s = 1; s <= BRANCH; s++) {
      if (p <= s - 1) break;
      items.push({ s: s, i: 0, f: clamp(p - (s - 1), 0, 1), fade: 0, pre: true });
    }
    for (s = BRANCH + 1; s <= T; s++) {
      if (p <= s - 1) break;
      for (i = 0; i < k; i++) {
        var lf = sim.leaf[s][i];
        items.push({ s: s, i: i, f: clamp(p - (s - 1), 0, 1), fade: lf < T ? clamp((p - lf) / 0.8, 0, 1) : 0 });
      }
    }
    items.sort(function (a, b) { return b.fade - a.fade; });
    items.forEach(function (g) {
      var P = seg(g.s, g.i); if (g.f < 1) P = split(P, g.f);
      var col = g.pre ? 'rgb(95,99,104)' : mix(LIVE, DEADC, g.fade);
      el('path', { d: d(P), fill: 'none', stroke: col, 'stroke-width': g.pre ? 3 : (2.4 - 1.0 * g.fade), 'stroke-linecap': 'round', 'stroke-opacity': 1 - 0.1 * g.fade }, svg);
    });
    // best / worst overlay near the end
    var ramp = clamp(p - (T - 1), 0, 1);
    if (ramp > 0) {
      [[sim.worst, '#c5221f'], [sim.best, '#188038']].forEach(function (bw) {
        var slot = bw[0];
        for (var st = T; st > BRANCH; st--) {
          el('path', { d: d(seg(st, slot)), fill: 'none', stroke: bw[1], 'stroke-width': 3.4, 'stroke-linecap': 'round', 'stroke-opacity': ramp * 0.92 }, svg);
          slot = sim.par[st][slot];
        }
      });
    }
    // branch node
    if (p >= BRANCH) el('circle', { cx: xs(BRANCH), cy: ys(sim.prefix[BRANCH]), r: 6, fill: '#5f6368', stroke: '#fff', 'stroke-width': 2 }, svg);
    // resample nodes
    RES.forEach(function (rs) {
      if (p < rs) return;
      var o = clamp((p - rs) / 0.4, 0, 1), src = sim.src[rs];
      for (var j = 0; j < k; j++) {
        var cnt = 0; src.forEach(function (q) { if (q === j) cnt++; });
        var cx = xs(rs), cy = ys(sim.pos[rs][j]);
        var g = el('g', { opacity: o }, svg);
        var tip = 'Particle ' + (j + 1) + ' at step ' + rs + ': weight w = ' + sim.sc[rs][j].toFixed(2) + (cnt === 0 ? ' → pruned' : cnt === 1 ? ' → kept' : ' → copied ×' + cnt);
        if (cnt === 0) {
          el('circle', { cx: cx, cy: cy, r: 6, fill: '#f1f3f4', stroke: '#bdc1c6', 'stroke-width': 1.5 }, g);
          el('path', { d: 'M' + (cx - 2.5) + ' ' + (cy - 2.5) + 'L' + (cx + 2.5) + ' ' + (cy + 2.5) + 'M' + (cx - 2.5) + ' ' + (cy + 2.5) + 'L' + (cx + 2.5) + ' ' + (cy - 2.5), stroke: '#80868b', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, g);
        } else {
          el('circle', { cx: cx, cy: cy, r: 5, fill: '#fff', stroke: '#1a73e8', 'stroke-width': 2 }, g);
          if (cnt > 1) {
            el('rect', { x: cx + 7, y: cy - 17, width: 22, height: 14, rx: 7, fill: '#e8f0fe', stroke: '#1a73e8', 'stroke-width': 1 }, g);
            var bt = el('text', { x: cx + 18, y: cy - 7, 'text-anchor': 'middle', 'class': 'fk-badge' }, g); bt.textContent = '×' + cnt;
          }
        }
        el('circle', { cx: cx, cy: cy, r: 11, fill: 'transparent' }, g).appendChild(document.createElementNS(NS, 'title')).textContent = tip;
      }
    });
    // heads / final nodes
    if (p >= T - 0.001) {
      var labs = [];
      for (i = 0; i < k; i++) {
        var isB = i === sim.best, isW = i === sim.worst;
        el('circle', { cx: xs(T), cy: ys(sim.pos[T][i]), r: isB || isW ? 6.5 : 4.5, fill: isB ? '#188038' : isW ? '#c5221f' : '#fff', stroke: isB || isW ? '#fff' : '#1a73e8', 'stroke-width': isB || isW ? 2 : 2 }, svg)
          .appendChild(document.createElementNS(NS, 'title')).textContent = 'Final particle ' + (i + 1) + ' reward r = ' + reward(sim.pos[T][i]).toFixed(2) + ' (schematic)';
      }
      var yb = ys(sim.pos[T][sim.best]), yw = ys(sim.pos[T][sim.worst]);
      if (Math.abs(yb - yw) < 16) { if (yb <= yw) { yb -= 8; yw += 8; } else { yb += 8; yw -= 8; } }
      var lb = el('text', { x: xs(T) + 12, y: yb + 4, 'class': 'fk-lbl', fill: '#188038' }, svg); lb.textContent = 'best';
      var lw = el('text', { x: xs(T) + 12, y: yw + 4, 'class': 'fk-lbl', fill: '#c5221f' }, svg); lw.textContent = 'worst';
    } else if (p > BRANCH) {
      var sH = Math.ceil(p - 1e-9), f = p - (sH - 1);
      for (i = 0; i < k; i++) {
        if (sim.leaf[sH][i] < p - 1e-9 && sim.leaf[sH][i] < T) continue;
        var P = seg(sH, i); var h = split(P, clamp(f, 0.0001, 1))[3];
        el('circle', { cx: h[0], cy: h[1], r: 4.5, fill: '#fff', stroke: '#1a73e8', 'stroke-width': 2 }, svg);
      }
    } else {
      var sP = Math.max(1, Math.ceil(p - 1e-9)), fP = p - (sP - 1);
      var hp = split(seg(sP, 0), clamp(fP, 0.0001, 1))[3];
      el('circle', { cx: hp[0], cy: hp[1], r: 4.5, fill: '#5f6368', stroke: '#fff', 'stroke-width': 2 }, svg);
    }
    narrate();
  }

  function setP(v) { p = v; draw(); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; tw = null; playBtn.textContent = p >= T ? 'Replay' : 'Play'; playBtn.setAttribute('aria-pressed', 'false'); }
  function tick(now) {
    raf = null;
    if (!tw) return;
    var t = clamp((now - tw.t0) / tw.dur, 0, 1);
    setP(tw.from + (tw.to - tw.from) * (tw.ease ? ease(t) : t));
    if (t < 1) raf = requestAnimationFrame(tick); else { tw = null; stop(); }
  }
  function run(to, dur, eased) {
    stop();
    if (reduce) { setP(to); stop(); return; }
    tw = { from: p, to: to, t0: performance.now(), dur: Math.max(dur, 1), ease: eased };
    raf = requestAnimationFrame(tick);
  }
  function build(k) { stop(); sim = simulate(k); narrIdx = -1; setP(BRANCH); stop(); }

  playBtn.addEventListener('click', function () {
    if (tw) { stop(); return; }
    if (p >= T - 0.001) p = 0;
    playBtn.textContent = 'Pause'; playBtn.setAttribute('aria-pressed', 'true');
    run(T, (T - p) * 190, false);
    if (!tw) stop();
    else { playBtn.textContent = 'Pause'; playBtn.setAttribute('aria-pressed', 'true'); }
  });
  stepBtn.addEventListener('click', function () {
    var next = null;
    for (var i = 0; i < RES.length; i++) if (RES[i] + 1 > p + 1e-6) { next = RES[i] + 1; break; }
    if (next === null) { p = BRANCH; next = RES[0] + 1; }
    if (next < BRANCH) next = BRANCH;
    run(next, 550 + (next - p) * 90, true);
  });
  resetBtn.addEventListener('click', function () { build(sim.k); });
  kSlider.addEventListener('input', function () { kVal.textContent = kSlider.value; build(parseInt(kSlider.value, 10)); });
  var rz = null;
  window.addEventListener('resize', function () {
    if (rz) cancelAnimationFrame(rz);
    rz = requestAnimationFrame(function () { rz = null; layout(); draw(); });
  });
  layout();
  build(parseInt(kSlider.value, 10));
}

/* ---------- Sparse incremental curriculum ---------- */
function initCurriculum() {
  var svg = document.getElementById('cur-svg');
  if (!svg) return;
  var T = 20, SCHED = [5, 10, 15, 20];
  var stage = document.getElementById('cur-stage');
  var anyBtn = document.getElementById('cur-any'), lateBtn = document.getElementById('cur-late'), shuffleBtn = document.getElementById('cur-shuffle');
  var readout = document.getElementById('cur-readout');
  var stageCap = document.getElementById('cur-stage-cap'), modeCap = document.getElementById('cur-mode-cap');
  var ticks = document.querySelectorAll('#cur-widget .tick');
  var mode = 'any', seed = 3, cells = [];
  var perm = [];

  function makePerm() {
    var r = rng(seed * 101 + 5), i;
    perm = []; for (i = 0; i < T; i++) perm.push(i);
    for (i = T - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp; }
  }
  function activeSet(n) {
    var set = {}, i;
    if (mode === 'late') for (i = T - n; i < T; i++) set[i] = true;
    else for (i = 0; i < n; i++) set[perm[i]] = true;  // nested subsets as the stage grows
    return set;
  }
  function build() {
    while (svg.childNodes.length > 2) svg.removeChild(svg.lastChild);
    var W = Math.max(280, Math.round(svg.getBoundingClientRect().width));
    var desktop = W >= 560;
    var pad = 4, gap = desktop ? 5 : 2, cw = (W - 2 * pad - gap * (T - 1)) / T;
    var ch = desktop ? 38 : 34, AH = desktop ? 104 : 86, top = 6, base = top + AH, H = base + 28;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var defs = el('defs', {}, svg);
    var gr = el('linearGradient', { id: 'reachGrad', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0%', 'stop-color': '#f2a766', 'stop-opacity': 0.55 }, gr);
    el('stop', { offset: '100%', 'stop-color': '#f7c9a1', 'stop-opacity': 0.08 }, gr);
    // reach area, schematic exponential decay along the timestep axis
    var N = 60, top1 = [], x;
    for (var q = 0; q <= N; q++) {
      x = pad + (W - 2 * pad) * q / N;
      var idx = (x - pad) / (cw + gap) - 0.5;
      top1.push([x, base - AH * Math.pow(0.9, Math.max(0, idx))]);
    }
    var dstr = 'M' + pad + ' ' + base + ' ' + top1.map(function (pt) { return 'L' + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1); }).join(' ') + ' L' + (W - pad) + ' ' + base + ' Z';
    el('path', { d: dstr, fill: 'url(#reachGrad)' }, svg);
    el('path', { d: 'M' + top1.map(function (pt) { return pt[0].toFixed(1) + ' ' + pt[1].toFixed(1); }).join(' L'), fill: 'none', stroke: '#e8a06a', 'stroke-width': 1.5, 'stroke-opacity': 0.8 }, svg);
    var rl = el('text', { x: W - pad - 2, y: base - ch - 14, 'class': 'fk-axis', 'text-anchor': 'end', fill: '#c26a2c', style: 'fill:#c26a2c' }, svg);
    rl.textContent = 'generative reach';
    // cells
    cells = [];
    for (var i = 0; i < T; i++) {
      var c = el('rect', { x: pad + i * (cw + gap), y: base - ch - 2, width: cw, height: ch, rx: desktop ? 6 : 4, 'class': 'cell' }, svg);
      c.appendChild(document.createElementNS(NS, 'title')).textContent = 't = ' + (T - i);
      cells.push(c);
    }
    // axis labels
    var ay = base + 20;
    var l1 = el('text', { x: pad, y: ay, 'class': 'fk-axis' }, svg); l1.textContent = desktop ? 't = T  (early)' : 't = T';
    var l2 = el('text', { x: W - pad, y: ay, 'class': 'fk-axis', 'text-anchor': 'end' }, svg); l2.textContent = desktop ? 't = 1  (late)' : 't = 1';
    update(true);
  }
  function showOnly(parent, idx) {
    for (var j = 0; j < parent.children.length; j++) parent.children[j].className = j === idx ? 'on' : '';
  }
  function update(instant) {
    var si = parseInt(stage.value, 10) - 1, n = SCHED[si], set = activeSet(n);
    cells.forEach(function (c, i) {
      c.style.transitionDelay = instant ? '0ms' : (mode === 'late' ? (T - i) * 8 : i * 10) + 'ms';
      c.setAttribute('class', 'cell' + (set[i] ? ' on' : ''));
      var t = c.firstChild; if (t) t.textContent = 't = ' + (T - i) + (set[i] ? ' · updated' : ' · frozen');
    });
    readout.innerHTML = '<b>' + n + '</b> of ' + T + ' timesteps updated · stage ' + (si + 1) + ' of 4';
    showOnly(stageCap, si);
    showOnly(modeCap, mode === 'any' ? 0 : 1);
    for (var j = 0; j < ticks.length; j++) ticks[j].className = 'tick' + (j === si ? ' cur' : '');
  }
  function setMode(m) {
    mode = m;
    anyBtn.className = m === 'any' ? 'seg-on' : ''; lateBtn.className = m === 'late' ? 'seg-on' : '';
    anyBtn.setAttribute('aria-pressed', m === 'any'); lateBtn.setAttribute('aria-pressed', m === 'late');
    shuffleBtn.disabled = m === 'late'; shuffleBtn.style.opacity = m === 'late' ? 0.45 : 1;
    update();
  }
  stage.addEventListener('input', function () { update(); });
  Array.prototype.forEach.call(ticks, function (t) {
    t.addEventListener('click', function () { stage.value = t.getAttribute('data-stage'); update(); });
  });
  anyBtn.addEventListener('click', function () { setMode('any'); });
  lateBtn.addEventListener('click', function () { setMode('late'); });
  shuffleBtn.addEventListener('click', function () { seed++; makePerm(); update(); });
  var rz = null;
  window.addEventListener('resize', function () {
    if (rz) cancelAnimationFrame(rz);
    rz = requestAnimationFrame(function () { rz = null; build(); });
  });
  makePerm();
  build();
}

/* ---------- Results explorer ---------- */
function initExplorer() {
  var mount = document.getElementById('explorer-mount');
  var staticWrap = document.getElementById('static-results');
  if (!mount || !staticWrap) return;
  var tbl = staticWrap.querySelector('table');
  var bodyRows = Array.prototype.slice.call(tbl.querySelectorAll('tbody tr'));
  var heads = Array.prototype.slice.call(tbl.querySelectorAll('thead tr:nth-child(2) th')); // 10 cells, first blank
  var tabs = [
    { name: 'Image generation', cols: [1, 2, 3, 4] },
    { name: '3D indoor scene', cols: [5, 6] },
    { name: 'Vanishing point', cols: [7, 8, 9] }
  ];
  var state = { tab: 0, sort: null, dir: 1 };

  var tabBar = document.createElement('div');
  tabBar.className = 'tabs'; tabBar.setAttribute('role', 'tablist');
  var bar = document.createElement('div');
  bar.className = 'explorer-bar';
  var hint = document.createElement('span');
  hint.textContent = 'Click a column header to sort (best first); click again to reverse, once more to reset.';
  var lab = document.createElement('label');
  var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true;
  lab.appendChild(cb); lab.appendChild(document.createTextNode(' Show GRPO comparison'));
  bar.appendChild(hint); bar.appendChild(lab);
  var wrap = document.createElement('div'); wrap.className = 'table-wrap';
  mount.appendChild(tabBar); mount.appendChild(bar); mount.appendChild(wrap);

  tabs.forEach(function (t, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'tab'; b.setAttribute('role', 'tab');
    b.textContent = t.name;
    b.addEventListener('click', function () { state.tab = i; state.sort = null; state.dir = 1; render(); });
    tabBar.appendChild(b); t.btn = b;
  });

  function num(td) {
    var m = td.textContent.replace(/[^0-9.\-]/g, '');
    return m === '' || m === '-' ? null : parseFloat(m);
  }
  function lowerBetter(th) { return th.textContent.indexOf('↓') >= 0; }

  function render() {
    var t = tabs[state.tab];
    tabs.forEach(function (x, i) { x.btn.setAttribute('aria-selected', i === state.tab ? 'true' : 'false'); });
    var rows = bodyRows.slice();
    if (state.sort !== null) {
      var ci = state.sort, lb = lowerBetter(heads[ci]);
      rows.sort(function (a, b) {
        var va = num(a.children[ci]), vb = num(b.children[ci]);
        if (va === null && vb === null) return 0;
        if (va === null) return 1; if (vb === null) return -1;
        var d = lb ? va - vb : vb - va;
        return d * state.dir;
      });
    }
    var table = document.createElement('table'); table.className = 'results';
    var thead = table.createTHead().insertRow();
    var th0 = document.createElement('th'); th0.textContent = 'Method'; thead.appendChild(th0);
    t.cols.forEach(function (ci) {
      var th = document.createElement('th');
      th.className = 'sortable'; th.tabIndex = 0; th.setAttribute('role', 'columnheader');
      th.innerHTML = heads[ci].innerHTML + ' <span class="arr"></span>';
      var arr = th.querySelector('.arr');
      if (state.sort === ci) { arr.textContent = state.dir === 1 ? '▾' : '▴'; th.setAttribute('aria-sort', state.dir === 1 ? 'descending' : 'ascending'); }
      var act = function () {
        if (state.sort !== ci) { state.sort = ci; state.dir = 1; }
        else if (state.dir === 1) state.dir = -1;
        else { state.sort = null; state.dir = 1; }
        render();
      };
      th.addEventListener('click', act);
      th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
      thead.appendChild(th);
    });
    var tb = table.createTBody();
    rows.forEach(function (r) {
      var tr = tb.insertRow(); tr.className = r.className;
      var c0 = tr.insertCell(); c0.innerHTML = r.children[0].innerHTML;
      t.cols.forEach(function (ci) { tr.insertCell().innerHTML = r.children[ci].innerHTML; });
    });
    wrap.innerHTML = ''; wrap.appendChild(table);
  }

  // GRPO comparison toggle drives the existing details block
  var grpo = document.querySelector('details.breakdown:not(.more)');
  var grpoNote = grpo ? grpo.nextElementSibling : null;
  cb.addEventListener('change', function () {
    if (!grpo) return;
    grpo.style.display = cb.checked ? '' : 'none';
    if (grpoNote && grpoNote.className === 'note') grpoNote.style.display = cb.checked ? '' : 'none';
  });

  staticWrap.style.display = 'none';
  render();
}
