import { describe, expect, it } from 'vitest';
import { distanceAttenuation, engineMix, SILENT_ENGINE } from '../src/audio/audio-mix';
import { ENGINE_SOUND } from '../src/data/audio-config';

const base = { throttle: 1, thrustFraction: 1, pressureRatio: 1, distanceM: 50 };

describe('엔진음 믹스', () => {
  it('엔진이 꺼져 있으면 무음', () => {
    expect(engineMix({ ...base, throttle: 0 })).toEqual(SILENT_ENGINE);
  });

  it('근거리 해면 풀스로틀이 최대 음량', () => {
    expect(engineMix(base).rumbleGain).toBeCloseTo(ENGINE_SOUND.maxRumbleGain);
  });

  it('멀어질수록 작고 먹먹해진다', () => {
    const near = engineMix(base);
    const far = engineMix({ ...base, distanceM: 5_000 });
    expect(far.rumbleGain).toBeLessThan(near.rumbleGain);
    expect(far.cutoffHz).toBeLessThan(near.cutoffHz);
    expect(far.crackleGain / far.rumbleGain).toBeLessThan(near.crackleGain / near.rumbleGain);
  });

  it('진공에서는 크래클이 사라지고 진동음만 조금 남는다', () => {
    const vac = engineMix({ ...base, pressureRatio: 0 });
    expect(vac.crackleGain).toBe(0);
    expect(vac.rumbleGain).toBeCloseTo(ENGINE_SOUND.maxRumbleGain * ENGINE_SOUND.vacuumFloor);
  });

  it('엔진 수가 적으면 작다', () => {
    expect(engineMix({ ...base, thrustFraction: 1 / 9 }).rumbleGain).toBeLessThan(engineMix(base).rumbleGain);
  });

  it('거리 감쇠는 기준 거리 안에서 1', () => {
    expect(distanceAttenuation(10)).toBe(1);
    expect(distanceAttenuation(ENGINE_SOUND.referenceDistanceM * 4)).toBeCloseTo(0.25);
  });
});
