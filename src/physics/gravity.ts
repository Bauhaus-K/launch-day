import { EARTH_MU, EARTH_RADIUS_M } from '../data/physics-constants';
import { length, scale, type Vec2 } from './vec2';

/** 위치 벡터(지구 중심 기준)에서의 중력 가속도 벡터 [m/s²] */
export function gravityAcceleration(pos: Vec2): Vec2 {
  const r = length(pos);
  return scale(pos, -EARTH_MU / (r * r * r));
}

/** 고도에 따른 중력 가속도 크기 [m/s²] */
export function gravityMagnitude(altitudeM: number): number {
  const r = EARTH_RADIUS_M + altitudeM;
  return EARTH_MU / (r * r);
}

/** 위치 벡터 → 고도 [m] */
export function altitudeOf(pos: Vec2): number {
  return length(pos) - EARTH_RADIUS_M;
}
