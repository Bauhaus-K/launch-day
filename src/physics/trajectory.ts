/**
 * 탄도 낙하점 예측과 지표 거리 계산. 순수 함수.
 */
import { EARTH_RADIUS_M } from '../data/physics-constants';
import { airDensity } from './atmosphere';
import { altitudeOf, gravityAcceleration } from './gravity';
import { add, length, scale, type Vec2 } from './vec2';

/** 발사대에서 지표를 따라 잰 다운레인지 거리 [m] (발사대 = 0, 발사 방향 +) */
export function downrangeDistance(pos: Vec2): number {
  return EARTH_RADIUS_M * Math.atan2(pos.x, pos.y);
}

/** 다운레인지 거리 → 해면 위 월드 좌표 */
export function surfacePoint(downrangeM: number, altitudeM = 0): Vec2 {
  const angle = downrangeM / EARTH_RADIUS_M;
  const r = EARTH_RADIUS_M + altitudeM;
  return { x: r * Math.sin(angle), y: r * Math.cos(angle) };
}

export interface ImpactPrediction {
  /** 낙하 지점 다운레인지 거리 [m] */
  readonly downrangeM: number;
  /** 낙하까지 시간 [s] */
  readonly timeS: number;
  /** 낙하 직전 속도 [m/s] */
  readonly speedMps: number;
}

/**
 * 추력 없이 중력·항력만으로 떨어질 때의 낙하점. 지면에 닿지 않으면 null.
 */
export function predictImpact(
  pos: Vec2,
  vel: Vec2,
  massKg: number,
  dragAreaM2: number,
  stepS: number,
  maxTimeS: number,
): ImpactPrediction | null {
  let p = pos;
  let v = vel;
  for (let t = 0; t < maxTimeS; t += stepS) {
    const speed = length(v);
    const rho = airDensity(altitudeOf(p));
    const drag = scale(v, (-0.5 * rho * speed * dragAreaM2) / massKg);
    v = add(v, scale(add(gravityAcceleration(p), drag), stepS));
    const next = add(p, scale(v, stepS));
    const nextAlt = altitudeOf(next);
    if (nextAlt <= 0) {
      // 마지막 구간을 선형 보간해 지면 교차점 추정
      const alt = altitudeOf(p);
      const f = alt / Math.max(1e-6, alt - nextAlt);
      const hit = add(p, scale(v, stepS * f));
      return { downrangeM: downrangeDistance(hit), timeS: t + stepS * f, speedMps: length(v) };
    }
    p = next;
  }
  return null;
}
