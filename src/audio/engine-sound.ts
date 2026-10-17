/**
 * 지속되는 로켓 엔진음: 브라운 노이즈 럼블 + 초저역 진동 + 타닥거리는 크래클.
 * 매 프레임 EngineMix 값을 받아 부드럽게 따라간다.
 */
import { AUDIO, ENGINE_SOUND as E } from '../data/audio-config';
import type { EngineMix } from './audio-mix';

export class EngineSound {
  private readonly rumbleFilter: BiquadFilterNode;
  private readonly rumbleGain: GainNode;
  private readonly subGain: GainNode;
  private readonly crackleGain: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    brown: AudioBuffer,
    white: AudioBuffer,
  ) {
    const rumble = ctx.createBufferSource();
    rumble.buffer = brown;
    rumble.loop = true;
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = E.minCutoffHz;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    rumble.connect(this.rumbleFilter).connect(this.rumbleGain).connect(out);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = E.subRumbleHz;
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0;
    sub.connect(this.subGain).connect(out);

    const crackle = ctx.createBufferSource();
    crackle.buffer = white;
    crackle.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = E.crackleBandHz;
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0;
    crackle.connect(band).connect(this.crackleGain).connect(out);

    rumble.start();
    sub.start();
    crackle.start();
  }

  update(mix: EngineMix): void {
    const t = this.ctx.currentTime;
    const k = AUDIO.smoothingS;
    this.rumbleGain.gain.setTargetAtTime(mix.rumbleGain, t, k);
    this.subGain.gain.setTargetAtTime(mix.rumbleGain * E.subRumbleGain, t, k);
    this.rumbleFilter.frequency.setTargetAtTime(mix.cutoffHz, t, k);
    // 크래클은 매 프레임 무작위로 흔들어 불규칙한 폭음처럼 들리게 한다
    const jitter = 1 - E.crackleJitter + Math.random() * E.crackleJitter * 2;
    this.crackleGain.gain.setTargetAtTime(mix.crackleGain * jitter, t, k / 4);
  }
}
