// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium, webkit } from 'playwright'
const URL0 = 'https://tom3games.github.io/sontaku-golf/'
const ID = new RegExp(['tmk', '4men'].join(''), 'i') // 個人IDを直接書かない
const out = []
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts }), p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('fail ' + r.url()) })
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__sgReady, null, { timeout: 20000 })
  // 遊びの通し: 始める → 部長が打つ → 丸ボタン2回 → 判定
  const tap = s => opts.hasTouch ? p.tap(s) : p.click(s)
  await tap('#bStart')
  await p.waitForFunction(() => sg.S.phase === 'aim', null, { timeout: 25000 })
  await tap('#bShot'); await p.waitForTimeout(800); await tap('#bShot')
  await p.waitForFunction(() => sg.S.phase === 'verdict', null, { timeout: 25000 })
  const v = await p.evaluate(() => sg.S.results.at(-1).v)
  await p.screenshot({ path: `shots/live-${name}.png` })
  const og = await p.evaluate(async () => { const r = await fetch(document.querySelector('meta[property="og:image"]').content); return r.status + ' ' + r.headers.get('content-type') })
  out.push(`${name}: verdict=${v} og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
const b = await chromium.launch(), p = await b.newPage()
for (const u of ['https://github.com/tom3games/sontaku-golf', 'https://github.com/tom3games/sontaku-golf/commits/main']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  out.push(`${u} status=${res.status()} personalId=${ID.test(await p.content()) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))
