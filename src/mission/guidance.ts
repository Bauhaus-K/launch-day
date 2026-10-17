/**
 * 자동 유도. 관람·일반 모드에서는 실제 명령으로, 리얼 모드에서는 HUD 권장값으로 쓰인다.
 * - 1단: 피치 킥 후 중력 선회 (속도 방향을 따라가 받음각을 최소화)
 * - 2단: 목표 고도에서 수직 속도를 0으로 맞추는 폐루프 제어
 */
import { GUIDANCE, STRUCTURE, TARGET_ORBIT } from '../data/mission-config';
import { EARTH_MU, EARTH_RADIUS_M } from '../data/physics-constants';
import type { FlightTelemetry } from '../physics/flight';
import { circularSpeed } from '../physics/orbit';
import type { StackConfig } from '../rocket/vehicle-config';
import type { VehicleState } from '../rocket/vehicle-state';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function guidancePitch(state: VehicleState, tel: FlightTelemetry, cfg: StackConfig): number {
  return state.activeStage === 1 ? stage1Pitch(tel) : stage2Pitch(tel, cfg);
}

function stage1Pitch(tel: FlightTelemetry): number {
  const vertical = Math.PI / 2;
  const { pitchKickStartSpeedMps: v0, pitchKickEndSpeedMps: v1, pitchKickRad } = GUIDANCE;
  if (tel.speedMps < v0) return vertical;
  if (tel.speedMps < v1) {
    return vertical - (pitchKickRad * (tel.speedMps - v0)) / (v1 - v0);
  }
  // 중력 선회: 비행경로각을 따라가되 킥 각도보다 높아지지는 않게
  const prograde = Math.min(tel.flightPathAngleRad, vertical - pitchKickRad);
  return Math.max(GUIDANCE.stage1MinPitchRad, prograde);
}

function stage2Pitch(tel: FlightTelemetry, cfg: StackConfig): number {
  const r = EARTH_RADIUS_M + tel.altitudeM;
  const g = EARTH_MU / (r * r);
  const centrifugal = (tel.horizontalSpeedMps * tel.horizontalSpeedMps) / r;

  // 궤도 속도에 가까워질수록 목표 수직 속도를 0으로 줄여, SECO 순간 원궤도에 가깝게 만든다
  const completion = clamp(tel.horizontalSpeedMps / circularSpeed(r), 0, 1);
  const desiredVs =
    clamp(
      (TARGET_ORBIT.altitudeM - tel.altitudeM) / GUIDANCE.altitudeTimeConstantS,
      -GUIDANCE.maxSinkRateMps,
      GUIDANCE.maxClimbRateMps,
    ) *
    (1 - completion ** GUIDANCE.completionExponent);
  const neededRadialAccel = g - centrifugal + GUIDANCE.verticalSpeedGain * (desiredVs - tel.verticalSpeedMps);

  // 엔진이 아직 점화 전이면 정격 추력 기준으로 계산
  const thrust = tel.thrustN > 0 ? tel.thrustN : cfg.stage2.engine.thrustVacN;
  const thrustAccel = thrust / tel.massKg;
  const sinPitch = clamp(
    neededRadialAccel / thrustAccel,
    Math.sin(GUIDANCE.stage2MinPitchRad),
    Math.sin(GUIDANCE.stage2MaxPitchRad),
  );
  return Math.asin(sinPitch);
}

/** 구조 하중 = q·(1 + k·sin|α|) [Pa] */
export function structuralLoadPa(tel: FlightTelemetry): number {
  return tel.dynamicPressurePa * (1 + STRUCTURE.angleOfAttackFactor * Math.sin(tel.angleOfAttackRad));
}

/** 자동 스로틀: 하중이 허용치에 가까워지면 줄인다 (스로틀 버킷) */
export function guidanceThrottle(tel: FlightTelemetry): number {
  const ratio = structuralLoadPa(tel) / STRUCTURE.qLimitPa;
  return clamp(1 - GUIDANCE.throttleGain * (ratio - GUIDANCE.throttleSoftRatio), 0, 1);
}

/**
 * 자동 SECO 조건: 궤도 장반경(= 궤도 에너지)이 목표 원궤도에 도달.
 * 근지점 기준보다 원지점 과주행이 적다 (평균 고도 = 장반경).
 */
export function shouldAutoSeco(tel: FlightTelemetry): boolean {
  if (tel.orbit.specificEnergy >= 0) return true;
  const semiMajorAxis = -EARTH_MU / (2 * tel.orbit.specificEnergy);
  return semiMajorAxis - EARTH_RADIUS_M >= TARGET_ORBIT.altitudeM - GUIDANCE.secoAltitudeToleranceM;
}
