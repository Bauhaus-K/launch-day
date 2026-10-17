/**
 * 분리된 1단 부스터의 비행 적분 (엔진 재점화·그리드 핀 양력 포함). 순수 함수.
 */
import {
  BOOSTER_BURN_PITCH_SLEW_RAD_PER_S,
  BOOSTER_DRAG_COEFFICIENT,
  BOOSTER_PITCH_SLEW_RAD_PER_S,
  GRID_FIN_LIFT_AREA_M2,
  GRID_FIN_SLEW_PER_S,
  STAGE1_ENGINE_COUNT,
} from '../data/booster-config';
import { BOOSTER_THROTTLE_SLEW_PER_S } from '../data/rocket-specs';
import { boosterMassKg, type BoosterCommand, type BoosterState } from '../rocket/booster-state';
import type { EngineSpec, StackConfig } from '../rocket/vehicle-config';
import { airDensity, dynamicPressure, pressureRatio } from './atmosphere';
import { massFlowRate, thrustAt } from './engine';
import { approach, bodyAxis } from './flight';
import { altitudeOf, gravityAcceleration } from './gravity';
import { add, length, scale, vec2 } from './vec2';

/** 각도를 (-π, π] 범위로 */
export function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r <= -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI) r -= 2 * Math.PI;
  return r;
}

/** 가장 짧은 방향으로 각도를 목표 쪽으로 이동 */
export function approachAngle(current: number, target: number, maxDelta: number): number {
  const diff = wrapAngle(target - current);
  return wrapAngle(current + Math.max(-maxDelta, Math.min(maxDelta, diff)));
}

/** 1단 엔진 1기 제원 */
export function singleEngine(cfg: StackConfig): EngineSpec {
  const e = cfg.stage1.engine;
  return { ...e, thrustVacN: e.thrustVacN / STAGE1_ENGINE_COUNT };
}

/** 부스터 기준 면적 = 스택과 동일 (직경 같음) */
export function boosterDragArea(cfg: StackConfig): number {
  return BOOSTER_DRAG_COEFFICIENT * cfg.referenceAreaM2;
}

/** 엔진 점화 시 부스터 추력 [N] */
export function boosterThrust(engine: EngineSpec, engines: number, throttle: number, altitudeM: number): number {
  return engines * thrustAt(engine, throttle, pressureRatio(altitudeM));
}

export function stepBooster(
  b: BoosterState,
  cmd: BoosterCommand,
  cfg: StackConfig,
  dt: number,
): BoosterState {
  if (b.status !== 'flying') return b;
  const engine = singleEngine(cfg);

  const engines = b.propellantKg > 0 ? cmd.engines : 0;
  const throttle =
    engines > 0
      ? approach(b.throttle, Math.min(1, Math.max(engine.minThrottle, cmd.throttle)), BOOSTER_THROTTLE_SLEW_PER_S * dt)
      : 0;
  const pitchSlew = engines > 0 ? BOOSTER_BURN_PITCH_SLEW_RAD_PER_S : BOOSTER_PITCH_SLEW_RAD_PER_S;
  const pitchRad = approachAngle(b.pitchRad, cmd.pitchRad, pitchSlew * dt);
  const finSteer = b.finsDeployed ? approach(b.finSteer, cmd.finSteer, GRID_FIN_SLEW_PER_S * dt) : 0;

  const requested = engines * massFlowRate(engine, throttle) * dt;
  const burned = Math.min(b.propellantKg, requested);
  const burnFraction = requested > 0 ? burned / requested : 0;

  const altitude = altitudeOf(b.pos);
  const mass = boosterMassKg(b);
  const thrust = boosterThrust(engine, engines, throttle, altitude) * burnFraction;

  let accel = add(gravityAcceleration(b.pos), scale(bodyAxis(b.pos, pitchRad), thrust / mass));

  const speed = length(b.vel);
  const rho = airDensity(altitude);
  if (rho > 0 && speed > 0) {
    accel = add(accel, scale(b.vel, (-0.5 * rho * speed * boosterDragArea(cfg)) / mass));
    if (b.finsDeployed && finSteer !== 0) {
      // 속도에 수직인 양력 (속도 방향 기준 왼쪽 법선)
      const left = vec2(-b.vel.y / speed, b.vel.x / speed);
      const lift = (dynamicPressure(altitude, speed) * GRID_FIN_LIFT_AREA_M2 * finSteer) / mass;
      accel = add(accel, scale(left, lift));
    }
  }

  const vel = add(b.vel, scale(accel, dt));
  const pos = add(b.pos, scale(vel, dt));
  return {
    ...b,
    pos,
    vel,
    engines,
    throttle,
    pitchRad,
    finSteer,
    propellantKg: b.propellantKg - burned,
  };
}
