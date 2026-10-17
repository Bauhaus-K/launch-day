/**
 * 부스터 귀환 프로그램의 단계와 자동 유도.
 * 관람 모드는 전부 자동, 일반 모드는 착륙 연소만 수동, 리얼 모드는 권장값 표시에만 쓴다.
 */
import {
  BOOSTER_BURN_ENGINES,
  BOOSTER_GUIDANCE as G,
  IMPACT_PREDICTION,
  LANDING_BURN_ENGINES,
  LANDING_BURN_MAX_ALTITUDE_M,
} from '../data/booster-config';
import { airDensity, dynamicPressure } from '../physics/atmosphere';
import { boosterDragArea, boosterThrust, singleEngine, wrapAngle } from '../physics/booster-flight';
import { horizontalUnit, radialUnit } from '../physics/flight';
import { altitudeOf, gravityMagnitude } from '../physics/gravity';
import { downrangeDistance, predictImpact, type ImpactPrediction } from '../physics/trajectory';
import { dot, length } from '../physics/vec2';
import { boosterMassKg, type BoosterCommand, type BoosterState } from '../rocket/booster-state';
import type { StackConfig } from '../rocket/vehicle-config';

export type BoosterStep = 'BOOSTBACK' | 'COAST' | 'ENTRY_BURN' | 'DESCENT' | 'LANDING_BURN' | 'DONE';

export const BOOSTER_STEP_LABELS: Record<BoosterStep, string> = {
  BOOSTBACK: '부스트백',
  COAST: '관성 비행',
  ENTRY_BURN: '재진입 연소',
  DESCENT: '대기권 하강',
  LANDING_BURN: '착륙 연소',
  DONE: '종료',
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface BoosterTelemetry {
  readonly altitudeM: number;
  readonly speedMps: number;
  readonly verticalSpeedMps: number;
  readonly horizontalSpeedMps: number;
  readonly dynamicPressurePa: number;
  /** 재진입 가열 지표 ½ρv³ */
  readonly heating: number;
  readonly massKg: number;
  /** 현재 다운레인지 위치 [m] */
  readonly downrangeM: number;
  /** 착륙선 기준 위치 오차 [m] (+면 착륙선보다 다운레인지 쪽) */
  readonly shipOffsetM: number;
  /** 무추력 낙하 시 예측 착지점의 착륙선 기준 오차 [m] (예측 불가면 null) */
  readonly impactErrorM: number | null;
  /** 엔진이 앞을 향하는(역추력) 자세의 피치 [rad] */
  readonly retrogradePitchRad: number;
  /** 연직 기준 기울기 [rad] */
  readonly tiltRad: number;
}

export function computeBoosterTelemetry(
  b: BoosterState,
  shipDownrangeM: number,
  impact: ImpactPrediction | null,
): BoosterTelemetry {
  const altitudeM = altitudeOf(b.pos);
  const speedMps = length(b.vel);
  const verticalSpeedMps = dot(b.vel, radialUnit(b.pos));
  const horizontalSpeedMps = dot(b.vel, horizontalUnit(b.pos));
  const downrangeM = downrangeDistance(b.pos);
  return {
    altitudeM,
    speedMps,
    verticalSpeedMps,
    horizontalSpeedMps,
    dynamicPressurePa: dynamicPressure(altitudeM, speedMps),
    heating: dynamicPressure(altitudeM, speedMps) * speedMps,
    massKg: boosterMassKg(b),
    downrangeM,
    shipOffsetM: downrangeM - shipDownrangeM,
    impactErrorM: impact ? impact.downrangeM - shipDownrangeM : null,
    retrogradePitchRad: Math.atan2(-verticalSpeedMps, -horizontalSpeedMps),
    tiltRad: Math.abs(wrapAngle(b.pitchRad - Math.PI / 2)),
  };
}

/** 부스터의 무추력 낙하점 예측 */
export function predictBoosterImpact(b: BoosterState, cfg: StackConfig): ImpactPrediction | null {
  return predictImpact(
    b.pos,
    b.vel,
    boosterMassKg(b),
    boosterDragArea(cfg),
    IMPACT_PREDICTION.stepS,
    IMPACT_PREDICTION.maxTimeS,
  );
}

/** 지금 점화하면 몇 기의 엔진이 켜지는지 (저고도에서는 착륙 연소용 1기) */
export function enginesForIgnition(step: BoosterStep, altitudeM: number): number {
  if (step === 'DESCENT' || step === 'LANDING_BURN' || altitudeM <= LANDING_BURN_MAX_ALTITUDE_M) {
    return LANDING_BURN_ENGINES;
  }
  return BOOSTER_BURN_ENGINES;
}

/**
 * 지금 주어진 스로틀로 착륙 연소를 하면 터치다운 속도까지 줄이는 동안 내려가는 고도 [m].
 * 역추력·항력·중력을 포함해 국지 평면에서 짧게 전방 적분한다 (질량 감소는 무시 → 보수적).
 */
export function landingBurnAltitudeLoss(tel: BoosterTelemetry, cfg: StackConfig, throttle: number): number {
  const thrust = boosterThrust(singleEngine(cfg), LANDING_BURN_ENGINES, throttle, tel.altitudeM);
  const dragArea = boosterDragArea(cfg);
  let vx = tel.horizontalSpeedMps;
  let vy = tel.verticalSpeedMps;
  let h = tel.altitudeM;
  const dt = G.ignitionPredictionStepS;
  for (let t = 0; t < G.ignitionPredictionMaxS && vy < -G.touchdownSpeedMps; t += dt) {
    const v = Math.hypot(vx, vy);
    const decel = (thrust + 0.5 * airDensity(h) * v * v * dragArea) / tel.massKg;
    vx -= (vx / v) * decel * dt;
    vy += (-(vy / v) * decel - gravityMagnitude(h)) * dt;
    h += vy * dt;
  }
  return tel.altitudeM - h;
}

/**
 * 착륙 연소 권장 점화 고도 [m]. 낙하 중이 아니거나 아직 높으면 0.
 */
export function landingIgnitionAltitude(tel: BoosterTelemetry, cfg: StackConfig): number {
  if (tel.verticalSpeedMps >= 0 || tel.altitudeM > LANDING_BURN_MAX_ALTITUDE_M) return 0;
  return landingBurnAltitudeLoss(tel, cfg, G.landingPlanThrottle) + G.ignitionMarginM;
}

/** 고속 구간이라 예측 기반 스로틀을 써야 하는지 */
function needsPredictiveThrottle(tel: BoosterTelemetry): boolean {
  return tel.altitudeM > G.landingAimAltitudeM * 2 && tel.verticalSpeedMps < -G.touchdownSpeedMps;
}

/**
 * 착륙 계획 (비싼 전방 예측 결과). 매 물리 스텝이 아니라 주기적으로 갱신해 재사용한다.
 */
export interface LandingPlan {
  /** 권장 점화 고도 [m] (해당 없으면 0) */
  readonly ignitionAltitudeM: number;
  /** 예측 기반 착륙 스로틀 (고속 구간이 아니면 null) */
  readonly predictedThrottle: number | null;
}

export const NO_LANDING_PLAN: LandingPlan = { ignitionAltitudeM: 0, predictedThrottle: null };

export function computeLandingPlan(tel: BoosterTelemetry, cfg: StackConfig): LandingPlan {
  if (tel.altitudeM > LANDING_BURN_MAX_ALTITUDE_M || tel.verticalSpeedMps >= 0) return NO_LANDING_PLAN;
  return {
    ignitionAltitudeM: landingIgnitionAltitude(tel, cfg),
    predictedThrottle: needsPredictiveThrottle(tel) ? predictiveLandingThrottle(tel, cfg) : null,
  };
}

/** 남은 고도에서 딱 멈추는 스로틀 (항력 포함 예측 + 이분 탐색) */
function predictiveLandingThrottle(tel: BoosterTelemetry, cfg: StackConfig): number {
  const goal = tel.altitudeM - G.landingAimAltitudeM;
  if (landingBurnAltitudeLoss(tel, cfg, 1) >= goal) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < G.throttleSearchIterations; i++) {
    const mid = (lo + hi) / 2;
    if (landingBurnAltitudeLoss(tel, cfg, mid) > goal) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** 착륙 연소 중 권장 스로틀·자세. plan이 없으면 그 자리에서 예측한다 */
export function landingBurnCommand(
  tel: BoosterTelemetry,
  cfg: StackConfig,
  plan: LandingPlan | null = null,
): { throttle: number; pitchRad: number } {
  const h = Math.max(1, tel.altitudeM);
  const vs = tel.verticalSpeedMps;
  const g = gravityMagnitude(tel.altitudeM);
  const target = G.touchdownSpeedMps;
  const fullThrust = boosterThrust(singleEngine(cfg), LANDING_BURN_ENGINES, 1, tel.altitudeM);

  let throttle: number;
  if (needsPredictiveThrottle(tel)) {
    // 고속 구간: 항력 변화를 고려한 예측으로 스로틀 결정
    // 캐시된 계획이 있으면 그 값을 쓰고(아직 높아 계획이 없으면 계획 스로틀), 없을 때만 즉석 예측
    throttle = plan ? (plan.predictedThrottle ?? G.landingPlanThrottle) : predictiveLandingThrottle(tel, cfg);
  } else {
    // 마지막 수십 m: 등감속 운동으로 터치다운 속도에 맞춘다
    const required = vs < -target ? (vs * vs - target * target) / (2 * h) + g : g * G.touchdownHoverRatio;
    throttle = clamp((required * tel.massKg) / fullThrust, 0, 1);
  }

  // 남은 추력 중 일부를 기울여 수평 속도·위치 오차를 줄인다
  const thrustAccel = (throttle * fullThrust) / tel.massKg;
  const maxHorizontal = thrustAccel * Math.sin(G.landingMaxTiltRad);
  let desiredHorizontal: number;
  if (tel.altitudeM > G.finalVerticalAltitudeM && vs < -target) {
    // ZEM/ZEV 유도: 남은 시간 동안 위치 오차와 수평 속도를 함께 0으로
    const timeToGo = Math.max(G.minTimeToGoS, (2 * h) / -vs);
    const x = tel.shipOffsetM;
    const v = tel.horizontalSpeedMps;
    desiredHorizontal = (-6 * (x + v * timeToGo)) / (timeToGo * timeToGo) + (2 * v) / timeToGo;
  } else {
    desiredHorizontal = -G.landingVelocityGain * tel.horizontalSpeedMps;
  }
  const aHorizontal = clamp(desiredHorizontal, -maxHorizontal, maxHorizontal);
  const aVertical = Math.sqrt(Math.max(0, thrustAccel * thrustAccel - aHorizontal * aHorizontal));
  return { throttle, pitchRad: Math.atan2(aVertical, aHorizontal) };
}

/** 대기권 하강 중 그리드 핀 자동 조종량 */
export function autoFinSteer(tel: BoosterTelemetry): number {
  if (tel.impactErrorM === null) return 0;
  return clamp(-tel.impactErrorM * G.finGainPerM, -1, 1);
}

/**
 * 단계별 자동 유도 명령.
 * engines는 "지금 엔진을 켜 두어야 하는지"를 뜻한다 (점화·차단 판단 포함).
 */
export function autoBoosterCommand(
  step: BoosterStep,
  b: BoosterState,
  tel: BoosterTelemetry,
  cfg: StackConfig,
  plan: LandingPlan,
): BoosterCommand {
  const retro = tel.retrogradePitchRad;
  switch (step) {
    case 'BOOSTBACK': {
      const aligned = Math.abs(wrapAngle(b.pitchRad - G.boostbackPitchRad)) < G.boostbackAlignRad;
      const needMore = tel.impactErrorM === null || tel.impactErrorM > G.boostbackCutoffErrorM;
      return {
        engines: aligned && needMore ? BOOSTER_BURN_ENGINES : 0,
        throttle: 1,
        pitchRad: G.boostbackPitchRad,
        finSteer: 0,
      };
    }
    case 'COAST': {
      const ignite = tel.verticalSpeedMps < 0 && tel.altitudeM <= G.entryBurnStartAltitudeM;
      return { engines: ignite ? BOOSTER_BURN_ENGINES : 0, throttle: 1, pitchRad: retro, finSteer: autoFinSteer(tel) };
    }
    case 'ENTRY_BURN': {
      const done = tel.speedMps <= G.entryBurnTargetSpeedMps;
      return { engines: done ? 0 : BOOSTER_BURN_ENGINES, throttle: 1, pitchRad: retro, finSteer: 0 };
    }
    case 'DESCENT': {
      const ignite = tel.altitudeM <= plan.ignitionAltitudeM;
      return {
        engines: ignite ? LANDING_BURN_ENGINES : 0,
        throttle: G.landingPlanThrottle,
        pitchRad: retro,
        finSteer: autoFinSteer(tel),
      };
    }
    case 'LANDING_BURN': {
      const cmd = landingBurnCommand(tel, cfg, plan);
      // 최소 스로틀로도 너무 감속해 떠오르면 끄고 다시 떨어지게 한다 (호버 불가 대비)
      const rising = tel.verticalSpeedMps > 0 && tel.altitudeM > G.hoverCutoffAltitudeM;
      return {
        engines: rising ? 0 : LANDING_BURN_ENGINES,
        throttle: cmd.throttle,
        pitchRad: cmd.pitchRad,
        finSteer: 0,
      };
    }
    case 'DONE':
      return { engines: 0, throttle: 0, pitchRad: b.pitchRad, finSteer: 0 };
  }
}
