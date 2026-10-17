/**
 * 1단 부스터 귀환·착륙 설정값. 단위는 SI.
 *
 * 근거: Falcon 9 1단의 바지선 착륙 프로파일(부스트백 → 재진입 연소 → 착륙 연소) 공개 중계·해설 자료를 참고한 근사.
 * 재미를 위해 조정한 값은 "게임용 조정값"으로 표시한다.
 */

const DEG = Math.PI / 180;

/** 1단 주 엔진 수 (엔진 1기 추력 = 1단 총추력 / 이 값) */
export const STAGE1_ENGINE_COUNT = 9;

/** 부스트백·재진입 연소에 쓰는 엔진 수 (실제: 3기) */
export const BOOSTER_BURN_ENGINES = 3;

/** 착륙 연소에 쓰는 엔진 수 (실제: 중앙 엔진 1기) */
export const LANDING_BURN_ENGINES = 1;

/** 엔진이 꺼진 상태에서 냉가스 추력기로 자세를 바꾸는 속도 [rad/s] — 게임용 조정값 */
export const BOOSTER_PITCH_SLEW_RAD_PER_S = 12 * DEG;

/** 엔진 연소 중 짐벌로 자세를 바꾸는 속도 [rad/s] — 게임용 조정값 */
export const BOOSTER_BURN_PITCH_SLEW_RAD_PER_S = 8 * DEG;

/** 리얼 모드에서 A/D로 부스터 자세 명령을 바꾸는 속도 [rad/s] */
export const BOOSTER_MANUAL_PITCH_RATE_RAD_PER_S = 15 * DEG;

/** 엔진 쪽이 앞서 떨어질 때의 항력 계수 (펼친 그리드 핀 포함) — 게임용 조정값 */
export const BOOSTER_DRAG_COEFFICIENT = 1.2;

/**
 * 그리드 핀 양력 계수 × 면적 [m²] — 게임용 조정값.
 * 양력 가속도 = q · 이 값 · 조종량 / 질량 (속도에 수직)
 */
export const GRID_FIN_LIFT_AREA_M2 = 6;

/** 그리드 핀 조종량 변화율 [1/s] */
export const GRID_FIN_SLEW_PER_S = 1.5;

/** 착륙선 위치: 분리 직후 예측 탄도 낙하점보다 이만큼 발사장 쪽(업레인지) [m] — 게임용 조정값 */
export const LANDING_SHIP_UPRANGE_OFFSET_M = 220_000;

/** 착륙선 갑판 반길이(다운레인지 방향) [m] (실제 바지선 갑판 약 90 × 52 m) */
export const LANDING_DECK_HALF_LENGTH_M = 45;
export const LANDING_DECK_WIDTH_M = 52;

/** 착륙 판정 한계 — 게임용 조정값 (착륙 다리가 견디는 범위) */
export const TOUCHDOWN_LIMITS = {
  maxVerticalSpeedMps: 8,
  maxHorizontalSpeedMps: 4,
  maxTiltRad: 10 * DEG,
} as const;

/** 착륙 다리 전개 고도 [m] (자동) */
export const LEG_DEPLOY_ALTITUDE_M = 2_500;
/** 착륙 다리 전개 애니메이션 시간 [s] */
export const LEG_DEPLOY_DURATION_S = 3;

/** 이 고도 아래에서 점화하면 착륙 연소(엔진 1기)로 본다 [m] */
export const LANDING_BURN_MAX_ALTITUDE_M = 15_000;

/**
 * 재진입 가열 지표(½ρv³, W/m² 차원) 허용치 — 게임용 조정값.
 * 종단속도로 떨어지는 동안은 넘지 않고, 재진입 연소 없이 고속으로 진입하면 넘도록 정했다.
 */
export const BOOSTER_HEATING_LIMIT = 150e6;
/** 초과 가열 비율 1당 초당 손상 증가량 */
export const BOOSTER_STRESS_RATE_PER_S = 0.25;

/** 착지점 예측 */
export const IMPACT_PREDICTION = {
  /** 예측 적분 간격 [s] */
  stepS: 0.5,
  /** 최대 예측 시간 [s] */
  maxTimeS: 900,
  /** 예측 갱신 주기 [s] */
  refreshS: 0.25,
  /** 착륙 연소 계획(점화 고도·스로틀) 갱신 주기 [s] */
  landingPlanRefreshS: 0.1,
} as const;

/** 부스터 자동 유도 — 관람 모드(전부), 일반 모드(착륙 연소 제외), 리얼 모드(권장값 표시) */
export const BOOSTER_GUIDANCE = {
  /** 부스트백 자세: 국지 수평 기준 [rad] (180° = 발사장 방향 수평, 약간 위로) */
  boostbackPitchRad: 175 * DEG,
  /** 역추진 자세 유지: 이 속도 미만이면 연직 자세로 바꿈 [m/s] (착지 직전 뒤집힘 방지) */
  retrogradeHoldMinSpeedMps: 25,
  /** 부스트백 점화 허용 자세 오차 [rad] */
  boostbackAlignRad: 5 * DEG,
  /**
   * 예측 착지점 오차가 이 값 이하가 되면 부스트백 종료 [m].
   * 이후 재진입 연소가 낙하점을 업레인지로 당기므로 일부러 다운레인지 쪽을 조준한다 — 게임용 조정값
   */
  boostbackCutoffErrorM: 8_000,
  /** 재진입 연소 시작 고도 [m] (실제 약 50~70 km) */
  entryBurnStartAltitudeM: 55_000,
  /** 재진입 연소 목표 속도 [m/s] — 이 속도 이하가 되면 종료 */
  entryBurnTargetSpeedMps: 800,
  /** 그리드 핀 자동 조종: 착지 오차 → 조종량 이득 [1/m] */
  finGainPerM: 1 / 1_500,
  /** 착륙 연소 점화 판단에 쓰는 계획 스로틀 (여유 확보) */
  landingPlanThrottle: 0.8,
  /** 점화 고도 예측 적분 간격·최대 시간 [s] */
  ignitionPredictionStepS: 0.1,
  ignitionPredictionMaxS: 120,
  /** 예측 유도가 멈추도록 겨냥하는 고도 [m] (이후 등감속으로 마무리) */
  landingAimAltitudeM: 15,
  /** 착륙 스로틀 이분 탐색 반복 수 */
  throttleSearchIterations: 10,
  /** 점화 고도 여유 [m] */
  ignitionMarginM: 40,
  /** 착륙 연소 종료 직전 목표 하강 속도 [m/s] */
  touchdownSpeedMps: 1.5,
  /** 목표 하강 속도에 도달한 뒤 중력 대비 추력 비율 (살짝 내려앉도록) */
  touchdownHoverRatio: 0.9,
  /** 자동 착륙: 상승하기 시작하면 엔진을 끄고 다시 점화를 기다리는 최소 고도 [m] */
  hoverCutoffAltitudeM: 5,
  /** 착륙 연소 마지막 구간의 수평 속도 감쇠 이득 [1/s] */
  landingVelocityGain: 0.4,
  /** ZEM/ZEV 유도의 최소 잔여 시간 [s] (0 근처 발산 방지) */
  minTimeToGoS: 3,
  /** 착륙 연소 중 최대 기울기 [rad] */
  landingMaxTiltRad: 15 * DEG,
  /** 이 고도 아래에서는 수평 보정을 줄이고 수직 자세로 [m] */
  finalVerticalAltitudeM: 60,
} as const;
