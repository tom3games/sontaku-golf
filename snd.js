// 音（素材なし・WebAudio）。ぬりぬりランウェイの音エンジンを土台に、曲と効果音を忖度ゴルフ用に書いた
// 最初のタップで Snd.init()、画面切替で Snd.setTrack('名前')、毎フレーム Snd.tick()。検証は Snd.played と Snd.level()
window.Snd = {
  ctx: null, muted: false, next: 0, step: 0, track: null, want: null, switchAt: 0, played: {},
  TEMPO: { title: 104, play: 92, win: 132, sad: 70 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    try {
      this.ctx = new AC()
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.master.connect(this.an); this.an.connect(this.ctx.destination)
      this.bgm = this.ctx.createGain(); this.bgm.gain.value = 0.0001; this.bgm.connect(this.master)
      const len = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, len, len)
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      if (this.want) { const w = this.want; this.want = null; this.setTrack(w) }
    } catch (e) { this.ctx = null }
  },
  setMute(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7 },
  tone(f, t0, dur, type = 'square', vol = 0.2, dest, f2) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + dur + 0.02)
  },
  noise(t0, dur, vol, freq, type = 'highpass', dest, q) {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02)
  },
  // 声っぽい音（のこぎり波をフォルマントで絞る）。情けない悲鳴や部長の笑い声に使う
  voice(f0, t0, dur, f1, vol = 0.12, formant = 900) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain(), vib = c.createOscillator(), vg = c.createGain()
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur)
    vib.frequency.value = 7; vg.gain.value = f0 * 0.04; vib.connect(vg); vg.connect(o.frequency)
    bp.type = 'bandpass'; bp.frequency.value = formant; bp.Q.value = 3
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(bp); bp.connect(g); g.connect(this.master); o.start(t0); vib.start(t0); o.stop(t0 + dur + 0.05); vib.stop(t0 + dur + 0.05)
  },
  now() { return this.ctx ? this.ctx.currentTime : 0 },
  level() { if (!this.an) return 0; const d = new Float32Array(this.an.fftSize); this.an.getFloatTimeDomainData(d); let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); return m },
  mtof: m => 440 * Math.pow(2, (m - 69) / 12),
  mark(n) { this.played[n] = (this.played[n] || 0) + 1 },
  setTrack(name) {
    if (this.want === name) return
    this.want = name; if (!this.ctx) return
    const now = this.ctx.currentTime, g = this.bgm.gain
    g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.linearRampToValueAtTime(0.0001, now + 0.25)
    this.switchAt = now + 0.27
  },
  tick() {
    if (!this.ctx) return; const c = this.ctx
    if (this.switchAt && c.currentTime >= this.switchAt) {
      this.track = this.want; this.step = 0; this.next = c.currentTime + 0.05; this.switchAt = 0
      const g = this.bgm.gain; g.cancelScheduledValues(c.currentTime); g.setValueAtTime(0.0001, c.currentTime); g.linearRampToValueAtTime(0.24, c.currentTime + 0.35)
      if (this.track) this.mark('bgm:' + this.track)
    }
    if (!this.track || this.switchAt) return
    const spb = 60 / this.TEMPO[this.track] / 4
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05
    while (this.next < c.currentTime + 0.25) { this['p_' + this.track](this.step, this.next); this.next += spb; this.step++ }
  },
  kick(t, v = 0.5) { this.tone(130, t, 0.14, 'sine', v, this.bgm, 45) },
  rim(t, v = 0.08) { this.noise(t, 0.03, v, 2500, 'bandpass', this.bgm, 4); this.tone(1700, t, 0.02, 'square', v * 0.25, this.bgm) },
  shaker(t, v = 0.03) { this.noise(t, 0.04, v, 7000, 'highpass', this.bgm) },
  bass(n, t, dur = 0.3, vol = 0.32) { this.tone(this.mtof(n), t, dur, 'triangle', vol, this.bgm) },
  ep(ns, t, dur = 0.5, vol = 0.03) { for (const n of ns) { this.tone(this.mtof(n), t, dur, 'sine', vol, this.bgm); this.tone(this.mtof(n) * 2, t, dur * 0.4, 'triangle', vol * 0.25, this.bgm) } },
  // タイトル: 接待っぽいボサノバ（Dm9 - G13 - Cmaj9 - A7）
  p_title(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const root = [38, 43, 36, 45][bar], ch = [[62, 65, 69, 72, 76], [59, 64, 65, 69], [59, 64, 67, 71], [61, 64, 67, 70]][bar]
    if (s === 0 || s === 10) this.bass(root, t, 0.35); if (s === 6 || s === 14) this.bass(root + 7, t, 0.25, 0.26)
    if ([0, 3, 6, 10, 12].includes(s)) this.rim(t, 0.06); if (s % 2 === 0) this.shaker(t, s % 4 ? 0.02 : 0.035)
    if ([2, 5, 9, 13].includes(s)) this.ep(ch, t, 0.32, 0.022)
    const mel = [[74, -1, 77, -1, 76, 74, -1, 72], [71, -1, 72, 74, -1, 71, -1, -1], [72, -1, 76, -1, 79, 77, 76, -1], [73, -1, 76, -1, 79, -1, 77, -1]]
    if (Math.floor(i / 64) % 2 && s % 2 === 0) { const n = mel[bar][s / 2]; if (n > 0) this.tone(this.mtof(n), t, 0.28, 'sine', 0.05, this.bgm) }
  },
  // プレイ中: 静かなラウンジ（緊張感のあるベースだけ）
  p_play(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const root = [40, 45, 38, 43][bar], ch = [[64, 67, 71, 74], [64, 67, 69, 72], [62, 65, 69, 72], [62, 65, 67, 71]][bar]
    if (s % 4 === 0) this.bass(root + [0, 7, 12, 7][s / 4], t, 0.26, 0.24)
    if (s === 4 || s === 12) this.rim(t, 0.05); if (s % 2 === 0) this.shaker(t, 0.018)
    if (s === 0) this.ep(ch, t, 1.4, 0.016)
  },
  // 昇進: 華やかなファンファーレ（ブラス風）
  p_win(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const root = [48, 53, 55, 48][bar], ch = [[64, 67, 72], [65, 69, 72], [67, 71, 74], [64, 67, 72]][bar]
    if (s % 4 === 0) this.kick(t, 0.55); if (s === 4 || s === 12) { this.noise(t, 0.08, 0.12, 1500, 'bandpass', this.bgm) } if (s % 2) this.shaker(t, 0.03)
    if (s % 4 === 0) this.bass(root, t, 0.2, 0.3)
    if (s === 0 || s === 6 || s === 10) for (const n of ch) this.tone(this.mtof(n), t, 0.22, 'sawtooth', 0.018, this.bgm)
    const mel = [[72, 76, 79, 84], [81, 77, 81, 84], [83, 79, 86, 83], [84, -1, 79, 84]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.tone(this.mtof(n), t, 0.24, 'square', 0.035, this.bgm) }
  },
  // 左遷: 物悲しいワルツ（Am - Dm - E - Am）
  p_sad(i, t) {
    const bar = Math.floor(i / 12) % 4, s = i % 12
    const ch = [[57, 60, 64], [57, 62, 65], [56, 59, 64], [57, 60, 64]][bar], root = [33, 38, 40, 33][bar]
    if (s === 0) this.bass(root, t, 0.8, 0.3); if (s === 4 || s === 8) for (const n of ch) this.tone(this.mtof(n), t, 0.4, 'triangle', 0.02, this.bgm)
    const mel = [[76, 74, 72], [74, 72, 69], [71, 69, 68], [69, -1, -1]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.tone(this.mtof(n), t, 0.5, 'sine', 0.06, this.bgm) }
  },
  sfx(name, v = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime; this.mark(name)
    switch (name) {
      case 'tap': this.tone(880, t, 0.06, 'triangle', 0.12 * v); break
      case 'gauge': this.tone(500, t, 0.08, 'square', 0.05, null, 900); break
      case 'swing': this.noise(t, 0.22, 0.12, 1200, 'bandpass', null, 1.5); break
      case 'hit': this.tone(1400, t, 0.05, 'square', 0.12, null, 600); this.noise(t, 0.06, 0.35, 3000, 'highpass'); this.tone(220, t, 0.08, 'sine', 0.3, null, 90); break
      case 'land': this.tone(160, t, 0.12, 'sine', 0.25 * v, null, 60); this.noise(t, 0.08, 0.1 * v, 600, 'lowpass'); break
      case 'splash': this.noise(t, 0.6, 0.45, 900, 'lowpass'); this.noise(t + 0.05, 0.9, 0.15, 3000, 'bandpass', null, 0.7); for (let k = 0; k < 6; k++) this.tone(600 + Math.random() * 900, t + 0.1 + k * 0.06, 0.08, 'sine', 0.06, null, 1600); break
      case 'sand': this.noise(t, 0.35, 0.3, 1800, 'bandpass', null, 0.6); this.tone(90, t, 0.15, 'sine', 0.3, null, 40); break
      case 'clang': this.tone(700, t, 0.6, 'square', 0.08, null, 650); this.tone(1130, t, 0.5, 'triangle', 0.1); this.noise(t, 0.05, 0.3, 4000); break
      case 'glass': for (let k = 0; k < 14; k++) this.tone(2500 + Math.random() * 3000, t + Math.random() * 0.35, 0.12, 'triangle', 0.06); this.noise(t, 0.5, 0.25, 5000); break
      case 'tree': this.noise(t, 0.4, 0.2, 2200, 'bandpass', null, 0.5); this.tone(240, t, 0.08, 'square', 0.1, null, 120); break
      case 'cup': for (let k = 0; k < 3; k++) this.tone(900, t + k * 0.07, 0.06, 'triangle', 0.15, null, 600); break
      case 'clap': for (let k = 0; k < 40 * v; k++) this.noise(t + Math.random() * 1.2 * v, 0.03, 0.06, 1800 + Math.random() * 2000, 'bandpass', null, 0.8); break
      case 'nice': { const f = 523; this.tone(f, t, 0.15, 'triangle', 0.2); this.tone(f * 1.25, t + 0.08, 0.15, 'triangle', 0.2); this.tone(f * 1.5, t + 0.16, 0.3, 'triangle', 0.22); this.tone(f * 2, t + 0.24, 0.45, 'sine', 0.18); break }
      case 'boo': for (let k = 0; k < 6; k++) { const f = 110 + Math.random() * 40; this.tone(f, t + Math.random() * 0.15, 1.0, 'sawtooth', 0.04, null, f * 0.7) } break
      case 'laugh': for (let k = 0; k < 5; k++) this.voice(260 - k * 8, t + k * 0.13, 0.11, 200 - k * 8, 0.16, 700); break
      case 'gulp': this.voice(500, t, 0.18, 280, 0.08, 1100); this.tone(300, t + 0.18, 0.1, 'sine', 0.15, null, 120); break
      case 'angry': this.voice(140, t, 0.7, 95, 0.2, 500); this.noise(t, 0.7, 0.05, 300, 'lowpass'); break
      case 'shriek': this.voice(700, t, 0.5, 1300, 0.12, 1600); this.voice(1300, t + 0.45, 0.4, 600, 0.1, 1400); break
      case 'hmph': this.voice(180, t, 0.25, 140, 0.14, 600); break
      case 'stamp': this.tone(90, t, 0.25, 'sine', 0.7, null, 40); this.noise(t, 0.12, 0.4, 800, 'lowpass'); break
      case 'drum': for (let k = 0; k < 24; k++) this.noise(t + k * 0.045, 0.05, 0.05 + k * 0.005, 400, 'lowpass'); break
      case 'whoosh': this.noise(t, 0.3, 0.06, 900, 'bandpass', null, 2); break
      case 'tick': this.tone(1200, t, 0.03, 'square', 0.04); break
    }
  },
}
