import {
  ATMOSPHERE_SCALE_HEIGHT_M,
  ATMOSPHERE_TOP_M,
  SEA_LEVEL_AIR_DENSITY,
} from '../data/physics-constants';

/**
 * 해면 대비 대기압 비율 (0~1). 지수 대기 모델: p/p0 = exp(-h/H).
 */
export function pressureRatio(altitudeM: number): number {
  if (altitudeM >= ATMOSPHERE_TOP_M) return 0;
  return Math.exp(-Math.max(0, altitudeM) / ATMOSPHERE_SCALE_HEIGHT_M);
}

/** 대기 밀도 [kg/m³] */
export function airDensity(altitudeM: number): number {
  return SEA_LEVEL_AIR_DENSITY * pressureRatio(altitudeM);
}

/** 동압 q = ½ρv² [Pa] */
export function dynamicPressure(altitudeM: number, speedMps: number): number {
  return 0.5 * airDensity(altitudeM) * speedMps * speedMps;
}
