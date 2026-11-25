// Procedural WebAudio Folk Orchestra & Sound Effect Director (Kulintang, Kudyapi, Monster Cries & Skill Foley).

import type { FieldActorEntity, GameSfxKind } from '../ecs/fieldWorld.ts';

export function clampAudioVolume(val: number | undefined, fallback = 80): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(0, Math.min(100, Math.round(val)));
}

export class WebAudioDirector {
  ctx: AudioContext | null = null;
  bgmTimer = 0;
  stepIndex = 0;

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  playTone(freq: number, endFreq: number, dur: number, type: OscillatorType = 'triangle', vol = 0.12, delaySec = 0): void {
    if (!this.ctx || this.ctx.state !== 'running' || vol <= 0.0005) return;
    const now = this.ctx.currentTime + delaySec;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + dur);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + Math.min(0.015, dur * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private playFilteredNoise(startFreq: number, endFreq: number, dur: number, q = 1.6, vol = 0.08): void {
    if (!this.ctx || this.ctx.state !== 'running' || vol <= 0.0005) return;
    const sampleCount = Math.max(256, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, sampleCount, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const now = this.ctx.currentTime;
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, endFreq), now + dur);
    filter.Q.value = q;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + Math.min(0.02, dur * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  private playFormantVoice(gender: 'male' | 'female', heavy = false, scale = 1.0): void {
    if (!this.ctx || this.ctx.state !== 'running' || scale <= 0.01) return;
    const now = this.ctx.currentTime;
    const dur = heavy ? 0.19 : 0.12;
    const baseF0 = gender === 'female' ? (heavy ? 315 : 290) : (heavy ? 150 : 168);
    const endF0 = gender === 'female' ? 215 : 112;
    const formantFreq = gender === 'female' ? 920 : 660;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseF0, now);
    osc.frequency.exponentialRampToValueAtTime(endF0, now + dur);

    const formant = this.ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(formantFreq * 1.15, now);
    formant.frequency.exponentialRampToValueAtTime(formantFreq * 0.85, now + dur);
    formant.Q.value = 3.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime((heavy ? 0.14 : 0.10) * scale, now + 0.022);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(formant);
    formant.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private playMonsterVoice(
    species: FieldActorEntity['enemyType'] | undefined,
    mode: 'roar' | 'hit' | 'die',
    scale: number
  ): void {
    if (scale <= 0.01) return;
    const dur = mode === 'die' ? 0.28 : mode === 'roar' ? 0.22 : 0.10;
    switch (species) {
      case 'bakunawa':
        // Abyssal serpent roar & echoing ocean crash
        this.playTone(mode === 'hit' ? 130 : 108, mode === 'die' ? 38 : 54, dur, 'sawtooth', 0.13 * scale);
        this.playTone(162, 68, dur * 0.9, 'triangle', 0.10 * scale, 0.02);
        this.playFilteredNoise(620, 140, dur, 1.3, 0.09 * scale);
        break;
      case 'kapre':
        // Deep giant ember growl
        this.playTone(155, mode === 'die' ? 48 : 74, dur, 'sawtooth', 0.11 * scale);
        this.playFilteredNoise(380, 110, dur * 0.85, 1.5, 0.07 * scale);
        break;
      case 'tikbalang':
        // Equine hoof snort & bronze clash
        this.playTone(240, 112, dur, 'square', 0.08 * scale);
        this.playFilteredNoise(1150, 320, dur * 0.6, 1.8, 0.08 * scale);
        break;
      case 'manananggal':
        // Piercing owl-wing screech
        this.playTone(620, mode === 'die' ? 240 : 880, dur, 'sine', 0.09 * scale);
        this.playFilteredNoise(1800, 740, dur * 0.85, 2.2, 0.06 * scale);
        break;
      case 'aswang':
        // Raspy predator hiss
        this.playTone(480, 230, dur, 'sawtooth', 0.08 * scale);
        this.playFilteredNoise(1650, 480, dur * 0.75, 1.7, 0.08 * scale);
        break;
      case 'tiyanak':
      default:
        // Eerie sharp goblin wail
        this.playTone(mode === 'die' ? 520 : 810, mode === 'die' ? 190 : 470, dur, 'triangle', 0.09 * scale);
        break;
    }
  }

  playSfx(
    kind: GameSfxKind,
    enabled = true,
    opts?: {
      gender?: 'male' | 'female';
      heavy?: boolean;
      species?: FieldActorEntity['enemyType'];
      weaponId?: number;
      sfxVolume?: number;
      voiceSfx?: boolean;
    }
  ): void {
    const volScale = clampAudioVolume(opts?.sfxVolume, 85) / 100;
    const voiceEnabled = opts?.voiceSfx !== false;
    if (!enabled || volScale <= 0.005) return;
    this.unlock();

    switch (kind) {
      case 'hero_attack_voice':
        if (voiceEnabled) this.playFormantVoice(opts?.gender ?? 'male', Boolean(opts?.heavy), volScale);
        break;
      case 'monster_roar':
        if (voiceEnabled) this.playMonsterVoice(opts?.species, 'roar', volScale);
        break;
      case 'swing': {
        const w = opts?.weaponId ?? 0;
        if (w === 1) {
          // Tirador bowstring twang
          this.playTone(420, 195, 0.11, 'triangle', 0.09 * volScale);
          this.playFilteredNoise(2100, 900, 0.06, 2.0, 0.05 * volScale);
        } else if (w === 2) {
          // Tungkod spirit staff whoosh + wooden ring
          this.playFilteredNoise(1050, 320, 0.13, 1.4, 0.09 * volScale);
          this.playTone(390, 520, 0.11, 'sine', 0.07 * volScale);
        } else if (w === 3) {
          // Kalasag heavy shield thud
          this.playTone(190, 82, 0.14, 'square', 0.09 * volScale);
          this.playFilteredNoise(740, 210, 0.12, 1.2, 0.09 * volScale);
        } else if (w === 4) {
          // Sibat piercing wind thrust
          this.playFilteredNoise(1950, 440, 0.12, 1.9, 0.10 * volScale);
          this.playTone(340, 130, 0.09, 'triangle', 0.07 * volScale);
        } else {
          // Dual Arnis crisp bamboo snap
          this.playFilteredNoise(opts?.heavy ? 950 : 1450, opts?.heavy ? 240 : 420, opts?.heavy ? 0.15 : 0.09, 1.4, (opts?.heavy ? 0.11 : 0.08) * volScale);
          this.playTone(opts?.heavy ? 210 : 300, 95, opts?.heavy ? 0.13 : 0.08, 'triangle', 0.07 * volScale);
        }
        break;
      }
      case 'skill_cast': {
        const w = opts?.weaponId ?? 0;
        this.playFilteredNoise(1600, 360, 0.18, 1.6, 0.10 * volScale);
        this.playTone(360 + w * 55, 720 + w * 70, 0.20, 'triangle', 0.11 * volScale);
        break;
      }
      case 'enemy_hit':
        this.playTone(175, 58, 0.11, 'triangle', 0.13 * volScale);
        this.playFilteredNoise(1100, 320, 0.06, 1.2, 0.08 * volScale);
        if (voiceEnabled) this.playMonsterVoice(opts?.species, 'hit', volScale * 0.72);
        break;
      case 'enemy_crit':
        this.playTone(220, 68, 0.14, 'triangle', 0.15 * volScale);
        this.playTone(660, 1080, 0.18, 'sine', 0.12 * volScale, 0.01);
        if (voiceEnabled) this.playMonsterVoice(opts?.species, 'hit', volScale * 0.9);
        break;
      case 'enemy_die':
        if (voiceEnabled) this.playMonsterVoice(opts?.species, 'die', volScale);
        this.playTone(740, 1280, 0.26, 'sine', 0.09 * volScale, 0.05);
        break;
      case 'hero_hit':
        this.playTone(145, 52, 0.13, 'sawtooth', 0.12 * volScale);
        this.playFilteredNoise(720, 180, 0.08, 1.1, 0.08 * volScale);
        break;
      case 'jump':
        this.playTone(240, 640, 0.16, 'sine', 0.11 * volScale);
        this.playFilteredNoise(480, 1600, 0.12, 1.8, 0.05 * volScale);
        break;
      case 'dash':
        this.playFilteredNoise(920, 280, 0.16, 1.5, 0.10 * volScale);
        this.playTone(320, 140, 0.12, 'triangle', 0.07 * volScale);
        break;
      case 'guard':
        this.playTone(380, 240, 0.08, 'square', 0.07 * volScale);
        break;
      case 'perfect_guard':
        this.playTone(880, 880, 0.24, 'triangle', 0.12 * volScale);
        this.playTone(1320, 1320, 0.26, 'sine', 0.10 * volScale, 0.02);
        this.playTone(1760, 1760, 0.28, 'sine', 0.08 * volScale, 0.04);
        break;
      case 'spell_cast':
        this.playTone(523.25, 528, 0.22, 'sine', 0.09 * volScale, 0.0);
        this.playTone(659.25, 664, 0.22, 'sine', 0.09 * volScale, 0.05);
        this.playTone(783.99, 790, 0.24, 'triangle', 0.09 * volScale, 0.10);
        this.playTone(1046.5, 1060, 0.30, 'sine', 0.10 * volScale, 0.15);
        break;
      case 'crystal':
        this.playTone(740, 1180, 0.14, 'sine', 0.09 * volScale);
        break;
      case 'st':
        this.playTone(330, 990, 0.38, 'triangle', 0.15 * volScale);
        this.playTone(660, 1320, 0.34, 'sine', 0.10 * volScale, 0.06);
        this.playFilteredNoise(1800, 420, 0.32, 1.5, 0.09 * volScale);
        break;
      case 'land_rise':
        this.playTone(196, 587, 0.55, 'sine', 0.15 * volScale);
        break;
      case 'level_up':
        this.playTone(440, 880, 0.42, 'triangle', 0.14 * volScale);
        this.playTone(554.37, 1108.7, 0.36, 'sine', 0.10 * volScale, 0.09);
        break;
      case 'menu':
        this.playTone(620, 780, 0.06, 'sine', 0.07 * volScale);
        break;
    }
  }

  tickBgm(dt: number, biomeIndex: number, enabled: boolean, bgmVolume = 75): void {
    const volScale = clampAudioVolume(bgmVolume, 75) / 100;
    if (!enabled || volScale <= 0.005 || !this.ctx || this.ctx.state !== 'running') return;
    this.bgmTimer -= dt;
    if (this.bgmTimer > 0) return;
    this.bgmTimer = 0.42;

    const scales = [
      [293.66, 329.63, 392.0, 440.0, 523.25], // Bamboo pentatonic
      [261.63, 329.63, 392.0, 493.88, 523.25], // Sanctuary warm lydian/major
      [246.94, 293.66, 369.99, 440.0, 493.88], // Cemetery shade minor
      [329.63, 392.0, 440.0, 587.33, 659.25], // Mountain wind
      [220.0, 261.63, 311.13, 415.3, 440.0],  // Bakunawa eclipse
    ];
    const notes = scales[Math.abs(biomeIndex) % scales.length];
    const freq = notes[this.stepIndex % notes.length];
    this.stepIndex = (this.stepIndex + 1 + (this.stepIndex % 3 === 0 ? 1 : 0)) % (notes.length * 4);
    this.playTone(freq, freq * 0.998, 0.36, 'sine', 0.042 * volScale);
  }
}
