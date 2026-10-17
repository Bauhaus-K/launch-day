import { EARTH_MU, EARTH_RADIUS_M } from '../data/physics-constants';
import { cross, dot, length, type Vec2 } from './vec2';

export interface OrbitalElements {
  /** 비역학 에너지 [J/kg] (음수면 속박 궤도) */
  readonly specificEnergy: number;
  readonly eccentricity: number;
  /** 원지점 고도 [m] (탈출 궤도면 Infinity) */
  readonly apoapsisAltitudeM: number;
  /** 근지점 고도 [m] (지표 아래면 음수) */
  readonly periapsisAltitudeM: number;
}

/** 2D 상태 벡터로부터 궤도 요소 계산 */
export function orbitalElements(pos: Vec2, vel: Vec2): OrbitalElements {
  const r = length(pos);
  const v2 = dot(vel, vel);
  const specificEnergy = v2 / 2 - EARTH_MU / r;
  const h = cross(pos, vel);
  const eccentricity = Math.sqrt(Math.max(0, 1 + (2 * specificEnergy * h * h) / (EARTH_MU * EARTH_MU)));

  if (specificEnergy >= 0) {
    // 포물선/쌍곡선 궤도 — 근지점만 의미가 있다
    const rp = (h * h) / (EARTH_MU * (1 + eccentricity));
    return {
      specificEnergy,
      eccentricity,
      apoapsisAltitudeM: Infinity,
      periapsisAltitudeM: rp - EARTH_RADIUS_M,
    };
  }

  const a = -EARTH_MU / (2 * specificEnergy);
  return {
    specificEnergy,
    eccentricity,
    apoapsisAltitudeM: a * (1 + eccentricity) - EARTH_RADIUS_M,
    periapsisAltitudeM: a * (1 - eccentricity) - EARTH_RADIUS_M,
  };
}

/** 반지름 r에서의 원궤도 속도 [m/s] */
export function circularSpeed(radiusM: number): number {
  return Math.sqrt(EARTH_MU / radiusM);
}
