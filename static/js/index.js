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
  var T = 20, BRANCH = 5, RES = [8, 12, 16], LAMBDA = 2.0;
  var X0 = 36, X1 = 700, YT = 0.5;
  var W = 720, TOP = 40, BOT = 280;
  var xs = function (s) { return X0 + (X1 - X0) * s / T; };
  var ys = function (v) { return TOP + (BOT - TOP) * v; };
  var reward = function (v) { var d = (v - YT) / 0.28; return Math.exp(-d * d); };

  var kSlider = document.getElementById('fk-k');
  var kVal = document.getElementById('fk-k-val');
  var playBtn = document.getElementById('fk-play');
  var stepBtn = document.getElementById('fk-step');
  var resetBtn = document.getElementById('fk-reset');

  var sim, p = 0, target = 0, playing = false, last = 0, raf = null;

  function simulate(k) {
    var r = rng(7 + k * 13);
    var pos = [], par = [], wt = [], src = {}, final = {};
    var prefix = [0.5];
    for (var s = 1; s <= BRANCH; s++) prefix.push(Math.min(0.95, Math.max(0.05, prefix[s - 1] + (r() - 0.5) * 0.12)));
    pos[BRANCH] = []; par[BRANCH] = []; wt[BRANCH] = [];
    for (var i = 0; i < k; i++) { pos[BRANCH][i] = prefix[BRANCH]; par[BRANCH][i] = i; wt[BRANCH][i] = 0; }
    for (s = BRANCH + 1; s <= T; s++) {
      pos[s] = []; par[s] = []; wt[s] = [];
      var prevSrc = src[s - 1];
      for (i = 0; i < k; i++) {
        var from = prevSrc ? prevSrc[i] : i;
        par[s][i] = from;
        var spread = 0.07 + 0.015 * (s - BRANCH);
        var v = pos[s - 1][from] + (r() - 0.5) * spread * 2;
        pos[s][i] = Math.min(0.97, Math.max(0.03, v));
        wt[s][i] = wt[s - 1][from];
      }
      if (RES.indexOf(s) >= 0) {
        var raw = [], tot = 0;
        for (i = 0; i < k; i++) {
          wt[s][i] = Math.max(reward(pos[s][i]), wt[s][i]);
          raw[i] = Math.exp(LAMBDA * wt[s][i]); tot += raw[i];
        }
        var sel = [];
        for (var j = 0; j < k; j++) {
          var u = r() * tot, acc = 0, pick = k - 1;
          for (i = 0; i < k; i++) { acc += raw[i]; if (u <= acc) { pick = i; break; } }
          sel[j] = pick;
        }
        src[s] = sel;
        // carry the chosen particles' weights forward
        wt[s] = sel.map(function (q) { return wt[s][q]; });
        // keep positions of sources for drawing the replacement links
        sim_tmp_pos[s] = pos[s].slice();
      }
    }
    return { k: k, pos: pos, par: par, wt: wt, src: src, prefix: prefix };
  }
  var sim_tmp_pos = {};

  function build(k) {
    sim_tmp_pos = {};
    sim = simulate(k);
    // final best/worst by reward at step T
    var rs = sim.pos[T].map(reward);
    sim.best = rs.indexOf(Math.max.apply(null, rs));
    sim.worst = rs.indexOf(Math.min.apply(null, rs));
    p = 0; target = 0; playing = false; playBtn.textContent = 'Play';
    playBtn.setAttribute('aria-pressed', 'false');
    draw();
  }

  // Which (step, slot) nodes lie on a path leading to the current frontier?
  function aliveSet(front) {
    var alive = {};
    var cur = {};
    for (var i = 0; i < sim.k; i++) cur[i] = true;
    for (var s = front; s > BRANCH; s--) {
      var nxt = {};
      for (i in cur) {
        alive[s + ':' + i] = true;
        // slot i at step s came from slot par[s][i] at step s-1
        nxt[sim.par[s][i]] = true;
      }
      cur = nxt;
    }
    return alive;
  }

  function draw() {
    while (svg.childNodes.length > 2) svg.removeChild(svg.lastChild); // keep title, desc
    var k = sim.k;
    var front = Math.min(T, Math.floor(p + 1e-6));
    var frac = p - Math.floor(p + 1e-6);
    // axis
    el('line', { x1: X0, y1: 296, x2: X1, y2: 296, stroke: '#c9ccd1' }, svg);
    var t1 = el('text', { x: X0, y: 312, 'class': 'fk-axis' }, svg); t1.textContent = 't = T (noise)';
    var t2 = el('text', { x: X1, y: 312, 'class': 'fk-axis', 'text-anchor': 'end' }, svg); t2.textContent = 't = 0 (sample)';
    // branch marker + resample markers
    function marker(s, label, col) {
      el('line', { x1: xs(s), y1: 26, x2: xs(s), y2: 296, stroke: col, 'stroke-dasharray': '3 4', 'stroke-width': 1 }, svg);
      var tx = el('text', { x: xs(s), y: 18, 'class': 'fk-axis', 'text-anchor': 'middle' }, svg);
      tx.textContent = label;
    }
    marker(BRANCH, 'branch (t_b = 5)', '#188038');
    RES.forEach(function (s, i) { marker(s, 'resample ' + ['0.4', '0.6', '0.8'][i] + 'T', '#1a73e8'); });

    var alive = aliveSet(front);
    var LIVE = '#1a73e8', DEAD = '#c4c7cc';
    var atEnd = front >= T;

    // shared prefix
    var pts = [];
    for (var s = 0; s <= Math.min(front, BRANCH); s++) pts.push(xs(s) + ',' + ys(sim.prefix[s]));
    if (front < BRANCH) {
      var a = sim.prefix[front], b = sim.prefix[front + 1];
      pts.push(xs(front + frac) + ',' + ys(a + (b - a) * frac));
    }
    el('polyline', { points: pts.join(' '), fill: 'none', stroke: LIVE, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);

    // segments: dead first, then live, then best/worst
    function seg(s, i, partial, style) {
      var from = sim.par[s][i];
      var x0 = xs(s - 1), y0 = ys(sim.pos[s - 1][from]);
      var x1 = xs(s), y1 = ys(sim.pos[s][i]);
      if (partial !== undefined) { x1 = x0 + (x1 - x0) * partial; y1 = y0 + (y1 - y0) * partial; }
      el('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: style.c, 'stroke-width': style.w, 'stroke-linecap': 'round', 'stroke-dasharray': style.d || 'none' }, svg);
    }
    var segs = [];
    for (s = BRANCH + 1; s <= Math.min(T, front + (frac > 0 ? 1 : 0)); s++) {
      for (var i = 0; i < k; i++) segs.push({ s: s, i: i, partial: s > front ? frac : undefined });
    }
    segs.forEach(function (g) {
      if (!alive[g.s + ':' + g.i]) seg(g.s, g.i, g.partial, { c: DEAD, w: 1.6, d: '4 3' });
    });
    segs.forEach(function (g) {
      var isLive = g.s > front || alive[g.s + ':' + g.i];
      if (isLive) seg(g.s, g.i, g.partial, { c: LIVE, w: 2.2 });
    });
    // best / worst lineages once finished
    if (atEnd) {
      [[sim.worst, '#c5221f'], [sim.best, '#188038']].forEach(function (bw) {
        var slot = bw[0];
        for (var st = T; st > BRANCH; st--) {
          seg(st, slot, undefined, { c: bw[1], w: 3.2 });
          slot = sim.par[st][slot];
        }
      });
    }
    // resample links: where a replaced particle was copied from
    RES.forEach(function (rs) {
      if (p < rs) return;
      var src = sim.src[rs];
      for (var j = 0; j < k; j++) {
        var cnt = 0; src.forEach(function (q2) { if (q2 === j) cnt++; });
        var pre = sim_tmp_pos[rs][j];
        var rad = 3 + 6 * reward(pre);
        var ok = cnt > 0;
        el('circle', { cx: xs(rs), cy: ys(pre), r: rad, fill: ok ? '#fff' : '#f1f3f4', stroke: ok ? '#1a73e8' : '#9aa0a6', 'stroke-width': 1.6 }, svg);
        if (!ok) {
          var x = xs(rs), y = ys(pre);
          el('line', { x1: x - 4, y1: y - 4, x2: x + 4, y2: y + 4, stroke: '#c5221f', 'stroke-width': 1.6 }, svg);
          el('line', { x1: x - 4, y1: y + 4, x2: x + 4, y2: y - 4, stroke: '#c5221f', 'stroke-width': 1.6 }, svg);
        } else if (cnt > 1) {
          var tx = el('text', { x: xs(rs) + 11, y: ys(pre) + 4, 'class': 'fk-lbl', fill: '#1a73e8', 'font-weight': 700 }, svg);
          tx.textContent = '×' + cnt;
        }
      }
    });
    // end labels
    if (atEnd) {
      var lb = el('text', { x: X1 - 4, y: ys(sim.pos[T][sim.best]) - 8, 'class': 'fk-lbl', 'text-anchor': 'end', fill: '#188038', 'font-weight': 700 }, svg);
      lb.textContent = 'best (kept)';
      var lw = el('text', { x: X1 - 4, y: ys(sim.pos[T][sim.worst]) + 16, 'class': 'fk-lbl', 'text-anchor': 'end', fill: '#c5221f', 'font-weight': 700 }, svg);
      lw.textContent = 'worst (kept)';
    }
    // playhead
    el('circle', { cx: xs(Math.min(T, p)), cy: 296, r: 4, fill: '#202124' }, svg);
  }

  function tick(now) {
    raf = null;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (p < target) {
      p = Math.min(target, p + dt * 5.5);
      draw();
      if (p >= target) { playing = false; playBtn.textContent = p >= T ? 'Replay' : 'Play'; playBtn.setAttribute('aria-pressed', 'false'); }
    }
    if (p < target) raf = requestAnimationFrame(tick);
  }
  function run(t) {
    target = t;
    playing = true;
    last = performance.now();
    playBtn.textContent = 'Pause';
    playBtn.setAttribute('aria-pressed', 'true');
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function pause() {
    target = p; playing = false;
    playBtn.textContent = 'Play'; playBtn.setAttribute('aria-pressed', 'false');
  }

  playBtn.addEventListener('click', function () {
    if (playing) { pause(); return; }
    if (p >= T) { p = 0; }
    run(T);
  });
  stepBtn.addEventListener('click', function () {
    var cur = Math.floor(p + 1e-6);
    var next = null;
    for (var i = 0; i < RES.length; i++) if (RES[i] >= cur && (RES[i] + 1) > p + 1e-6) { next = RES[i]; break; }
    if (next === null) { p = 0; next = RES[0]; }
    // go to just after the resample step so the copy is visible
    run(next + 1);
  });
  resetBtn.addEventListener('click', function () { build(sim.k); });
  kSlider.addEventListener('input', function () {
    kVal.textContent = kSlider.value;
    build(parseInt(kSlider.value, 10));
  });
  build(parseInt(kSlider.value, 10));
}

/* ---------- Sparse incremental curriculum ---------- */
function initCurriculum() {
  var svg = document.getElementById('cur-svg');
  if (!svg) return;
  var T = 20, SCHED = [5, 10, 15, 20];
  var stage = document.getElementById('cur-stage');
  var stageVal = document.getElementById('cur-stage-val');
  var nVal = document.getElementById('cur-n-val');
  var anyBtn = document.getElementById('cur-any');
  var lateBtn = document.getElementById('cur-late');
  var shuffleBtn = document.getElementById('cur-shuffle');
  var mode = 'any', seed = 3, subsets = {};

  // order[0..T-1]: position 0 is t = T (earliest denoising step)
  function subsetFor(n) {
    var key = mode + n + ':' + seed;
    if (subsets[key]) return subsets[key];
    var set = {};
    if (mode === 'late') { for (var i = T - n; i < T; i++) set[i] = true; }
    else {
      // nested random subsets: one random permutation per seed, first n taken
      var r = rng(seed * 101 + 5), perm = [];
      for (i = 0; i < T; i++) perm.push(i);
      for (i = T - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp; }
      for (i = 0; i < n; i++) set[perm[i]] = true;
    }
    subsets[key] = set;
    return set;
  }

  function draw() {
    while (svg.childNodes.length > 2) svg.removeChild(svg.lastChild);
    var n = SCHED[parseInt(stage.value, 10) - 1];
    var set = subsetFor(n);
    var X0 = 30, X1 = 700, slot = (X1 - X0) / T, bw = slot - 6;
    var BASE = 170, MAXH = 120;
    el('text', { x: X0, y: 22, 'class': 'cur-axis' }, svg).textContent = 'Stage ' + stage.value + ': ' + n + ' of ' + T + ' timesteps receive gradient updates';
    for (var i = 0; i < T; i++) {
      var x = X0 + i * slot + 3;
      var reach = Math.pow(0.9, i); // schematic decay, early steps highest
      var h = MAXH * reach;
      var on = !!set[i];
      el('rect', { x: x, y: BASE, width: bw, height: 28, rx: 4, fill: on ? '#1a73e8' : '#dfe1e5' }, svg);
      var lab = el('text', { x: x + bw / 2, y: BASE + 18, 'text-anchor': 'middle', 'class': 'cur-axis', fill: on ? '#fff' : '#5f6368' }, svg);
      lab.textContent = (T - i);
      lab.setAttribute('style', on ? 'fill:#fff' : '');
      el('rect', { x: x, y: BASE - 6 - h, width: bw, height: h, rx: 2, fill: '#f4b183', opacity: on ? 0.95 : 0.35 }, svg);
      if (on) el('rect', { x: x, y: BASE - 6 - h, width: bw, height: h, rx: 2, fill: 'none', stroke: '#1a73e8', 'stroke-width': 1.5 }, svg);
    }
    el('text', { x: X0, y: BASE + 50, 'class': 'cur-axis' }, svg).textContent = 'early: t = T (high generative reach)';
    el('text', { x: X1, y: BASE + 50, 'class': 'cur-axis', 'text-anchor': 'end' }, svg).textContent = 'late: t = 1 (low reach)';
    el('text', { x: 360, y: BASE + 50, 'class': 'cur-axis', 'text-anchor': 'middle' }, svg).textContent = '';
    stageVal.textContent = stage.value;
    nVal.textContent = n;
  }
  function setMode(m) {
    mode = m;
    anyBtn.classList.toggle('seg-on', m === 'any');
    lateBtn.classList.toggle('seg-on', m === 'late');
    anyBtn.setAttribute('aria-pressed', m === 'any');
    lateBtn.setAttribute('aria-pressed', m === 'late');
    shuffleBtn.disabled = m === 'late';
    draw();
  }
  stage.addEventListener('input', draw);
  anyBtn.addEventListener('click', function () { setMode('any'); });
  lateBtn.addEventListener('click', function () { setMode('late'); });
  shuffleBtn.addEventListener('click', function () { seed++; draw(); });
  draw();
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
