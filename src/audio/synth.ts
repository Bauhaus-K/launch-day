/**
 * 효과음 합성: 노이즈 버퍼와 오실레이터로 짧은 소리를 만든다.
 */
import { ENGINE_SOUND, type NoiseSpec, type SoundSpec, type ToneSpec } from '../data/audio-config';

/** 짧은 음 시작 시 클릭 잡음을 막는 어택 시간 [s] */
const ATTACK_S = 0.01;
/** 지수 감쇠가 도달하는 최소 음량 (0은 지수 램프에 쓸 수 없음) */
const SILENCE = 0.0001;

export function createWhiteNoise(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * ENGINE_SOUND.noiseBufferS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** 저역이 강한 브라운 노이즈 (로켓 럼블의 기본 재료) */
export function createBrownNoise(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * ENGINE_SOUND.noiseBufferS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

function envelope(ctx: AudioContext, gain: number, start: number, duration: number): GainNode {
  const node = ctx.createGain();
  node.gain.setValueAtTime(SILENCE, start);
  node.gain.exponentialRampToValueAtTime(gain, start + ATTACK_S);
  node.gain.exponentialRampToValueAtTime(SILENCE, start + duration);
  return node;
}

function playTone(ctx: AudioContext, out: AudioNode, spec: ToneSpec): void {
  const start = ctx.currentTime + (spec.delay ?? 0);
  const osc = ctx.createOscillator();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.freq, start);
  if (spec.endFreq) osc.frequency.exponentialRampToValueAtTime(spec.endFreq, start + spec.duration);
  const env = envelope(ctx, spec.gain, start, spec.duration);
  osc.connect(env).connect(out);
  osc.start(start);
  osc.stop(start + spec.duration + ATTACK_S);
}

function playNoise(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, spec: NoiseSpec): void {
  const start = ctx.currentTime + (spec.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = spec.filter;
  filter.frequency.setValueAtTime(spec.freq, start);
  if (spec.endFreq) filter.frequency.exponentialRampToValueAtTime(spec.endFreq, start + spec.duration);
  const env = envelope(ctx, spec.gain, start, spec.duration);
  src.connect(filter).connect(env).connect(out);
  src.start(start, Math.random() * ENGINE_SOUND.noiseBufferS);
  src.stop(start + spec.duration + ATTACK_S);
}

export function playSound(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, spec: SoundSpec): void {
  spec.tones?.forEach((t) => playTone(ctx, out, t));
  spec.noises?.forEach((n) => playNoise(ctx, out, noise, n));
}
