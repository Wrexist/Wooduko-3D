import { AUDIO } from '../config';

type Win = Window & { webkitAudioContext?: typeof AudioContext };

/**
 * WebAudio synth. Unlocked on the first touch. Sound effects and music have separate gains under
 * one master. Phase 6 swaps these synths for recorded wood foley.
 */
export class Sound {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private sfxOn = true;
  private musicOn = true;
  private musicTimer: number | null = null;
  private musicStep = 0;

  /** Suspended by us, or "interrupted" by iOS (calls, Siri, other audio). */
  private get needsResume(): boolean {
    const st = this.ac?.state as string | undefined;
    return st === 'suspended' || st === 'interrupted';
  }

  /** Call from a user gesture. Safe to call often. */
  unlock(): void {
    if (!this.ac) {
      try {
        const Ctx = window.AudioContext ?? (window as Win).webkitAudioContext;
        if (!Ctx) return;
        const ac = new Ctx();
        this.master = ac.createGain();
        this.master.gain.value = AUDIO.master;
        this.master.connect(ac.destination);
        this.sfx = ac.createGain();
        this.sfx.gain.value = this.sfxOn ? 1 : 0;
        this.sfx.connect(this.master);
        this.musicGain = ac.createGain();
        this.musicGain.gain.value = this.musicOn ? AUDIO.musicVolume : 0;
        this.musicGain.connect(this.master);
        const len = Math.floor(ac.sampleRate * AUDIO.noiseSeconds);
        this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.ac = ac;
        this.syncMusic();
      } catch {
        this.ac = null;
      }
    }
    if (this.needsResume) void this.ac?.resume().catch(() => undefined);
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    if (this.sfx) this.sfx.gain.value = on ? 1 : 0;
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.musicGain && this.ac) {
      this.musicGain.gain.setTargetAtTime(on ? AUDIO.musicVolume : 0, this.ac.currentTime, 0.4);
    }
    this.syncMusic();
  }

  /** Pause everything (app backgrounded). */
  suspend(): void {
    if (this.ac?.state === 'running') void this.ac.suspend().catch(() => undefined);
    this.stopMusic();
  }

  resume(): void {
    if (this.needsResume) void this.ac?.resume().catch(() => undefined);
    this.syncMusic();
  }

  // ---------- primitives ----------

  private env(g: GainNode, t0: number, a: number, peak: number, dec: number): void {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    t0: number,
    dur: number,
    peak: number,
    out?: AudioNode,
  ): void {
    const ac = this.ac;
    const dest = out ?? this.sfx;
    if (!ac || !dest) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    this.env(g, t0, 0.004, peak, dur);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(
    type: BiquadFilterType,
    freq: number,
    q: number,
    t0: number,
    dur: number,
    peak: number,
  ): void {
    const ac = this.ac;
    if (!ac || !this.sfx || !this.noiseBuf) return;
    const s = ac.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    this.env(g, t0, 0.003, peak, dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    s.start(t0);
    s.stop(t0 + dur + 0.05);
  }

  private marimba(f: number, t0: number, gain: number, out?: AudioNode): void {
    this.tone('sine', f, f, t0, 0.7, gain, out);
    this.tone('sine', f * 4, f * 4, t0, 0.12, gain * 0.22, out);
    this.tone('sine', f * 10, f * 10, t0, 0.04, gain * 0.06, out);
  }

  private get now(): number | null {
    return this.ac && this.sfxOn ? this.ac.currentTime : null;
  }

  // ---------- effects ----------

  pickup(): void {
    const t = this.now;
    if (t === null) return;
    this.noise('bandpass', 2600, 1.2, t, 0.05, 0.16);
    this.tone('sine', 880, 700, t, 0.05, 0.05);
  }

  place(): void {
    const t = this.now;
    if (t === null) return;
    this.tone('sine', 165, 72, t, 0.2, 0.6);
    this.noise('bandpass', 650, 1.1, t, 0.08, 0.38);
    this.tone('triangle', 430, 380, t, 0.07, 0.1);
  }

  returnPiece(): void {
    const t = this.now;
    if (t === null) return;
    this.tone('sine', 320, 210, t, 0.09, 0.12);
    this.noise('lowpass', 900, 0.7, t, 0.05, 0.08);
  }

  clear(units: number, streak: number): void {
    const t = this.now;
    if (t === null) return;
    const scale = AUDIO.scale;
    const base =
      AUDIO.clearBase * 2 ** ((Math.min(streak - 1, AUDIO.clearStreakCap) * AUDIO.clearStreakSemis) / 12);
    const n = Math.min(scale.length, 3 + units);
    for (let i = 0; i < n; i++)
      this.marimba(base * 2 ** ((scale[i] ?? 0) / 12), t + 0.05 + i * AUDIO.clearNoteGap, 0.22);
    this.noise('highpass', 3500, 0.7, t + 0.04, 0.3, 0.05);
    this.whoosh(t);
  }

  private whoosh(t: number): void {
    const ac = this.ac;
    if (!ac || !this.sfx || !this.noiseBuf) return;
    const s = ac.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(4200, t + 0.32);
    const g = ac.createGain();
    this.env(g, t, 0.06, 0.16, 0.32);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    s.start(t);
    s.stop(t + 0.45);
  }

  deal(): void {
    const t = this.now;
    if (t === null) return;
    for (const d of [0, 0.08, 0.16]) {
      this.noise('bandpass', 1800, 2, t + d, 0.04, 0.07);
      this.tone('sine', 620 + d * 900, 560 + d * 900, t + d, 0.05, 0.04);
    }
  }

  boardClear(): void {
    const t = this.now;
    if (t === null) return;
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.marimba(523 * 2 ** (n / 12), t + 0.25 + i * 0.05, 0.16));
  }

  gameOver(): void {
    const t = this.now;
    if (t === null) return;
    [392, 330, 262, 196].forEach((f, i) => this.marimba(f, t + i * 0.16, 0.2));
  }

  /** Soft UI tick for buttons. */
  tick(): void {
    const t = this.now;
    if (t === null) return;
    this.noise('bandpass', 2200, 1.5, t, 0.03, 0.06);
  }

  // ---------- music: slow generative marimba over a pentatonic scale ----------

  private syncMusic(): void {
    if (this.musicOn && this.ac && this.ac.state !== 'closed') this.startMusic();
    else this.stopMusic();
  }

  private startMusic(): void {
    if (this.musicTimer !== null) return;
    const beat = 0.62;
    const chords = [
      [0, 4, 7, 11],
      [-3, 0, 4, 7],
      [-7, -3, 0, 4],
      [-5, -1, 2, 7],
    ];
    const root = 220;
    const play = (): void => {
      const ac = this.ac;
      const out = this.musicGain;
      if (!ac || !out || ac.state !== 'running') return;
      const t = ac.currentTime + 0.05;
      const step = this.musicStep++;
      const chord = chords[Math.floor(step / 8) % chords.length] ?? [0];
      const pick = chord[(step * 3 + Math.floor(step / 4)) % chord.length] ?? 0;
      if (step % 8 === 0) this.marimba((root * 2 ** ((chord[0] ?? 0) / 12)) / 2, t, 0.5, out);
      if (step % 2 === 0 || Math.random() < 0.35) this.marimba(root * 2 ** (pick / 12), t, 0.32, out);
    };
    this.musicTimer = window.setInterval(play, beat * 1000);
  }

  private stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  dispose(): void {
    this.stopMusic();
    void this.ac?.close().catch(() => undefined);
    this.ac = null;
  }
}
