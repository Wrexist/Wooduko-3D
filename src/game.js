// Grain game runtime (ported 1:1 from prototype/grain.html).
// TODO(phase 1): split into board/, render/, fx/, audio/, input/, ui/ modules and convert to TypeScript.
(function(){
'use strict';
const V3 = THREE.Vector3;

/* ---------- constants ---------- */
const X0 = -4.5, Z0 = -4.5;
const DEPTH = 0.86, BT = 0.06, BS = 0.05, GAP = 0.045, CR = 0.1;
const HP = DEPTH + 2 * BT;
const BASE_Y = -(0.86 + 2 * 0.06) + 0.04;
const TOP_Y = BASE_Y + HP + 0.012;
const GHOST_Y = BASE_Y + 0.006;
const LIFT = 0.7, TRAY_S = 0.62;
const SAVE_KEY = 'grain_save_v1', BEST_KEY = 'grain_best_v1';

/* ---------- renderer / scene ---------- */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.info.autoReset = true;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.94;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a2415);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 300);
const maxAniso = renderer.capabilities.getMaxAnisotropy();

/* ---------- procedural wood textures ---------- */
const TAU = Math.PI * 2;
function rng(seed){ let s = (seed >>> 0) || 1; return function(){ s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function speckle(g, w, h, R, amt){
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4){ const n = (R() - 0.5) * amt; d[i] += n; d[i+1] += n; d[i+2] += n * 0.8; }
  g.putImageData(img, 0, 0);
}
function drawGrain(g, w, h, o){
  const R = rng(o.seed);
  g.fillStyle = o.base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < o.bands; i++){
    g.strokeStyle = (R() < 0.5 ? o.dark : o.light) + (0.04 + R() * 0.06) + ')';
    g.lineWidth = 20 + R() * 60; const y0 = R() * h, a = 10 + R() * 30, f = TAU * (1 + Math.floor(R() * 2)) / w, p = R() * 6;
    for (const oy of [-h, 0, h]){ g.beginPath(); for (let x = 0; x <= w; x += 16){ const y = oy + y0 + Math.sin(x * f + p) * a; x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); }
  }
  for (let i = 0; i < o.lines; i++){
    const dark = R() < 0.72;
    g.strokeStyle = (dark ? o.dark : o.light) + (dark ? 0.1 + R() * 0.32 : 0.08 + R() * 0.18) + ')';
    g.lineWidth = 0.6 + R() * (R() < 0.15 ? 4 : 1.8);
    const y0 = R() * h, a1 = 2 + R() * 9, f1 = TAU * (1 + Math.floor(R() * 4)) / w, p1 = R() * 6, a2 = R() * 1.5, f2 = TAU * (3 + Math.floor(R() * 5)) / w;
    for (const oy of [-h, 0, h]){
      if (y0 + oy < -20 || y0 + oy > h + 20) continue;
      g.beginPath();
      for (let x = 0; x <= w; x += 8){ const y = oy + y0 + Math.sin(x * f1 + p1) * a1 + Math.sin(x * f2 + p1 * 2) * a2; x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
  }
  speckle(g, w, h, R, o.noise || 12);
}
function canvasTex(cv, repeat){
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso;
  if (repeat){ t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function makeRingTexture(){
  const N = 1024, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d');
  const R = rng(11);
  const grd = g.createRadialGradient(N/2, N/2, 0, N/2, N/2, N * 0.72);
  grd.addColorStop(0, '#f1d9a8'); grd.addColorStop(0.6, '#e9cc95'); grd.addColorStop(1, '#ddb980');
  g.fillStyle = grd; g.fillRect(0, 0, N, N);
  const p = [R()*6.28, R()*6.28, R()*6.28, R()*6.28];
  let r = 3;
  while (r < N * 0.76){
    const k = 1.2 + r * 0.03;
    const ring = (w, col) => {
      g.strokeStyle = col; g.lineWidth = w; g.beginPath();
      for (let i = 0; i <= 180; i++){
        const a = i / 180 * Math.PI * 2;
        const rr = r + k * (Math.sin(3*a + p[0]) * 0.9 + Math.sin(5*a + p[1]) * 0.45 + Math.sin(2*a + p[2]) * 0.8 + Math.sin(8*a + p[3] + r * 0.013) * 0.22);
        const x = N/2 + Math.cos(a) * rr, y = N/2 + Math.sin(a) * rr;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath(); g.stroke();
    };
    ring(6 + R() * 8, 'rgba(200,150,90,' + (0.05 + R() * 0.06) + ')');
    ring(0.9 + R() * 2, 'rgba(150,92,42,' + (0.26 + R() * 0.26) + ')');
    r += 7 + R() * 14;
  }
  // a few fine radial checks, like real end grain
  for (let i = 0; i < 26; i++){
    const a = R() * Math.PI * 2, r0 = 40 + R() * 300, l = 20 + R() * 90;
    g.strokeStyle = 'rgba(140,90,45,' + (0.05 + R() * 0.08) + ')'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(N/2 + Math.cos(a) * r0, N/2 + Math.sin(a) * r0); g.lineTo(N/2 + Math.cos(a) * (r0 + l), N/2 + Math.sin(a) * (r0 + l)); g.stroke();
  }
  speckle(g, N, N, R, 13);
  const t = canvasTex(cv, false); t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; return t;
}
function makeLongGrain(w, h, o){ const cv = document.createElement('canvas'); cv.width = w; cv.height = h; drawGrain(cv.getContext('2d'), w, h, o); return cv; }

function makeBoardTexture(){
  const N = 1024, S = 9.24, ppu = N / S, m = (S - 9) / 2 * ppu;
  const cv = makeLongGrain(N, N, { seed: 5, base: '#4f2416', dark: 'rgba(22,8,3,', light: 'rgba(132,64,38,', lines: 260, bands: 18, noise: 10 });
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(12,4,1,.6)';
  g.fillRect(0, 0, N, m); g.fillRect(0, N - m, N, m); g.fillRect(0, 0, m, N); g.fillRect(N - m, 0, m, N);
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++){
    g.fillStyle = (br + bc) % 2 ? 'rgba(255,190,150,.07)' : 'rgba(0,0,0,.14)';
    g.fillRect(m + bc * 3 * ppu, m + br * 3 * ppu, 3 * ppu, 3 * ppu);
  }
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++){
    const x = m + c * ppu, y = m + r * ppu;
    g.fillStyle = 'rgba(255,200,170,.10)'; g.fillRect(x + 3, y + 3, ppu - 6, 3); g.fillRect(x + 3, y + 3, 3, ppu - 6);
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x + 3, y + ppu - 6, ppu - 6, 3); g.fillRect(x + ppu - 6, y + 3, 3, ppu - 6);
  }
  g.strokeStyle = 'rgba(10,3,1,.92)';
  for (let i = 0; i <= 9; i++){
    g.lineWidth = i % 3 === 0 ? 7 : 4;
    const v = m + i * ppu;
    g.beginPath(); g.moveTo(v, m - 2); g.lineTo(v, N - m + 2); g.stroke();
    g.beginPath(); g.moveTo(m - 2, v); g.lineTo(N - m + 2, v); g.stroke();
  }
  return canvasTex(cv, false);
}

const ringTex = makeRingTexture();
const sideTex = canvasTex(makeLongGrain(512, 512, { seed: 21, base: '#e4c38d', dark: 'rgba(150,100,52,', light: 'rgba(250,228,186,', lines: 140, bands: 8, noise: 10 }), true);
sideTex.repeat.set(0.4, 0.4);
const tableTex = canvasTex(makeLongGrain(1024, 1024, { seed: 33, base: '#8e5330', dark: 'rgba(70,34,14,', light: 'rgba(196,128,76,', lines: 170, bands: 18, noise: 7 }), true);
tableTex.repeat.set(1 / 10, 1 / 10);
const boardTex = makeBoardTexture();

const topMat = new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.66, metalness: 0 });
const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.62, metalness: 0 });

/* ---------- lights ---------- */
scene.add(new THREE.HemisphereLight(0xfff2de, 0x3a2312, 0.42));
const sun = new THREE.DirectionalLight(0xfff0d6, 1.22);
sun.position.set(-3, 20, -2.4); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffdcb4, 0.32); fill.position.set(7, 8, 11); scene.add(fill);

/* ---------- table with carved recess ---------- */
function roundedRect(p, x, y, w, h, r){
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
}
(function buildTable(){
  const s = new THREE.Shape(); roundedRect(s, -40, -40, 80, 80, 1);
  const hole = new THREE.Path(); roundedRect(hole, -4.9, -4.9, 9.8, 9.8, 0.22); s.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 1.25, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 6 });
  geo.rotateX(Math.PI / 2); geo.translate(0, -0.05, 0);
  const mat = new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.72 });
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(9.3, 9.3).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.78 }));
  fl.position.y = BASE_Y; fl.receiveShadow = true; scene.add(fl);
  // scale board texture plane to exact 9.24 texture area
  fl.scale.set(9.24 / 9.3, 1, 9.24 / 9.3);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(10.1, 10.1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1e0c05, roughness: 0.9 }));
  under.position.y = BASE_Y - 0.002; under.receiveShadow = true; scene.add(under);
  // raised carved ridges between cells: blocks drop down into their slots
  const RH = 0.26;
  const ridgeMat = new THREE.MeshStandardMaterial({ map: sideTex, color: 0x3e1c0f, roughness: 0.8 });
  for (let i = 0; i <= 9; i++){
    const w = i % 3 === 0 ? 0.085 : 0.06;
    const hz = new THREE.Mesh(new THREE.BoxGeometry(9 + w, RH, w), ridgeMat);
    hz.position.set(0, BASE_Y + RH / 2, Z0 + i);
    const vt = new THREE.Mesh(new THREE.BoxGeometry(w, RH, 9 + w), ridgeMat);
    vt.position.set(X0 + i, BASE_Y + RH / 2, 0);
    [hz, vt].forEach(m2 => { m2.castShadow = true; m2.receiveShadow = true; scene.add(m2); });
  }
})();

/* ---------- piece geometry: one carved block per piece ---------- */
function outlineLoops(cells){
  const edges = new Map();
  const add = (x1, y1, x2, y2) => {
    const rk = x2 + ',' + y2 + '>' + x1 + ',' + y1;
    if (edges.has(rk)) edges.delete(rk); else edges.set(x1 + ',' + y1 + '>' + x2 + ',' + y2, [x1, y1, x2, y2]);
  };
  for (const [r, c] of cells){ add(c, r, c+1, r); add(c+1, r, c+1, r+1); add(c+1, r+1, c, r+1); add(c, r+1, c, r); }
  const byStart = new Map(); for (const e of edges.values()) byStart.set(e[0] + ',' + e[1], e);
  const used = new Set(), loops = [];
  for (const [k, e0] of byStart){
    if (used.has(k)) continue;
    const pts = []; let e = e0, guard = 0;
    while (e && !used.has(e[0] + ',' + e[1]) && guard++ < 500){ used.add(e[0] + ',' + e[1]); pts.push([e[0], e[1]]); e = byStart.get(e[2] + ',' + e[3]); }
    const out = [];
    for (let i = 0; i < pts.length; i++){
      const p = pts[(i - 1 + pts.length) % pts.length], q = pts[i], n = pts[(i + 1) % pts.length];
      if ((q[0]-p[0]) * (n[1]-q[1]) - (q[1]-p[1]) * (n[0]-q[0]) !== 0) out.push(q);
    }
    if (out.length >= 4) loops.push(out);
  }
  return loops;
}
function insetLoop(pts, g){
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++){
    const p = pts[(i - 1 + n) % n], q = pts[i], nx = pts[(i + 1) % n];
    let d1x = q[0]-p[0], d1y = q[1]-p[1], l1 = Math.hypot(d1x, d1y); d1x /= l1; d1y /= l1;
    let d2x = nx[0]-q[0], d2y = nx[1]-q[1], l2 = Math.hypot(d2x, d2y); d2x /= l2; d2y /= l2;
    out.push([q[0] + (-d1y - d2y) * g, q[1] + (d1x + d2x) * g]);
  }
  return out;
}
function loopToShape(pts, r){
  const s = new THREE.Shape(), n = pts.length;
  for (let i = 0; i < n; i++){
    const p = pts[(i - 1 + n) % n], q = pts[i], nx = pts[(i + 1) % n];
    const lp = Math.hypot(p[0]-q[0], p[1]-q[1]), ln = Math.hypot(nx[0]-q[0], nx[1]-q[1]);
    const ax = q[0] + (p[0]-q[0]) / lp * r, ay = q[1] + (p[1]-q[1]) / lp * r;
    const bx = q[0] + (nx[0]-q[0]) / ln * r, by = q[1] + (nx[1]-q[1]) / ln * r;
    if (i === 0) s.moveTo(ax, ay); else s.lineTo(ax, ay);
    s.quadraticCurveTo(q[0], q[1], bx, by);
  }
  s.closePath(); return s;
}
function buildGeometry(cells, center, seed){
  const shapes = outlineLoops(cells).map(l => loopToShape(insetLoop(l, GAP + BS), CR));
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: DEPTH, bevelEnabled: true, bevelThickness: BT, bevelSize: BS, bevelSegments: 3, curveSegments: 3 });
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const ca = Math.cos(seed.a), sa = Math.sin(seed.a), rep = seed.s / 6.4;
  for (const grp of geo.groups){
    if (grp.materialIndex !== 0) continue;
    for (let i = grp.start; i < grp.start + grp.count; i++){
      const x = pos.getX(i) - center[0], y = pos.getY(i) - center[1];
      uv.setXY(i, 0.5 + seed.jx + (x * ca - y * sa) * rep, 0.5 + seed.jy + (x * sa + y * ca) * rep);
    }
  }
  uv.needsUpdate = true;
  geo.rotateX(Math.PI / 2); geo.translate(0, DEPTH + BT, 0);
  return geo;
}
function tintFor(seed, dim){ const t = dim ? 0.42 : seed.t; return dim ? new THREE.Color(t, t * 0.97, t * 0.93) : new THREE.Color(t, t * 0.992, t * 0.975); }
function makeMesh(cells, center, seed){
  const top = topMat.clone(), side = sideMat.clone();
  const col = tintFor(seed, false); top.color.copy(col); side.color.copy(col);
  const m = new THREE.Mesh(buildGeometry(cells, center, seed), [top, side]);
  m.castShadow = true; m.receiveShadow = true; return m;
}
function disposeMesh(m){ m.geometry.dispose(); m.material.forEach(x => x.dispose()); }
function makeSeed(){ return { a: Math.random() * 6.283, s: 0.85 + Math.random() * 0.35, jx: (Math.random() - 0.5) * 0.1, jy: (Math.random() - 0.5) * 0.1, t: 0.86 + Math.random() * 0.1 }; }

/* ---------- shapes ---------- */
function normalize(cells){
  const mr = Math.min(...cells.map(p => p[0])), mc = Math.min(...cells.map(p => p[1]));
  return cells.map(([r, c]) => [r - mr, c - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const ORIENTS = [];
(function(){
  const BASES = [['#',1],['##',2.2],['###',2.2],['####',1.6],['#####',1.1],['##|#.',3],['##|##',2.2],['#..|###',2.6],['###|.#.',2],['##.|.##',1.6],['#..|#..|###',1.5],['.#.|###|.#.',0.7],['#.#|###',0.6]];
  for (const [s, w] of BASES){
    const cells = [];
    s.split('|').forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') cells.push([r, c]); }));
    const seen = new Set(), list = [];
    let cur = cells;
    for (let m = 0; m < 2; m++){
      for (let k = 0; k < 4; k++){
        const n = normalize(cur), key = n.map(p => p.join(',')).join(';');
        if (!seen.has(key)){ seen.add(key); list.push(n); }
        cur = cur.map(([r, c]) => [c, -r]);
      }
      cur = cells.map(([r, c]) => [r, -c]);
    }
    list.forEach(n => {
      const h = Math.max(...n.map(p => p[0])) + 1, wd = Math.max(...n.map(p => p[1])) + 1;
      ORIENTS.push({ cells: n, w: wd, h, weight: w / list.length });
    });
  }
})();
const TOTAL_W = ORIENTS.reduce((a, o) => a + o.weight, 0);
function pickShape(){ let x = Math.random() * TOTAL_W; for (let i = 0; i < ORIENTS.length; i++){ x -= ORIENTS[i].weight; if (x <= 0) return i; } return 0; }

/* ---------- game state ---------- */
let grid = [...Array(9)].map(() => Array(9).fill(0));
const groups = new Map(); let nextId = 1;
let tray = [null, null, null];
let score = 0, displayScore = 0, streak = 0, best = 0, isOver = false;
try { best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}

function canPlace(cells, r0, c0){
  for (const [r, c] of cells){ const rr = r + r0, cc = c + c0; if (rr < 0 || rr > 8 || cc < 0 || cc > 8 || grid[rr][cc]) return false; }
  return true;
}
function canFitAnywhere(o){ for (let r = 0; r <= 9 - o.h; r++) for (let c = 0; c <= 9 - o.w; c++) if (canPlace(o.cells, r, c)) return true; return false; }
function findClears(occ){
  const set = new Set(), list = []; let units = 0;
  for (let r = 0; r < 9; r++){ let f = true; for (let c = 0; c < 9; c++) if (!occ(r, c)){ f = false; break; } if (f){ units++; list.push({ t: 'r', i: r }); for (let c = 0; c < 9; c++) set.add(r * 9 + c); } }
  for (let c = 0; c < 9; c++){ let f = true; for (let r = 0; r < 9; r++) if (!occ(r, c)){ f = false; break; } if (f){ units++; list.push({ t: 'c', i: c }); for (let r = 0; r < 9; r++) set.add(r * 9 + c); } }
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++){
    let f = true;
    for (let r = 0; r < 3 && f; r++) for (let c = 0; c < 3; c++) if (!occ(br * 3 + r, bc * 3 + c)){ f = false; break; }
    if (f){ units++; list.push({ t: 'b', i: br * 3 + bc }); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) set.add((br * 3 + r) * 9 + bc * 3 + c); }
  }
  return { set, units, list };
}
function components(cells){
  const left = new Set(cells.map(([r, c]) => r * 9 + c)), out = [];
  while (left.size){
    const start = left.values().next().value; left.delete(start);
    const comp = [], stack = [start];
    while (stack.length){
      const k = stack.pop(), r = (k / 9) | 0, c = k % 9; comp.push([r, c]);
      [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([a, b]) => { if (a < 0 || a > 8 || b < 0 || b > 8) return; const kk = a * 9 + b; if (left.has(kk)){ left.delete(kk); stack.push(kk); } });
    }
    out.push(comp);
  }
  return out;
}
function createGroup(cells, center, seed){
  const id = nextId++;
  const mesh = makeMesh(cells, center, seed); mesh.position.set(X0, BASE_Y, Z0); scene.add(mesh);
  groups.set(id, { id, cells, center, seed, mesh });
  for (const [r, c] of cells) grid[r][c] = id;
  return id;
}
function removeGroup(g){ scene.remove(g.mesh); disposeMesh(g.mesh); }

/* ---------- tray ---------- */
let layout = null;
function computeLayout(aspect){
  if (aspect > 1.15){
    layout = { land: true, slots: [[7.7, -3.3], [7.7, 0], [7.7, 3.3]], hit: [1.95, 1.62], bounds: { x0: -4.95, x1: 9.7, z0: -4.95, z1: 4.95 } };
  } else {
    layout = { land: false, slots: [[-3.5, 7.3], [0, 7.3], [3.5, 7.3]], hit: [1.75, 1.9], bounds: { x0: -5.05, x1: 5.05, z0: -4.95, z1: 8.9 } };
  }
}
function slotPos(i){ return new V3(layout.slots[i][0], 0, layout.slots[i][1]); }
function newTrayPiece(slot, shapeIdx, seed){
  const o = ORIENTS[shapeIdx]; seed = seed || makeSeed();
  const center = [o.cells.reduce((a, p) => a + p[1], 0) / o.cells.length + 0.5, o.cells.reduce((a, p) => a + p[0], 0) / o.cells.length + 0.5];
  const mesh = makeMesh(o.cells, center, seed); mesh.position.set(-o.w / 2, 0, -o.h / 2);
  const pivot = new THREE.Group(); pivot.add(mesh); pivot.scale.setScalar(TRAY_S); scene.add(pivot);
  return { shapeIdx, o, seed, center, mesh, pivot, slot, anim: false, fits: true, prev: new V3() };
}
function setPieceDim(p, dim){ const col = tintFor(p.seed, dim); p.mesh.material[0].color.copy(col); p.mesh.material[1].color.copy(col); }
function updateTrayFit(){ tray.forEach(p => { if (!p) return; p.fits = canFitAnywhere(p.o); setPieceDim(p, !p.fits); }); }
function chooseSet(){
  let set;
  for (let t = 0; t < 40; t++){ set = [pickShape(), pickShape(), pickShape()]; if (set.some(i => canFitAnywhere(ORIENTS[i]))) return set; }
  return set;
}
function refill(animate){
  const set = chooseSet();
  for (let i = 0; i < 3; i++){
    const p = newTrayPiece(i, set[i]); tray[i] = p;
    const to = slotPos(i);
    if (animate){
      const from = to.clone(); if (layout.land) from.x += 9; else from.x += 13;
      p.pivot.position.copy(from); p.anim = true;
      p.pivot.scale.setScalar(0.01);
      tween({ delay: 0.05 + i * 0.08, dur: 0.55, update: (e, k) => {
        p.pivot.position.lerpVectors(from, to, easeOutCubic(k));
        p.pivot.scale.setScalar(Math.max(0.01, TRAY_S * easeOutBack(Math.min(1, k * 1.15))));
      }, done: () => { p.anim = false; p.pivot.scale.setScalar(TRAY_S); } });
      if (i === 0) setTimeout(sDeal, 60);
    } else p.pivot.position.copy(to);
  }
  updateTrayFit();
}

/* ---------- overlays (ghost + clear preview) ---------- */
const ovTex = (function(){
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); roundedRect(g, 6, 6, 116, 116, 22); g.fill();
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t;
})();
const ovGeo = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
const overlays = [];
for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++){
  const mat = new THREE.MeshBasicMaterial({ map: ovTex, transparent: true, depthWrite: false, opacity: 0.5, color: 0xffffff });
  const m = new THREE.Mesh(ovGeo, mat); m.position.set(X0 + c + 0.5, GHOST_Y, Z0 + r + 0.5); m.visible = false; m.renderOrder = 2;
  scene.add(m); overlays.push(m);
}
const glowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const glows = [], glowT = new Float32Array(81);
for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++){
  const mat = new THREE.MeshBasicMaterial({ color: 0xffa323, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const m = new THREE.Mesh(glowGeo, mat); m.position.set(X0 + c + 0.5, TOP_Y, Z0 + r + 0.5); m.visible = false; m.renderOrder = 3;
  scene.add(m); glows.push(m);
}
const GHOST_COL = new THREE.Color(0xfff1d6), GHOST_GOLD = new THREE.Color(0xffc45c);
let previewKey = '', ghost = null;
function disposeGhost(){ if (!ghost) return; scene.remove(ghost.pivot); ghost.mesh.geometry.dispose(); ghost.mat.dispose(); ghost = null; }
function makeGhost(p){
  disposeGhost();
  const mat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0x2e1d08, roughness: 0.85, transparent: true, opacity: 0 });
  const m = new THREE.Mesh(p.mesh.geometry.clone(), mat); m.position.set(-p.o.w / 2, 0, -p.o.h / 2); m.renderOrder = 1;
  const pivot = new THREE.Group(); pivot.add(m); pivot.visible = false; scene.add(pivot);
  ghost = { pivot, mesh: m, mat, target: new V3(), show: false, clears: false, dead: false };
}
function clearPreview(){ glowT.fill(0); if (ghost) ghost.show = false; previewKey = ''; }
function setPreview(p, r0, c0){
  glowT.fill(0);
  const abs = new Set(p.o.cells.map(([r, c]) => (r + r0) * 9 + c + c0));
  const { set } = findClears((r, c) => grid[r][c] !== 0 || abs.has(r * 9 + c));
  set.forEach(k => { if (!abs.has(k)) glowT[k] = 1; });
  if (ghost){
    ghost.target.set(X0 + c0 + p.o.w / 2, BASE_Y + 0.003, Z0 + r0 + p.o.h / 2);
    if (ghost.mat.opacity < 0.04) ghost.pivot.position.copy(ghost.target);
    ghost.show = true; ghost.clears = [...abs].some(k => set.has(k));
  }
}
function updatePreviewFx(dt, time){
  const a = 1 - Math.exp(-dt * 14), pulse = 0.8 + 0.2 * Math.sin(time * 6.5);
  for (let i = 0; i < 81; i++){
    const m = glows[i].material, tgt = glowT[i] * 0.6 * pulse;
    m.opacity += (tgt - m.opacity) * a; glows[i].visible = m.opacity > 0.01;
  }
  if (ghost){
    const tgtO = ghost.show ? 0.42 : 0;
    ghost.mat.opacity += (tgtO - ghost.mat.opacity) * (1 - Math.exp(-dt * (ghost.show ? 16 : 24)));
    ghost.pivot.position.lerp(ghost.target, 1 - Math.exp(-dt * 26));
    ghost.mat.color.lerp(ghost.clears ? GHOST_GOLD : GHOST_COL, a);
    ghost.pivot.visible = ghost.mat.opacity > 0.01;
    if (ghost.dead && ghost.mat.opacity < 0.01) disposeGhost();
  }
}

/* ---------- tweens ---------- */
const tweens = [];
function tween(o){ o.t = -(o.delay || 0); tweens.push(o); return o; }
const lin = k => k, easeOutCubic = k => 1 - Math.pow(1 - k, 3), easeInCubic = k => k * k * k;
const easeOutBack = k => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
function updateTweens(dt){
  for (let i = tweens.length - 1; i >= 0; i--){
    const tw = tweens[i]; tw.t += dt; if (tw.t < 0) continue;
    const k = Math.min(1, tw.t / tw.dur); tw.update((tw.ease || lin)(k), k);
    if (k >= 1){ tweens.splice(i, 1); if (tw.done) tw.done(); }
  }
}

/* ---------- audio ---------- */
let ac = null, master = null, noiseBuf = null, muted = false;
try { muted = localStorage.getItem('grain_muted') === '1'; } catch (e) {}
function unlockAudio(){
  if (!ac){
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }
  if (ac && ac.state === 'suspended') ac.resume();
}
function env(g, t0, a, peak, dec){ g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec); }
function tone(type, f0, f1, t0, dur, peak){
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  env(g, t0, 0.004, peak, dur); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(type, freq, q, t0, dur, peak){
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); env(g, t0, 0.003, peak, dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.05);
}
function sPick(){ if (!ac) return; const t = ac.currentTime; noise('bandpass', 2600, 1.2, t, 0.05, 0.16); tone('sine', 880, 700, t, 0.05, 0.05); }
function sDrop(){ if (!ac) return; const t = ac.currentTime; tone('sine', 165, 72, t, 0.2, 0.6); noise('bandpass', 650, 1.1, t, 0.08, 0.38); tone('triangle', 430, 380, t, 0.07, 0.1); }
function sReturn(){ if (!ac) return; const t = ac.currentTime; tone('sine', 320, 210, t, 0.09, 0.12); noise('lowpass', 900, 0.7, t, 0.05, 0.08); }
function marimba(f, t0, g){ tone('sine', f, f, t0, 0.7, g); tone('sine', f * 4, f * 4, t0, 0.12, g * 0.22); tone('sine', f * 10, f * 10, t0, 0.04, g * 0.06); }
function sClear(units, st){
  if (!ac) return; const t = ac.currentTime;
  const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  const base = 330 * Math.pow(2, Math.min(st - 1, 7) * 2 / 12);
  const n = Math.min(scale.length, 3 + units);
  for (let i = 0; i < n; i++) marimba(base * Math.pow(2, scale[i] / 12), t + 0.05 + i * 0.055, 0.22);
  noise('highpass', 3500, 0.7, t + 0.04, 0.3, 0.05);
}
function sWhoosh(){ if (!ac) return; const t = ac.currentTime;
  const s2 = ac.createBufferSource(); s2.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
  f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(4200, t + 0.32);
  const g = ac.createGain(); env(g, t, 0.06, 0.16, 0.32); s2.connect(f); f.connect(g); g.connect(master); s2.start(t); s2.stop(t + 0.45); }
function sDeal(){ if (!ac) return; const t = ac.currentTime; [0, 0.08, 0.16].forEach(d => { noise('bandpass', 1800, 2, t + d, 0.04, 0.07); tone('sine', 620 + d * 900, 560 + d * 900, t + d, 0.05, 0.04); }); }
function sShine(){ if (!ac) return; const t = ac.currentTime; [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => marimba(523 * Math.pow(2, n / 12), t + 0.25 + i * 0.05, 0.16)); }
function sOver(){ if (!ac) return; const t = ac.currentTime; [392, 330, 262, 196].forEach((f, i) => marimba(f, t + i * 0.16, 0.2)); }
function buzz(ms){ try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

/* ---------- chips (wood splinters) ---------- */
const chipGeo = new THREE.BoxGeometry(0.11, 0.05, 0.17);
const chipMat = new THREE.MeshStandardMaterial({ map: sideTex, color: 0xf3dcae, roughness: 0.7 });
const chips = [];
function spawnChips(pos, n){
  for (let i = 0; i < n; i++){
    const m = new THREE.Mesh(chipGeo, chipMat); m.castShadow = true;
    m.position.set(pos.x + (Math.random() - 0.5) * 0.6, pos.y + 0.55, pos.z + (Math.random() - 0.5) * 0.6);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    const a = Math.random() * 6.283, sp = 1.4 + Math.random() * 2.6;
    chips.push({ m, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 3 + Math.random() * 3.2, sx: (Math.random() - 0.5) * 16, sy: (Math.random() - 0.5) * 16, life: 0.8 + Math.random() * 0.5, age: 0 });
    scene.add(m);
  }
}
function updateChips(dt){
  for (let i = chips.length - 1; i >= 0; i--){
    const c = chips[i]; c.age += dt; c.vy -= 16 * dt;
    c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt;
    if (c.m.position.y < 0.03){ c.m.position.y = 0.03; c.vy *= -0.32; c.vx *= 0.55; c.vz *= 0.55; c.sx *= 0.5; c.sy *= 0.5; }
    c.m.rotation.x += c.sx * dt; c.m.rotation.y += c.sy * dt;
    const s = c.age > c.life - 0.25 ? Math.max(0.001, (c.life - c.age) / 0.25) : 1; c.m.scale.setScalar(s);
    if (c.age >= c.life){ scene.remove(c.m); chips.splice(i, 1); }
  }
}

/* ---------- light fx: sparkles, sweeps, rings ---------- */
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function gradTex(w, h, draw){ const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t; }
const sparkTex = gradTex(64, 64, (g, w) => { const gr = g.createRadialGradient(w/2, w/2, 0, w/2, w/2, w/2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,.85)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
const barTex = gradTex(16, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
const haloTex = gradTex(256, 256, (g, w) => { const gr = g.createRadialGradient(w/2, w/2, w * 0.3, w/2, w/2, w/2); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.72, 'rgba(255,255,255,.9)'); gr.addColorStop(0.82, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
const boxTex = gradTex(128, 128, (g, w) => { const gr = g.createRadialGradient(w/2, w/2, 0, w/2, w/2, w * 0.72); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });

const SP_N = 700, spPos = new Float32Array(SP_N * 3), spCol = new Float32Array(SP_N * 3), spD = [];
for (let i = 0; i < SP_N; i++) spD.push({ age: 1, life: 0, vx: 0, vy: 0, vz: 0, r: 0, g: 0, b: 0 });
const spGeo = new THREE.BufferGeometry();
spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
spGeo.setAttribute('color', new THREE.BufferAttribute(spCol, 3));
const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({ size: 0.34, map: sparkTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
sparks.frustumCulled = false; sparks.renderOrder = 6; scene.add(sparks);
let spHead = 0, spLive = 0;
const SP_COLS = [[1, 0.86, 0.5], [1, 0.95, 0.75], [1, 0.72, 0.32], [1, 1, 0.92]];
function emitSparks(x, y, z, n, speed, up, spread){
  for (let k = 0; k < n; k++){
    const d = spD[spHead], i3 = spHead * 3; spHead = (spHead + 1) % SP_N;
    spPos[i3] = x + (Math.random() - 0.5) * (spread || 0.5); spPos[i3 + 1] = y; spPos[i3 + 2] = z + (Math.random() - 0.5) * (spread || 0.5);
    const a = Math.random() * 6.283, sp = speed * (0.35 + Math.random() * 0.8);
    d.vx = Math.cos(a) * sp; d.vz = Math.sin(a) * sp; d.vy = up * (0.5 + Math.random() * 0.8);
    const c = SP_COLS[(Math.random() * SP_COLS.length) | 0]; d.r = c[0]; d.g = c[1]; d.b = c[2];
    d.age = 0; d.life = 0.45 + Math.random() * 0.55;
  }
  spLive = 2;
}
function updateSparks(dt){
  if (!spLive) return;
  let alive = 0;
  for (let i = 0; i < SP_N; i++){
    const d = spD[i], i3 = i * 3;
    if (d.age >= d.life){ if (spCol[i3] !== 0){ spCol[i3] = spCol[i3 + 1] = spCol[i3 + 2] = 0; } continue; }
    alive++; d.age += dt;
    const drag = Math.exp(-dt * 2.2);
    d.vx *= drag; d.vz *= drag; d.vy = d.vy * drag - 5.5 * dt;
    spPos[i3] += d.vx * dt; spPos[i3 + 1] += d.vy * dt; spPos[i3 + 2] += d.vz * dt;
    const f = Math.max(0, 1 - d.age / d.life), tw = f * f * (0.75 + 0.25 * Math.sin(d.age * 40 + i));
    spCol[i3] = d.r * tw; spCol[i3 + 1] = d.g * tw; spCol[i3 + 2] = d.b * tw;
  }
  spGeo.attributes.position.needsUpdate = true; spGeo.attributes.color.needsUpdate = true;
  if (!alive) spLive--;
}
function fxMat(tex, color){ return new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }); }
const FX_Y = TOP_Y + 0.06;
function fxPlane(w, h, tex, color){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), fxMat(tex, color));
  m.renderOrder = 5; scene.add(m); return m;
}
function killFx(m){ scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
function sweepUnit(u, delay){
  let m, len = 9, axis = 'x', cx = 0, cz = 0;
  if (u.t === 'r'){ cz = Z0 + u.i + 0.5; m = fxPlane(9.4, 1.5, barTex, 0xffc560); }
  else if (u.t === 'c'){ cx = X0 + u.i + 0.5; axis = 'z'; m = fxPlane(9.4, 1.5, barTex, 0xffc560); m.rotation.y = Math.PI / 2; }
  else { const br = (u.i / 3) | 0, bc = u.i % 3; cx = X0 + bc * 3 + 1.5; cz = Z0 + br * 3 + 1.5; len = 3; m = fxPlane(3.8, 3.8, boxTex, 0xffc560); }
  m.position.set(cx, FX_Y, cz);
  let lastCell = -1;
  tween({ delay, dur: 0.7, update: (e, k) => {
    m.material.opacity = (k < 0.18 ? k / 0.18 : 1 - easeOutCubic((k - 0.18) / 0.82)) * 0.95;
    const sc = 1 + 0.5 * easeOutCubic(k);
    if (u.t === 'b') m.scale.set(sc, 1, sc); else m.scale.set(1, 1, sc);
    // a bright head travels along the line, shedding sparkles cell by cell
    const cell = Math.min(len - 1, Math.floor(easeOutCubic(Math.min(1, k * 2.2)) * len));
    while (lastCell < cell){
      lastCell++;
      let x = cx, z = cz;
      if (u.t === 'r') x = X0 + lastCell + 0.5; else if (u.t === 'c') z = Z0 + lastCell + 0.5;
      else { x = cx + ((lastCell % 3) - 1); z = cz + (Math.floor(lastCell / 3) - 1); }
      emitSparks(x, FX_Y, z, u.t === 'b' ? 5 : 6, 2.2, 3.2, 0.7);
    }
  }, done: () => killFx(m) });
}
function shockRing(x, z, size, color, peak, dur){
  const m = fxPlane(1, 1, haloTex, color); m.position.set(x, FX_Y - 0.02, z);
  tween({ dur: dur || 0.7, update: (e, k) => { const s2 = 0.4 + size * easeOutCubic(k); m.scale.set(s2, 1, s2); m.material.opacity = peak * (1 - k) * (1 - k); }, done: () => killFx(m) });
}
function landingRing(x, z, w, h){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: haloTex, color: 0xfff0d0, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  m.position.set(x, BASE_Y + 0.22, z); m.renderOrder = 4; scene.add(m);
  const base = Math.max(w, h) + 0.8;
  tween({ dur: 0.45, update: (e, k) => { const s2 = base * (0.85 + 0.45 * easeOutCubic(k)); m.scale.set(s2 * (w + 0.8) / base, 1, s2 * (h + 0.8) / base); m.material.opacity = 0.55 * (1 - k); }, done: () => killFx(m) });
}
function punch(a){
  if (REDUCED) return;
  tween({ dur: 0.5, update: (e, k) => { camera.zoom = 1 + a * (k < 0.14 ? easeOutCubic(k / 0.14) : Math.pow(1 - (k - 0.14) / 0.86, 2)); camera.updateProjectionMatrix(); }, done: () => { camera.zoom = 1; camera.updateProjectionMatrix(); } });
}
const flashEl = document.getElementById('flash');
function screenFlash(){ if (REDUCED) return; flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on'); }
function floatText(text, x, y, z, gold){
  const v = new V3(x, y, z).project(camera);
  const el = document.createElement('div'); el.className = 'float' + (gold ? ' gold' : ''); el.textContent = text;
  el.style.left = ((v.x + 1) / 2 * window.innerWidth) + 'px'; el.style.top = ((1 - v.y) / 2 * window.innerHeight) + 'px';
  document.body.appendChild(el); el.addEventListener('animationend', () => el.remove()); setTimeout(() => el.remove(), 1500);
}

/* ---------- clearing ---------- */
function spawnPop(r, c, g, ox, oz){
  const m = makeMesh([[r, c]], g.center, g.seed);
  const piv = new THREE.Group(); piv.position.set(X0 + c + 0.5, BASE_Y, Z0 + r + 0.5);
  m.position.set(-(c + 0.5), 0, -(r + 0.5)); piv.add(m); scene.add(piv);
  const dist = Math.hypot(piv.position.x - ox, piv.position.z - oz);
  const rx = (Math.random() - 0.5) * 1.4, rz = (Math.random() - 0.5) * 1.4;
  const top = m.material[0]; top.emissive.setHex(0xffa83a); top.emissiveIntensity = 0;
  let started = false;
  tween({ delay: dist * 0.03, dur: 0.55, update: (k) => {
    if (!started){ started = true; spawnChips(piv.position, 4); }
    piv.position.y = BASE_Y + easeOutCubic(Math.min(1, k * 1.6)) * 0.95;
    const s = k < 0.28 ? 1 + 0.16 * (k / 0.28) : 1.16 * (1 - easeInCubic((k - 0.28) / 0.72));
    piv.scale.setScalar(Math.max(0.001, s));
    piv.rotation.x = rx * k; piv.rotation.z = rz * k;
    top.emissiveIntensity = 0.55 * Math.sin(Math.min(1, k * 2) * Math.PI);
  }, done: () => { scene.remove(piv); disposeMesh(m); } });
}
function flashCells(set){
  set.forEach(k => {
    const o = overlays[k]; o.userData.flash = true; o.visible = true; o.position.y = GHOST_Y;
    o.material.color.setHex(0xffd27a);
    tween({ dur: 0.6, update: (e, k2) => { o.material.opacity = 0.75 * (1 - k2); }, done: () => { o.userData.flash = false; o.visible = false; } });
  });
}
function doClear(set, ox, oz){
  const byGroup = new Map();
  set.forEach(k => {
    const r = (k / 9) | 0, c = k % 9, gid = grid[r][c]; grid[r][c] = 0;
    if (!byGroup.has(gid)) byGroup.set(gid, []); byGroup.get(gid).push([r, c]);
  });
  byGroup.forEach((removed, gid) => {
    const g = groups.get(gid); if (!g) return;
    removed.forEach(([r, c]) => spawnPop(r, c, g, ox, oz));
    const rem = g.cells.filter(([r, c]) => !removed.some(q => q[0] === r && q[1] === c));
    removeGroup(g); groups.delete(gid);
    components(rem).forEach(comp => createGroup(comp, g.center, g.seed));
  });
  flashCells(set);
}

/* ---------- UI ---------- */
const scoreEl = document.getElementById('score'), bestEl = document.getElementById('bestVal');
const toastEl = document.getElementById('toast'), hintEl = document.getElementById('hint');
const overEl = document.getElementById('over'), hudEl = document.getElementById('hud');
bestEl.textContent = best;
function toast(big, small){
  const v = new V3(0, 0.5, -0.6).project(camera);
  toastEl.style.top = ((1 - v.y) / 2 * window.innerHeight) + 'px';
  toastEl.innerHTML = '<div class="big"></div>' + (small ? '<div class="small"></div>' : '');
  toastEl.querySelector('.big').textContent = big; if (small) toastEl.querySelector('.small').textContent = small;
  toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
}
const comboEl = document.getElementById('combo');
let comboShown = 0;
function updateCombo(){
  if (streak >= 2){
    comboEl.textContent = 'Combo ×' + streak; comboEl.classList.add('show');
    if (comboShown !== streak){ comboEl.classList.remove('kick'); void comboEl.offsetWidth; comboEl.classList.add('kick'); }
  } else comboEl.classList.remove('show', 'kick');
  comboShown = streak;
}
function bumpScore(){ scoreEl.classList.remove('bump'); void scoreEl.offsetWidth; scoreEl.classList.add('bump'); }
let hintHidden = false;
function hideHint(){ if (!hintHidden){ hintHidden = true; hintEl.classList.add('gone'); } }
function setBest(){ if (score > best){ best = score; bestEl.textContent = best; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {} } }

/* ---------- save / load ---------- */
function save(){
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      score, streak,
      groups: [...groups.values()].map(g => ({ cells: g.cells, center: g.center, seed: g.seed })),
      tray: tray.map(p => p ? { shape: p.shapeIdx, seed: p.seed } : null)
    }));
  } catch (e) {}
}
function load(){
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!s || !Array.isArray(s.tray) || !Array.isArray(s.groups)) return false;
    score = s.score | 0; streak = s.streak | 0; displayScore = score;
    s.groups.forEach(g => { if (g.cells.every(([r, c]) => r >= 0 && r < 9 && c >= 0 && c < 9 && !grid[r][c])) createGroup(g.cells, g.center, g.seed); });
    s.tray.forEach((t, i) => { if (t && ORIENTS[t.shape]){ const p = newTrayPiece(i, t.shape, t.seed); p.pivot.position.copy(slotPos(i)); tray[i] = p; } });
    if (tray.every(t => !t)) refill(false);
    updateTrayFit();
    if (groups.size) hideHint();
    return true;
  } catch (e) { return false; }
}

/* ---------- camera fit ---------- */
const camBase = new V3(); let shake = 0;
function fitCamera(){
  const W = window.innerWidth, H = window.innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.clearViewOffset(); camera.updateProjectionMatrix();
  computeLayout(W / H);
  const b = layout.bounds, target = new V3((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
  const dir = new V3(0, 1, 0.4).normalize();
  const padB = parseFloat(getComputedStyle(document.documentElement).paddingBottom) || 0;
  const topPx = hudEl.getBoundingClientRect().bottom + (layout.land ? 6 : 10), botPx = padB + (layout.land ? 14 : 20);
  const yTop = 1 - 2 * topPx / H, yBot = -1 + 2 * botPx / H, half = (yTop - yBot) / 2, mid = (yTop + yBot) / 2;
  const xLim = 0.95;
  const pts = []; [b.x0, b.x1].forEach(x => [b.z0, b.z1].forEach(z => [0, 0.4].forEach(y => pts.push(new V3(x, y, z)))));
  let lo = 4, hi = 250; const v = new V3();
  for (let i = 0; i < 40; i++){
    const d = (lo + hi) / 2;
    camera.position.copy(target).addScaledVector(dir, d); camera.lookAt(target); camera.updateMatrixWorld(true);
    let ok = true;
    for (const p of pts){ v.copy(p).project(camera); if (Math.abs(v.x) > xLim || Math.abs(v.y) > half){ ok = false; break; } }
    if (ok) hi = d; else lo = d;
  }
  camera.position.copy(target).addScaledVector(dir, hi); camera.lookAt(target); camera.updateMatrixWorld(true);
  camBase.copy(camera.position);
  camera.setViewOffset(W, H, 0, mid * H / 2, W, H); camera.updateProjectionMatrix();
  tray.forEach((p, i) => { if (p && !p.anim && (!drag || drag.piece !== p)) p.pivot.position.copy(slotPos(i)); });
}

/* ---------- input / dragging ---------- */
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pointerOnPlane(e, y){
  const rect = canvas.getBoundingClientRect();
  ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  if (Math.abs(d.y) < 1e-6) return null;
  return o.clone().addScaledVector(d, (y - o.y) / d.y);
}
let drag = null;
function updateDragTarget(e){
  // where the finger points on the board floor (piece floats a bit above the finger on touch)
  const land = pointerOnPlane(e, BASE_Y); if (!land) return;
  land.z += drag.offZ;
  // hover the piece on the same line of sight, so it sits exactly over the spot it will drop into
  const cp = camBase, d = land.clone().sub(cp);
  drag.target.copy(cp).addScaledVector(d, (LIFT - cp.y) / d.y);
  const o = drag.piece.o;
  const fc = land.x - X0 - o.w / 2, fr = land.z - Z0 - o.h / 2;
  let c0 = Math.round(fc), r0 = Math.round(fr);
  // hysteresis: keep the current spot until the finger clearly moves to the next cell
  if (drag.valid && Math.abs(fc - drag.c0) < 0.72 && Math.abs(fr - drag.r0) < 0.72 && canPlace(o.cells, drag.r0, drag.c0)){ r0 = drag.r0; c0 = drag.c0; }
  let valid = canPlace(o.cells, r0, c0);
  if (!valid){
    // magnet: snap to the nearest free spot within one cell
    let bd = 0.85 * 0.85, br = 0, bc = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++){
      const rr = Math.round(fr) + dr, cc = Math.round(fc) + dc, dd = (rr - fr) * (rr - fr) + (cc - fc) * (cc - fc);
      if (dd < bd && canPlace(o.cells, rr, cc)){ bd = dd; br = rr; bc = cc; valid = true; }
    }
    if (valid){ r0 = br; c0 = bc; }
  }
  const key = valid ? r0 + ',' + c0 : '';
  drag.valid = valid; drag.r0 = r0; drag.c0 = c0;
  if (key !== previewKey){ if (valid){ setPreview(drag.piece, r0, c0); previewKey = key; } else clearPreview(); }
}
canvas.addEventListener('pointerdown', e => {
  unlockAudio();
  if (isOver || drag) return;
  const p = pointerOnPlane(e, 0); if (!p) return;
  let bestP = null, bd = 1e9;
  tray.forEach((t, i) => {
    if (!t || t.anim) return;
    const s = slotPos(i), dx = Math.abs(p.x - s.x), dz = Math.abs(p.z - s.z);
    if (dx < layout.hit[0] && dz < layout.hit[1] && dx + dz < bd){ bd = dx + dz; bestP = t; }
  });
  if (!bestP) return;
  e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  const touch = e.pointerType !== 'mouse';
  drag = { piece: bestP, id: e.pointerId, offZ: touch ? -1.8 : 0, target: new V3(), valid: false, r0: 0, c0: 0 };
  bestP.prev.copy(bestP.pivot.position);
  makeGhost(bestP); hoverSlot = -1;
  updateDragTarget(e); sPick(); buzz(8); hideHint();
});
let hoverSlot = -1;
canvas.addEventListener('pointermove', e => {
  if (drag){ if (e.pointerId === drag.id) updateDragTarget(e); return; }
  if (e.pointerType !== 'mouse') return;
  const p = pointerOnPlane(e, 0); hoverSlot = -1; if (!p || isOver) return;
  tray.forEach((t, i) => { if (!t) return; const s2 = slotPos(i); if (Math.abs(p.x - s2.x) < layout.hit[0] && Math.abs(p.z - s2.z) < layout.hit[1]) hoverSlot = i; });
  canvas.style.cursor = hoverSlot >= 0 ? 'grab' : '';
});
canvas.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) endDrag(true); });
canvas.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) endDrag(false); });
document.addEventListener('gesturestart', e => e.preventDefault());

function endDrag(commit){
  const d = drag; drag = null; clearPreview(); if (ghost) ghost.dead = true;
  const p = d.piece;
  if (commit && d.valid && canPlace(p.o.cells, d.r0, d.c0)) dropPiece(p, d.r0, d.c0);
  else returnPiece(p);
}
function returnPiece(p){
  p.anim = true; sReturn();
  const pv = p.pivot, from = pv.position.clone(), fs = pv.scale.x, frx = pv.rotation.x, frz = pv.rotation.z, to = slotPos(p.slot);
  tween({ dur: 0.38, ease: easeOutBack, update: k => {
    pv.position.lerpVectors(from, to, k); pv.scale.setScalar(fs + (TRAY_S - fs) * k);
    pv.rotation.x = frx * (1 - k); pv.rotation.z = frz * (1 - k);
  }, done: () => { p.anim = false; pv.position.copy(to); pv.rotation.set(0, 0, 0); pv.scale.setScalar(TRAY_S); } });
}
function dropPiece(p, r0, c0){
  p.anim = true;
  const pv = p.pivot, from = pv.position.clone(), fs = pv.scale.x, frx = pv.rotation.x, frz = pv.rotation.z;
  const to = new V3(X0 + c0 + p.o.w / 2, BASE_Y, Z0 + r0 + p.o.h / 2);
  tween({ dur: 0.2, update: (e, k) => {
    const kx = easeOutCubic(Math.min(1, k * 1.25));
    pv.position.x = from.x + (to.x - from.x) * kx; pv.position.z = from.z + (to.z - from.z) * kx;
    pv.position.y = from.y + (to.y - from.y) * k * k;
    pv.scale.setScalar(fs + (1 - fs) * kx);
    pv.rotation.x = frx * (1 - kx); pv.rotation.z = frz * (1 - kx);
  }, done: () => commitPlacement(p, r0, c0) });
}
function commitPlacement(p, r0, c0){
  if (tray[p.slot] !== p) return;
  scene.remove(p.pivot); disposeMesh(p.mesh); tray[p.slot] = null;
  const cells = p.o.cells.map(([r, c]) => [r + r0, c + c0]);
  const gid = createGroup(cells, [p.center[0] + c0, p.center[1] + r0], p.seed);
  const gm = groups.get(gid).mesh;
  tween({ dur: 0.36, update: (e, k) => { gm.scale.y = 1 - 0.1 * Math.exp(-k * 6) * Math.cos(k * 14); }, done: () => { gm.scale.y = 1; } });
  const ox = X0 + c0 + p.o.w / 2, oz = Z0 + r0 + p.o.h / 2;
  sDrop(); buzz(14); shake = REDUCED ? 0 : 0.06;
  landingRing(ox, oz, p.o.w, p.o.h);
  score += cells.length;
  const { set, units, list } = findClears((r, c) => grid[r][c] !== 0);
  if (units){
    streak++;
    const base = 18 * units + 9 * units * (units - 1);
    let pts = Math.round(base * (1 + 0.5 * (streak - 1)));
    doClear(set, ox, oz);
    list.forEach((u, i) => sweepUnit(u, i * 0.06));
    const perfect = groups.size === 0;
    if (perfect) pts += 150;
    score += pts;
    sClear(units, streak); sWhoosh(); buzz([12, 40, 12]);
    shake = REDUCED ? 0 : 0.1 + 0.04 * Math.min(units, 4);
    punch(0.022 + 0.012 * Math.min(units + streak - 1, 5));
    shockRing(ox, oz, 4 + units * 2.5, 0xffd27a, 0.7 + 0.1 * Math.min(units, 3));
    if (units >= 2 || streak >= 3) screenFlash();
    floatText('+' + pts, ox, TOP_Y + 0.4, oz, true);
    let word = units >= 4 ? 'Unreal!' : units === 3 ? 'Excellent!' : units === 2 ? 'Great!' : streak >= 3 ? 'On fire!' : streak === 2 ? 'Combo!' : 'Nice!';
    if (perfect){
      word = 'Board clear!'; sShine();
      for (let i = 0; i < 9; i++) setTimeout(() => emitSparks(X0 + Math.random() * 9, FX_Y, Z0 + Math.random() * 9, 14, 3, 4.5, 1), i * 50);
      shockRing(0, 0, 14, 0xfff0c0, 0.9, 1);
    }
    toast(word, streak >= 2 ? 'Combo ×' + streak : (units >= 2 ? units + ' lines' : ''));
  } else {
    streak = 0;
    floatText('+' + cells.length, ox, TOP_Y + 0.3, oz, false);
  }
  updateCombo(); bumpScore();
  setBest();
  if (tray.every(t => !t)) refill(true); else updateTrayFit();
  if (!tray.some(t => t && canFitAnywhere(t.o))) triggerOver(); else save();
}
function triggerOver(){
  if (isOver) return; isOver = true;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  streak = 0; updateCombo();
  const dimCol = new THREE.Color(0.38, 0.35, 0.32);
  groups.forEach(g => {
    const mats = g.mesh.material, from = mats[0].color.clone(), row = Math.min(...g.cells.map(c => c[0]));
    tween({ delay: 0.05 + row * 0.05, dur: 0.4, update: e => { mats.forEach(m => m.color.copy(from).lerp(dimCol, e)); } });
  });
  setTimeout(() => {
    sOver();
    const fs = document.getElementById('finalScore'), target = score;
    tween({ dur: Math.min(1.2, 0.4 + target / 600), ease: easeOutCubic, update: e => { fs.textContent = Math.round(target * e); } });
    document.getElementById('finalBest').textContent = score >= best && score > 0 ? 'New best score' : 'Best ' + best;
    overEl.classList.remove('hidden');
    document.getElementById('again').focus({ preventScroll: true });
  }, 900);
}
function newGame(){
  drag = null; clearPreview(); disposeGhost();
  groups.forEach(removeGroup); groups.clear();
  grid = [...Array(9)].map(() => Array(9).fill(0));
  tray.forEach(p => { if (p){ scene.remove(p.pivot); disposeMesh(p.mesh); } });
  tray = [null, null, null];
  score = 0; displayScore = 0; streak = 0; isOver = false; updateCombo();
  overEl.classList.add('hidden');
  refill(true); save();
}

/* ---------- buttons ---------- */
let restartArmed = 0;
document.getElementById('btnRestart').addEventListener('click', () => {
  unlockAudio();
  if (isOver || score === 0 || Date.now() - restartArmed < 2500){ restartArmed = 0; newGame(); return; }
  restartArmed = Date.now(); toast('Restart?', 'Tap again to start over');
});
document.getElementById('again').addEventListener('click', () => { unlockAudio(); newGame(); });
const btnSound = document.getElementById('btnSound');
function renderSound(){
  document.getElementById('icoOn').style.display = muted ? 'none' : '';
  document.getElementById('icoOff').style.display = muted ? '' : 'none';
  btnSound.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
}
btnSound.addEventListener('click', () => {
  unlockAudio(); muted = !muted; if (master) master.gain.value = muted ? 0 : 0.9;
  try { localStorage.setItem('grain_muted', muted ? '1' : '0'); } catch (e) {}
  renderSound();
});
renderSound();

/* ---------- loop ---------- */
function updateDrag(dt){
  if (!drag || dt <= 0) return;
  const p = drag.piece, pv = p.pivot;
  p.prev.copy(pv.position);
  const axz = 1 - Math.exp(-dt * 30), ay = 1 - Math.exp(-dt * 15);
  pv.position.x += (drag.target.x - pv.position.x) * axz;
  pv.position.z += (drag.target.z - pv.position.z) * axz;
  pv.position.y += (drag.target.y - pv.position.y) * ay;
  pv.scale.setScalar(pv.scale.x + (1 - pv.scale.x) * (1 - Math.exp(-dt * 16)));
  const vx = (pv.position.x - p.prev.x) / dt, vz = (pv.position.z - p.prev.z) / dt;
  const cl = (x) => Math.max(-0.3, Math.min(0.3, x));
  const a = 1 - Math.exp(-dt * 12);
  pv.rotation.z += (cl(-vx * 0.028) - pv.rotation.z) * a;
  pv.rotation.x += (cl(vz * 0.028) - pv.rotation.x) * a;
}
let last = performance.now();
let dpr = Math.min(window.devicePixelRatio || 1, 2), ftAcc = 0, ftN = 0, slowSecs = 0;
function frame(now){
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
  // keep frames fast: if this device struggles, quietly render at a lower resolution
  ftAcc += raw; ftN++;
  if (ftAcc >= 1){ const avg = ftAcc / ftN; slowSecs = avg > 1 / 50 ? slowSecs + 1 : 0; if (slowSecs >= 2 && dpr > 1){ dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); slowSecs = 0; } ftAcc = 0; ftN = 0; }
  updateSparks(dt);
  updateTweens(dt); updateDrag(dt); updateChips(dt); updatePreviewFx(dt, now / 1000);
  const ah = 1 - Math.exp(-dt * 14);
  tray.forEach((t, i) => {
    if (!t || t.anim || (drag && drag.piece === t)) return;
    const hov = i === hoverSlot, ty = hov ? 0.22 : 0, ts = TRAY_S * (hov ? 1.07 : 1);
    t.pivot.position.y += (ty - t.pivot.position.y) * ah;
    t.pivot.scale.setScalar(t.pivot.scale.x + (ts - t.pivot.scale.x) * ah);
  });
  shake *= Math.exp(-dt * 14);
  camera.position.set(camBase.x + (Math.random() - 0.5) * shake, camBase.y + (Math.random() - 0.5) * shake * 0.5, camBase.z + (Math.random() - 0.5) * shake);
  if (Math.abs(score - displayScore) > 0.5){ displayScore += (score - displayScore) * Math.min(1, dt * 10); scoreEl.textContent = Math.round(displayScore); }
  else if (scoreEl.textContent !== String(score)){ displayScore = score; scoreEl.textContent = score; }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
fitCamera();
if (!load()) refill(true);
if (!tray.some(t => t && canFitAnywhere(t.o))) { isOver = false; newGame(); }
setBest(); scoreEl.textContent = score; updateCombo();
window.addEventListener('resize', fitCamera);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitCamera);
requestAnimationFrame(frame);
})();
