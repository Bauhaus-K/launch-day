/**
 * 부스터 귀환 프로그램: 하위 단계 전환, 난이도별 조종 명령 결정, 손상 누적.
 * Three.js에 의존하지 않으며 MissionContext 없이 테스트할 수 있다.
 */
import {
  BOOSTER_HEATING_LIMIT,
  BOOSTER_STRESS_RATE_PER_S,
  IMPACT_PREDICTION,
  LANDING_BURN_MAX_ALTITUDE_M,
  LANDING_SHIP_UPRANGE_OFFSET_M,
  LEG_DEPLOY_ALTITUDE_M,
  BOOSTER_MANUAL_PITCH_RATE_RAD_PER_S,
  BOOSTER_GUIDANCE,
} from '../data/booster-config';
import { CONTROLS } from '../data/mission-config';
import type { DifficultyConfig } from '../data/difficulty';
import type { ImpactPrediction } from '../physics/trajectory';
import { wrapAngle } from '../physics/booster-flight';
import type { BoosterCommand, BoosterState } from '../rocket/booster-state';
import type { StackConfig } from '../rocket/vehicle-config';
import {
  autoBoosterCommand,
  autoFinSteer,
  computeBoosterTelemetry,
  computeLandingPlan,
  enginesForIgnition,
  landingBurnCommand,
  NO_LANDING_PLAN,
  predictBoosterImpact,
  type LandingPlan,
  type BoosterStep,
  type BoosterTelemetry,
} from './booster-guidance';
import type { BoosterOutcome } from './landing';
import type { PilotInput } from './mission-types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 리얼 모드 자세 유지 (자동 조종이 아닌 "자세만" 붙잡아 주는 보조 기능) */
export type AttitudeHold = 'none' | 'boostback' | 'retrograde';

export interface BoosterProgram {
  step: BoosterStep;
  attitudeHold: AttitudeHold;
  /** 착륙선 위치 (다운레인지 거리) [m] */
  readonly shipDownrangeM: number;
  /** 수동 모드에서 엔진 점화 요청 상태 (Space로 토글) */
  engineRequest: boolean;
  manualThrottle: number;
  manualPitchRad: number;
  boostbackFired: boolean;
  /** 재진입 가열 손상 누적 (0~1) */
  stress: number;
  impact: ImpactPrediction | null;
  impactAgeS: number;
  telemetry: BoosterTelemetry;
  /** 자동 유도 권장 명령 (HUD 표시용) */
  recommended: BoosterCommand;
  /** 착륙 연소 권장 점화 고도 [m] */
  ignitionAltitudeM: number;
  /** 주기적으로 갱신하는 착륙 예측 결과 */
  landingPlan: LandingPlan;
  landingPlanAgeS: number;
  outcome: BoosterOutcome | null;
}

/** 분리 직후 부스터로 프로그램 생성. 착륙선은 예측 낙하점보다 업레인지에 둔다 */
export function createBoosterProgram(b: BoosterState, cfg: StackConfig): BoosterProgram {
  const impact = predictBoosterImpact(b, cfg);
  const shipDownrangeM = (impact?.downrangeM ?? 0) - LANDING_SHIP_UPRANGE_OFFSET_M;
  const telemetry = computeBoosterTelemetry(b, shipDownrangeM, impact);
  return {
    step: 'BOOSTBACK',
    attitudeHold: 'none',
    shipDownrangeM,
    engineRequest: false,
    manualThrottle: 1,
    manualPitchRad: b.pitchRad,
    boostbackFired: false,
    stress: 0,
    impact,
    impactAgeS: 0,
    telemetry,
    recommended: { engines: 0, throttle: 0, pitchRad: b.pitchRad, finSteer: 0 },
    ignitionAltitudeM: 0,
    landingPlan: NO_LANDING_PLAN,
    landingPlanAgeS: Infinity,
    outcome: null,
  };
}

/** 이 단계에서 일반 모드 플레이어가 직접 조종하는지 (착륙 연소만) */
export function normalModeManual(step: BoosterStep): boolean {
  return step === 'DESCENT' || step === 'LANDING_BURN';
}

/** 플레이어가 Space를 눌러 점화/차단할 수 있는 상태인지 */
export function canToggleEngine(p: BoosterProgram, difficulty: DifficultyConfig): boolean {
  if (p.step === 'DONE') return false;
  if (difficulty.autoConfirm) return false;
  if (difficulty.autoPitch) return normalModeManual(p.step);
  return true;
}

export interface ProgramUpdate {
  /** 다음 물리 스텝에 쓸 명령 */
  readonly command: BoosterCommand;
  /** 부스터 상태에 반영할 변경 (핀·다리 전개) */
  readonly patch: { finsDeployed?: boolean; legsDeployed?: boolean };
  /** 단계가 바뀌었으면 새 단계 */
  readonly stepChanged: BoosterStep | null;
  /** 재진입 손상으로 파괴되었는지 */
  readonly destroyed: boolean;
}

export function updateBoosterProgram(
  p: BoosterProgram,
  b: BoosterState,
  input: PilotInput,
  difficulty: DifficultyConfig,
  cfg: StackConfig,
  dt: number,
): ProgramUpdate {
  // 착지점 예측은 주기적으로만 갱신 (비용 절감)
  p.impactAgeS += dt;
  if (p.impactAgeS >= IMPACT_PREDICTION.refreshS) {
    p.impact = predictBoosterImpact(b, cfg);
    p.impactAgeS = 0;
  }
  const tel = computeBoosterTelemetry(b, p.shipDownrangeM, p.impact);
  p.telemetry = tel;
  // 착륙 예측도 비싸므로 주기적으로만 갱신
  p.landingPlanAgeS += dt;
  if (p.landingPlanAgeS >= IMPACT_PREDICTION.landingPlanRefreshS) {
    p.landingPlan = computeLandingPlan(tel, cfg);
    p.landingPlanAgeS = 0;
  }
  p.ignitionAltitudeM = p.landingPlan.ignitionAltitudeM;

  // 손상 누적
  if (tel.heating > BOOSTER_HEATING_LIMIT) {
    p.stress += ((tel.heating - BOOSTER_HEATING_LIMIT) / BOOSTER_HEATING_LIMIT) * BOOSTER_STRESS_RATE_PER_S * dt;
  }
  const destroyed = p.stress >= 1;

  // 하위 단계 전환 (실제 엔진 상태 기준)
  const before = p.step;
  const burning = b.engines > 0;
  switch (p.step) {
    case 'BOOSTBACK':
      if (burning) p.boostbackFired = true;
      if ((p.boostbackFired && !burning) || (!p.boostbackFired && tel.verticalSpeedMps < 0)) p.step = 'COAST';
      break;
    case 'COAST':
      if (burning) p.step = tel.altitudeM > LANDING_BURN_MAX_ALTITUDE_M ? 'ENTRY_BURN' : 'LANDING_BURN';
      else if (tel.altitudeM <= LANDING_BURN_MAX_ALTITUDE_M) p.step = 'DESCENT';
      break;
    case 'ENTRY_BURN':
      if (!burning) p.step = 'DESCENT';
      break;
    case 'DESCENT':
      if (burning) p.step = 'LANDING_BURN';
      break;
    case 'LANDING_BURN':
      if (!burning) p.step = 'DESCENT';
      break;
    case 'DONE':
      break;
  }
  const stepChanged = p.step !== before ? p.step : null;
  // 엔진이 꺼져 관성 구간에 들어가면 점화 요청을 초기화 (연료 고갈 등으로 꺼진 경우 포함)
  if (stepChanged === 'COAST' || stepChanged === 'DESCENT') p.engineRequest = false;

  const patch: ProgramUpdate['patch'] = {};
  if (!b.finsDeployed && p.step !== 'BOOSTBACK') patch.finsDeployed = true;
  if (!b.legsDeployed && tel.altitudeM < LEG_DEPLOY_ALTITUDE_M && tel.verticalSpeedMps < 0) patch.legsDeployed = true;

  const auto = autoBoosterCommand(p.step, b, tel, cfg, p.landingPlan);
  p.recommended = p.step === 'DESCENT'
    ? { ...auto, throttle: landingBurnCommand(tel, cfg, p.landingPlan).throttle }
    : auto;

  return { command: resolveCommand(p, b, tel, auto, input, difficulty, cfg, dt), patch, stepChanged, destroyed };
}

function resolveCommand(
  p: BoosterProgram,
  b: BoosterState,
  tel: BoosterTelemetry,
  auto: BoosterCommand,
  input: PilotInput,
  difficulty: DifficultyConfig,
  cfg: StackConfig,
  dt: number,
): BoosterCommand {
  if (p.step === 'DONE') return auto;
  if (difficulty.autoConfirm) return auto;

  if (input.hold && !difficulty.autoPitch) toggleAttitudeHold(p, input.hold);
  if (canToggleEngine(p, difficulty) && input.confirm) {
    p.engineRequest = !p.engineRequest;
    if (p.engineRequest) p.manualThrottle = auto.throttle > 0 ? auto.throttle : p.manualThrottle;
  }
  p.manualThrottle = clamp(p.manualThrottle + input.throttleAxis * CONTROLS.throttleRatePerS * dt, 0, 1);
  const engines = p.engineRequest ? enginesForIgnition(p.step, tel.altitudeM) : 0;

  // 일반 모드: 착륙 구간만 점화·스로틀 수동, 자세·핀은 자동
  if (difficulty.autoPitch) {
    if (!normalModeManual(p.step)) return auto;
    const pitchRad = engines > 0 ? landingBurnCommand(tel, cfg, p.landingPlan).pitchRad : tel.retrogradePitchRad;
    return { engines, throttle: p.manualThrottle, pitchRad, finSteer: engines > 0 ? 0 : autoFinSteer(tel) };
  }

  // 리얼 모드: 엔진이 꺼지고 핀이 펴진 동안 A/D는 그리드 핀, 그 외에는 자세
  if (engines === 0 && b.finsDeployed) {
    p.manualPitchRad = tel.retrogradePitchRad;
    return { engines, throttle: p.manualThrottle, pitchRad: tel.retrogradePitchRad, finSteer: -input.pitchAxis };
  }
  if (input.pitchAxis !== 0) p.attitudeHold = 'none'; // 직접 조작하면 자세 유지 해제
  const landingPitch = engines > 0 && p.step === 'LANDING_BURN' ? landingBurnCommand(tel, cfg, p.landingPlan).pitchRad : null;
  const held = holdPitch(p.attitudeHold, tel, landingPitch);
  p.manualPitchRad =
    held ?? wrapAngle(p.manualPitchRad + input.pitchAxis * BOOSTER_MANUAL_PITCH_RATE_RAD_PER_S * dt);
  return { engines, throttle: p.manualThrottle, pitchRad: p.manualPitchRad, finSteer: 0 };
}

/**
 * 자세 유지 목표 피치.
 * 역추진 유지는 착륙 연소 중이면 착륙선 쪽으로 수평 오차를 줄이는 착륙 자세(landingPitch)를,
 * 속도가 거의 없으면(착지 직전) 연직 자세를 쓴다.
 */
export function holdPitch(hold: AttitudeHold, tel: BoosterTelemetry, landingPitch: number | null = null): number | null {
  switch (hold) {
    case 'none':
      return null;
    case 'boostback':
      return BOOSTER_GUIDANCE.boostbackPitchRad;
    case 'retrograde':
      if (landingPitch !== null) return landingPitch;
      return tel.speedMps < BOOSTER_GUIDANCE.retrogradeHoldMinSpeedMps ? Math.PI / 2 : tel.retrogradePitchRad;
  }
}

/** 자세 유지 토글 (같은 키를 다시 누르면 해제). 리얼 모드에서만 의미가 있다 */
export function toggleAttitudeHold(p: BoosterProgram, request: Exclude<AttitudeHold, 'none'>): void {
  p.attitudeHold = p.attitudeHold === request ? 'none' : request;
}
