// 忖度ゴルフ / LET THE BOSS WIN
// 接待ゴルフで部長に「ほんの少しだけ」負ける。3D は three.js、時間は固定60Hz（performance.now で数える）
import * as THREE from './vendor/three.module.js'
if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath() }

const D = window.SG_DATA, J = D.JUDGE
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)]
const DT = 1 / 60, DEG = Math.PI / 180
const clamp = (v, a, b) => v < a ? a : v > b ? b : v
const lerp = (a, b, k) => a + (b - a) * k
const store = { get(k, d) { try { const v = localStorage.getItem('sg.' + k); return v == null ? d : v } catch (e) { return d } }, set(k, v) { try { localStorage.setItem('sg.' + k, v) } catch (e) {} } }
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const isTouch = matchMedia('(pointer:coarse)').matches

// ---------- 物理の定数（単位はヤード・秒）
const G = 60, LA = 40 * DEG, WIND_K = 0.9, SLOPE_K = 1.7, GR = 13, OBX = 46
const FRIC = { green: 7, fair: 11, rough: 24, ob: 24 }
const LANDK = { green: 0.15, fair: 0.13, rough: 0.07, ob: 0.07 }
const GAUGE_T = 1.5 // ゲージが 0→最大 にかかる秒
const CLOCK = 10 // 打つまでの持ち時間

// ---------- 状態
const S = {
  lang: store.get('lang', (navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en'),
  muted: store.get('mute', '0') === '1',
  view: 'title', phase: 'none', pt: 0, hole: 0, holes: [], plan: [], seed: 1, rng: Math.random, mood: D.MOOD0, results: [],
  aim: 0, gauge: { on: false, v: 0, dir: 1, fixed: null }, clock: CLOCK, ff: 1, paused: false, aimHold: 0, said: {},
  boss: null, me: null, sweat: false, over: false, t: 0,
}
let H = null // いまのホール
const T = k => D.TXT[S.lang][k] ?? D.TXT.ja[k] ?? k
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '')
const pickR = a => a[Math.floor(S.rng() * a.length)]
const pick = a => a[Math.floor(Math.random() * a.length)]

// ---------- 描画の土台
const canvas = $('#gl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.6 : 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene()
const SKY_TOP = new THREE.Color('#3f97e0'), SKY_BOT = new THREE.Color('#cfeaff')
scene.fog = new THREE.Fog(0xcfe6f5, 180, 620)
const camera = new THREE.PerspectiveCamera(52, 1, 0.3, 2000)
const pipCam = new THREE.PerspectiveCamera(40, 4 / 3, 0.3, 2000)
scene.add(new THREE.HemisphereLight(0xdff1ff, 0x5a8a3a, 1.25))
const sun = new THREE.DirectionalLight(0xfff4dc, 1.9); sun.position.set(70, 150, 90); scene.add(sun)
const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o })
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]) }
  return t
}
// 空（大きな球の内側にグラデーション）
;(() => {
  const g = new THREE.SphereGeometry(1200, 24, 12), col = [], p = g.attributes.position, c = new THREE.Color()
  for (let i = 0; i < p.count; i++) { const k = clamp(p.getY(i) / 700, 0, 1); c.copy(SKY_BOT).lerp(SKY_TOP, Math.pow(k, 0.6)); col.push(c.r, c.g, c.b) }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })))
  // 遠くの山と雲
  const mR = mulberry(3), mm = [lam(0x6c9bb8, { flatShading: true }), lam(0x7eaac4, { flatShading: true })]
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + mR() * 0.3, r = 700 + mR() * 120, h = 90 + mR() * 120, m = new THREE.Mesh(new THREE.ConeGeometry(120 + mR() * 90, h, 5), mm[i % 2]); m.position.set(Math.sin(a) * r, h / 2 - 10, -Math.cos(a) * r - 100); m.rotation.y = mR() * 3; scene.add(m) }
  const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, flatShading: true, fog: false }), cg = new THREE.IcosahedronGeometry(1, 0)
  for (let i = 0; i < 12; i++) {
    const grp = new THREE.Group(), a = (i / 12) * Math.PI * 2, r = 520 + mR() * 160
    for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(cg, cm); m.scale.set(26 + mR() * 20, 12 + mR() * 8, 18 + mR() * 10); m.position.set(k * 26 - 40, mR() * 8, mR() * 10); grp.add(m) }
    grp.position.set(Math.sin(a) * r, 150 + mR() * 90, -Math.cos(a) * r - 120); grp.lookAt(0, grp.position.y, 0); scene.add(grp)
  }
})()

// 地面（ラフ）。ホールごとに作り直さない共通部分
const roughTex = canvasTex(128, 128, (x, w, h) => { const r = mulberry(11); x.fillStyle = '#4c9a3f'; x.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? 'rgba(30,80,30,.18)' : 'rgba(150,210,110,.15)'; x.fillRect(r() * w, r() * h, 2, 3) } }, [90, 90])
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), lam(0xffffff, { map: roughTex })); ground.rotation.x = -Math.PI / 2; scene.add(ground)
const stripeTex = canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#7fd06a'; x.fillRect(0, 0, w, h); x.fillStyle = '#6fc25c'; x.fillRect(0, 0, w, h / 2) }, [1, 1])
const greenTex = canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#9be47e'; x.fillRect(0, 0, w, h); x.fillStyle = '#8ed872'; for (let i = 0; i < 4; i++) x.fillRect(0, i * 16, w, 8) }, [3, 3])

let holeGroup = null
const trunkG = new THREE.CylinderGeometry(0.5, 0.7, 4, 6); trunkG.translate(0, 2, 0)
const leafG = new THREE.ConeGeometry(1, 1, 7); leafG.translate(0, 0.5, 0)
const MAXT = 260
const trunkIM = new THREE.InstancedMesh(trunkG, lam(0x6b4a2e), MAXT), leafIM = new THREE.InstancedMesh(leafG, lam(0xffffff, { flatShading: true }), MAXT)
trunkIM.frustumCulled = leafIM.frustumCulled = false
scene.add(trunkIM, leafIM)

function capsuleShape(ax, az, bx, bz, r) {
  const sh = new THREE.Shape(), a = Math.atan2(bz - az, bx - ax), n = 14
  // Shape は (x, -z) で描き、あとで -90度 寝かせる
  for (let i = 0; i <= n; i++) { const t = a + Math.PI / 2 + (i / n) * Math.PI; const px = ax + Math.cos(t) * r, pz = az + Math.sin(t) * r; i ? sh.lineTo(px, -pz) : sh.moveTo(px, -pz) }
  for (let i = 0; i <= n; i++) { const t = a - Math.PI / 2 + (i / n) * Math.PI; sh.lineTo(bx + Math.cos(t) * r, -(bz + Math.sin(t) * r)) }
  return sh
}
function flat(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); return m }
function ellipseMesh(e, mat, y, grow = 0) { const m = flat(new THREE.CircleGeometry(1, 28), mat, e.x, y, e.z); m.scale.set(e.rx + grow, e.rz + grow, 1); return m }
const inEll = (e, x, z, g = 0) => ((x - e.x) / (e.rx + g)) ** 2 + ((z - e.z) / (e.rz + g)) ** 2 < 1

// ---------- ホールを作る
function buildHole(i) {
  const src = D.HOLES[i], r = mulberry(S.seed * 31 + i * 7 + 1)
  const pin = { x: src.px, z: -src.D }
  const h = {
    i, src, pin, D: Math.hypot(pin.x, pin.z), pond: src.pond, bunkers: src.bunkers, slope: { x: src.slope[0] * SLOPE_K, z: src.slope[1] * SLOPE_K },
    backZ: pin.z - 42, frontZ: 14, fa: { ax: 0, az: -10, bx: pin.x * 0.85, bz: pin.z + 22, r: 15 }, obs: [], trees: [],
  }
  h.club = Math.round(h.D * 1.25 / 5) * 5
  // 風。1ホール目は弱め、だんだん強く
  const ws = (1.2 + r() * 2.2) + i * 0.9, wa = r() * Math.PI * 2
  h.wind = { s: +ws.toFixed(1), ang: wa, x: Math.sin(wa) * ws * WIND_K, z: -Math.cos(wa) * ws * WIND_K }
  // カート（左の道）と、OB の外のクラブハウス（右）
  let cz = pin.z * 0.42; if (inEll(h.pond, -23, cz, 6)) cz = pin.z * 0.62
  h.cart = { kind: 'cart', x: -23, z: cz, hw: 1.3, hd: 2, h: 2.3 }
  h.house = { kind: 'house', x: OBX + 36, z: pin.z * 0.55, hw: 13, hd: 16, h: 11 }
  h.obs.push(h.cart, h.house)
  // 木: ラフの中（少なめ）・OB の外（多め・ただし OB 線から16yは空ける）・グリーン奥
  const ok = (x, z, rad) => !inEll(h.pond, x, z, rad + 2) && Math.hypot(x - pin.x, z - pin.z) > GR + 10 && !(Math.abs(x - h.house.x) < h.house.hw + 6 && Math.abs(z - h.house.z) < h.house.hd + 6) && Math.hypot(x - h.cart.x, z - h.cart.z) > 8 && fairDist(h, x, z) > h.fa.r + 4 && z < 40
  const add = (x, z) => { const rad = 2.4 + r() * 1.6, hh = 9 + r() * 7; if (ok(x, z, rad) && h.trees.length < MAXT) h.trees.push({ kind: 'tree', x, z, r: rad, h: hh }) }
  for (let z = 30; z > h.backZ - 40; z -= 6 + r() * 7) { for (const sd of [-1, 1]) { add(sd * (OBX + 17 + r() * 14), z); add(sd * (OBX + 34 + r() * 30), z - 3) } }
  for (let z = -20; z > pin.z + 10; z -= 18 + r() * 16) { for (const sd of [-1, 1]) if (r() < 0.55) add(sd * (h.fa.r + 9 + r() * (OBX - h.fa.r - 14)), z) }
  for (let x = -70; x < 70; x += 8 + r() * 6) add(x, h.backZ - 6 - r() * 26)
  h.obs.push(...h.trees)
  return h
}
function fairDist(h, x, z) { const f = h.fa, dx = f.bx - f.ax, dz = f.bz - f.az, t = clamp(((x - f.ax) * dx + (z - f.az) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(x - (f.ax + dx * t), z - (f.az + dz * t)) }
function surfAt(h, x, z) {
  if (inEll(h.pond, x, z)) return 'water'
  for (const b of h.bunkers) if (inEll(b, x, z)) return 'sand'
  if (Math.hypot(x - h.pin.x, z - h.pin.z) < GR) return 'green'
  if (Math.abs(x) > OBX || z < h.backZ || z > h.frontZ) return 'ob'
  if (fairDist(h, x, z) < h.fa.r) return 'fair'
  return 'rough'
}
const tierOf = (h, x, z) => { const s = surfAt(h, x, z); return s === 'ob' ? 2 : s === 'water' ? 1 : 0 }

// 見た目を作る
const M = {
  fair: lam(0xffffff, { map: stripeTex }), green: lam(0xffffff, { map: greenTex }), fringe: lam(0x86d36c), sand: lam(0xf1dfa8), sandLip: lam(0xd9c48a),
  water: new THREE.MeshPhongMaterial({ color: 0x3aa0d8, shininess: 80, specular: 0xbfe8ff, transparent: true, opacity: 0.92 }), waterEdge: lam(0x8a8f7a),
  ob: lam(0x3a7d34, { transparent: true, opacity: 0.55 }), tee: lam(0x8fdc76), path: lam(0xb9b4a8), white: lam(0xf4f4f0), red: lam(0xd8262e), dark: lam(0x222222),
}
function showHole(h) {
  if (holeGroup) { scene.remove(holeGroup); holeGroup.traverse(o => { if (o.geometry && !o.userData.keep) o.geometry.dispose() }) }
  const g = holeGroup = new THREE.Group(); scene.add(g)
  stripeTex.repeat.set(1, 10)
  const fa = new THREE.Mesh(new THREE.ShapeGeometry(capsuleShape(h.fa.ax, h.fa.az, h.fa.bx, h.fa.bz, h.fa.r)), M.fair); fa.rotation.x = -Math.PI / 2; fa.position.y = 0.03
  // ストライプがフェアウェイの向きに並ぶよう UV を z 基準に
  { const uv = fa.geometry.attributes.uv, p = fa.geometry.attributes.position; for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k) / 30, p.getY(k) / 14) }
  g.add(fa)
  for (const sd of [-1, 1]) { const o = flat(new THREE.PlaneGeometry(300, 900), M.ob, sd * (OBX + 150), 0.015, -200); g.add(o) }
  g.add(flat(new THREE.CircleGeometry(GR + 2.2, 40), M.fringe, h.pin.x, 0.04, h.pin.z))
  const gr = flat(new THREE.CircleGeometry(GR, 40), M.green, h.pin.x, 0.05, h.pin.z); gr.rotation.z = Math.atan2(h.slope.x, -h.slope.z); g.add(gr)
  for (const b of h.bunkers) { g.add(ellipseMesh(b, M.sandLip, 0.06, 0.7)); g.add(ellipseMesh(b, M.sand, 0.07)) }
  g.add(ellipseMesh(h.pond, M.waterEdge, 0.07, 1.2)); const w = ellipseMesh(h.pond, M.water, 0.09); w.userData.water = true; g.add(w); h.waterMesh = w
  // ティー
  const tb = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 7), M.tee); tb.position.set(0, 0.15, 1); g.add(tb)
  // カート道
  const pathM = flat(new THREE.PlaneGeometry(3, -h.pin.z + 40), M.path, -23, 0.02, (h.pin.z + 20) / 2 + 5); g.add(pathM)
  // OB 杭
  const stakeG = new THREE.CylinderGeometry(0.18, 0.18, 1.6, 5), n = Math.ceil((h.frontZ - h.backZ) / 12)
  const st = new THREE.InstancedMesh(stakeG, M.white, n * 2), mt = new THREE.Matrix4(); let k = 0
  for (let j = 0; j < n; j++) for (const sd of [-1, 1]) { mt.makeTranslation(sd * OBX, 0.8, h.frontZ - j * 12); st.setMatrixAt(k++, mt) }
  g.add(st)
  // ピンと旗
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 6), M.white); pole.position.set(h.pin.x, 4, h.pin.z); g.add(pole)
  const flagGeo = new THREE.PlaneGeometry(3.4, 2.1, 6, 1); flagGeo.translate(1.7, 0, 0)
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ color: 0xff3b3b, side: THREE.DoubleSide })); flag.position.set(h.pin.x, 7, h.pin.z); g.add(flag); h.flag = flag
  g.add(flat(new THREE.CircleGeometry(0.55, 16), M.dark, h.pin.x, 0.07, h.pin.z))
  // グリーンの傾きを示す矢印
  h.chev = []
  const chG = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-1.2, -0.6), new THREE.Vector2(0, 0.8), new THREE.Vector2(1.2, -0.6), new THREE.Vector2(0, -0.1)]))
  const chM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false })
  for (let j = 0; j < 3; j++) { const c = flat(chG, chM, h.pin.x, 0.1, h.pin.z); c.rotation.z = Math.atan2(-h.slope.x, -h.slope.z); g.add(c); h.chev.push(c) }
  // カート
  const cart = new THREE.Group(); cart.position.set(h.cart.x, 0, h.cart.z)
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 3.6), M.white); body.position.y = 0.8; cart.add(body)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.5), lam(0x2c3e66)); seat.position.set(0, 1.6, 0.4); cart.add(seat)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 3.2), lam(0x2c6fd6)); roof.position.y = 2.4; cart.add(roof)
  for (const [px, pz] of [[-1, -1.3], [1, -1.3], [-1, 1.3], [1, 1.3]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 4), M.dark); p.position.set(px, 1.8, pz); cart.add(p); const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10), M.dark); wh.rotation.z = Math.PI / 2; wh.position.set(px * 1.25, 0.4, pz); cart.add(wh) }
  const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.4, 8), lam(0xd8262e)); bag.position.set(0, 1.5, 1.5); bag.rotation.x = 0.3; cart.add(bag)
  g.add(cart)
  // クラブハウス（窓ガラスつき）
  const hs = h.house, house = new THREE.Group(); house.position.set(hs.x, 0, hs.z)
  const winT = canvasTex(256, 96, (x, w, hh) => { x.fillStyle = '#efe4cc'; x.fillRect(0, 0, w, hh); for (let c = 0; c < 6; c++) { x.fillStyle = '#7fb9de'; x.fillRect(10 + c * 41, 20, 32, 46); x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(14 + c * 41, 24, 8, 30) } x.fillStyle = '#8b5a2b'; x.fillRect(0, 80, w, 16) })
  const hb = new THREE.Mesh(new THREE.BoxGeometry(hs.hw * 2, hs.h, hs.hd * 2), [lam(0xffffff, { map: winT }), lam(0xffffff, { map: winT }), lam(0xefe4cc), lam(0xefe4cc), lam(0xffffff, { map: winT }), lam(0xffffff, { map: winT })]); hb.position.y = hs.h / 2; house.add(hb)
  const hr = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(hs.hw, hs.hd) * 1.05, 6, 4), lam(0x8e3b2a, { flatShading: true })); hr.rotation.y = Math.PI / 4; hr.position.y = hs.h + 3; hr.scale.set(1, 1, hs.hd / hs.hw); house.add(hr)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), lam(0xffffff, { map: canvasTex(512, 96, (x, w, hh) => { x.fillStyle = '#1d5326'; x.fillRect(0, 0, w, hh); x.fillStyle = '#fff'; x.font = '900 56px "Hiragino Sans","Yu Gothic",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SONTAKU COUNTRY CLUB', w / 2, hh / 2 + 2) }) }))
  sign.position.set(-hs.hw - 0.05, hs.h - 2, 0); sign.rotation.y = -Math.PI / 2; house.add(sign)
  g.add(house)
  // 木
  const col = new THREE.Color(), lc = [0x2f7a34, 0x3c8c3a, 0x276b2e, 0x4d9a3f]
  h.trees.forEach((t, j) => { mt.makeScale(t.r * 0.35, 1 + t.h * 0.05, t.r * 0.35); mt.setPosition(t.x, 0, t.z); trunkIM.setMatrixAt(j, mt); mt.makeScale(t.r * 1.15, t.h - 2.5, t.r * 1.15); mt.setPosition(t.x, 2.5, t.z); leafIM.setMatrixAt(j, mt); leafIM.setColorAt(j, col.set(lc[j % 4])) })
  trunkIM.count = leafIM.count = h.trees.length; trunkIM.instanceMatrix.needsUpdate = leafIM.instanceMatrix.needsUpdate = true; if (leafIM.instanceColor) leafIM.instanceColor.needsUpdate = true
}

// ---------- 球の物理（同じ関数で、実際の飛行・解く用・検証用を回す）
const dirOf = a => ({ x: Math.sin(a), z: -Math.cos(a) })
function newBall(h, aim, power) {
  const R = Math.max(0.5, power * h.club), v = Math.sqrt(R * G / Math.sin(2 * LA)), d = dirOf(aim)
  return { x: 0, y: 0.2, z: 0, vx: d.x * v * Math.cos(LA), vy: v * Math.sin(LA), vz: d.z * v * Math.cos(LA), st: 'fly', t: 0, ev: [], hop: 0, hopV: 0, surf: null, landT: 0 }
}
function collide(b, h) {
  for (const o of h.obs) {
    if (b.y > o.h) continue
    if (o.kind === 'tree') {
      const dx = b.x - o.x, dz = b.z - o.z, d2 = dx * dx + dz * dz; if (d2 > o.r * o.r * (b.y < 2.5 ? 0.12 : 1)) continue
      const d = Math.sqrt(d2) || 1, nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz
      if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vz -= 1.6 * vn * nz; b.vx *= 0.35; b.vz *= 0.35; if (b.vy > 0) b.vy *= 0.3; b.ev.push('tree') }
    } else {
      const dx = b.x - o.x, dz = b.z - o.z; if (Math.abs(dx) > o.hw + 0.3 || Math.abs(dz) > o.hd + 0.3) continue
      const px = o.hw + 0.3 - Math.abs(dx), pz = o.hd + 0.3 - Math.abs(dz)
      if (b.y > o.h - 0.6 && b.vy < 0) { b.y = o.h; b.vy = -b.vy * 0.4; b.vx *= 0.6; b.vz *= 0.6 } // 屋根で跳ねる
      else if (px < pz) { b.x = o.x + Math.sign(dx) * (o.hw + 0.3); b.vx = -b.vx * 0.35; b.vz *= 0.6 } else { b.z = o.z + Math.sign(dz) * (o.hd + 0.3); b.vz = -b.vz * 0.35; b.vx *= 0.6 }
      if (b.ev[b.ev.length - 1] !== o.kind) b.ev.push(o.kind)
    }
  }
}
function stepBall(b, h) {
  if (b.st === 'rest') return
  b.t += DT
  if (b.st === 'fly') {
    b.vy -= G * DT; b.vx += h.wind.x * DT; b.vz += h.wind.z * DT
    b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT
    collide(b, h)
    if (b.y <= 0) {
      b.y = 0; const s = surfAt(h, b.x, b.z); b.surf = s
      if (s === 'water') { rest(b, h); b.ev.push('water'); return }
      if (s === 'sand') { rest(b, h); b.ev.push('sand'); return }
      const k = LANDK[s]; b.vx *= k; b.vz *= k; b.vy = 0; b.st = 'roll'; b.hopV = 6; b.hop = 0; b.landT = b.t; b.ev.push('land')
    }
  } else if (b.st === 'roll') {
    const s = surfAt(h, b.x, b.z); b.surf = s
    if (s === 'water') { rest(b, h); b.ev.push('water'); return }
    if (s === 'sand') { rest(b, h); b.ev.push('sand'); return }
    let sp = Math.hypot(b.vx, b.vz)
    if (sp > 0) { const ns = Math.max(0, sp - FRIC[s] * DT); b.vx *= ns / sp; b.vz *= ns / sp }
    if (s === 'green') { b.vx += h.slope.x * DT; b.vz += h.slope.z * DT }
    b.x += b.vx * DT; b.z += b.vz * DT
    b.hopV -= 40 * DT; b.hop = Math.max(0, b.hop + b.hopV * DT); if (b.hop === 0 && b.hopV < 0) b.hopV = Math.abs(b.hopV) > 3 ? -b.hopV * 0.35 : 0
    b.y = b.hop
    collide(b, h)
    sp = Math.hypot(b.vx, b.vz)
    if (Math.hypot(b.x - h.pin.x, b.z - h.pin.z) < 0.55 && sp < 9) { b.x = h.pin.x; b.z = h.pin.z; b.ev.push('cup'); rest(b, h); b.holed = true; return }
    if (sp < 0.35) rest(b, h)
  }
  if (b.t > 25) rest(b, h)
}
function rest(b, h) { b.st = 'rest'; b.vx = b.vy = b.vz = 0; b.y = 0; b.dist = Math.hypot(b.x - h.pin.x, b.z - h.pin.z); b.tier = tierOf(h, b.x, b.z); b.surf = surfAt(h, b.x, b.z) }
function runShot(h, aim, power) { const b = newBall(h, aim, power); let n = 0; while (b.st !== 'rest' && n++ < 3000) stepBall(b, h); return b }
// 狙った地点に止まる向きと強さを探す（部長のショットと、検証のボット用）
function solve(h, tx, tz, noWind) {
  const hw = h.wind; if (noWind) h.wind = { s: 0, ang: 0, x: 0, z: 0 }
  let aim = Math.atan2(tx, -tz), pw = clamp((Math.hypot(tx, tz) - 6) / h.club, 0.03, 1.05), best = null
  for (let it = 0; it < 24; it++) {
    const b = runShot(h, aim, pw), ex = tx - b.x, ez = tz - b.z, e = Math.hypot(ex, ez)
    if (!best || e < best.e) best = { aim, power: pw, e, b }
    if (e < 0.04) break
    const f = dirOf(aim), r = { x: Math.cos(aim), z: Math.sin(aim) }, along = ex * f.x + ez * f.z, lat = ex * r.x + ez * r.z
    const dist = Math.max(20, Math.hypot(b.x, b.z))
    pw = clamp(pw + along / h.club * 0.85, 0.02, 1.05); aim += lat / dist * 0.9
  }
  // 仕上げ: 強さと向きを少しずつ動かして詰める（グリーンの傾きで転がる分）
  let st = [0.01, 0.004]
  for (let it = 0; it < 30 && best.e > 0.05; it++) {
    let improved = false
    for (const [da, dp] of [[st[1], 0], [-st[1], 0], [0, st[0]], [0, -st[0]]]) { const b = runShot(h, best.aim + da, best.power + dp), e = Math.hypot(tx - b.x, tz - b.z); if (e < best.e) { best = { aim: best.aim + da, power: best.power + dp, e, b }; improved = true } }
    if (!improved) { st = [st[0] / 2, st[1] / 2]; if (st[0] < 0.0003) break }
  }
  h.wind = hw
  return best
}
function judge(dB, tB, dP, tP) {
  if (tP < tB) return { v: 'beat', m: dP - dB }
  if (tP > tB) return { v: 'overdo', m: dP - dB }
  const m = dP - dB
  const v = m < 0 ? 'beat' : m < J.hiyari ? 'hiyari' : m <= J.tight ? 'tight' : m <= J.perfect ? 'perfect' : m <= J.good ? 'good' : m <= J.loose ? 'loose' : 'obvious'
  return { v, m }
}

// ---------- 人（部長とあなた）
function drawFace(x, s, expr, t, o = {}) {
  const boss = o.who !== 'me'
  x.save(); x.clearRect(0, 0, s, s); x.scale(s / 100, s / 100); x.lineCap = 'round'; x.lineJoin = 'round'
  const red = expr === 'angry'
  if (o.portrait) {
    x.fillStyle = red ? '#ff9c86' : boss ? '#ffd9ae' : '#ffe6c8'; x.beginPath(); x.ellipse(50, 56, 40, 41, 0, 0, 7); x.fill()
    x.fillStyle = red ? '#ff9c86' : '#ffd0a0'; for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(50 + sd * 40, 58, 6, 9, 0, 0, 7); x.fill() }
    // サンバイザー
    x.fillStyle = boss ? '#ffffff' : '#2c3e66'; x.beginPath(); x.moveTo(12, 34); x.quadraticCurveTo(50, 10, 88, 34); x.lineTo(88, 40); x.quadraticCurveTo(50, 22, 12, 40); x.fill()
    x.fillStyle = boss ? '#d8262e' : '#ffc53d'; x.beginPath(); x.ellipse(50, 38, 36, 6, 0, 0, Math.PI); x.fill()
    if (boss) { x.strokeStyle = '#3a2a20'; x.lineWidth = 2; x.beginPath(); x.moveTo(30, 20); x.quadraticCurveTo(50, 12, 66, 18); x.stroke() } // バーコード頭
  }
  x.strokeStyle = '#1f1a17'; x.fillStyle = '#1f1a17'
  const browY = 44, eyeY = 53
  // 眉
  x.lineWidth = boss ? 5 : 3.5
  const brow = (sd, a, dy = 0) => { x.beginPath(); x.moveTo(50 + sd * 9, browY + dy + a * sd * 0 + (a > 0 ? a : 0)); x.lineTo(50 + sd * 25, browY + dy - a); x.stroke() }
  if (expr === 'angry') { for (const sd of [-1, 1]) { x.beginPath(); x.moveTo(50 + sd * 8, browY + 6); x.lineTo(50 + sd * 26, browY - 3); x.stroke() } }
  else if (expr === 'sweat' || expr === 'shock' || expr === 'sad' || expr === 'nervous') { for (const sd of [-1, 1]) { x.beginPath(); x.moveTo(50 + sd * 8, browY - 4); x.lineTo(50 + sd * 25, browY + 3); x.stroke() } }
  else if (expr === 'smug') { brow(-1, 0, 1); x.beginPath(); x.moveTo(59, browY - 3); x.quadraticCurveTo(68, browY - 10, 76, browY - 5); x.stroke() }
  else if (expr === 'sus') { x.beginPath(); x.moveTo(26, browY + 1); x.lineTo(42, browY + 3); x.stroke(); x.beginPath(); x.moveTo(58, browY - 4); x.lineTo(75, browY - 7); x.stroke() }
  else { brow(-1, 1); brow(1, 1) }
  // 目
  x.lineWidth = 3.5
  for (const sd of [-1, 1]) {
    const ex = 50 + sd * 16
    if (expr === 'happy') { x.beginPath(); x.arc(ex, eyeY + 3, 6, Math.PI * 1.1, Math.PI * 1.9); x.stroke() }
    else if (expr === 'smug') { x.beginPath(); x.moveTo(ex - 7, eyeY); x.lineTo(ex + 7, eyeY); x.stroke(); x.beginPath(); x.arc(ex + 1, eyeY + 1.5, 2.6, 0, Math.PI); x.fill() }
    else if (expr === 'shock' || expr === 'sweat' || expr === 'panic') { x.fillStyle = '#fff'; x.beginPath(); x.arc(ex, eyeY, expr === 'shock' ? 8 : 6.5, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#1f1a17'; x.beginPath(); x.arc(ex + Math.sin(t * 20) * (expr === 'sweat' ? 1.5 : 0), eyeY, 2, 0, 7); x.fill() }
    else if (expr === 'angry') { x.beginPath(); x.arc(ex, eyeY + 1, 3.2, 0, 7); x.fill(); x.beginPath(); x.moveTo(ex - 7, eyeY - 4); x.lineTo(ex + 7, eyeY - 4); x.stroke() }
    else if (expr === 'sus') { x.beginPath(); x.moveTo(ex - 7, eyeY); x.lineTo(ex + 7, eyeY); x.stroke(); x.beginPath(); x.arc(ex, eyeY + 1.6, 2.4, 0, Math.PI); x.fill() }
    else if (expr === 'sad') { x.beginPath(); x.arc(ex, eyeY, 3, 0, 7); x.fill() }
    else { x.beginPath(); x.ellipse(ex, eyeY, 3.2, 4, 0, 0, 7); x.fill() }
  }
  // 鼻
  x.fillStyle = red ? '#d8262e' : boss ? '#f2a07a' : '#f5b48e'; x.beginPath(); x.ellipse(50, 63, boss ? 6 : 4, boss ? 5 : 3.5, 0, 0, 7); x.fill()
  // 口
  x.fillStyle = '#1f1a17'; x.lineWidth = 3.5
  const my = boss ? 80 : 76
  if (expr === 'happy') { x.fillStyle = '#7a1c1c'; x.beginPath(); x.moveTo(36, my - 4); x.quadraticCurveTo(50, my + 16, 64, my - 4); x.closePath(); x.fill(); x.fillStyle = '#ff8a8a'; x.beginPath(); x.ellipse(50, my + 4, 6, 3, 0, 0, 7); x.fill() }
  else if (expr === 'smug') { x.beginPath(); x.moveTo(40, my); x.quadraticCurveTo(52, my + 4, 64, my - 6); x.stroke() }
  else if (expr === 'sweat' || expr === 'nervous') { x.beginPath(); x.moveTo(38, my); for (let k = 0; k <= 6; k++) x.lineTo(38 + k * 4, my + (k % 2 ? -3 : 2)); x.stroke() }
  else if (expr === 'angry') { x.fillStyle = '#fff'; x.beginPath(); x.roundRect(36, my - 6, 28, 11, 3); x.fill(); x.stroke(); x.beginPath(); x.moveTo(36, my - 1); x.lineTo(64, my - 1); x.moveTo(43, my - 6); x.lineTo(43, my + 5); x.moveTo(50, my - 6); x.lineTo(50, my + 5); x.moveTo(57, my - 6); x.lineTo(57, my + 5); x.stroke() }
  else if (expr === 'shock' || expr === 'panic') { x.fillStyle = '#7a1c1c'; x.beginPath(); x.ellipse(50, my, 6, 8, 0, 0, 7); x.fill() }
  else if (expr === 'sad') { x.beginPath(); x.arc(50, my + 8, 9, Math.PI * 1.2, Math.PI * 1.8); x.stroke() }
  else if (expr === 'sus') { x.beginPath(); x.moveTo(42, my); x.lineTo(58, my - 1); x.stroke() }
  else { x.beginPath(); x.moveTo(42, my); x.quadraticCurveTo(50, my + 3, 58, my); x.stroke() }
  // ひげ（部長）
  if (boss) { x.fillStyle = '#2a211b'; x.beginPath(); x.moveTo(50, 68); x.quadraticCurveTo(36, 66, 30, 75); x.quadraticCurveTo(40, 72, 50, 73); x.quadraticCurveTo(60, 72, 70, 75); x.quadraticCurveTo(64, 66, 50, 68); x.fill() }
  // 汗・怒りマーク・キラリ
  if (expr === 'sweat' || expr === 'shock' || expr === 'nervous' || expr === 'panic') {
    x.fillStyle = '#5fb8ff'; x.strokeStyle = '#fff'; x.lineWidth = 1.5
    for (let k = 0; k < 3; k++) { const ph = (t * 1.3 + k * 0.33) % 1, sx = [18, 84, 74][k], sy = 30 + ph * 40; x.globalAlpha = 1 - ph * 0.6; x.beginPath(); x.moveTo(sx, sy - 7); x.quadraticCurveTo(sx + 5, sy, sx, sy + 4); x.quadraticCurveTo(sx - 5, sy, sx, sy - 7); x.fill(); x.stroke() }
    x.globalAlpha = 1
  }
  if (expr === 'angry') { x.strokeStyle = '#d8262e'; x.lineWidth = 3.5; const vx = 78, vy = 26; for (const [a, b2, c, d] of [[-6, -2, -2, -2], [-2, -2, -2, -6], [2, -6, 2, -2], [2, -2, 6, -2], [-6, 2, -2, 2], [-2, 2, -2, 6], [2, 6, 2, 2], [2, 2, 6, 2]]) { x.beginPath(); x.moveTo(vx + a, vy + b2); x.lineTo(vx + c, vy + d); x.stroke() } x.fillStyle = 'rgba(255,60,60,.35)'; for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(50 + sd * 24, 66, 7, 4, 0, 0, 7); x.fill() } }
  if (expr === 'smug' && o.portrait) { x.fillStyle = '#ffd23f'; const sx = 88, sy = 18, r = 6 + Math.sin(t * 6) * 2; x.beginPath(); x.moveTo(sx, sy - r); x.lineTo(sx + r * 0.3, sy - r * 0.3); x.lineTo(sx + r, sy); x.lineTo(sx + r * 0.3, sy + r * 0.3); x.lineTo(sx, sy + r); x.lineTo(sx - r * 0.3, sy + r * 0.3); x.lineTo(sx - r, sy); x.lineTo(sx - r * 0.3, sy - r * 0.3); x.fill() }
  if (expr === 'happy' && boss) { x.fillStyle = 'rgba(255,90,90,.35)'; for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(50 + sd * 25, 66, 7, 4, 0, 0, 7); x.fill() } }
  x.restore()
}
function makePerson(o) {
  const g = new THREE.Group(), pants = lam(o.pants), shirt = lam(o.shirt), skin = lam(o.skin), b = o.belly
  for (const sd of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.28), pants); l.position.set(sd * 0.15, 0.43, 0); g.add(l); const sh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.36), lam(0xffffff)); sh.position.set(sd * 0.15, 0.06, 0.04); g.add(sh) }
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.33 * b, 0.72, 10), shirt); torso.position.y = 1.2; g.add(torso)
  if (b > 1.05) { const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34 * b, 12, 10), shirt); belly.position.set(0, 1.05, 0.12); belly.scale.set(1, 0.95, 0.9); g.add(belly) }
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.33 * b, 0.33 * b, 0.07, 10), lam(0x2a2a2a)); belt.position.y = 0.86; g.add(belt)
  const headG = new THREE.Group(); headG.position.y = 1.78; g.add(headG)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 12), skin); headG.add(head)
  const fc = document.createElement('canvas'); fc.width = fc.height = 128; const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false })); face.position.set(0, -0.02, 0.255); headG.add(face)
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.1, 14, 1, true), lam(o.cap, { side: THREE.DoubleSide })); visor.position.y = 0.12; headG.add(visor)
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.24), lam(o.brim)); brim.position.set(0, 0.1, 0.32); headG.add(brim)
  // 腕とクラブ（肩の高さで回す）
  const piv = new THREE.Group(); piv.position.set(0, 1.45, 0.12); g.add(piv)
  for (const sd of [-1, 1]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.13), shirt); a.position.set(sd * 0.12, -0.3, 0.08); a.rotation.z = sd * 0.25; piv.add(a) }
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), skin); hand.position.set(0, -0.62, 0.1); piv.add(hand)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 5), lam(0xcfd4da)); shaft.position.set(0, -1.1, 0.1); piv.add(shaft)
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.1), lam(0x3a3f45)); ch.position.set(0.06, -1.6, 0.1); piv.add(ch)
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.06; g.add(shadow)
  scene.add(g)
  const P = { g, piv, headG, head, skinM: skin, skin0: new THREE.Color(o.skin), face, ft, fc, who: o.who, expr: '', swing: 0, bow: 0, jump: 0, shake: 0 }
  P.setExpr = e => { if (P.expr === e && !/sweat|shock|nervous|panic/.test(e)) return; P.expr = e; drawFace(fc.getContext('2d'), 128, e, S.t, { who: o.who }); ft.needsUpdate = true }
  P.setExpr(o.who === 'me' ? 'nervous' : 'smug')
  return P
}
// 人を置く。facing は顔の向き（ラジアン、0 が +z）
function place(P, x, z, facing) { P.g.position.set(x, 0, z); P.g.rotation.y = facing }
function faceTo(P, tx, tz) { P.g.rotation.y = Math.atan2(tx - P.g.position.x, tz - P.g.position.z) }
function stance(P, aim) { const d = dirOf(aim); place(P, -Math.cos(aim) * 0.95, -Math.sin(aim) * 0.95, Math.atan2(Math.cos(aim), Math.sin(aim))) ; return d }

// ---------- 目印（球・柱・名札・輪）
function labelSprite(text, bg) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d')
  x.fillStyle = bg; x.strokeStyle = '#fff'; x.lineWidth = 8; x.beginPath(); x.roundRect(8, 8, 240, 64, 22); x.fill(); x.stroke()
  x.beginPath(); x.moveTo(110, 70); x.lineTo(128, 92); x.lineTo(146, 70); x.fill()
  x.fillStyle = '#fff'; x.font = '900 40px "M PLUS Rounded 1c","Hiragino Sans",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 42)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, sizeAttenuation: false, depthTest: false, transparent: true })); s.scale.set(0.16, 0.06, 1); s.center.set(0.5, 0); s.renderOrder = 10
  return s
}
const glowTex = canvasTex(64, 64, (x, w) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w) })
function makeBallSet(color, label) {
  const g = new THREE.Group()
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35 })); g.add(ball)
  const ring = flat(new THREE.RingGeometry(0.9, 1.4, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }), 0, 0.12, 0); g.add(ring)
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 26, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false })); beam.position.y = 13; g.add(beam)
  const lab = labelSprite(label, '#' + new THREE.Color(color).getHexString()); lab.position.y = 4; g.add(lab)
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(3.2, 3.2, 1); g.add(glow)
  const trail = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 200), 3)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }))
  trail.frustumCulled = false; scene.add(trail)
  g.visible = false; scene.add(g)
  return { g, ball, ring, beam, lab, trail, glow, pts: [], side: label === 'YOU' ? 0.1 : 0.9, labY: label === 'YOU' ? 2 : 4.2 }
}
const bossSet = makeBallSet(0xe0303a, '部長'), mySet = makeBallSet(0x2c6fd6, 'YOU')
function setLabel(set, text, color) { const s = labelSprite(text, color); s.center.set(set.side, 0); set.g.remove(set.lab); set.lab.material.map.dispose(); set.lab = s; s.position.y = 4; set.g.add(s) }
function syncSet(set, b, live) {
  if (!b) { set.g.visible = false; set.trail.visible = false; return }
  set.g.visible = true; set.g.position.set(b.x, 0, b.z); set.ball.position.y = b.y + 0.55
  const resting = b.st === 'rest'; set.ring.visible = resting || b.st === 'roll'; set.beam.visible = resting; set.lab.visible = true; set.lab.position.y = b.y + set.labY
  if (b.surf === 'water' && resting) set.ball.position.y = 0.1
  set.glow.position.y = set.ball.position.y; set.glow.visible = b.st === 'fly'
  const arr = set.trail.geometry.attributes.position.array; arr.fill(0); arr.set(set.pts.slice(-600)); set.trail.geometry.setDrawRange(0, set.pts.length / 3); set.trail.geometry.attributes.position.needsUpdate = true
  set.trail.visible = set.pts.length > 3
}
// 忖度ゾーンの輪（部長の距離の赤線と、金色の帯）
const ringG = new THREE.Group(); scene.add(ringG)
const ringRed = flat(new THREE.RingGeometry(1, 1.1, 128), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.95, depthWrite: false }), 0, 0.14, 0)
const ringGold = flat(new THREE.RingGeometry(1, 2, 128), new THREE.MeshBasicMaterial({ color: 0xffc53d, transparent: true, opacity: 0.6, depthWrite: false }), 0, 0.13, 0)
ringG.add(ringGold, ringRed); ringG.visible = false
function setRing(r) {
  ringG.position.set(H.pin.x, 0, H.pin.z)
  const lw = Math.max(0.18, r * 0.012)
  ringRed.geometry.dispose(); ringRed.geometry = new THREE.RingGeometry(Math.max(0.01, r - lw), r + lw, 160)
  ringGold.geometry.dispose(); ringGold.geometry = new THREE.RingGeometry(r + J.hiyari, r + J.perfect, 160)
  ringG.visible = true
}
// 狙いの線
const aimLine = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, map: canvasTex(16, 64, (x, w, h) => { x.fillStyle = '#fff'; for (let i = 0; i < 4; i++) x.fillRect(0, i * 16, w, 9) }, [1, 40]) }))
aimLine.rotation.x = -Math.PI / 2; aimLine.visible = false; scene.add(aimLine)

// 粒（池の水しぶき・砂・ガラス・湯気・紙吹雪）
const PN = 400, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), parts = []
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3))
const dotTex = canvasTex(32, 32, (x, w) => { x.fillStyle = '#fff'; x.beginPath(); x.arc(16, 16, 14, 0, 7); x.fill() })
const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.5, map: dotTex, alphaTest: 0.5, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false })); pts.frustumCulled = false; scene.add(pts)
function burst(x, y, z, n, col, sp, up, g = 30, life = 1.2, size) {
  const c = new THREE.Color(col)
  for (let i = 0; i < n; i++) { if (parts.length >= PN) parts.shift(); const a = Math.random() * 6.283, s = sp * (0.3 + Math.random()); parts.push({ x, y, z, vx: Math.cos(a) * s, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * s, g, life: life * (0.6 + Math.random() * 0.6), c }) }
}
function stepParts() {
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.vy -= p.g * DT; p.x += p.vx * DT; p.y += p.vy * DT; p.z += p.vz * DT; p.life -= DT; if (p.y < 0) { p.y = 0; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6 } if (p.life <= 0) parts.splice(i, 1) }
  for (let i = 0; i < PN; i++) { const p = parts[i]; if (p) { pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z; pCol[i * 3] = p.c.r; pCol[i * 3 + 1] = p.c.g; pCol[i * 3 + 2] = p.c.b } else { pPos[i * 3 + 1] = -999 } }
  pGeo.attributes.position.needsUpdate = pGeo.attributes.color.needsUpdate = true
}

// ---------- 画面と文言
function go(v) {
  S.view = v
  for (const id of ['vTitle', 'vHow', 'vPlay', 'vResult']) $('#' + id).hidden = id !== v
  Snd.setTrack(v === 'vPlay' ? 'play' : v === 'vResult' ? (S.resTrack || 'win') : 'title')
}
function applyLang() {
  document.documentElement.lang = S.lang
  for (const el of $$('[data-t]')) el.innerHTML = T(el.dataset.t)
  $('#logoMain').innerHTML = S.lang === 'ja' ? '忖度<b>ゴルフ</b>' : 'LET THE<br><b>BOSS WIN</b>'
  $('#langTxt').textContent = S.lang === 'ja' ? 'EN' : 'JA'
  $('#howCtl').innerHTML = isTouch ? T('howSp') + '<br>' + T('howPc') : T('howPc') + '<br>' + T('howSp')
  $('#figBoss').textContent = T('bossBall'); $('#figYou').textContent = T('yourBall')
  setLabel(bossSet, S.lang === 'ja' ? '部長' : 'BOSS', '#e0303a'); setLabel(mySet, S.lang === 'ja' ? 'あなた' : 'YOU', '#2c6fd6')
  if (S.view === 'vPlay' && H) refreshHud()
  if (S.view === 'vResult' && S.final) fillResult(false)
}
const faceCans = () => $$('canvas.face')
function drawUiFaces() {
  const e = S.bossExpr || 'smug'
  for (const c of faceCans()) { const ex = c.dataset.face || e; drawFace(c.getContext('2d'), c.width, ex, S.t, { portrait: true }) }
}
function say(key, force) {
  const arr = D.BOSS[S.lang][key]; if (!arr) return
  const txt = force || pick(arr); S.lastSay = key; $('#talkTxt').textContent = txt
  const tk = $('#talk'); tk.style.opacity = 1
}
function me(key) { const a = D.ME[S.lang][key]; const el = $('#me'); if (!a) { el.classList.remove('on'); return } el.textContent = pick(a); el.classList.add('on') }
function setBoss(e) { S.bossExpr = e; S.boss.setExpr(e) }
function banner(txt, sub, cls, sfx) {
  const b = $('#banner'); b.className = ''; void b.offsetWidth; b.className = 'pop ' + (cls || '')
  $('#bn1').innerHTML = txt; const b2 = $('#bn2'); b2.hidden = !sub; if (sub) b2.innerHTML = sub
  $('#banner').hidden = false; S.bannerT = 0
  if (sfx) Snd.sfx(sfx)
}
function hideBanner() { $('#banner').hidden = true }
function toast(s) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = s; document.body.appendChild(d); setTimeout(() => d.remove(), 1800) }
const yd = v => v >= 100 ? v.toFixed(0) : v.toFixed(1)

function relWord(ang) { // 自分の向きから見た方角の言葉
  const k = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8
  return (S.lang === 'ja' ? ['奥へ', '右奥へ', '右へ', '右手前へ', '手前へ', '左手前へ', '左へ', '左奥へ'] : ['away', 'right-away', 'right', 'right-toward', 'toward you', 'left-toward', 'left', 'left-away'])[k]
}
function refreshHud() {
  $('#holeChip').innerHTML = `<span>${T('hole')} ${H.i + 1}/5</span><b>${H.D.toFixed(0)}<small>y</small></b>`
  const rel = H.wind.ang - S.aim
  $('#windArrow').setAttribute('transform', `rotate(${(rel / DEG).toFixed(1)} 20 20)`)
  $('#windTxt').textContent = `${H.wind.s.toFixed(1)} m/s ${relWord(rel)}`
  $('#slopeTxt').textContent = `${T('slope')}: ${relWord(Math.atan2(H.slope.x, -H.slope.z) - S.aim)}`
  const bb = S.bossBall
  if (bb && bb.st === 'rest') {
    $('#ydBoss').textContent = `${T('bossBall')} ${yd(bb.dist)}y`
    const a = yd(bb.dist + J.hiyari), b = yd(bb.dist + J.perfect)
    $('#targetTxt').textContent = fmt(bb.tier === 2 ? T('targetOb') : bb.tier === 1 ? T('targetPond') : `${T('target')} ${T('targetFmt')}`, { a, b })
  } else { $('#ydBoss').textContent = ''; $('#targetTxt').textContent = '' }
  const mb = S.myBall; $('#ydYou').textContent = mb ? `${T('yourBall')} ${yd(Math.hypot(mb.x - H.pin.x, mb.z - H.pin.z))}y` : ''
  setMood(S.mood, null)
}
function setMood(v, delta) {
  $('#moodMeter i').style.width = v + '%'; $('#moodMeter').classList.toggle('low', v < 30)
  const d = $('#moodDelta')
  if (delta != null) { d.textContent = delta > 0 ? '+' + delta : delta < 0 ? String(delta) : ''; d.className = delta > 0 ? 'up' : delta < 0 ? 'dn' : '' }
}
// ゲージの目盛り
function buildGauge() {
  const tk = $('#gTicks'); let html = ''
  for (let y = 50; y < H.club; y += 50) html += `<i style="left:${y / H.club * 100}%"></i><span style="left:${y / H.club * 100}%">${y}</span>`
  tk.innerHTML = html
  const pp = solve(H, H.pin.x, H.pin.z, true); H.pinPower = pp.power
  $('#gPin').style.left = `calc(6px + (100% - 12px) * ${clamp(pp.power, 0, 1)})`
}
function drawGauge() {
  const g = S.gauge, v = g.fixed != null ? g.fixed : g.v
  $('#gFill').style.width = `calc((100% - 12px) * ${clamp(v, 0, 1)})`
  $('#gauge').classList.toggle('idle', !g.on && g.fixed == null)
  const m = $('#gMark'); m.hidden = g.fixed == null; if (g.fixed != null) m.style.left = `calc(6px + (100% - 12px) * ${g.fixed})`
  $('#gHint').textContent = S.phase === 'aim' ? (g.on ? T('gaugeHint') : T('tapToShot')) : ''
  $('#bShot').classList.toggle('on', g.on)
  $('#clkArc').setAttribute('stroke-dashoffset', (257.6 * (1 - clamp(S.clock / CLOCK, 0, 1))).toFixed(1))
  $('#clkArc').setAttribute('stroke', S.clock < 3 ? '#ffe066' : '#fff')
}

// ---------- 進行
function newRound(seed) {
  S.seed = seed ?? ((Math.random() * 1e9) | 0); S.rng = mulberry(S.seed)
  const plan = D.BOSS_PLAN.slice(); for (let i = plan.length - 1; i > 0; i--) { const j = Math.floor(S.rng() * (i + 1)); [plan[i], plan[j]] = [plan[j], plan[i]] }
  // OB は1ホール目にしない（最初は普通に覚えてもらう）
  if (plan[0] === 'ob' || plan[0] === 'pond') { const k = plan.findIndex(p => p === 'normal' || p === 'close' || p === 'bunker'); [plan[0], plan[k]] = [plan[k], plan[0]] }
  S.plan = plan; S.results = []; S.mood = D.MOOD0; S.over = false; S.final = null; S.said = {}
  setMood(S.mood, 0)
}
function startHole(i) {
  S.hole = i; H = buildHole(i); showHole(H)
  S.bossBall = null; S.myBall = null; bossSet.pts = []; mySet.pts = []; ringG.visible = false; aimLine.visible = false
  S.aim = Math.atan2(H.pin.x, -H.pin.z); S.gauge = { on: false, v: 0, dir: 1, fixed: null }; S.clock = CLOCK; S.ff = 1
  stance(S.boss, S.aim); S.boss.swing = 0
  const d = dirOf(S.aim), r = { x: Math.cos(S.aim), z: Math.sin(S.aim) }
  place(S.me, -d.x * 4 - r.x * 3.5, -d.z * 4 - r.z * 3.5, 0); faceTo(S.me, 0, 0); S.me.setExpr('nervous')
  setBoss('smug'); say('intro'); me(null)
  $('#pipBox').hidden = true; $('#ctrl').classList.add('off'); $('#target').hidden = true; $('#tut').style.display = 'none'
  buildGauge(); refreshHud(); drawGauge()
  banner(`${T('hole')} ${i + 1}`, `${T('pin')} ${H.D.toFixed(0)}y ・ ${T('wind')} ${H.wind.s.toFixed(1)}m/s`, '', 'whoosh')
  setPhase('intro')
  // 部長の狙いを決める
  const kind = S.plan[i], pin = H.pin, rr = S.rng
  let tx, tz
  if (kind === 'close' || kind === 'normal') { const a = rr() * Math.PI * 2, rad = kind === 'close' ? 1.6 + rr() * 1.6 : 6 + rr() * 5; tx = pin.x + Math.cos(a) * rad; tz = pin.z + Math.sin(a) * rad * 0.8 }
  else if (kind === 'bunker') { const b = H.bunkers[Math.floor(rr() * H.bunkers.length)]; tx = b.x; tz = b.z }
  else if (kind === 'pond') { tx = H.pond.x + (rr() - 0.5) * H.pond.rx * 0.6; tz = H.pond.z + (rr() - 0.5) * H.pond.rz * 0.4 }
  else { const sd = rr() < 0.5 ? -1 : 1; tx = sd * (OBX + 5 + rr() * 7); tz = pin.z + 6 + rr() * 22 }
  const sol = solve(H, tx, tz)
  S.bossShot = { aim: sol.aim, power: sol.power, kind }
}
function setPhase(p) { S.phase = p; S.pt = 0; if (p === 'bossSwing' || p === 'aim') S.cut = true }
function trail(set, b) { if (b && b.st !== 'rest') { set.pts.push(b.x, b.y + 0.55, b.z); if (set.pts.length > 600) set.pts.splice(0, 3) } }
function launchBoss() { S.bossBall = newBall(H, S.bossShot.aim, S.bossShot.power); S.camDir = dirOf(S.bossShot.aim); Snd.sfx('hit'); S.boss.setExpr('smug') }
function canShoot() { return S.phase === 'aim' }
function shotPress() {
  Snd.init()
  if (S.view !== 'vPlay') return
  if (S.phase === 'aim') {
    if (!S.gauge.on) { S.gauge.on = true; S.gauge.v = 0; S.gauge.dir = 1; Snd.sfx('gauge') }
    else fire(S.gauge.v)
    return
  }
  ffPress()
}
function ffPress() {
  if (['bossFly', 'fly'].includes(S.phase)) S.ff = 4
  else if (S.phase === 'verdict' && S.pt > 0.7) S.pt = 99
  else if (S.phase === 'bossRest' && S.pt > 0.6) S.pt = 99
  else if (S.phase === 'intro' && S.pt > 0.3) S.pt = 99
}
function fire(power) {
  S.gauge.on = false; S.gauge.fixed = power; S.myPower = power
  setPhase('swing'); $('#ctrl').classList.add('off'); aimLine.visible = false; $('#tut').style.display = 'none'
  Snd.sfx('swing')
}
function shoot(aim, power) { S.aim = aim; fire(power) } // 検証のボット用
function launchMe() { S.myBall = newBall(H, S.aim, S.myPower); S.camDir = dirOf(S.aim); mySet.pts = []; Snd.sfx('hit'); S.me.setExpr('nervous') }

function onBallEvents(b, prev, who) {
  for (let k = prev; k < b.ev.length; k++) {
    const e = b.ev[k], wx = b.x, wz = b.z
    if (e === 'water') { burst(wx, 0.2, wz, 70, 0xbfe8ff, 8, 22, 40, 1.4); burst(wx, 0.2, wz, 30, 0x3aa0d8, 4, 30, 40, 1.6); Snd.sfx('splash'); banner(T('pond'), '', 'v-pond') }
    else if (e === 'sand') { burst(wx, 0.2, wz, 50, 0xf1dfa8, 6, 12, 30, 1); Snd.sfx('sand'); banner(T('sand'), '', 'v-sand') }
    else if (e === 'land') Snd.sfx('land', 0.8)
    else if (e === 'tree') { burst(wx, b.y, wz, 25, 0x3c8c3a, 5, 6, 12, 1.2); Snd.sfx('tree'); banner(S.lang === 'ja' ? 'カーン！' : 'BONK!', '', 'v-sand') }
    else if (e === 'cart') { Snd.sfx('clang'); burst(wx, b.y + 1, wz, 20, 0xffffff, 5, 8, 20, 0.8); banner(S.lang === 'ja' ? 'ゴンッ！' : 'CLANG!', S.lang === 'ja' ? 'カートのおじさん「あぶねえ！」' : 'Cart guy: "WATCH IT!"', 'v-sand') }
    else if (e === 'house') { Snd.sfx('glass'); burst(wx, b.y + 1, wz, 60, 0xcdeeff, 9, 10, 25, 1.4); banner(S.lang === 'ja' ? 'ガシャーン！' : 'CRASH!', S.lang === 'ja' ? 'クラブハウスの窓が…' : 'The clubhouse window...', 'v-sand'); S.flash = 0.6 }
    else if (e === 'cup') { Snd.sfx('cup'); banner(T('holed'), '', 'v-holed') }
  }
}
function settleBanner(b) { if (b.tier === 2 && !b.ev.includes('house')) banner(T('ob'), '', 'v-ob', 'boo') }

function update() {
  S.t += DT; S.pt += DT
  const P = S.phase
  if (S.view === 'vPlay') {
    if (P === 'intro') { if (S.pt > 1.1) { hideBanner(); setPhase('bossSwing') } }
    else if (P === 'bossSwing') {
      S.boss.swing = S.pt
      if (S.pt >= 0.55 && !S.bossBall) launchBoss()
      if (S.pt > 0.75) setPhase('bossFly')
    }
    if (P === 'bossFly' || P === 'bossSwing') {
      if (S.bossBall) { for (let k = 0; k < S.ff; k++) { const b = S.bossBall, n = b.ev.length; stepBall(b, H); onBallEvents(b, n, 'boss'); if (b.st === 'rest') break } trail(bossSet, S.bossBall) }
      if (S.bossBall && S.bossBall.st === 'rest' && P === 'bossFly') {
        const b = S.bossBall; S.ff = 1
        setRing(b.dist)
        const kind = b.tier === 2 ? 'ob' : b.tier === 1 ? 'pond' : b.surf === 'sand' ? 'bunker' : b.dist < 4 ? 'close' : 'normal'
        say(kind); setBoss(kind === 'ob' || kind === 'pond' || kind === 'bunker' ? 'smug' : 'happy'); Snd.sfx(kind === 'close' ? 'laugh' : 'hmph')
        if (kind === 'close' || kind === 'normal') Snd.sfx('clap', 0.6)
        if (b.tier === 2) banner(T('ob'), T('bannerOb'), 'v-ob', 'boo')
        if (b.tier === 1) banner(T('pond'), T('bannerPond'), 'v-pond')
        setPhase('bossRest')
      }
    } else if (P === 'bossRest') {
      if (S.pt > 1.6) {
        hideBanner(); setPhase('aim'); S.clock = CLOCK; S.gauge = { on: false, v: 0, dir: 1, fixed: null }
        stance(S.me, S.aim); S.me.swing = 0; S.me.setExpr('nervous')
        const d = dirOf(S.aim), r = { x: Math.cos(S.aim), z: Math.sin(S.aim) }
        place(S.boss, d.x * 5 - r.x * 5, d.z * 5 - r.z * 5, 0); S.boss.swing = 0
        $('#pipBox').hidden = false; $('#ctrl').classList.remove('off'); $('#target').hidden = false
        me(S.bossBall.tier === 2 ? 'ob' : S.bossBall.tier === 1 ? 'pond' : 'aim')
        if (H.i === 0 && S.results.length === 0) { $('#tut').style.display = 'block'; $('#tut').textContent = T('tutZone') }
        refreshHud()
      }
    } else if (P === 'aim') {
      if (S.aimHold) { S.aim += S.aimHold * 7 * DEG * DT; S.aim = clamp(S.aim, -1.1, 1.1) }
      if (S.gauge.on) { S.gauge.v += S.gauge.dir * DT / GAUGE_T; if (S.gauge.v >= 1) { S.gauge.v = 1; S.gauge.dir = -1 } if (S.gauge.v <= 0) { S.gauge.v = 0; S.gauge.dir = 1 } }
      S.clock -= DT
      if (S.clock <= 0) { banner(T('timeup'), '', 'v-loose'); say('timeup'); S.me.setExpr('panic'); Snd.sfx('shriek'); fire(0.06) }
      stance(S.me, S.aim); faceTo(S.boss, S.me.g.position.x, S.me.g.position.z)
      if (Math.floor(S.t * 4) !== Math.floor((S.t - DT) * 4)) refreshHud()
    } else if (P === 'swing') {
      S.me.swing = S.pt
      if (S.pt >= 0.4 && !S.myBall) launchMe()
      if (S.myBall) for (let k = 0; k < S.ff; k++) stepBall(S.myBall, H)
      if (S.pt > 0.6) setPhase('fly')
    } else if (P === 'fly') {
      const b = S.myBall, bb = S.bossBall
      for (let k = 0; k < S.ff; k++) { const n = b.ev.length; stepBall(b, H); onBallEvents(b, n, 'me'); if (b.st === 'rest') break }
      trail(mySet, b)
      // 近づくと部長が冷や汗
      if (bb.tier === 0 && b.st !== 'rest') {
        const dNow = Math.hypot(b.x - H.pin.x, b.z - H.pin.z)
        if (dNow < bb.dist + 10 && (b.st === 'roll' || b.y < 25)) { if (!S.sweat) { S.sweat = true; setBoss('sweat'); say('approach'); Snd.sfx('gulp') } if (dNow < bb.dist && S.bossExpr !== 'shock') { setBoss('shock') } }
      }
      if (Math.floor(S.t * 6) !== Math.floor((S.t - DT) * 6)) refreshHud()
      if (b.st === 'rest') { S.ff = 1; settleBanner(b); verdict() }
    } else if (P === 'verdict') {
      if (S.pt > 2.2) {
        hideBanner(); S.sweat = false
        if (S.mood <= 0) { S.over = true; finish() }
        else if (S.hole < 4) startHole(S.hole + 1)
        else finish()
      }
    }
    if (S.bannerT != null) S.bannerT += DT
  }
  // 人の動き
  for (const Pp of [S.boss, S.me]) animPerson(Pp)
  stepParts()
  if (S.flash) S.flash = Math.max(0, S.flash - DT * 2)
  stepCamera()
}
function verdict() {
  const bb = S.bossBall, b = S.myBall
  const r = judge(bb.dist, bb.tier, b.dist, b.tier)
  const dm = D.MOOD[r.v], pts = D.PTS[r.v]
  S.mood = clamp(S.mood + dm, 0, 100)
  S.results.push({ v: r.v, m: r.m, pts, dB: bb.dist, dP: b.dist, tB: bb.tier, tP: b.tier, ev: b.ev.slice(), kind: S.plan[S.hole] })
  const sub = r.v === 'beat' || r.v === 'overdo' ? (b.tier !== bb.tier ? '' : `${r.m >= 0 ? '+' : ''}${yd(r.m)}y`) : `${r.m >= 0 ? '+' : ''}${yd(r.m)}y`
  banner(T('v_' + r.v), sub || null, 'v-' + r.v)
  setMood(S.mood, dm)
  const ex = { tight: 'happy', perfect: 'happy', good: 'smug', hiyari: 'sweat', loose: 'sus', obvious: 'angry', overdo: 'angry', beat: 'angry' }[r.v]
  setBoss(ex); say(r.v)
  if (r.v === 'tight' || r.v === 'perfect') { Snd.sfx('nice'); Snd.sfx('laugh'); Snd.sfx('clap', 1); S.boss.jump = 1; S.me.bow = 1; S.me.setExpr('happy'); burst(b.x, 1, b.z, 60, 0xffd23f, 6, 16, 18, 1.6) }
  else if (r.v === 'good') { Snd.sfx('clap', 0.5); S.me.setExpr('happy'); S.me.bow = 1 }
  else if (r.v === 'hiyari') { Snd.sfx('gulp'); S.me.setExpr('nervous'); S.boss.shake = 1 }
  else if (r.v === 'loose') { Snd.sfx('hmph'); S.me.setExpr('nervous') }
  else { Snd.sfx('angry'); Snd.sfx('boo'); S.me.setExpr('panic'); S.boss.jump = 1.4; S.boss.shake = 1; setTimeout(() => Snd.sfx('shriek'), 350); S.shake = 0.6 }
  setPhase('verdict')
}
function animPerson(P) {
  if (!P) return
  // スイング: 0〜0.4 テイクバック、0.4〜0.55 振り下ろし、その後フォロー
  const s = P.swing
  let a = 0
  if (s > 0) { if (s < 0.4) a = -2.4 * Math.sin((s / 0.4) * Math.PI / 2); else if (s < 0.55) a = lerp(-2.4, 1.2, (s - 0.4) / 0.15); else a = lerp(1.2, 2.2, Math.min(1, (s - 0.55) / 0.3)) }
  P.piv.rotation.z = a
  if (P.bow > 0) { P.bow = Math.max(0, P.bow - DT * 0.6); P.g.children.forEach(() => {}); P.headG.rotation.x = Math.sin(Math.min(1, (1 - P.bow) * 3) * Math.PI) * 0.6 } else P.headG.rotation.x = 0
  if (P.jump > 0) { P.jump = Math.max(0, P.jump - DT); P.g.position.y = Math.abs(Math.sin(P.jump * 14)) * 0.35 * P.jump } else P.g.position.y = 0
  if (P.shake > 0) { P.shake = Math.max(0, P.shake - DT); P.headG.position.x = Math.sin(S.t * 60) * 0.04 * P.shake } else P.headG.position.x = 0
  const red = P.expr === 'angry'; P.skinM.color.lerp(red ? new THREE.Color(0xff6a50) : P.skin0, 0.08)
  if (/sweat|shock|nervous|panic/.test(P.expr) && Math.floor(S.t * 15) !== Math.floor((S.t - DT) * 15)) { drawFace(P.fc.getContext('2d'), 128, P.expr, S.t, { who: P.who }); P.ft.needsUpdate = true }
  if (red && Math.random() < 0.25) { const hp = P.headG.getWorldPosition(new THREE.Vector3()); burst(hp.x, hp.y + 0.4, hp.z, 1, 0xffffff, 0.5, 3, -1, 0.9) }
}

// ---------- カメラ
const camPos = new THREE.Vector3(0, 6, 12), camLook = new THREE.Vector3(0, 0, -50), tmpV = new THREE.Vector3(), tmpL = new THREE.Vector3()
function frameShot(points, out, outLook, view) {
  // 点を全部入れて、ティー側の斜め上から見る
  let cx = 0, cz = 0; for (const p of points) { cx += p.x; cz += p.z } cx /= points.length; cz /= points.length
  let r = 6; for (const p of points) r = Math.max(r, Math.hypot(p.x - cx, p.z - cz))
  const bx = -cx, bz = -cz, bl = Math.hypot(bx, bz) || 1, side = view === 'pip' ? 0.35 : 0.25
  const dist = (r * 1.9 + 17) * (view === 'pip' ? 1 : innerWidth < innerHeight ? 1.35 : 1.2)
  out.set(cx + (bx / bl) * dist * 0.8 + (-bz / bl) * dist * side, r * 1.25 + 15, cz + (bz / bl) * dist * 0.8 + (bx / bl) * dist * side)
  outLook.set(cx, 0, cz)
}
function stepCamera() {
  let k = 0.08
  const P = S.phase
  if (S.view === 'vTitle' || S.view === 'vHow' || S.view === 'vResult') {
    const res = S.view === 'vResult', a = 0.55 + Math.sin(S.t * 0.15) * 0.45 + (res ? 0.3 : 0), r = res ? 7.5 : 7
    const bp = S.boss.g.position, port = innerWidth < innerHeight
    tmpV.set(bp.x + 1 + Math.sin(a) * r, res ? 2.4 : 2.1, bp.z + Math.cos(a) * r); tmpL.set(bp.x + (port || res ? 1.1 : -1.2), res ? (port ? -1.6 : 1.4) : port ? 1.25 : 2.3, bp.z); k = 0.05
  } else if (P === 'intro') {
    const d = dirOf(S.aim); tmpV.set(-d.x * 10 + 3, 5, -d.z * 10 + 2); tmpL.set(H.pin.x * 0.6, 0, H.pin.z * 0.6); k = 0.06
  } else if (P === 'bossSwing' || (P === 'bossFly' && S.bossBall && S.bossBall.t < 0.25)) {
    const d = dirOf(S.aim), r = { x: Math.cos(S.aim), z: Math.sin(S.aim) }, bp = S.boss.g.position
    const rr = innerWidth < innerHeight ? 6.5 : 5
    tmpV.set(bp.x + r.x * rr - d.x * 0.6, 1.6, bp.z + r.z * rr - d.z * 0.6); tmpL.set(bp.x, 1.0, bp.z); k = 0.15
  } else if (P === 'bossFly' || P === 'fly' || P === 'swing') {
    const b = P === 'bossFly' ? S.bossBall : S.myBall
    if (!b) { const d = dirOf(S.aim); tmpV.set(-d.x * 8, 3.6, -d.z * 8); tmpL.set(d.x * 45, 0, d.z * 45) }
    else {
      const sp = Math.hypot(b.vx, b.vz)
      if (!S.camDir) S.camDir = { x: 0, z: -1 }
      if (sp > 2) { S.camDir.x = lerp(S.camDir.x, b.vx / sp, 0.1); S.camDir.z = lerp(S.camDir.z, b.vz / sp, 0.1) }
      const l = Math.hypot(S.camDir.x, S.camDir.z) || 1, dx = S.camDir.x / l, dz = S.camDir.z / l
      if (b.st === 'fly') { tmpV.set(b.x - dx * 11, b.y + 3.5, b.z - dz * 11); tmpL.set(b.x + dx * 5, b.y - 2.5, b.z + dz * 5); k = 0.16 }
      else { frameShot([{ x: b.x, z: b.z }, H.pin], tmpV, tmpL); k = 0.05 }
    }
  } else if (P === 'bossRest') {
    frameShot([S.bossBall, H.pin], tmpV, tmpL); k = 0.06
  } else if (P === 'aim') {
    const d = dirOf(S.aim), r = { x: Math.cos(S.aim), z: Math.sin(S.aim) }
    tmpV.set(-d.x * 8 - r.x * 0.5, 3.1, -d.z * 8 - r.z * 0.5); tmpL.set(d.x * 40 - r.x * 0.5, 0, d.z * 40 - r.z * 0.5); k = 0.25
    aimLine.visible = true; aimLine.position.set(d.x * H.D / 2, 0.16, d.z * H.D / 2); aimLine.scale.set(1, H.D - 3, 1); aimLine.rotation.z = -S.aim
  } else if (P === 'verdict') {
    frameShot([S.bossBall, S.myBall, H.pin], tmpV, tmpL); k = 0.06
  }
  if (S.cut) { k = 1; S.cut = false }
  camPos.lerp(tmpV, k); camLook.lerp(tmpL, k)
  camera.position.copy(camPos)
  if (S.shake) { S.shake = Math.max(0, S.shake - DT); camera.position.x += (Math.random() - 0.5) * S.shake; camera.position.y += (Math.random() - 0.5) * S.shake }
  camera.lookAt(camLook)
  // グリーン中継
  if (H) { const ptsL = [H.pin]; if (S.bossBall && S.bossBall.st === 'rest') ptsL.push(S.bossBall); if (S.myBall) ptsL.push(S.myBall); frameShot(ptsL, tmpV, tmpL, 'pip'); pipCam.position.lerp(tmpV, P === 'aim' && S.pt < 0.1 ? 1 : 0.1); pipCam.lookAt(tmpL) }
}

// ---------- 描画
let lastW = 0, lastH = 0
function resize() {
  const w = innerWidth, h = innerHeight; if (w === lastW && h === lastH) return; lastW = w; lastH = h
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.8 ? 62 : 50; camera.updateProjectionMatrix()
}
function render() {
  resize()
  syncSet(bossSet, S.bossBall, false); syncSet(mySet, S.myBall, false)
  if (H) { H.flag.rotation.y = -H.wind.ang + Math.PI / 2 + Math.sin(S.t * 4) * 0.15; H.chev.forEach((c, j) => { const ph = (S.t * 0.6 + j / 3) % 1, a = Math.atan2(H.slope.x, -H.slope.z); c.position.set(H.pin.x + Math.sin(a) * (ph - 0.5) * 16, 0.1, H.pin.z - Math.cos(a) * (ph - 0.5) * 16); c.material.opacity = 0.55 * Math.sin(ph * Math.PI) }); if (H.waterMesh) H.waterMesh.material.color.setHSL(0.56, 0.62, 0.52 + Math.sin(S.t * 2) * 0.03) }
  $('#flash').style.opacity = S.flash || 0
  renderer.setScissorTest(false); renderer.setViewport(0, 0, lastW, lastH)
  renderer.render(scene, camera)
  const pip = $('#pipBox')
  if (S.view === 'vPlay' && !pip.hidden) {
    const r = pip.getBoundingClientRect(), y = lastH - r.bottom + 3
    renderer.setScissorTest(true); renderer.setScissor(r.left + 3, y, r.width - 6, r.height - 6); renderer.setViewport(r.left + 3, y, r.width - 6, r.height - 6)
    pipCam.aspect = r.width / r.height; pipCam.updateProjectionMatrix(); aimLine.visible = false
    renderer.render(scene, pipCam)
    renderer.setScissorTest(false); renderer.setViewport(0, 0, lastW, lastH)
    if (S.phase === 'aim') aimLine.visible = true
  }
  if (S.view === 'vPlay' || S.view === 'vTitle' || S.view === 'vResult') drawUiFaces()
  if (S.view === 'vPlay') drawGauge()
}

// ---------- 結果
function finish() {
  const tot = S.results.reduce((a, r) => a + r.pts, 0)
  const dan = Math.floor(tot / 5), beats = S.results.filter(r => r.v === 'beat').length, fakes = S.results.filter(r => r.v === 'obvious' || r.v === 'overdo').length
  let ord
  if (S.over) ord = D.ORDERS.find(o => o.id === 'gameover')
  else if (beats >= 3) ord = D.ORDERS.find(o => o.id === 'beater')
  else if (fakes >= 3) ord = D.ORDERS.find(o => o.id === 'actor')
  else ord = D.ORDERS.find(o => o.min != null && tot >= o.min)
  S.final = { tot, dan, ord, mood: S.mood, lineKey: ord.stamp === 'big' || ord.stamp === 'promote' ? 'tight' : ord.id === 'gameover' ? 'timeup' : ord.stamp === 'move' ? 'good' : 'beat' }
  S.final.line = pick(D.BOSS[S.lang][S.final.lineKey])
  S.resTrack = ord.stamp === 'promote' || ord.stamp === 'big' ? 'win' : 'sad'
  // 結果画面では部長をティーに戻す
  const good = S.resTrack === 'win'
  place(S.boss, 0, 0, 0); setBoss(good ? 'happy' : 'angry'); S.boss.swing = 0
  place(S.me, 1.9, -0.6, 0); S.me.setExpr(good ? 'happy' : 'panic'); faceTo(S.me, 0, 0); S.me.bow = good ? 1 : 0
  S.bossBall = S.myBall = null; bossSet.pts = []; mySet.pts = []; ringG.visible = false; aimLine.visible = false
  setPhase('none'); go('vResult'); fillResult(true)
}
function danLabel(f) { return f.dan >= 10 ? [T('meijin'), ''] : f.dan <= 0 ? [T('mudan'), ''] : [String(f.dan), T('danUnit')] }
function fillResult(anim) {
  const f = S.final
  if (f.lineLang !== S.lang) { f.line = pick(D.BOSS[S.lang][f.lineKey]); f.lineLang = S.lang }
  $('#oTo').textContent = S.lang === 'ja' ? 'あなた 殿' : 'To: You'
  $('#oPos').textContent = S.lang === 'ja' ? f.ord.ja : f.ord.en
  $('#oEnd').textContent = T('orderEnd') || ''
  const [a, b] = danLabel(f); $('#rDan').textContent = a; $('#rDanU').textContent = b
  $('#rDan').style.fontSize = a.length > 2 ? '0.62em' : ''
  $('#rMood').textContent = f.mood + ' / 100'; $('#rMeter i').style.width = f.mood + '%'; $('#rMeter').classList.toggle('low', f.mood < 30)
  $('#rHoles').innerHTML = S.results.map((r, i) => { const c = r.v === 'tight' || r.v === 'perfect' ? 'g' : r.v === 'good' ? 'ok' : r.v === 'hiyari' || r.v === 'loose' ? 'so' : 'ng'; const m = r.tB !== r.tP ? '--' : (r.m >= 0 ? '+' : '') + yd(r.m); return `<div class="${c}">${i + 1}<b>${m}</b></div>` }).join('')
  const hk = $('#hanko'); hk.textContent = T('stamp_' + f.ord.stamp); hk.className = 'hanko' + (f.ord.stamp === 'big' ? ' big' : '')
  if (S.lang === 'en') hk.style.fontSize = '0.8em'; else hk.style.fontSize = ''
  if (anim) {
    Snd.sfx('drum')
    hk.style.opacity = 0
    clearTimeout(S.stampTO); S.stampTO = setTimeout(() => { hk.style.opacity = ''; hk.classList.add('slam'); Snd.sfx('stamp'); $('#order').classList.remove('shake'); void $('#order').offsetWidth; $('#order').classList.add('shake'); if (S.resTrack === 'win') { Snd.sfx('clap', 1.5); Snd.sfx('laugh') } else { Snd.sfx('shriek') } }, 1100)
  } else { hk.classList.add('slam'); hk.style.opacity = '' }
}
async function saveImage(share = true) {
  const f = S.final; if (!f) return
  const W = 1080, Hh = 1350, c = document.createElement('canvas'); c.width = W; c.height = Hh; const x = c.getContext('2d')
  try { await document.fonts.ready } catch (e) {}
  // 上半分: 部長とあなたを専用のカメラで撮る
  x.fillStyle = '#7cc4f0'; x.fillRect(0, 0, W, Hh)
  try {
    const tw = W, th = 640, rt = new THREE.WebGLRenderTarget(tw, th, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace
    const cam = new THREE.PerspectiveCamera(36, tw / th, 0.3, 2000), bp = S.boss.g.position
    cam.position.set(bp.x + 1.6, 1.7, bp.z + 4.6); cam.lookAt(bp.x + 0.75, 1.75, bp.z)
    const fl = S.flash; renderer.setRenderTarget(rt); renderer.render(scene, cam)
    const buf = new Uint8Array(tw * th * 4); renderer.readRenderTargetPixels(rt, 0, 0, tw, th, buf); renderer.setRenderTarget(null); rt.dispose(); S.flash = fl
    const img = x.createImageData(tw, th); for (let yy = 0; yy < th; yy++) img.data.set(buf.subarray((th - 1 - yy) * tw * 4, (th - yy) * tw * 4), yy * tw * 4)
    x.putImageData(img, 0, 0)
  } catch (e) {}
  // 部長の顔と一言
  { const fc = document.createElement('canvas'); fc.width = fc.height = 240; drawFace(fc.getContext('2d'), 240, S.bossExpr || 'smug', 0.3, { portrait: true })
    x.save(); x.beginPath(); x.arc(930, 330, 104, 0, 7); x.fillStyle = '#ffe9c9'; x.fill(); x.lineWidth = 8; x.strokeStyle = '#fff'; x.stroke(); x.drawImage(fc, 820, 220, 220, 220); x.restore()
    const line = S.final.line || ''; x.font = "900 34px 'M PLUS Rounded 1c',sans-serif"; const lw = Math.min(560, x.measureText(line).width + 44)
    x.fillStyle = '#fff'; x.strokeStyle = '#1f1a17'; x.lineWidth = 5; x.beginPath(); x.roundRect(810 - lw, 446, lw, 66, 20); x.fill(); x.stroke()
    x.beginPath(); x.moveTo(790, 452); x.lineTo(860, 420); x.lineTo(820, 470); x.fill()
    x.fillStyle = '#1f1a17'; x.textAlign = 'center'; x.textBaseline = 'middle'; fitText(x, line, 810 - lw / 2, 480, lw - 30); x.textAlign = 'left'; x.textBaseline = 'alphabetic' }
  const grd = x.createLinearGradient(0, 400, 0, 660); grd.addColorStop(0, 'rgba(20,36,58,0)'); grd.addColorStop(1, 'rgba(20,36,58,.85)'); x.fillStyle = grd; x.fillRect(0, 400, W, 260)
  x.fillStyle = '#14243a'; x.fillRect(0, 640, W, Hh - 640)
  // ロゴ
  x.textAlign = 'left'; x.textBaseline = 'alphabetic'
  x.font = "900 30px 'M PLUS Rounded 1c',sans-serif"; x.fillStyle = '#d8262e'; x.fillRect(48, 44, x.measureText(T('company')).width + 32, 48); x.fillStyle = '#fff'; x.fillText(T('company'), 64, 79)
  x.font = "110px 'Dela Gothic One',sans-serif"; x.lineWidth = 14; x.strokeStyle = '#1f1a17'; x.lineJoin = 'round'
  const tl = S.lang === 'ja' ? '忖度ゴルフ' : 'LET THE BOSS WIN'; if (S.lang === 'en') x.font = "84px 'Dela Gothic One',sans-serif"
  x.strokeText(tl, 48, 200); x.fillStyle = '#fff'; x.fillText(tl, 48, 200)
  // 辞令
  const ox = 60, oy = 600, ow = W - 120, oh = 470
  x.save(); x.translate(W / 2, oy + oh / 2); x.rotate(-0.012); x.translate(-W / 2, -(oy + oh / 2))
  x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(ox + 10, oy + 14, ow, oh)
  x.fillStyle = '#fffaf0'; x.fillRect(ox, oy, ow, oh); x.strokeStyle = '#c9b48c'; x.lineWidth = 4; x.strokeRect(ox + 14, oy + 14, ow - 28, oh - 28); x.lineWidth = 2; x.strokeRect(ox + 24, oy + 24, ow - 48, oh - 48)
  x.textAlign = 'center'; x.fillStyle = '#1f1a17'; x.font = "64px 'Dela Gothic One',sans-serif"; x.fillText(S.lang === 'ja' ? '辞　令' : 'PERSONNEL ORDER', W / 2, oy + 104)
  x.font = "900 26px 'M PLUS Rounded 1c',sans-serif"; x.fillStyle = '#6b5d50'; x.fillText(T('company'), W / 2, oy + 146)
  x.textAlign = 'left'; x.fillStyle = '#1f1a17'; x.font = "900 34px 'M PLUS Rounded 1c',sans-serif"; x.fillText(S.lang === 'ja' ? 'あなた 殿' : 'To: You', ox + 60, oy + 210)
  x.textAlign = 'center'; x.fillStyle = '#8e1218'
  const pos = S.lang === 'ja' ? f.ord.ja : f.ord.en
  wrapText(x, pos, W / 2, oy + 300, ow - 140, 54, "60px 'Dela Gothic One',sans-serif", 2)
  x.fillStyle = '#1f1a17'; x.font = "900 32px 'M PLUS Rounded 1c',sans-serif"; x.textAlign = 'right'; if (T('orderEnd')) x.fillText(T('orderEnd'), ox + ow - 220, oy + 410)
  x.textAlign = 'left'; x.font = "800 24px 'M PLUS Rounded 1c',sans-serif"; x.fillStyle = '#6b5d50'; x.fillText(T('date'), ox + 60, oy + 430)
  // ハンコ
  x.save(); x.translate(ox + ow - 140, oy + 140); x.rotate(-0.25); x.strokeStyle = x.fillStyle = f.ord.stamp === 'big' ? '#c4142e' : '#d8262e'; x.globalAlpha = 0.9
  x.lineWidth = 10; x.beginPath(); x.arc(0, 0, 96, 0, 7); x.stroke(); x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 80, 0, 7); x.stroke()
  x.textAlign = 'center'; x.textBaseline = 'middle'; const stx = T('stamp_' + f.ord.stamp); x.font = `${S.lang === 'ja' ? (stx.length > 2 ? 46 : 60) : 30}px 'Dela Gothic One',sans-serif`; x.fillText(stx, 0, 4); x.restore()
  x.restore()
  // 段位と機嫌
  x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillStyle = '#cfe0f5'; x.font = "900 28px 'M PLUS Rounded 1c',sans-serif"; x.fillText(T('dan'), 70, 1150)
  const [da, db] = danLabel(f); x.fillStyle = '#ffc53d'; x.font = "96px 'Dela Gothic One',sans-serif"; x.fillText(da, 70, 1250); const dw = x.measureText(da).width
  x.fillStyle = '#fff'; x.font = "900 40px 'M PLUS Rounded 1c',sans-serif"; x.fillText(db, 80 + dw, 1250)
  x.fillStyle = '#cfe0f5'; x.font = "900 26px 'M PLUS Rounded 1c',sans-serif"; x.fillText(`${T('mood')} ${f.mood}/100`, 470, 1150)
  x.fillStyle = 'rgba(255,255,255,.2)'; x.beginPath(); x.roundRect(470, 1168, 540, 26, 13); x.fill()
  const mg = x.createLinearGradient(470, 0, 1010, 0); mg.addColorStop(0, '#4a8de8'); mg.addColorStop(0.5, '#5fd36b'); mg.addColorStop(1, '#ffc53d'); x.fillStyle = f.mood < 30 ? '#e8484a' : mg; x.beginPath(); x.roundRect(470, 1168, Math.max(26, 540 * f.mood / 100), 26, 13); x.fill()
  S.results.forEach((r, i) => { const c = r.v === 'tight' || r.v === 'perfect' ? '#c99a12' : r.v === 'good' ? '#2f8d48' : r.v === 'hiyari' || r.v === 'loose' ? '#566477' : '#a8303a'; x.fillStyle = c; x.beginPath(); x.roundRect(470 + i * 110, 1212, 100, 52, 10); x.fill(); x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = "900 24px 'M PLUS Rounded 1c',sans-serif"; x.fillText(r.tB !== r.tP ? '--' : (r.m >= 0 ? '+' : '') + yd(r.m), 520 + i * 110, 1247); x.textAlign = 'left' })
  x.fillStyle = '#8fa6c2'; x.font = "800 24px 'M PLUS Rounded 1c',sans-serif"; x.textAlign = 'center'; x.fillText('tom3games.github.io/sontaku-golf', W / 2, 1318)
  const blob = await new Promise(r => c.toBlob(r, 'image/png'))
  S.lastImage = { w: c.width, h: c.height, size: blob ? blob.size : 0 }
  if (!share) return blob
  const file = new File([blob], 'sontaku-golf.png', { type: 'image/png' })
  try { if (navigator.canShare && navigator.canShare({ files: [file] }) && isTouch) { await navigator.share({ files: [file], title: T('title'), text: `${T('dan')} ${da}${db} / ${pos}` }); toast(T('shared')); return blob } } catch (e) { if (e && e.name === 'AbortError') return blob }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sontaku-golf.png'; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(T('saved'))
  return blob
}
function fitText(x, s, cx, cy, maxW) { let sz = parseFloat(x.font.match(/([\d.]+)px/)[1]); const fam = x.font.replace(/^.*?px\s*/, ''); const wt = /^\d{3}\s/.test(x.font) ? x.font.split(' ')[0] : ''; while (x.measureText(s).width > maxW && sz > 14) { sz -= 1; x.font = `${wt} ${sz}px ${fam}` } x.fillText(s, cx, cy) }
function wrapText(x, s, cx, y, maxW, lh, font, maxLines) {
  x.font = font; let size = parseFloat(font)
  const fam = font.replace(/^[\d.]+px\s*/, '')
  const lines = () => { const out = []; let cur = ''; const toks = S.lang === 'ja' ? [...s] : s.split(/(\s+)/); for (const ch of toks) { if (x.measureText(cur + ch).width > maxW && cur) { out.push(cur.trim()); cur = ch } else cur += ch } if (cur.trim()) out.push(cur.trim()); return out }
  let ls = lines(); while ((ls.length > maxLines || (ls.length > 1 && ls[ls.length - 1].length <= 3)) && size > 24) { size -= 3; x.font = `${size}px ${fam}`; ls = lines() }
  const step = size * 1.2; ls.forEach((l, i) => x.fillText(l, cx, y + (i - (ls.length - 1) / 2) * step))
}

// ---------- 入力
let drag = null
canvas.addEventListener('pointerdown', e => { Snd.init(); drag = { x: e.clientX, y: e.clientY, a: S.aim, moved: 0, type: e.pointerType }; try { canvas.setPointerCapture(e.pointerId) } catch (er) {} })
canvas.addEventListener('pointermove', e => {
  if (!drag) return; const dx = e.clientX - drag.x; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(e.clientY - drag.y))
  if (S.phase === 'aim') { S.aim = clamp(drag.a + dx * 0.06 * DEG * (isTouch ? 1.2 : 1), -1.1, 1.1) }
})
canvas.addEventListener('pointerup', e => {
  if (!drag) return; const d = drag; drag = null
  if (d.moved < 8) { if (S.phase === 'aim') { if (d.type === 'mouse') shotPress() } else ffPress() }
})
canvas.addEventListener('pointercancel', () => { drag = null })
function holdBtn(id, dir) {
  const b = $(id)
  b.addEventListener('pointerdown', e => { e.preventDefault(); Snd.init(); if (S.phase !== 'aim') return; S.aim = clamp(S.aim + dir * 0.25 * DEG, -1.1, 1.1); S.aimHoldT = setTimeout(() => { S.aimHold = dir }, 220); Snd.sfx('tick') })
  const up = () => { clearTimeout(S.aimHoldT); S.aimHold = 0 }
  b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up)
}
holdBtn('#bLeft', -1); holdBtn('#bRight', 1)
$('#bShot').addEventListener('pointerdown', e => { e.preventDefault(); shotPress() })
const keys = {}
addEventListener('keydown', e => {
  if (e.repeat && (e.code === 'Space' || e.code === 'Enter')) return
  if (S.view === 'vPlay') {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); shotPress() }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { S.aimHold = -1; e.preventDefault() }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { S.aimHold = 1; e.preventDefault() }
  } else if (S.view === 'vTitle' && (e.code === 'Space' || e.code === 'Enter') && document.activeElement === document.body) { e.preventDefault(); startGame() }
})
addEventListener('keyup', e => { if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) S.aimHold = 0 })

function startGame(seed) {
  Snd.init(); Snd.sfx('tap')
  newRound(seed); go('vPlay'); startHole(0)
}
const on = (id, fn) => $(id).addEventListener('click', e => { Snd.init(); fn(e) })
on('#bStart', () => startGame())
on('#bHow', () => { Snd.sfx('tap'); go('vHow') })
on('#bHowBack', () => { Snd.sfx('tap'); go('vTitle') })
on('#bAgain', () => startGame())
on('#bSave', () => saveImage(true))
// Xでポスト: クリックの同期処理内で開く（ポップアップブロック回避）
const PUB_URL = 'https://tom3games.github.io/sontaku-golf/'
function xText() { const f = S.final; if (!f) return ''; const [a, b] = danLabel(f); return T('xText').replace('{dan}', a + b).replace('{pos}', S.lang === 'ja' ? f.ord.ja : f.ord.en) }
function xUrl() { return 'https://x.com/intent/post?text=' + encodeURIComponent(xText()) + '&url=' + encodeURIComponent(PUB_URL) }
on('#bX', () => { window.open(xUrl(), '_blank', 'noopener') })
on('#bTitle', () => { Snd.sfx('tap'); toTitle() })
on('#bLang', () => { S.lang = S.lang === 'ja' ? 'en' : 'ja'; store.set('lang', S.lang); applyLang() })
on('#bMute', () => { Snd.setMute(!Snd.muted); $('#icOn').hidden = Snd.muted; $('#icOff').hidden = !Snd.muted; store.set('mute', Snd.muted ? '1' : '0') })
function toTitle() {
  setPhase('none'); H = buildHole(0); showHole(H); bossSet.g.visible = mySet.g.visible = false; bossSet.trail.visible = mySet.trail.visible = false; ringG.visible = false; aimLine.visible = false
  place(S.boss, 0, 0, 0.7); S.boss.swing = 0; setBoss('smug'); place(S.me, 2.1, -0.9, 0); faceTo(S.me, 0, 0); S.me.setExpr('nervous'); S.me.bow = 0; S.bossBall = S.myBall = null
  go('vTitle')
}

// ---------- ループ（固定60Hz）
let acc = 0, lastT = performance.now()
function loop() {
  const now = performance.now(); let dt = (now - lastT) / 1000; lastT = now; if (dt > 0.25) dt = 0.25
  if (!S.paused) { acc += dt; let n = 0; while (acc >= DT && n++ < 20) { update(); acc -= DT } } else acc = 0
  render(); Snd.tick()
  requestAnimationFrame(loop)
}
document.addEventListener('visibilitychange', () => { lastT = performance.now(); acc = 0 })

// ---------- 起動
S.boss = makePerson({ who: 'boss', shirt: 0xff7eb6, pants: 0xf2eedd, skin: 0xffd2a6, belly: 1.45, cap: 0xffffff, brim: 0xd8262e })
S.me = makePerson({ who: 'me', shirt: 0xffffff, pants: 0x2c3e66, skin: 0xffdcbc, belly: 1, cap: 0x2c3e66, brim: 0xffc53d })
if (S.muted) { Snd.muted = true; $('#icOn').hidden = true; $('#icOff').hidden = false }
S.seed = 1; S.rng = mulberry(1)
toTitle(); applyLang()
camPos.set(8, 4, 10)
requestAnimationFrame(loop)
window.__sgReady = true

// 検証用の窓口
window.sg = {
  S, get H() { return H }, D, camera, pipCam, drawFace, camPos, camLook, bossSet, mySet, renderer, scene, Snd, solve, runShot, judge, surfAt: (x, z) => surfAt(H, x, z), tierOf: (x, z) => tierOf(H, x, z),
  start: seed => startGame(seed), startGame, toTitle, saveImage, xText, xUrl, PUB_URL, finish, shoot, shotPress, fire, verdict, setRing,
  // 上手い人の狙い: 部長の距離 + margin の所に止める向きと強さ（実際の物理で解く）
  ideal(margin = 1.2) {
    const bb = S.bossBall, pin = H.pin, r = bb.dist + margin
    let base = Math.atan2(bb.z - pin.z, bb.x - pin.x); if (bb.dist < 0.3) base = Math.atan2(-pin.z, -pin.x)
    for (const off of [0, 0.15, -0.15, 0.3, -0.3, 0.5, -0.5, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2, 3.0]) {
      const a = base + off, tx = pin.x + Math.cos(a) * r, tz = pin.z + Math.sin(a) * r
      if (tierOf(H, tx, tz) !== bb.tier || surfAt(H, tx, tz) === 'sand' && bb.surf !== 'sand') continue
      const s = solve(H, tx, tz); const b = s.b
      if (Math.abs(b.dist - r) < 0.6 && b.tier === bb.tier) return { aim: s.aim, power: s.power, tx, tz }
    }
    const s = solve(H, pin.x + Math.cos(base) * r, pin.z + Math.sin(base) * r); return { aim: s.aim, power: s.power }
  },
  dbg: {
    pause: v => { S.paused = v }, step: n => { for (let i = 0; i < n; i++) update() }, render,
    until: (ph, max = 3000) => { let i = 0; while (S.phase !== ph && S.view === 'vPlay' && i++ < max) update(); return S.phase },
  },
}
