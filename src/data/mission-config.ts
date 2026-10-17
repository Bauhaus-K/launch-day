/**
 * 미션 타임라인·판정·유도·점수 설정값. 단위는 SI.
 */

const DEG = Math.PI / 180;

/** 비행 기록 (결과 화면 그래프) */
export const RECORDER = {
  /** 샘플 간격 [s] (시뮬레이션 시간) */
  sampleIntervalS: 1,
} as const;

/** 고정 물리 타임스텝 [s] */
export const FIXED_TIMESTEP_S = 1 / 60;

/** 한 프레임에 처리할 최대 경과 시간 [s] (탭 비활성 후 복귀 시 폭주 방지) */
export const MAX_FRAME_TIME_S = 0.1;

/** 선택 가능한 시간 배속 */
export const TIME_WARP_STEPS = [1, 2, 5] as const;

export const COUNTDOWN = {
  /** 카운트다운 시작 시각 T- [s] */
  startS: 60,
  /** 엔진 점화 시각 T- [s] (실제 미션: 약 T-3초) */
  ignitionS: 3,
  /** 이 시점부터는 배속 해제 T- [s] */
  warpLockS: 10,
} as const;

/** 단계 전환 기준 */
export const PHASE_RULES = {
  /** 이 고도를 넘으면 LIFTOFF → MAX_Q [m] (발사탑 통과 이후) */
  liftoffClearAltitudeM: 1_000,
  /** MECO 후 단 분리까지 관성 비행 시간 [s] (실제 약 2~4초) */
  mecoCoastS: 3,
  /** 단 분리 후 2단 점화 가능까지 대기 시간 [s] */
  separationSettleS: 2,
  /** 관람 모드에서 2단 자동 점화까지 시간 [s] */
  autoSesDelayS: 3,
  /** 페어링 분리 고도 [m] (실제 미션: 대략 110 km 부근, 대기 가열이 충분히 낮아진 뒤) */
  fairingSeparationAltitudeM: 110_000,
  /** SECO 후 결과 판정까지 대기 [s] */
  secoToResultS: 4,
  /** 이륙 후 이 시간이 지난 뒤 고도가 0 아래면 추락 판정 [s] */
  crashGraceS: 2,
} as const;

/** 목표 궤도 */
export const TARGET_ORBIT = {
  /** 목표 원궤도 고도 [m] (주차 궤도 근사) */
  altitudeM: 200_000,
  /** 궤도 진입 성공 최소 근지점 고도 [m] (이 아래면 곧 재진입) */
  minPeriapsisM: 140_000,
} as const;

/** 구조 하중(Max-Q) 모델 — 게임용 조정값 */
export const STRUCTURE = {
  /** 허용 동압 [Pa]. 이 이상의 하중은 기체 스트레스를 누적시킨다 */
  qLimitPa: 24_000,
  /** 받음각이 하중을 키우는 계수 (하중 = q·(1 + k·sin|α|)) */
  angleOfAttackFactor: 6,
  /** 초과 하중 비율 1당 초당 스트레스 증가량 */
  stressRatePerS: 0.15,
  /** HUD 경고를 띄우는 하중 비율 */
  warningRatio: 0.85,
  /** 이 하중 비율 이상인 동안 시간 배속을 1x로 고정 */
  warpLockRatio: 0.7,
} as const;

/** 자동 유도 (관람·일반 모드, 리얼 모드에서는 권장값 표시용) */
export const GUIDANCE = {
  /** 피치 킥 시작 속도 [m/s] */
  pitchKickStartSpeedMps: 60,
  /** 피치 킥 종료 속도 [m/s] */
  pitchKickEndSpeedMps: 110,
  /** 피치 킥 각도 [rad] — 이후 중력 선회(속도 방향 추종) */
  pitchKickRad: 6 * DEG,
  /** 1단 최소 피치 [rad] */
  stage1MinPitchRad: 15 * DEG,
  /** 자동 스로틀이 줄이기 시작하는 하중 비율 */
  throttleSoftRatio: 0.8,
  /** 자동 스로틀 감소 기울기 */
  throttleGain: 3,
  /** 2단: 목표 고도 오차 → 목표 수직 속도 시상수 [s] */
  altitudeTimeConstantS: 90,
  /** 2단: 목표 수직 속도 상한/하한 [m/s] */
  maxClimbRateMps: 1_200,
  maxSinkRateMps: 150,
  /** 2단: 원궤도 속도 대비 진행률의 이 거듭제곱만큼 목표 수직 속도를 줄임 */
  completionExponent: 3,
  /** 2단: 수직 속도 오차 피드백 이득 [1/s] */
  verticalSpeedGain: 0.12,
  /** 2단 피치 한계 [rad] */
  stage2MinPitchRad: -15 * DEG,
  stage2MaxPitchRad: 50 * DEG,
  /** 자동 SECO: 궤도 평균 고도(장반경)가 (목표 - 허용오차) 이상이면 차단 [m] */
  secoAltitudeToleranceM: 500,
} as const;

/** 플레이어 조작 감도 */
export const CONTROLS = {
  /** 스로틀 키 변화율 [1/s] */
  throttleRatePerS: 0.5,
  /** 피치 키 변화율 [rad/s] */
  pitchRateRadPerS: 3 * DEG,
  minPitchRad: -30 * DEG,
  maxPitchRad: 90 * DEG,
} as const;

/** 점수 배점 (합계 100) */
export const SCORING = {
  orbitAccuracyMax: 35,
  /** 이 오차 이상이면 궤도 정확도 0점 [m] */
  orbitErrorZeroM: 60_000,
  fuelMax: 15,
  /** 2단 추진제가 이 비율 이상 남으면 연료 만점 */
  fuelFullScoreFraction: 0.05,
  structureMax: 15,
  landingMax: 25,
  checklistMax: 10,
  /** 착륙에 성공하면 품질과 무관하게 받는 비율 */
  landingBaseRatio: 0.6,
  grades: [
    { min: 90, grade: 'S' },
    { min: 80, grade: 'A' },
    { min: 65, grade: 'B' },
    { min: 50, grade: 'C' },
    { min: 0, grade: 'D' },
  ],
} as const;
