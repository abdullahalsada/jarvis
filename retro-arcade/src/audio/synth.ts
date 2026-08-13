/**
 * Tiny chiptune synthesizer. Generates square/triangle-wave PCM, wraps it in a
 * WAV header, and returns a base64 data URI playable by expo-audio. This keeps
 * every sound effect era-appropriate (pure synth beeps, no samples) and the
 * app fully self-contained — no licensed SFX files needed.
 */

const SAMPLE_RATE = 22050;

export type WaveForm = 'square' | 'triangle' | 'noise';

export interface Tone {
  /** Start frequency in Hz. */
  freq: number;
  /** Optional end frequency for pitch slides (laser zaps, falls). */
  freqEnd?: number;
  /** Duration in seconds. */
  duration: number;
  wave?: WaveForm;
  volume?: number;
}

function sampleWave(wave: WaveForm, phase: number): number {
  switch (wave) {
    case 'square':
      return phase % 1 < 0.5 ? 1 : -1;
    case 'triangle': {
      const p = phase % 1;
      return p < 0.5 ? p * 4 - 1 : 3 - p * 4;
    }
    case 'noise':
      // Deterministic pseudo-noise (no Math.random so tones are stable).
      return Math.sin(phase * 12.9898) * 43758.5453 % 2 - 1;
  }
}

/** Renders a tone sequence to 16-bit mono PCM samples. */
function render(tones: Tone[]): Int16Array {
  const total = tones.reduce((s, t) => s + Math.floor(t.duration * SAMPLE_RATE), 0);
  const pcm = new Int16Array(total);
  let offset = 0;
  for (const tone of tones) {
    const n = Math.floor(tone.duration * SAMPLE_RATE);
    const wave = tone.wave ?? 'square';
    const vol = (tone.volume ?? 0.5) * 0.6; // headroom to avoid clipping
    const fEnd = tone.freqEnd ?? tone.freq;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const f = tone.freq + (fEnd - tone.freq) * t;
      phase += f / SAMPLE_RATE;
      // Quick attack/release envelope so beeps click less.
      const env = Math.min(1, i / 100, (n - i) / 200);
      pcm[offset + i] = Math.round(sampleWave(wave, phase) * vol * env * 32767);
    }
    offset += n;
  }
  return pcm;
}

function toBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += alphabet[b0 >> 2];
    out += alphabet[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? alphabet[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? alphabet[b2 & 63] : '=';
  }
  return out;
}

/** Builds a `data:audio/wav;base64,` URI for a tone sequence. */
export function wavDataUri(tones: Tone[]): string {
  const pcm = render(tones);
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < pcm.length; i++) {
    view.setInt16(44 + i * 2, pcm[i], true);
  }
  return 'data:audio/wav;base64,' + toBase64(new Uint8Array(buffer));
}
