import { describe, expect, it } from 'vitest';
import { HELIOS9_STACK } from '../src/data/rocket-specs';
import { EARTH_RADIUS_M } from '../src/data/physics-constants';
import { LANDING_DECK_HALF_LENGTH_M, TOUCHDOWN_LIMITS } from '../src/data/booster-config';
import { approachAngle, singleEngine, stepBooster, wrapAngle } from '../src/physics/booster-flight';
import { downrangeDistance, predictImpact, surfacePoint } from '../src/physics/trajectory';
import { length, vec2 } from '../src/physics/vec2';
import type { BoosterState } from '../src/rocket/booster-state';
import type { BoosterTelemetry } from '../src/mission/booster-guidance';
import { evaluateTouchdown, landingQuality } from '../src/mission/landing';

const cfg = HELIOS9_STACK;
const DEG = Math.PI / 180;

function booster(overrides: Partial<BoosterState> = {}): BoosterState {
  return {
    pos: surfacePoint(0, 5_000),
    vel: vec2(0, -200),
    dryMassKg: cfg.stage1.dryMassKg,
    propellantKg: 10_000,
    engines: 0,
    throttle: 0,
    pitchRad: Math.PI / 2,
    finSteer: 0,
    finsDeployed: false,
    legsDeployed: false,
    status: 'flying',
    ...overrides,
  };
}

describe('각도 유틸', () => {
  it('wrapAngle은 (-π, π] 범위', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2);
  });

  it('approachAngle은 짧은 쪽으로 돈다 (170° → -170°는 +방향)', () => {
    expect(approachAngle(170 * DEG, -170 * DEG, 5 * DEG)).toBeCloseTo(175 * DEG);
  });
});

describe('부스터 비행', () => {
  it('엔진 1기 추력은 1단 전체의 1/9', () => {
    expect(singleEngine(cfg).thrustVacN * 9).toBeCloseTo(cfg.stage1.engine.thrustVacN);
  });

  it('위로 향한 엔진을 켜면 연료가 줄고 낙하가 감속된다', () => {
    const b0 = booster({ engines: 1, throttle: 1 });
    const coast = stepBooster(b0, { engines: 0, throttle: 0, pitchRad: Math.PI / 2, finSteer: 0 }, cfg, 1);
    const burn = stepBooster(b0, { engines: 1, throttle: 1, pitchRad: Math.PI / 2, finSteer: 0 }, cfg, 1);
    expect(burn.propellantKg).toBeLessThan(b0.propellantKg);
    expect(burn.vel.y).toBeGreaterThan(coast.vel.y);
  });

  it('연료가 없으면 점화되지 않는다', () => {
    const b = stepBooster(
      booster({ propellantKg: 0 }),
      { engines: 3, throttle: 1, pitchRad: 0, finSteer: 0 },
      cfg,
      1,
    );
    expect(b.engines).toBe(0);
  });

  it('그리드 핀은 펼쳐져 있을 때만 옆으로 미는 힘을 낸다', () => {
    const cmd = { engines: 0, throttle: 0, pitchRad: -Math.PI / 2, finSteer: 1 };
    const folded = stepBooster(booster(), cmd, cfg, 1);
    const deployed = stepBooster(booster({ finsDeployed: true, finSteer: 1 }), cmd, cfg, 1);
    expect(Math.abs(deployed.vel.x)).toBeGreaterThan(Math.abs(folded.vel.x));
  });

  it('착륙했거나 추락한 부스터는 움직이지 않는다', () => {
    const b = booster({ status: 'landed' });
    expect(stepBooster(b, { engines: 1, throttle: 1, pitchRad: 0, finSteer: 0 }, cfg, 1)).toBe(b);
  });
});

describe('궤적 예측', () => {
  it('다운레인지 거리와 지표점 변환은 서로 역함수', () => {
    expect(downrangeDistance(surfacePoint(123_456))).toBeCloseTo(123_456, 3);
    expect(length(surfacePoint(5_000, 100))).toBeCloseTo(EARTH_RADIUS_M + 100);
  });

  it('수직 낙하는 같은 다운레인지 지점에 떨어진다', () => {
    const impact = predictImpact(surfacePoint(50_000, 3_000), vec2(0, 0), 30_000, 10, 0.1, 300);
    expect(impact).not.toBeNull();
    expect(Math.abs((impact?.downrangeM ?? 0) - 50_000)).toBeLessThan(5);
  });

  it('수평 속도가 있으면 더 멀리 떨어진다', () => {
    const p = surfacePoint(0, 3_000);
    const still = predictImpact(p, vec2(0, 0), 30_000, 10, 0.1, 300);
    const moving = predictImpact(p, vec2(100, 0), 30_000, 10, 0.1, 300);
    expect(moving?.downrangeM ?? 0).toBeGreaterThan(still?.downrangeM ?? 0);
  });
});

describe('착지 판정', () => {
  const tel = (o: Partial<BoosterTelemetry>): BoosterTelemetry => ({
    altitudeM: 0,
    speedMps: 2,
    verticalSpeedMps: -2,
    horizontalSpeedMps: 0,
    dynamicPressurePa: 0,
    heating: 0,
    massKg: 30_000,
    downrangeM: 0,
    shipOffsetM: 0,
    impactErrorM: 0,
    retrogradePitchRad: 0,
    tiltRad: 0,
    ...o,
  });

  it('정중앙에 천천히 똑바로 내리면 성공, 품질은 높다', () => {
    const o = evaluateTouchdown(tel({}), true);
    expect(o.landed).toBe(true);
    expect(landingQuality(o)).toBeGreaterThan(0.8);
  });

  it('갑판 밖이면 바다에 추락', () => {
    expect(evaluateTouchdown(tel({ shipOffsetM: LANDING_DECK_HALF_LENGTH_M + 1 }), true).landed).toBe(false);
  });

  it('다리를 안 펴거나 너무 빠르거나 기울면 실패', () => {
    expect(evaluateTouchdown(tel({}), false).landed).toBe(false);
    const fast = -TOUCHDOWN_LIMITS.maxVerticalSpeedMps - 1;
    expect(evaluateTouchdown(tel({ verticalSpeedMps: fast }), true).landed).toBe(false);
    expect(evaluateTouchdown(tel({ tiltRad: TOUCHDOWN_LIMITS.maxTiltRad * 1.5 }), true).landed).toBe(false);
  });
});
