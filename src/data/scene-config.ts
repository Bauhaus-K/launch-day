/**
 * 렌더링·연출 설정값 (물리와 무관한 시각 효과용). 단위는 m, s, rad.
 */

export const RENDER = {
  /** 카메라 근/원 평면 [m] (로그 깊이 버퍼 사용) */
  nearM: 0.5,
  farM: 1e8,
  /** 최대 디바이스 픽셀 비율 (성능 보호) */
  maxPixelRatio: 2,
  baseFovDeg: 50,
} as const;

export const COLORS = {
  skyHigh: 0x02040a,
  ocean: '#1d4f86',
  oceanDeep: '#0f2f5c',
  land: '#4d6b3a',
  landDry: '#8a7d55',
  ice: '#e8eef2',
  padConcrete: 0x9a9a96,
  tower: 0x4a4f57,
  rocketWhite: 0xeef0f2,
  interstage: 0x1d1f22,
  nozzle: 0x3a3330,
  flameOuter: 0xff8a2a,
  flameCore: 0xffe2a8,
  vacuumFlame: 0x8fb7ff,
  atmosphereGlow: 0x5aa8ff,
  sun: 0xfff4e0,
  shipHull: 0x3b3f45,
  shipDeck: 0x55585c,
  shipMarking: 0xf2c230,
} as const;

/** 하늘이 완전히 검게 되는 고도 [m] */
export const SKY_BLACK_ALTITUDE_M = 60_000;
/** 별이 보이기 시작/완전히 보이는 고도 [m] */
export const STARS_FADE_START_M = 20_000;
export const STARS_FADE_END_M = 60_000;
export const STAR_COUNT = 2_500;
export const STAR_SPHERE_RADIUS_M = 5e7;

export const EARTH_VISUAL = {
  /** 구 분할 수 */
  widthSegments: 256,
  heightSegments: 256,
  /** 발사장 주변 고해상도 지면 반경 [m] */
  localCapRadiusM: 30_000,
  localCapSegments: 64,
  /** 대기 발광 껍질 두께 [m] */
  atmosphereThicknessM: 90_000,
  textureWidth: 2048,
  textureHeight: 1024,
  continentCount: 70,
  /** 절차적 지형 생성용 시드 (항상 같은 지구가 나오도록) */
  seed: 20261017,
} as const;

export const PAD = {
  padRadiusM: 45,
  towerHeightM: 85,
  towerWidthM: 10,
  /** 발사탑과 기체 중심 사이 거리 [m] */
  towerOffsetM: 14,
} as const;

export const CAMERA = {
  /** 발사대 카메라 위치 (발사대 기준) [m] */
  padCameraOffset: { x: 260, y: 25, z: 420 },
  /** 발사대 카메라가 기체를 화면에 담기 위해 유지하는 시야 높이 [m] */
  padCameraFramingM: 160,
  padCameraMinFovDeg: 1.5,
  /** 추적 카메라: 기체 축 뒤쪽 거리, 측면 거리 [m] */
  chaseBackM: 70,
  chaseSideM: 110,
  chaseUpM: 15,
  /** 카메라 위치 스무딩 시상수 [s] */
  smoothingS: 0.25,
  onboardSideM: 3.2,
  onboardForwardM: 4,
  onboardFovDeg: 70,
  /** 부스터 카메라: 측면 거리, 위쪽 높이, 아래로 내려다보는 조준 오프셋 [m] */
  boosterSideM: 140,
  boosterUpM: 35,
  boosterLookDownM: 25,
} as const;

export const EXHAUST = {
  stage1FlameLengthM: 28,
  stage1FlameRadiusM: 2.2,
  stage2FlameLengthM: 22,
  stage2FlameRadiusM: 1.2,
  /** 진공에서 화염 폭이 커지는 배율 */
  vacuumExpansion: 5,
} as const;

/** 연기·증기 파티클 풀 */
export const SMOKE = {
  poolSize: 2_400,
  /** 초당 방출 수 (비행 중) */
  emitRatePerS: 70,
  /** 발사대 근처 추가 방출 (고도 이하일 때) */
  groundEmitRatePerS: 140,
  groundAltitudeM: 150,
  /** 이 고도 위에서는 배기 연기 방출 안 함 [m] */
  maxAltitudeM: 30_000,
  groundSpreadSpeedMps: 25,
  airSpreadSpeedMps: 4,
  /** 화염빛이 연기를 비추는 거리 척도 [m] */
  flameLightRangeM: 70,
  /** 화염빛 HDR 세기 */
  flameLightIntensity: 2.2,
} as const;

/**
 * 파티클 종류별 모양 (크기 [m], 수명 [s], 불투명도, 저항 [1/s], 부력 [m/s², +위]).
 * glow: 태어날 때 화염색으로 빛나는 정도 (HDR, 수명 앞부분에서 사라진다)
 */
export interface PuffSpec {
  readonly color: number;
  readonly startSizeM: number;
  readonly endSizeM: number;
  readonly minLifeS: number;
  readonly maxLifeS: number;
  readonly opacity: number;
  readonly glow: number;
  /** 발광이 사라지는 시점 (수명 대비 비율) */
  readonly glowFade: number;
  readonly drag: number;
  readonly buoyancy: number;
  /** 회전 속도 최대값 [rad/s] */
  readonly spin: number;
}

export const PUFFS = {
  exhaust: { color: 0xd9d6d0, startSizeM: 8, endSizeM: 60, minLifeS: 6, maxLifeS: 14, opacity: 0.5, glow: 0.8, glowFade: 0.25, drag: 0.05, buoyancy: 0, spin: 0.25 },
  groundCloud: { color: 0xe4e1dc, startSizeM: 10, endSizeM: 75, minLifeS: 8, maxLifeS: 16, opacity: 0.6, glow: 1.2, glowFade: 0.25, drag: 0.25, buoyancy: 0.6, spin: 0.2 },
  /** 발사대 물 분사(디류지) 증기 — 흰색, 빠르게 피어오름 */
  delugeSteam: { color: 0xf4f6f8, startSizeM: 6, endSizeM: 55, minLifeS: 5, maxLifeS: 10, opacity: 0.55, glow: 0, glowFade: 0.25, drag: 0.4, buoyancy: 2.5, spin: 0.3 },
  /** 액체산소 벤팅 — 차가운 증기라 아래로 가라앉으며 흩어진다 */
  loxVent: { color: 0xf2f5f8, startSizeM: 1.2, endSizeM: 9, minLifeS: 2, maxLifeS: 4, opacity: 0.5, glow: 0, glowFade: 0.25, drag: 0.6, buoyancy: -1.2, spin: 0.6 },
  /** 단 분리·자세 제어 냉가스 — 진공에서 빠르게 퍼지고 사라진다 */
  coldGas: { color: 0xf0f2f5, startSizeM: 1.5, endSizeM: 22, minLifeS: 1.5, maxLifeS: 3.5, opacity: 0.55, glow: 0, glowFade: 0.25, drag: 0, buoyancy: 0, spin: 1 },
  /** 착륙 연소가 갑판·바다를 때리며 생기는 물보라·증기 */
  spray: { color: 0xe8edf0, startSizeM: 4, endSizeM: 40, minLifeS: 3, maxLifeS: 7, opacity: 0.55, glow: 0.6, glowFade: 0.25, drag: 0.5, buoyancy: 1.2, spin: 0.4 },
  /** 폭발 불덩이 */
  fireball: { color: 0x6a4630, startSizeM: 6, endSizeM: 45, minLifeS: 1.5, maxLifeS: 3, opacity: 0.9, glow: 6, glowFade: 0.85, drag: 1.2, buoyancy: 3, spin: 0.8 },
  /** 폭발 뒤 검은 연기 */
  blackSmoke: { color: 0x2a2826, startSizeM: 10, endSizeM: 70, minLifeS: 8, maxLifeS: 15, opacity: 0.65, glow: 0.3, glowFade: 0.4, drag: 0.5, buoyancy: 2, spin: 0.2 },
} as const satisfies Record<string, PuffSpec>;

/** 발사 전 증기 연출 */
export const PAD_VAPOR = {
  /** 물 분사 시작 시각 (T- 초) */
  delugeStartTMinusS: 10,
  /** 점화 전 / 점화 후 초당 증기 방출 수 */
  delugeRatePerS: 25,
  delugeIgnitionRatePerS: 90,
  delugeSpeedMps: 18,
  /** 기체가 이 고도를 넘으면 물 분사 증기 방출 중단 [m] */
  delugeMaxAltitudeM: 400,
  /** 점화 순간 한꺼번에 피어나는 증기 수 */
  ignitionBurstCount: 160,
  /** 액체산소 벤팅 초당 방출 수 (벤트 한 곳당) */
  loxVentRatePerS: 6,
  loxVentSpeedMps: 3,
} as const;

/** 단 분리·재진입·착륙 이벤트 효과 */
export const EVENT_FX = {
  separationPuffCount: 70,
  separationPuffSpeedMps: 14,
  /** 부스트백 뒤집기 자세 제어 분사 */
  rcsPuffCount: 18,
  rcsPuffSpeedMps: 20,
  /** 재진입 플라스마 발광: 가열이 한계치의 이 비율부터 보이기 시작 */
  plasmaStartRatio: 0.1,
  plasmaIntensity: 6,
  plasmaColor: 0xff7a3d,
  /** 착륙 물보라: 갑판 위 이 고도 아래에서 방출 [m] */
  sprayAltitudeM: 90,
  sprayRatePerS: 120,
  spraySpeedMps: 30,
  touchdownBurstCount: 120,
  explosionFireballCount: 90,
  explosionSmokeCount: 70,
  explosionSpeedMps: 35,
} as const;

/** 절차 생성 텍스처 시드 */
export const TEXTURE_SEEDS = {
  puff: 7,
  soot: 41,
  frost: 97,
} as const;

/** 대기 하늘 돔 */
export const SKY = {
  /** 하늘 돔 반경 [m] (깊이 테스트 없이 가장 먼저 그린다) */
  domeRadiusM: 1e6,
  /** 해면 고도 천정·지평선 색 */
  zenithLow: 0x2f6fc4,
  horizonLow: 0xb9d6ee,
  /** 고고도 지평선의 얇은 푸른 띠 */
  horizonHigh: 0x4f8fe0,
  /** 태양 원반 HDR 밝기, 원반 크기(cos 기준) */
  sunDiscIntensity: 30,
  sunDiscCos: 0.99985,
  sunGlowColor: 0xfff0d0,
} as const;

/** 원근 대기 안개 (지수 제곱 모델) — 해면 밀도를 고도에 따라 대기압 비율로 줄인다 */
export const FOG = {
  densityPerM: 1.6e-5,
} as const;

/** 태양 그림자 */
export const SHADOW = {
  mapSize: 2048,
  /** 그림자 영역 반경 [m] */
  halfExtentM: 90,
  /** 광원까지 거리 [m] */
  lightDistanceM: 600,
  /** 초점이 이 고도 아래면 그림자 중심을 지면으로 내린다 [m] */
  groundCenterAltitudeM: 200,
  bias: -0.0004,
  normalBias: 0.04,
} as const;

/** 로켓 표면 디테일 (그을음·서리) */
export const ROCKET_DETAIL = {
  /** 재사용 부스터 기본 그을음 (이미 비행한 기체) */
  boosterBaseSoot: 0.55,
  /** 재진입·착륙 연소 누적 시간에 따른 그을음 증가 [초당] */
  sootPerBurnS: 0.012,
  /** 서리 영역 (탱크 UV v 범위: 1단은 위쪽 산소탱크, 2단은 아래쪽 산소탱크) */
  stage1FrostRange: [0.5, 0.97],
  stage2FrostRange: [0.04, 0.55],
  /** 이륙 후 서리가 사라지는 시간 [s] */
  frostFadeS: 45,
  frostColor: 0xb4c6da,
  /** 레이스웨이(배선 덮개) 폭·두께 [m] */
  racewayWidthM: 0.35,
  racewayDepthM: 0.18,
} as const;

export const LANDING_SHIP = {
  hullHeightM: 8,
  draftM: 4,
  wallHeightM: 3,
  targetRadiusM: 12,
  /** 착륙선 주변에 깔 바다 원판 반경 [m] */
  oceanRadiusM: 12_000,
} as const;

/** 착륙 다리 전개 각도 [rad] (접힘 0 → 펼침) */
export const LEG_DEPLOY_ANGLE_RAD = (150 * Math.PI) / 180;

/** 부스터 엔진 수에 따른 화염 크기 배율 (1단 9기 = 1) */
export const BOOSTER_FLAME_SCALE: Record<number, number> = { 1: 0.45, 3: 0.65 };

export const SEPARATION_VISUAL = {
  /** 페어링 반쪽이 옆으로 벌어지는 속도 [m/s] */
  fairingDriftMps: 4,
  fairingSpinRadPerS: 0.4,
  /** 페어링을 렌더링하는 시간 [s] */
  fairingVisibleS: 40,
} as const;

/** 후처리: 톤매핑·블룸·비네트 */
export const POST = {
  /** ACES 톤매핑 노출 */
  exposure: 1.05,
  /** 이 밝기(HDR 선형값)를 넘는 부분만 번진다 — 화염·섬광 위주 */
  bloomThreshold: 1.1,
  bloomStrength: 0.5,
  bloomRadius: 0.4,
  /** 화면 가장자리 어두워지는 정도 (0~1) */
  vignetteStrength: 0.35,
  /** 후처리 렌더 타깃 MSAA 샘플 수 */
  msaaSamples: 4,
  /** 점화 섬광 시 노출 증가량, 감쇠 시상수 [s] */
  flashExposureBoost: 0.6,
  flashDecayS: 0.35,
} as const;

/** 셰이더 화염 연출 */
export const FLAME_FX = {
  /** HDR 밝기 배율 (블룸 임계값을 넘도록 1보다 크게) */
  coreIntensity: 2,
  outerIntensity: 1.6,
  /** 노이즈가 노즐에서 끝으로 흘러가는 속도 [화염 길이/s] */
  scrollSpeed: 2.4,
  /** 충격 다이아몬드(마하 디스크) 개수와 밝기 — 외기압이 높을수록 선명 */
  shockDiamondCount: 5,
  shockDiamondBoost: 2.5,
  /** 점화 섬광: 크기·밝기 증가량, 감쇠 시상수 [s] */
  ignitionFlashBoost: 1.2,
  ignitionFlashDecayS: 0.5,
  /** 부드러운 깜빡임 진폭과 주파수 [Hz] */
  flickerAmount: 0.06,
  flickerHz: 13,
} as const;

/**
 * 카메라 흔들림 (트라우마 모델: 흔들림 = trauma², 시간에 따라 감쇠).
 * 진폭은 시야각에 비례하는 각도로 줘서 망원(발사대) 카메라에서도 일정하게 보인다.
 */
export const CAMERA_SHAKE = {
  /** trauma 1일 때 최대 회전 = 시야각 × 이 비율 */
  maxFovFraction: 0.035,
  maxRollRad: 0.02,
  /** 초당 trauma 감소량 */
  decayPerS: 0.9,
  /** 흔들림 기본 주파수 [Hz] */
  frequencyHz: 17,
  /** 이벤트별 순간 충격량 (0~1) */
  impulse: {
    stage1Ignition: 0.55,
    stage2Ignition: 0.3,
    separation: 0.5,
    fairing: 0.2,
    boosterBurn: 0.3,
    touchdown: 0.6,
    crash: 1,
  },
  /** 발사대 카메라: 이 고도 아래에서 엔진 굉음 진동 [m] */
  padRumbleAltitudeM: 4_000,
  padRumble: 0.55,
  /** 추적·온보드 카메라: 이 동압에서 진동이 maxQRumble 이 된다 [Pa] */
  maxQReferencePa: 32_000,
  maxQRumble: 0.5,
  /** 엔진이 켜져 있을 때 온보드 기본 진동 */
  onboardEngineRumble: 0.18,
  /** 부스터 카메라: 이 고도 아래 착륙 연소 진동 [m] */
  boosterRumbleAltitudeM: 6_000,
  boosterRumble: 0.3,
} as const;

/** 시네마틱 컷 */
export const CINEMATIC = {
  /** 단 분리 직후 두 기체를 함께 담는 측면 컷 길이 [s, 실제 시간] */
  separationShotS: 6,
  separationSideM: 160,
  /** 갑판 카메라: 착륙선 기준 위치 [m] (x 다운레인지, y 위, z 측면) */
  deckCameraOffset: { x: -70, y: 12, z: 140 },
  /** 갑판 카메라가 기체를 담기 위해 유지하는 시야 높이 [m] */
  deckFramingM: 140,
  deckMinFovDeg: 0.4,
} as const;
