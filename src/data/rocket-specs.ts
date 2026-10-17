/**
 * 가상 2단 재사용 로켓 "헬리오스 9" 제원.
 *
 * 근거: Falcon 9 Block 5 공개 제원(제조사 웹사이트·사용자 가이드, Wikipedia 집계치)을 참고한 근사값.
 * 실제 수치와 다르게 재미를 위해 조정한 값은 "게임용 조정값"으로 표시한다.
 */
import type { StackConfig } from '../rocket/vehicle-config';

export const ROCKET_NAME = '헬리오스 9';
export const COMPANY_NAME = '오비탈 프런티어';

/** 기체 직경 [m] — 공개 제원 3.7 m */
export const ROCKET_DIAMETER_M = 3.7;

export const HELIOS9_STACK: StackConfig = {
  stage1: {
    // 1단 건조 질량 약 25.6 t (공개 추정치)
    dryMassKg: 25_600,
    // 1단 추진제(RP-1/LOX) 약 411 t
    propellantMassKg: 411_000,
    engine: {
      // 주 엔진 9기 합계 진공 추력 8,227 kN, Isp 해면 282 s / 진공 311 s
      thrustVacN: 8_227_000,
      ispSeaLevelS: 282,
      ispVacS: 311,
      // 공개 자료상 약 40%까지 스로틀 가능
      minThrottle: 0.4,
    },
  },
  stage2: {
    // 2단 건조 질량 약 4 t
    dryMassKg: 4_000,
    // 2단 추진제 약 107.5 t
    propellantMassKg: 107_500,
    engine: {
      // 진공용 엔진 1기 추력 981 kN, 진공 Isp 348 s.
      // 해면 Isp는 사용되지 않음(대기권 밖 점화)이므로 진공값과 동일하게 둔다 (게임용 단순화)
      thrustVacN: 981_000,
      ispSeaLevelS: 348,
      ispVacS: 348,
      minThrottle: 0.4,
    },
  },
  // 페어링 약 1.9 t
  fairingMassKg: 1_900,
  // 탑재체 질량 — 게임용 조정값 (부스터 회수 예비 연료를 남기고 200 km 궤도에 여유 있게 도달하도록)
  payloadMassKg: 11_000,
  // 항력 계수 — 게임용 조정값 (세장형 로켓 아음속~초음속 평균 근사)
  dragCoefficient: 0.3,
  // 기준 면적 = π (d/2)²
  referenceAreaM2: Math.PI * (ROCKET_DIAMETER_M / 2) ** 2,
};

/**
 * 1단 MECO 시 남겨두는 추진제 비율 (부스터 귀환용 예비) — 게임용 조정값.
 * 실제 바지선 착륙 미션은 대략 추진제의 수~십수 %를 남기는 것으로 알려져 있다.
 */
export const STAGE1_LANDING_RESERVE_FRACTION = 0.1;

/** 스로틀 변화율 한계 [1/s] — 게임용 조정값 (점화 시 추력 상승 연출 포함) */
export const THROTTLE_SLEW_PER_S = 0.6;

/** 부스터 재점화 시 스로틀 변화율 한계 [1/s] — 게임용 조정값 (착륙 연소 반응성 확보) */
export const BOOSTER_THROTTLE_SLEW_PER_S = 2;

/** 자세(피치) 변화율 한계 [rad/s] — 게임용 조정값 (약 4°/s) */
export const PITCH_SLEW_RAD_PER_S = (4 * Math.PI) / 180;

/** 단 분리 시 부스터가 2단 대비 밀려나는 상대 속도 [m/s] — 게임용 조정값 */
export const STAGE_SEPARATION_PUSH_MPS = 1.5;

/** 3D 모델 치수 [m] (실제 기체 길이 약 70 m를 단계별로 나눈 근사값) */
export const MODEL_DIMENSIONS = {
  stage1LengthM: 42,
  interstageLengthM: 5,
  stage2LengthM: 10,
  fairingCylinderLengthM: 7,
  fairingNoseLengthM: 6,
  fairingDiameterM: 5.2,
  legLengthM: 9,
  nozzleLengthM: 2.4,
  stage2NozzleLengthM: 3,
} as const;
