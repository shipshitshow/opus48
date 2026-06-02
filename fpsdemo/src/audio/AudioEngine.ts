// Procedural music + SFX via the Web Audio API. No audio files: everything is
// synthesised, so it ships anywhere (incl. static hosts) and works offline.
// A single shared instance is used by the game and the React settings UI.

type SfxName =
  | 'shoot'
  | 'hit'
  | 'headshot'
  | 'kill'
  | 'reload'
  | 'pickup'
  | 'hurt'
  | 'switch'
  | 'wave'
  | 'boss'
  | 'victory'
  | 'defeat'
  | 'shieldhit'

// A minor vibe: Am – F – C – G, voiced low for a pad.
const PROGRESSION: number[][] = [
  [110.0, 130.81, 164.81], // Am
  [87.31, 110.0, 130.81], // F
  [130.81, 164.81, 196.0], // C
  [98.0, 123.47, 146.83], // G
]
const STEP_DUR = 0.25 // eighth note @ ~120bpm

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicBus: GainNode | null = null
  private sfxBus: GainNode | null = null

  private musicEnabled = true
  private sfxEnabled = true
  private musicRunning = false
  private schedulerId: number | null = null
  private nextNoteTime = 0
  private step = 0

  private ensure(): boolean {
    if (this.ctx) return true
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return false
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.9
      this.master.connect(this.ctx.destination)
      this.musicBus = this.ctx.createGain()
      this.musicBus.gain.value = 0.16
      this.musicBus.connect(this.master)
      this.sfxBus = this.ctx.createGain()
      this.sfxBus.gain.value = 0.5
      this.sfxBus.connect(this.master)
      return true
    } catch {
      this.ctx = null
      return false
    }
  }

  /** Call from a user gesture (click) so the browser allows audio. */
  unlock() {
    if (!this.ensure() || !this.ctx) return
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    if (this.musicEnabled) this.startMusic()
  }

  setMusicEnabled(on: boolean) {
    this.musicEnabled = on
    if (!this.ctx) return
    if (on) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      this.startMusic()
    } else {
      this.stopMusic()
    }
  }

  setSfxEnabled(on: boolean) {
    this.sfxEnabled = on
  }

  get musicOn() {
    return this.musicEnabled
  }
  get sfxOn() {
    return this.sfxEnabled
  }
  /** Exposed for verification/diagnostics. */
  get contextState() {
    return this.ctx ? this.ctx.state : 'none'
  }

  // --------------------------------------------------------------- music

  private startMusic() {
    if (!this.ctx || this.musicRunning) return
    this.musicRunning = true
    this.step = 0
    this.nextNoteTime = this.ctx.currentTime + 0.1
    this.schedulerId = window.setInterval(() => this.scheduler(), 25)
  }

  private stopMusic() {
    this.musicRunning = false
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId)
      this.schedulerId = null
    }
  }

  private scheduler() {
    if (!this.ctx || !this.musicRunning) return
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextNoteTime)
      this.step = (this.step + 1) % 32
      this.nextNoteTime += STEP_DUR
    }
  }

  private scheduleStep(step: number, t: number) {
    const chord = PROGRESSION[Math.floor(step / 8) % PROGRESSION.length]
    const eighth = step % 8
    if (eighth === 0) this.playPad(chord, t, STEP_DUR * 8)
    this.playArp(chord[eighth % chord.length] * 2, t)
    if (eighth === 0 || eighth === 4) this.playKick(t)
    if (eighth % 2 === 1) this.playHat(t)
  }

  private playPad(freqs: number[], t: number, dur: number) {
    if (!this.ctx || !this.musicBus) return
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.5, t + 0.6)
    g.gain.linearRampToValueAtTime(0, t + dur)
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    g.connect(lp).connect(this.musicBus)
    for (const f of freqs) {
      const o = this.ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      const d = this.ctx.createOscillator()
      d.type = 'triangle'
      d.frequency.value = f * 1.004
      o.connect(g)
      d.connect(g)
      o.start(t)
      d.start(t)
      o.stop(t + dur + 0.1)
      d.stop(t + dur + 0.1)
    }
  }

  private playArp(freq: number, t: number) {
    if (!this.ctx || !this.musicBus) return
    const o = this.ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = freq
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    o.connect(g).connect(this.musicBus)
    o.start(t)
    o.stop(t + 0.25)
  }

  private playKick(t: number) {
    if (!this.ctx || !this.musicBus) return
    const o = this.ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(120, t)
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.9, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
    o.connect(g).connect(this.musicBus)
    o.start(t)
    o.stop(t + 0.18)
  }

  private playHat(t: number) {
    if (!this.ctx || !this.musicBus) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer(0.05)
    const hp = this.ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7000
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.12, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
    src.connect(hp).connect(g).connect(this.musicBus)
    src.start(t)
    src.stop(t + 0.06)
  }

  // ----------------------------------------------------------------- sfx

  sfx(name: SfxName) {
    if (!this.sfxEnabled || !this.ensure() || !this.ctx) return
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    const t = this.ctx.currentTime
    switch (name) {
      case 'shoot':
        this.zap(t, 'square', 320, 90, 0.09, 0.22)
        this.noise(t, 0.05, 0.18, 1800)
        break
      case 'hit':
        this.zap(t, 'triangle', 700, 520, 0.06, 0.18)
        break
      case 'headshot':
        this.zap(t, 'square', 900, 900, 0.05, 0.2)
        this.zap(t + 0.05, 'square', 1320, 1320, 0.08, 0.2)
        break
      case 'kill':
        this.zap(t, 'sawtooth', 440, 110, 0.16, 0.22)
        break
      case 'reload':
        this.noise(t, 0.04, 0.25, 2500)
        this.noise(t + 0.18, 0.05, 0.3, 1800)
        break
      case 'pickup':
        this.zap(t, 'sine', 520, 1040, 0.16, 0.28)
        break
      case 'hurt':
        this.zap(t, 'square', 160, 70, 0.16, 0.3)
        this.noise(t, 0.08, 0.22, 700)
        break
      case 'switch':
        this.zap(t, 'square', 600, 600, 0.04, 0.15)
        break
      case 'wave':
        this.zap(t, 'sawtooth', 220, 660, 0.5, 0.22)
        break
      case 'boss':
        this.zap(t, 'sawtooth', 70, 140, 0.9, 0.32)
        break
      case 'victory':
        this.chord(t, [523, 659, 784, 1047], 0.7)
        break
      case 'defeat':
        this.zap(t, 'sawtooth', 330, 70, 1.0, 0.3)
        break
      case 'shieldhit':
        this.zap(t, 'sine', 1200, 1600, 0.06, 0.12)
        break
    }
  }

  private zap(t: number, type: OscillatorType, f0: number, f1: number, dur: number, gain: number) {
    if (!this.ctx || !this.sfxBus) return
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.sfxBus)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  private noise(t: number, dur: number, gain: number, filterFreq: number) {
    if (!this.ctx || !this.sfxBus) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer(dur)
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = filterFreq
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(bp).connect(g).connect(this.sfxBus)
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  private chord(t: number, freqs: number[], dur: number) {
    freqs.forEach((f, i) => this.zap(t + i * 0.08, 'triangle', f, f, dur, 0.22))
  }

  private noiseBuffer(dur: number): AudioBuffer {
    const ctx = this.ctx!
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur))
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return buf
  }
}

export const audio = new AudioEngine()
