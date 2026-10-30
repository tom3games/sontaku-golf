// SNS用サムネ og.png（1200x630）。部長の球に自分の球が迫って部長が冷や汗の瞬間＋タイトル。node og.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
const ROOT = import.meta.dirname
const PORT = await new Promise(r => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 500))
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__sgReady)
await p.evaluate(() => document.fonts.ready)
const info = await p.evaluate(() => {
  sg.dbg.pause(true)
  // 部長が「普通」の結果のホールを探し、少し強めに打って部長の球を追い越しかける所で止める
  for (let s = 1; s < 80; s++) {
    sg.start(s); const i = sg.S.plan.indexOf('normal'); if (i !== 0) continue
    sg.dbg.until('aim'); const id = sg.ideal(-0.6); sg.shoot(id.aim, id.power)
    sg.dbg.until('fly'); let n = 0
    let hit = false
    while (n++ < 2000 && sg.S.phase === 'fly') { sg.dbg.step(1); const b = sg.S.myBall, bb = sg.S.bossBall; if (b && b.st === 'roll' && Math.hypot(b.x - sg.H.pin.x, b.z - sg.H.pin.z) < bb.dist + 2.5) { hit = true; break } }
    if (!hit) continue
    return { s, v: sg.S.bossBall.dist }
  }
})
await p.evaluate(() => {
  const H = sg.H, bb = sg.S.bossBall, b = sg.S.myBall, c = sg.camera
  sg.S.view = 'og'
  const cx = (bb.x + b.x + H.pin.x) / 3, cz = (bb.z + b.z + H.pin.z) / 3
  c.fov = 46; c.aspect = 1200 / 630; c.updateProjectionMatrix()
  c.position.set(cx - 6, 11, cz + 22); c.lookAt(cx + 9, 0, cz - 2); c.updateMatrixWorld()
  const ctx = sg.renderer.getContext()
  sg.dbg.render = sg.dbg.render
  document.querySelector('#vPlay').hidden = true; document.querySelector('#corner').style.display = 'none'
  sg.renderer.setViewport(0, 0, 1200, 630); sg.renderer.render(sg.scene, c)
})
await p.addStyleTag({ content: `body::after{content:'';position:fixed;inset:0 0 0 50%;background:linear-gradient(90deg,rgba(20,36,58,0),rgba(20,36,58,.92) 24%);z-index:30}` })
await p.evaluate(() => {
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:34px;top:0;bottom:0;width:540px;z-index:31;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:16px;color:#fff;text-align:center'
  d.innerHTML = `<div style="background:#d8262e;font:900 22px 'M PLUS Rounded 1c',sans-serif;padding:6px 16px;border-radius:6px;box-shadow:0 3px 0 #8e1218;letter-spacing:.06em;transform:rotate(-2deg)">接待ゴルフ</div>
  <div style="font-family:'Dela Gothic One';font-size:112px;line-height:1;white-space:nowrap;text-shadow:0 6px 0 #1d5326,4px 4px 0 #1f1a17,-2px -2px 0 #1f1a17,2px -2px 0 #1f1a17,-2px 2px 0 #1f1a17">忖度<span style="color:#ffc53d">ゴルフ</span></div>
  <div style="font:900 34px/1.45 'M PLUS Rounded 1c',sans-serif">部長に「ほんの少しだけ」負けろ。</div>
  <div style="font:800 22px/1.5 'M PLUS Rounded 1c',sans-serif;color:#cfe0f5">勝っても、わざとらしくてもアウト</div>`
  document.body.appendChild(d)
  // 冷や汗の部長
  const f = document.createElement('canvas'); f.width = f.height = 300; sg.drawFace(f.getContext('2d'), 300, 'sweat', 0.35, { portrait: true })
  f.style.cssText = 'position:fixed;left:36px;top:34px;width:170px;height:170px;z-index:31;border-radius:50%;background:#ffe9c9;box-shadow:0 6px 0 rgba(0,0,0,.3),inset 0 0 0 5px #fff'
  document.body.appendChild(f)
  const o = document.createElement('div'); o.textContent = 'お、おい…近いぞ…'
  o.style.cssText = "position:fixed;left:220px;top:70px;z-index:31;background:#fff;color:#1f1a17;font:900 36px 'M PLUS Rounded 1c',sans-serif;padding:12px 22px;border-radius:22px;border:4px solid #1f1a17;box-shadow:0 5px 0 rgba(0,0,0,.3);transform:rotate(-3deg)"
  document.body.appendChild(o)
})
await p.waitForTimeout(500)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('ok', JSON.stringify(info))
