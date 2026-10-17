/**
 * 엔진음 믹스 계산. Web Audio에 의존하지 않는 순수 함수.
 */
import { ENGINE_SOUND as E } from '../data/audio-config';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface EngineMixInput {
  /** 실제 스로틀 (0~1) */
  readonly throttle: number;
  /** 1단 9기 대비 추력 비율 (0~1) — 엔진 수·종류에 따른 크기 */
  readonly thrustFraction: number;
  /** 청취 위치의 해면 대비 대기압 (0~1) */
  readonly pressureRatio: number;
  /** 엔진과 청취자 사이 거리 [m] */
  readonly distanceM: number;
}

export interface EngineMix {
  readonly rumbleGain: number;
  readonly crackleGain: number;
  readonly cutoffHz: number;
}

export const SILENT_ENGINE: EngineMix = { rumbleGain: 0, crackleGain: 0, cutoffHz: E.minCutoffHz };

/** 거리 감쇠 (기준 거리 안에서는 1, 밖에서는 거리에 반비례) */
export function distanceAttenuation(distanceM: number): number {
  return clamp01(E.referenceDistanceM / Math.max(E.referenceDistanceM, distanceM));
}

export function engineMix(input: EngineMixInput): EngineMix {
  if (input.throttle <= 0 || input.thrustFraction <= 0) return SILENT_ENGINE;
  const pr = clamp01(input.pressureRatio);
  const atmosphere = E.vacuumFloor + (1 - E.vacuumFloor) * pr;
  const distance = distanceAttenuation(input.distanceM);
  const loudness = clamp01(input.throttle) ** 0.7 * Math.sqrt(clamp01(input.thrustFraction));
  return {
    rumbleGain: E.maxRumbleGain * loudness * atmosphere * distance,
    // 타닥거리는 고음은 공기가 있어야 하고, 멀어지면 먼저 사라진다
    crackleGain: E.maxCrackleGain * loudness * pr * distance ** 1.5,
    cutoffHz: E.minCutoffHz + (E.maxCutoffHz - E.minCutoffHz) * distance * (0.3 + 0.7 * pr),
  };
}
