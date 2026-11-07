// 自分で壊す検証。node verify.mjs（全部 pass で 0 終了）。BOTS=0 でボットの分布測定を省く
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
// 空いているポートを取る（他のゲームの検証と並行して走るため）
const PORT = await new Promise(r => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 500))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)) }
async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, acceptDownloads: true, ...opts })
  await ctx.addInitScript(() => { try { localStorage.clear() } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__sgReady, null, { timeout: 30000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *, #vPlay:not([hidden]) *')) {
    if (el.closest('[hidden]') || el.closest('#banner') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, W = innerWidth, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  const vis = el => el.offsetParent && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden'
  const sel = 'main:not([hidden]) button, #vPlay:not([hidden]) button, #corner button, main:not([hidden]) .panel, main:not([hidden]) .order, main:not([hidden]) .score, #vPlay:not([hidden]) #pipBox, #vPlay:not([hidden]) #gauge, #vPlay:not([hidden]) #talk, #vPlay:not([hidden]) #target'
  for (const el of document.querySelectorAll(sel)) { if (!vis(el)) continue; const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1 || r.right > W + 1 || r.left < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  // 重なり（ボタン同士・HUD の主要部品同士）
  const bs = [...document.querySelectorAll('main:not([hidden]) button, #vPlay:not([hidden]) button, #corner button, #vPlay:not([hidden]) #pipBox, #vPlay:not([hidden]) #talk, #vPlay:not([hidden]) #hudTop, #vPlay:not([hidden]) #target, #vPlay:not([hidden]) #gauge, #vPlay:not([hidden]) #windBox')].filter(vis).map(b => [b.id || b.className, b.getBoundingClientRect(), b])
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { if (bs[i][2].contains(bs[j][2]) || bs[j][2].contains(bs[i][2])) continue; const a = bs[i][1], b = bs[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) over.push('overlap ' + bs[i][0] + '/' + bs[j][0]) }
  return { H, over: over.slice(0, 6) }
})
const glVariance = p => p.evaluate(() => {
  sg.dbg.render(); const src = document.querySelector('#gl'), c = document.createElement('canvas'); c.width = 200; c.height = 200
  const x = c.getContext('2d'); x.drawImage(src, 0, 0, 200, 200); const d = x.getImageData(0, 0, 200, 200).data
  let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 7) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ }
  return Math.round(s2 / n - (s / n) ** 2)
})
// ---- Xでポスト の検査道具
// window.open をスタブして押す → 開いたURLを分解して確かめる
const xStub = async (pg, ns, pub, tag) => {
  await pg.evaluate(() => { window.__opened = []; if (!window.__origOpen) window.__origOpen = window.open; window.open = (...a) => { window.__opened.push(a); return null } })
  const vis = await pg.evaluate(() => { const b = document.querySelector('#bX'), r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, clip: b.scrollWidth > b.clientWidth + 1, bg: getComputedStyle(b).backgroundColor, label: b.textContent.trim(), svg: !!b.querySelector('svg path') } })
  await pg.click('#bX')
  const r = await pg.evaluate(ns => ({ opened: window.__opened, text: window[ns].xText(), url: window[ns].xUrl() }), ns)
  await pg.evaluate(() => { window.open = window.__origOpen })
  expect(r.opened.length === 1, r)
  const [u, target, feat] = r.opened[0], q = new URL(u)
  const text = q.searchParams.get('text'), url = q.searchParams.get('url')
  expect(u.startsWith('https://x.com/intent/post?') && target === '_blank' && /noopener/.test(feat || '') && u === r.url, r.opened[0])
  expect(text === r.text && text.includes(tag) && (text.match(/#/g) || []).length === 1 && url === pub && !/https?:\/\//.test(text), { text, url })
  expect(vis.inView && !vis.clip && vis.svg && vis.bg === 'rgb(0, 0, 0)' && vis.h >= 36, vis)
  return { label: vis.label, text }
}
// 本物のクリックで新しいタブ（popup）が開く。x.com へは出ずにダミーを返す
const xPopup = async (pg, pub) => {
  await pg.context().route(/^https:\/\/x\.com\//, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>x</title>ok' }))
  const [pop] = await Promise.all([pg.waitForEvent('popup', { timeout: 8000 }), pg.click('#bX')])
  await pop.waitForLoadState().catch(() => {})
  const u = new URL(pop.url()); await pop.close()
  expect(u.origin + u.pathname === 'https://x.com/intent/post' && u.searchParams.get('url') === pub && u.searchParams.get('text'), pop.url())
  return u.searchParams.get('text')
}
// 結果画面のボタンの文字が切れていない
const btnClip = pg => pg.evaluate(() => [...document.querySelectorAll('#vResult button')].filter(b => b.offsetParent && b.scrollWidth > b.clientWidth + 1).map(b => b.id + ':' + b.scrollWidth + '>' + b.clientWidth))
// ハンコが見出し・辞令本文の文字に重ならない／ハンコの字が単語の途中で折れない・枠からはみ出さない（全辞令 × 日英）
const HANKO = async () => {
const hankoCheck = () => {
  const hk = document.querySelector('#hanko'), r = hk.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2
  const w = hk.offsetWidth / 2, h = hk.offsetHeight / 2, round = getComputedStyle(hk).borderTopLeftRadius.endsWith('%')
  const m = /rotate\(([-\d.]+)deg\)/.exec(getComputedStyle(hk).getPropertyValue('--hr') ? 'rotate(' + getComputedStyle(hk).getPropertyValue('--hr').trim() + ')' : 'rotate(-14deg)'), a = -(+m[1]) * Math.PI / 180
  const inside = (x, y) => { const dx = x - cx, dy = y - cy, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a); return round ? Math.hypot(lx, ly) < w - 1 : Math.abs(lx) < w - 1 && Math.abs(ly) < h - 1 }
  const hits = []
  for (const sel of ['.order .oh', '#oPos', '#oTo', '#oEnd']) {
    const el = document.querySelector(sel); if (!el || !el.textContent.trim()) continue
    const rg = document.createRange(); rg.selectNodeContents(el)
    let n = 0; for (const b of rg.getClientRects()) for (let x = b.left; x <= b.right; x += 2) for (let y = b.top + 2; y <= b.bottom - 2; y += 2) if (inside(x, y)) n++
    if (n) hits.push(sel + ':' + n)
  }
  return hits
}

  const bad = [], lang0 = sg.S.lang, ord0 = sg.S.final.ord
  for (const lang of ['ja', 'en']) {
    sg.S.lang = lang; sg.applyLang()
    for (const o of sg.D.ORDERS) {
      sg.S.final.ord = o; sg.fillResult(false); await document.fonts.ready
      const hk = document.querySelector('#hanko'), sp = hk.firstElementChild, lim = lang === 'en' ? hk.clientWidth : hk.clientWidth * 0.8
      const hits = hankoCheck(); if (hits.length) bad.push(`${lang}/${o.stamp}/${o.ja.slice(0, 4)} overlap ${hits}`)
      if (sp.offsetWidth > lim || sp.offsetHeight > lim) bad.push(`${lang}/${o.stamp} clip ${sp.offsetWidth}x${sp.offsetHeight}>${lim}`)
      const tn = sp.firstChild; let pos = 0
      for (const wd of tn.textContent.split(/\s/)) { const rg = document.createRange(); rg.setStart(tn, pos); rg.setEnd(tn, pos + wd.length); pos += wd.length + 1; if (new Set([...rg.getClientRects()].map(x => Math.round(x.top))).size > 1) bad.push(`${lang}/${o.stamp} break ${wd}`) }
    }
  }
  sg.S.lang = lang0; sg.applyLang(); sg.S.final.ord = ord0; sg.fillResult(false)
  return bad
}
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [844, 390, 'land'], [667, 375, 'land-se'], [768, 1024, 'tab'], [1440, 900, 'pc']]
// ページ内で使う: 台本で進める道具
const HELP = () => {
  window.__bot = (kind, rnd) => {
    const S = sg.S
    if (kind === 'none') return
    const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
    const P = { good: [0.012, 0.4, 1.6], normal: [0.03, 1.2, 2.2], rough: [0.08, 4, 4] }[kind]
    const id = sg.ideal(P[2] + (rnd() - 0.5) * 0.8)
    sg.shoot(id.aim + gauss() * P[1] * Math.PI / 180, Math.max(0.01, Math.min(1, id.power + gauss() * P[0])))
  }
  window.__play = (seed, kind) => {
    let r = seed * 9301 + 49297; const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280 }
    sg.dbg.pause(true); sg.start(seed)
    for (let h = 0; h < 5; h++) {
      if (sg.dbg.until('aim') !== 'aim') break
      __bot(kind, rnd)
      let i = 0; while (sg.S.view === 'vPlay' && sg.S.phase !== 'intro' && i++ < 4000) sg.dbg.step(1)
      if (sg.S.view !== 'vPlay') break
    }
    return { seed, final: sg.S.final && { tot: sg.S.final.tot, dan: sg.S.final.dan, ord: sg.S.final.ord.ja, mood: sg.S.final.mood }, res: sg.S.results.map(x => x.v), over: sg.S.over }
  }
}

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await open(browser)
await p.evaluate(HELP)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', r); return r
})
await t('OGP 一式がある（画像は ?v= つきの絶対URL）', async () => {
  const r = await p.evaluate(() => ({ list: ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => !!document.querySelector(`meta[property="${k}"]`)).concat(!!document.querySelector('meta[name="twitter:card"]')), img: document.querySelector('meta[property="og:image"]').content, url: document.querySelector('meta[property="og:url"]').content }))
  expect(r.list.every(Boolean) && r.img === 'https://tom3games.github.io/sontaku-golf/og.png?v=1' && r.url === 'https://tom3games.github.io/sontaku-golf/', r)
})
await t('タイトルの3Dが描けている（輝度の散らばり）', async () => { await p.waitForTimeout(600); const v = await glVariance(p); expect(v > 150, v); return v })
await t('物理が決まった結果を返す（同じ入力で同じ着地）', async () => {
  const r = await p.evaluate(() => { sg.dbg.pause(true); sg.start(5); const H = sg.H; const a = sg.runShot(H, 0.02, 0.7), b = sg.runShot(H, 0.02, 0.7); return [a.x, a.z, b.x, b.z, a.st] })
  expect(r[0] === r[2] && r[1] === r[3] && r[4] === 'rest', r); return r.map(v => typeof v === 'number' ? +v.toFixed(2) : v)
})
await t('狙った所に止める計算が合う（グリーン上で中央値0.6y・最大1.5y以内）', async () => {
  const r = await p.evaluate(() => { const H = sg.H, out = []; for (const [dx, dz] of [[3, 2], [-6, 4], [5, -5], [0, 8]]) { const s = sg.solve(H, H.pin.x + dx, H.pin.z + dz); out.push(+s.e.toFixed(2)) } return out })
  const md = [...r].sort((a, b) => a - b)[1]; expect(md < 0.6 && r.every(e => e < 1.5), r); return r
})
await t('判定の境界（近い=勝ち、少し遠い=ナイス、遠すぎ=わざとらしい、段違い）', async () => {
  const r = await p.evaluate(() => { const j = (a, b, c, d) => sg.judge(a, b, c, d).v; return [j(5, 0, 4.9, 0), j(5, 0, 5.1, 0), j(5, 0, 5.8, 0), j(5, 0, 7.5, 0), j(5, 0, 11, 0), j(5, 0, 20, 0), j(5, 0, 40, 0), j(30, 2, 10, 0), j(30, 2, 31, 2), j(5, 0, 6, 2), j(0, 0, 0, 0), j(12, 1, 13, 1)] })
  expect(JSON.stringify(r) === JSON.stringify(['beat', 'hiyari', 'tight', 'perfect', 'good', 'loose', 'obvious', 'beat', 'tight', 'overdo', 'hiyari', 'tight']), r); return r
})
await t('部長の結果は5種類が1回ずつ（OB・池が必ずある・1ホール目は普通）', async () => {
  const r = await p.evaluate(() => { const out = []; for (let s = 1; s <= 30; s++) { sg.start(s); out.push(sg.S.plan.join(',')) } return out })
  const okAll = r.every(x => { const a = x.split(','); return a.length === 5 && new Set(a).size === 5 && a.includes('ob') && a[0] !== 'ob' && a[0] !== 'pond' })
  expect(okAll, r.slice(0, 3)); return r.slice(0, 2)
})
await t('部長の球が狙いどおりの場所に行く（OB=OB、池=池）30ラウンド', async () => {
  const r = await p.evaluate(() => {
    let ok = 0, bad = []
    for (let s = 1; s <= 30; s++) {
      sg.start(s)
      for (let h = 0; h < 5; h++) {
        sg.dbg.until('aim'); const b = sg.S.bossBall, k = sg.S.plan[sg.S.hole]
        const want = k === 'ob' ? 2 : k === 'pond' ? 1 : 0
        if (b.tier === want) ok++; else bad.push(s + ':' + h + ':' + k + ':' + b.tier)
        sg.shoot(sg.S.aim, 0.5); let i = 0; while (sg.S.phase !== 'intro' && sg.S.view === 'vPlay' && i++ < 4000) sg.dbg.step(1)
        if (sg.S.view !== 'vPlay') break
      }
    }
    return { ok, bad: bad.slice(0, 6) }
  })
  expect(r.bad.length <= 3, r); return r
})
await t('上手い狙いなら OB の部長にも「もっと外にOB」でナイス忖度が取れる', async () => {
  const r = await p.evaluate(() => {
    for (let s = 1; s < 60; s++) { sg.start(s); const i = sg.S.plan.indexOf('ob'); if (i < 1) continue
      for (let h = 0; h < i; h++) { sg.dbg.until('aim'); sg.shoot(sg.S.aim, 0.9); let k = 0; while (sg.S.phase !== 'intro' && k++ < 4000) sg.dbg.step(1) }
      sg.S.mood = 60; sg.dbg.until('aim'); const id = sg.ideal(1.5); sg.shoot(id.aim, id.power); sg.dbg.until('verdict'); const last = sg.S.results.at(-1); return { s, v: last.v, tB: last.tB, tP: last.tP, m: +last.m.toFixed(2) } }
  })
  expect(r && r.tB === 2 && r.tP === 2 && (r.v === 'tight' || r.v === 'perfect'), r); return r
})
await t('何もしないと10秒で「手が滑った」弱い球が出て、わざとらしい判定になる', async () => {
  const r = await p.evaluate(() => { sg.start(3); sg.dbg.until('aim'); sg.dbg.step(60 * 9); const before = sg.S.phase; sg.dbg.step(60 * 1.2); const after = sg.S.phase; sg.dbg.until('verdict'); return { before, after, v: sg.S.results.at(-1).v, power: sg.S.myPower } })
  expect(r.before === 'aim' && r.after !== 'aim' && ['obvious', 'overdo', 'beat', 'loose'].includes(r.v), r); return r
})
// ボットで分布を測る（上手い／ふつう／雑／何もしない）
const dist = {}
if (process.env.BOTS !== '0') {
  for (const kind of ['good', 'normal', 'rough', 'none']) {
    const runs = await p.evaluate(([kind]) => { const out = []; for (let s = 1; s <= 40; s++) out.push(__play(s * 7 + 3, kind)); return out }, [kind])
    const dans = runs.map(r => r.final ? r.final.dan : -1), ords = {}, vs = {}
    for (const r of runs) { if (r.final) ords[r.final.ord] = (ords[r.final.ord] || 0) + 1; for (const v of r.res) vs[v] = (vs[v] || 0) + 1 }
    dist[kind] = { avgDan: +(dans.reduce((a, b) => a + b, 0) / dans.length).toFixed(2), top: dans.filter(d => d >= 9).length, dans: dans.join(''), ords, vs, gameover: runs.filter(r => r.over).length }
  }
  writeFileSync(ROOT + '/shots/bots.json', JSON.stringify(dist, null, 1))
  await t('ボット分布: 上手い>ふつう>雑>何もしない の順に段位が下がる', async () => { const a = ['good', 'normal', 'rough', 'none'].map(k => dist[k].avgDan); expect(a[0] > a[1] && a[1] > a[2] && a[2] >= a[3], a); return a })
  await t('ボット分布: 上手いなら最高ランク(9段以上)がたまに出る・ふつうはほぼ出ない', async () => { const g = dist.good.top, n = dist.normal.top; expect(g >= 2 && g <= 24 && n <= 4, { g, n }); return { good: g, normal: n } })
}
await t('結果画像が 1080x1350 で作れる', async () => {
  const r = await p.evaluate(async () => { __play(11, 'good'); const b = await sg.saveImage(false); return { ...sg.S.lastImage, ok: !!b } })
  expect(r.w === 1080 && r.h === 1350 && r.size > 50000, r); return r
})
await t('保存ボタンでダウンロードが始まる', async () => {
  await p.evaluate(() => sg.dbg.pause(false))
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.click('#bSave')])
  expect(dl.suggestedFilename() === 'sontaku-golf.png', dl.suggestedFilename()); return dl.suggestedFilename()
})
await p.screenshot({ path: ROOT + '/shots/result-ja.png' })
const PUB = 'https://tom3games.github.io/sontaku-golf/'
await t('Xでポスト: 日本語（ボタンが見える・x.com/intent/post・本文に段位と辞令とハッシュタグ・url=公開URL）', async () => {
  const r = await xStub(p, 'sg', PUB, '#忖度ゴルフ')
  const pos = await p.evaluate(() => document.querySelector('#oPos').textContent)
  expect(r.label === 'Xでポスト' && r.text.includes(pos) && /忖度力/.test(r.text), r); return r.text
})
await t('Xでポスト: 本物のクリックで新しいタブが開く', async () => { const tx = await xPopup(p, PUB); expect(/#忖度ゴルフ/.test(tx), tx); return tx.length })
await t('Xでポスト: 英語', async () => {
  await p.click('#bLang')
  const r = await xStub(p, 'sg', PUB, '#LetTheBossWin')
  const pos = await p.evaluate(() => document.querySelector('#oPos').textContent)
  await p.screenshot({ path: ROOT + '/shots/result-en-x.png' })
  await p.click('#bLang')
  expect(r.label === 'Post on X' && r.text.includes(pos) && !/[ぁ-んァ-ン一-龥]/.test(r.text), r); return r.text
})
await t('英語に切り替わる（タイトル・辞令・判定）', async () => {
  await p.click('#bLang')
  const r = await p.evaluate(() => ({ pos: document.querySelector('#oPos').textContent, hk: document.querySelector('#hanko').textContent, lang: document.documentElement.lang }))
  await p.screenshot({ path: ROOT + '/shots/result-en.png' })
  await p.click('#bTitle'); await p.waitForTimeout(300)
  const tt = await p.evaluate(() => document.querySelector('#logoMain').textContent)
  await p.screenshot({ path: ROOT + '/shots/title-en.png' })
  await p.click('#bLang')
  expect(/[A-Za-z]/.test(r.pos) && !/[ぁ-んァ-ン一-龥]/.test(r.pos) && /DEMOTED|PROMOTED|MOVED|MEGA/.test(r.hk) && r.lang === 'en' && /BOSS WIN/.test(tt), r); return r
})
await t('音を鳴らしてもエラーが出ない（ショット・池・拍手・ハンコ）', async () => {
  const r = await p.evaluate(() => { const S = sg.Snd; S.init(); for (const n of ['tap', 'gauge', 'swing', 'hit', 'land', 'splash', 'sand', 'clang', 'glass', 'tree', 'cup', 'clap', 'nice', 'boo', 'laugh', 'gulp', 'angry', 'shriek', 'hmph', 'stamp', 'drum', 'whoosh', 'tick']) S.sfx(n); for (const tr of ['title', 'play', 'win', 'sad']) { S.track = tr; for (let i = 0; i < 64; i++) S['p_' + tr](i, S.now() + i * 0.01) } return Object.keys(S.played).length })
  await p.waitForTimeout(400)
  expect(r >= 20 && p.errs.length === 0, r + ' ' + p.errs.join('|')); return r
})
// 実時間で1ラウンド通す（キーボード・上手い人のタイミング）。時間と fps を測る
await t('実時間で5ホール通せる（スペースキー操作）・60秒前後・fps', async () => {
  await p.click('#bStart')
  const r = await p.evaluate(() => new Promise(res => {
    const t0 = performance.now(); let frames = 0, slow = 0, last = performance.now()
    const tick = () => { const n = performance.now(); frames++; if (n - last > 34) slow++; last = n; if (sg.S.view === 'vResult') return res({ sec: +((n - t0) / 1000).toFixed(1), fps: Math.round(frames / ((n - t0) / 1000)), slow, res: sg.S.results.map(x => x.v) }); if (n - t0 > 150000) return res({ timeout: true, phase: sg.S.phase }); requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    // 人のふり: aim になったら少し考えてからゲージ開始、狙いの強さで止める
    let target = null, state = 0, waitT = 0
    setInterval(() => {
      const S = sg.S
      if (S.view !== 'vPlay') return
      if (S.phase !== 'aim') { state = 0; return }
      if (state === 0) { const id = sg.ideal(1.6); S.aim = id.aim; target = id.power; state = 1; waitT = performance.now() + 900 }
      else if (state === 1 && performance.now() > waitT) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })); state = 2 }
      else if (state === 2 && S.gauge.on && S.gauge.dir > 0 && Math.abs(S.gauge.v - target) < 0.012) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })); state = 3 }
    }, 4)
  }))
  expect(!r.timeout && r.sec > 35 && r.sec < 95 && p.errs.length === 0, r + p.errs.join('|')); return r
})
await t('通しで鳴った音（BGM と効果音）', async () => {
  const r = await p.evaluate(() => Object.keys(sg.Snd.played).filter(k => !['tap'].includes(k)))
  const muted = await p.evaluate(() => !!(sg.Snd.ctx && sg.Snd.ctx.state === 'suspended'))
  expect((r.includes('bgm:play') || muted) && r.includes('hit') && r.includes('stamp'), r); return r.length
})
await p.screenshot({ path: ROOT + '/shots/result-live.png' })
await p.close()

// ---- 6サイズ × 全画面で一画面に収まる
for (const [w, h, name] of SIZES) {
  const q = await open(browser, { viewport: { width: w, height: h } })
  await q.evaluate(HELP)
  const views = {}
  await q.waitForTimeout(300)
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.click('#bHow'); await q.waitForTimeout(200); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` })
  await q.click('#bHowBack'); await q.click('#bStart')
  await q.evaluate(() => { sg.dbg.pause(true); sg.dbg.until('bossRest'); sg.dbg.step(30) }); await q.waitForTimeout(150)
  views.bossRest = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-boss.png` })
  await q.evaluate(() => { sg.dbg.until('aim'); sg.dbg.step(30); sg.S.gauge.on = true; sg.S.gauge.v = 0.55 }); await q.waitForTimeout(150)
  views.aim = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-aim.png` })
  await q.evaluate(() => { const id = sg.ideal(1.6); sg.shoot(id.aim, id.power); sg.dbg.until('verdict'); sg.dbg.step(40) }); await q.waitForTimeout(150)
  views.verdict = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-verdict.png` })
  await q.evaluate(() => { __play(21, 'good'); sg.dbg.pause(false) }); await q.waitForTimeout(1600)
  views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  const clip = await btnClip(q)
  await t(`${name}: 結果画面のボタンの文字が切れない`, async () => { expect(!clip.length, clip) })
  await q.click('#bLang'); await q.waitForTimeout(150); views.resultEn = await fit(q); await t(`${name}: 英語の結果画面のボタンの文字が切れない`, async () => { const c = await btnClip(q); expect(!c.length, c) }); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result-en.png` }); await q.click('#bLang')
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, r) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await t(`${name}: ハンコが見出し・本文に重ならず字が折れない（全辞令×日英）`, async () => { await q.waitForTimeout(400); const b = await q.evaluate(HANKO); expect(!b.length, b.slice(0, 4)) })
  await q.close()
}
await browser.close()
// ---- WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await wp.evaluate(HELP)
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: タップで始めて、丸ボタン2回タップで打てる', async () => {
  await wp.tap('#bStart')
  await wp.waitForFunction(() => sg.S.phase === 'aim', null, { timeout: 20000 })
  await wp.waitForTimeout(300)
  await wp.tap('#bShot'); await wp.waitForTimeout(700); await wp.tap('#bShot')
  await wp.waitForFunction(() => sg.S.phase === 'verdict', null, { timeout: 20000 })
  await wp.screenshot({ path: ROOT + '/shots/webkit-verdict.png' })
  const r = await wp.evaluate(() => ({ v: sg.S.results.at(-1).v, power: +sg.S.myPower.toFixed(2) }))
  expect(r.power > 0.2, r); return r
})
await t('WebKit: 3Dが描けている・エラーなし', async () => { const v = await glVariance(wp); expect(v > 150 && wp.errs.length === 0, v + ' ' + wp.errs.join('|')); return v })
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log('\nbots', JSON.stringify(dist))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
