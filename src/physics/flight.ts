/**
 * 기체 비행 적분기. Three.js에 의존하지 않는 순수 함수.
 * 반암시적 오일러(semi-implicit Euler)로 고정 타임스텝 적분한다.
 */
import { PITCH_SLEW_RAD_PER_S, THROTTLE_SLEW_PER_S } from '../data/rocket-specs';
import type { StackConfig } from '../rocket/vehicle-config';
import {
  activePropellantKg,
  activeStageSpec,
  vehicleMassKg,
  type VehicleCommand,
  type VehicleState,
} from '../rocket/vehicle-state';
import { airDensity, dynamicPressure, pressureRatio } from './atmosphere';
import { massFlowRate, thrustAt } from './engine';
import { altitudeOf, gravityAcceleration } from './gravity';
import { orbitalElements, type OrbitalElements } from './orbit';
import { add, dot, length, normalize, scale, vec2, type Vec2 } from './vec2';

/** 국지 연직(위) 단위 벡터 */
export function radialUnit(pos: Vec2): Vec2 {
  return normalize(pos);
}

/** 국지 수평(다운레인지 방향) 단위 벡터 */
export function horizontalUnit(pos: Vec2): Vec2 {
  const r = radialUnit(pos);
  return vec2(r.y, -r.x);
}

/** 피치각(국지 수평 기준)에 해당하는 기체 축 방향 */
export function bodyAxis(pos: Vec2, pitchRad: number): Vec2 {
  return add(scale(horizontalUnit(pos), Math.cos(pitchRad)), scale(radialUnit(pos), Math.sin(pitchRad)));
}

/** 현재값을 목표값 쪽으로 최대 maxDelta만큼 이동 */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}

/** 항력 가속도 [m/s²] = -½ρ|v|v·CdA / m */
function dragAcceleration(pos: Vec2, vel: Vec2, dragAreaM2: number, massKg: number): Vec2 {
  const rho = airDensity(altitudeOf(pos));
  if (rho === 0) return vec2(0, 0);
  const speed = length(vel);
  return scale(vel, (-0.5 * rho * speed * dragAreaM2) / massKg);
}

export function stepVehicle(
  state: VehicleState,
  command: VehicleCommand,
  cfg: StackConfig,
  dt: number,
): VehicleState {
  const stage = activeStageSpec(state, cfg);
  const engine = stage.engine;

  // 엔진 정지(차단)는 즉시, 점화·스로틀 변경은 변화율 한계를 따른다
  const throttle = state.enginesOn
    ? approach(
        state.throttle,
        Math.min(1, Math.max(engine.minThrottle, command.throttle)),
        THROTTLE_SLEW_PER_S * dt,
      )
    : 0;
  const pitchRad = approach(state.pitchRad, command.pitchRad, PITCH_SLEW_RAD_PER_S * dt);

  // 추진제 소모 (마지막 스텝에서는 남은 양만큼만 연소)
  const propellant = activePropellantKg(state);
  const requestedBurn = massFlowRate(engine, throttle) * dt;
  const burned = Math.min(propellant, requestedBurn);
  const burnFraction = requestedBurn > 0 ? burned / requestedBurn : 0;
  const remaining = propellant - burned;

  const altitude = altitudeOf(state.pos);
  const thrust = thrustAt(engine, throttle, pressureRatio(altitude)) * burnFraction;
  const mass = vehicleMassKg(state, cfg);

  const withPropellant: VehicleState =
    state.activeStage === 1
      ? { ...state, throttle, pitchRad, stage1PropellantKg: remaining }
      : { ...state, throttle, pitchRad, stage2PropellantKg: remaining };

  // 발사대에 고정된 동안은 엔진이 돌아도 움직이지 않는다
  if (state.clamped) return withPropellant;

  const thrustAccel = scale(bodyAxis(state.pos, pitchRad), thrust / mass);
  const drag = dragAcceleration(state.pos, state.vel, cfg.dragCoefficient * cfg.referenceAreaM2, mass);
  const accel = add(add(gravityAcceleration(state.pos), thrustAccel), drag);

  const vel = add(state.vel, scale(accel, dt));
  const pos = add(state.pos, scale(vel, dt));
  return { ...withPropellant, pos, vel };
}

/** HUD·점수·유도용 파생 값 */
export interface FlightTelemetry {
  readonly altitudeM: number;
  readonly speedMps: number;
  readonly verticalSpeedMps: number;
  readonly horizontalSpeedMps: number;
  readonly dynamicPressurePa: number;
  /** 받음각 [rad] (기체 축과 속도 벡터 사이 각) */
  readonly angleOfAttackRad: number;
  /** 비행경로각 [rad] (국지 수평 기준 속도 벡터 각) */
  readonly flightPathAngleRad: number;
  readonly thrustN: number;
  readonly massKg: number;
  readonly orbit: OrbitalElements;
}

/** 이 속도 미만에서는 받음각을 0으로 취급 [m/s] (저속에서 각도가 불안정하므로) */
const MIN_SPEED_FOR_AOA_MPS = 20;

export function computeTelemetry(state: VehicleState, cfg: StackConfig): FlightTelemetry {
  const altitudeM = altitudeOf(state.pos);
  const speedMps = length(state.vel);
  const up = radialUnit(state.pos);
  const horizontal = horizontalUnit(state.pos);
  const verticalSpeedMps = dot(state.vel, up);
  const horizontalSpeedMps = dot(state.vel, horizontal);
  const axis = bodyAxis(state.pos, state.pitchRad);

  let angleOfAttackRad = 0;
  if (speedMps > MIN_SPEED_FOR_AOA_MPS) {
    const c = dot(axis, scale(state.vel, 1 / speedMps));
    angleOfAttackRad = Math.acos(Math.min(1, Math.max(-1, c)));
  }

  const engine = activeStageSpec(state, cfg).engine;
  const hasPropellant = activePropellantKg(state) > 0;
  const thrustN = hasPropellant ? thrustAt(engine, state.throttle, pressureRatio(altitudeM)) : 0;

  return {
    altitudeM,
    speedMps,
    verticalSpeedMps,
    horizontalSpeedMps,
    dynamicPressurePa: dynamicPressure(altitudeM, speedMps),
    angleOfAttackRad,
    flightPathAngleRad: Math.atan2(verticalSpeedMps, horizontalSpeedMps),
    thrustN,
    massKg: vehicleMassKg(state, cfg),
    orbit: orbitalElements(state.pos, state.vel),
  };
}
