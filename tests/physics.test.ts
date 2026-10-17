import { describe, expect, it } from 'vitest';
import { airDensity, dynamicPressure, pressureRatio } from '../src/physics/atmosphere';
import { effectiveIsp, massFlowRate, thrustAt } from '../src/physics/engine';
import { altitudeOf, gravityMagnitude } from '../src/physics/gravity';
import { circularSpeed, orbitalElements } from '../src/physics/orbit';
import { approach, bodyAxis, computeTelemetry, stepVehicle } from '../src/physics/flight';
import { vec2 } from '../src/physics/vec2';
import {
  ATMOSPHERE_SCALE_HEIGHT_M,
  EARTH_RADIUS_M,
  SEA_LEVEL_AIR_DENSITY,
  STANDARD_GRAVITY,
} from '../src/data/physics-constants';
import { HELIOS9_STACK } from '../src/data/rocket-specs';
import { createInitialVehicle, jettisonFairing, separateStages } from '../src/rocket/stack';
import { vehicleMassKg } from '../src/rocket/vehicle-state';

const cfg = HELIOS9_STACK;

describe('atmosphere', () => {
  it('해면 밀도는 표준값, 고도가 오르면 지수적으로 감소', () => {
    expect(airDensity(0)).toBeCloseTo(SEA_LEVEL_AIR_DENSITY);
    expect(airDensity(10_000)).toBeLessThan(airDensity(5_000));
    expect(pressureRatio(ATMOSPHERE_SCALE_HEIGHT_M)).toBeCloseTo(Math.exp(-1));
  });

  it('대기 상한 위에서는 0', () => {
    expect(airDensity(200_000)).toBe(0);
  });

  it('동압 q = ½ρv²', () => {
    expect(dynamicPressure(0, 100)).toBeCloseTo(0.5 * SEA_LEVEL_AIR_DENSITY * 100 * 100);
  });
});

describe('gravity', () => {
  it('지표 중력은 약 9.8 m/s², 고도가 오르면 감소', () => {
    expect(gravityMagnitude(0)).toBeCloseTo(9.82, 1);
    expect(gravityMagnitude(200_000)).toBeLessThan(gravityMagnitude(0));
  });

  it('altitudeOf', () => {
    expect(altitudeOf(vec2(0, EARTH_RADIUS_M + 1234))).toBeCloseTo(1234);
  });
});

describe('engine', () => {
  const engine = cfg.stage1.engine;

  it('Isp는 해면~진공 사이를 보간', () => {
    expect(effectiveIsp(engine, 1)).toBe(engine.ispSeaLevelS);
    expect(effectiveIsp(engine, 0)).toBe(engine.ispVacS);
    expect(effectiveIsp(engine, 0.5)).toBeCloseTo((engine.ispSeaLevelS + engine.ispVacS) / 2);
  });

  it('진공 추력 = 유량 × Isp × g0', () => {
    expect(thrustAt(engine, 1, 0)).toBeCloseTo(engine.thrustVacN);
    expect(massFlowRate(engine, 1) * engine.ispVacS * STANDARD_GRAVITY).toBeCloseTo(engine.thrustVacN);
  });

  it('해면 추력은 진공보다 작다', () => {
    expect(thrustAt(engine, 1, 1)).toBeLessThan(thrustAt(engine, 1, 0));
  });
});

describe('orbit', () => {
  it('원궤도 속도에서는 원지점·근지점이 같다', () => {
    const r = EARTH_RADIUS_M + 200_000;
    const el = orbitalElements(vec2(0, r), vec2(circularSpeed(r), 0));
    expect(el.eccentricity).toBeLessThan(1e-9);
    expect(el.apoapsisAltitudeM).toBeCloseTo(200_000, -1);
    expect(el.periapsisAltitudeM).toBeCloseTo(200_000, -1);
  });

  it('탈출 속도 이상이면 원지점 무한대', () => {
    const r = EARTH_RADIUS_M + 200_000;
    const el = orbitalElements(vec2(0, r), vec2(circularSpeed(r) * 1.5, 0));
    expect(el.apoapsisAltitudeM).toBe(Infinity);
  });
});

describe('flight', () => {
  it('approach는 최대 변화량만큼만 이동', () => {
    expect(approach(0, 1, 0.25)).toBe(0.25);
    expect(approach(1, 0, 2)).toBe(0);
  });

  it('피치 90°면 기체 축은 연직 위', () => {
    const axis = bodyAxis(vec2(0, EARTH_RADIUS_M), Math.PI / 2);
    expect(axis.x).toBeCloseTo(0);
    expect(axis.y).toBeCloseTo(1);
  });

  it('클램프 상태에서는 연료만 줄고 움직이지 않는다', () => {
    const s0 = { ...createInitialVehicle(cfg), enginesOn: true, throttle: 1 };
    const s1 = stepVehicle(s0, { throttle: 1, pitchRad: Math.PI / 2 }, cfg, 1);
    expect(s1.pos).toEqual(s0.pos);
    expect(s1.stage1PropellantKg).toBeLessThan(s0.stage1PropellantKg);
  });

  it('클램프 해제 후 추력 대 중량비 > 1 이면 상승', () => {
    let s = { ...createInitialVehicle(cfg), enginesOn: true, throttle: 1, clamped: false };
    for (let i = 0; i < 600; i++) s = stepVehicle(s, { throttle: 1, pitchRad: Math.PI / 2 }, cfg, 1 / 60);
    const tel = computeTelemetry(s, cfg);
    expect(tel.altitudeM).toBeGreaterThan(10);
    expect(tel.verticalSpeedMps).toBeGreaterThan(0);
  });

  it('연료가 바닥나면 더 이상 연소하지 않는다', () => {
    const s0 = { ...createInitialVehicle(cfg), enginesOn: true, throttle: 1, stage1PropellantKg: 1 };
    const s1 = stepVehicle(s0, { throttle: 1, pitchRad: Math.PI / 2 }, cfg, 1);
    expect(s1.stage1PropellantKg).toBe(0);
  });
});

describe('stack', () => {
  it('단 분리 후 질량에서 1단이 빠진다', () => {
    const s = createInitialVehicle(cfg);
    const { upperStage, booster } = separateStages(s, cfg);
    expect(upperStage.activeStage).toBe(2);
    expect(vehicleMassKg(upperStage, cfg)).toBeCloseTo(
      vehicleMassKg(s, cfg) - cfg.stage1.dryMassKg - cfg.stage1.propellantMassKg,
    );
    expect(booster.dryMassKg + booster.propellantKg).toBe(cfg.stage1.dryMassKg + cfg.stage1.propellantMassKg);
    expect(booster.status).toBe('flying');
  });

  it('페어링 분리 후 페어링 질량만큼 가벼워진다', () => {
    const s = createInitialVehicle(cfg);
    expect(vehicleMassKg(s, cfg) - vehicleMassKg(jettisonFairing(s), cfg)).toBeCloseTo(cfg.fairingMassKg);
  });
});
