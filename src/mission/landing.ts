/**
 * 부스터 착지 판정과 착륙 점수. 순수 함수.
 */
import { LANDING_DECK_HALF_LENGTH_M, TOUCHDOWN_LIMITS } from '../data/booster-config';
import type { BoosterTelemetry } from './booster-guidance';

export interface BoosterOutcome {
  readonly landed: boolean;
  readonly reason: string;
  readonly verticalSpeedMps: number;
  readonly horizontalSpeedMps: number;
  /** 착륙선 중심에서의 거리 [m] */
  readonly distanceM: number;
  readonly tiltRad: number;
}

export function evaluateTouchdown(tel: BoosterTelemetry, legsDeployed: boolean): BoosterOutcome {
  const vs = Math.abs(tel.verticalSpeedMps);
  const hs = Math.abs(tel.horizontalSpeedMps);
  const distanceM = Math.abs(tel.shipOffsetM);
  const base = { verticalSpeedMps: vs, horizontalSpeedMps: hs, distanceM, tiltRad: tel.tiltRad };

  const fail = (reason: string): BoosterOutcome => ({ ...base, landed: false, reason });
  if (distanceM > LANDING_DECK_HALF_LENGTH_M) {
    return fail(`착륙선에서 ${(distanceM / 1000).toFixed(distanceM < 10_000 ? 2 : 0)} km 떨어진 바다에 추락`);
  }
  if (!legsDeployed) return fail('착륙 다리가 펴지지 않은 채 갑판에 충돌');
  if (vs > TOUCHDOWN_LIMITS.maxVerticalSpeedMps) return fail(`하강 속도 ${vs.toFixed(1)} m/s — 너무 빠르게 충돌`);
  if (hs > TOUCHDOWN_LIMITS.maxHorizontalSpeedMps) return fail(`수평 속도 ${hs.toFixed(1)} m/s — 미끄러져 전복`);
  if (tel.tiltRad > TOUCHDOWN_LIMITS.maxTiltRad) {
    return fail(`기울기 ${((tel.tiltRad * 180) / Math.PI).toFixed(1)}° — 착지 후 전복`);
  }
  return { ...base, landed: true, reason: '부스터 착륙 성공!' };
}

/**
 * 착륙 품질 (0~1). 성공 시에만 의미가 있다.
 * 위치·하강 속도·기울기 오차가 한계 대비 얼마나 작은지의 평균.
 */
export function landingQuality(o: BoosterOutcome): number {
  if (!o.landed) return 0;
  const parts = [
    1 - o.distanceM / LANDING_DECK_HALF_LENGTH_M,
    1 - o.verticalSpeedMps / TOUCHDOWN_LIMITS.maxVerticalSpeedMps,
    1 - o.horizontalSpeedMps / TOUCHDOWN_LIMITS.maxHorizontalSpeedMps,
    1 - o.tiltRad / TOUCHDOWN_LIMITS.maxTiltRad,
  ];
  return parts.reduce((s, p) => s + Math.max(0, p), 0) / parts.length;
}
