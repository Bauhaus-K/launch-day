/**
 * 물리 상수 (모두 SI 단위).
 */

/** 지구 평균 반지름 [m] (IUGG 평균 반지름 6,371.0 km) */
export const EARTH_RADIUS_M = 6_371_000;

/** 지구 중력 상수 μ = GM [m³/s²] (WGS84) */
export const EARTH_MU = 3.986004418e14;

/** 표준 중력 가속도 [m/s²] (비추력 Isp → 유효 배기속도 변환용) */
export const STANDARD_GRAVITY = 9.80665;

/** 해면 대기 밀도 [kg/m³] (국제표준대기 ISA) */
export const SEA_LEVEL_AIR_DENSITY = 1.225;

/**
 * 대기 스케일 높이 [m].
 * 실제 대기는 고도별로 6~9 km 범위. 단일 지수 모델로 단순화하며 (게임용 단순화),
 * 7.5 km는 1976 표준대기 밀도(20 km ≈ 0.089, 30 km ≈ 0.018 kg/m³)에 Max-Q 이후 구간이 근접하도록 고른 값.
 */
export const ATMOSPHERE_SCALE_HEIGHT_M = 7_500;

/** 이 고도 이상은 대기 밀도를 0으로 취급 [m] (게임용 단순화, 카르만선 100 km보다 여유 있게) */
export const ATMOSPHERE_TOP_M = 140_000;
