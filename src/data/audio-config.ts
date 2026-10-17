/**
 * 사운드 설정. 모든 소리는 Web Audio API로 실시간 합성하며 외부 음원 파일을 쓰지 않는다.
 * 관제 음성은 브라우저 내장 음성 합성(Web Speech API)으로 읽는다 (실제 미션 음성 미사용).
 */

export const AUDIO = {
  masterGain: 0.8,
  /** 음소거 설정을 저장하는 localStorage 키 */
  muteStorageKey: 'launch-day:muted',
  /** 오디오 파라미터 변화 시상수 [s] (뚝뚝 끊기지 않게) */
  smoothingS: 0.08,
} as const;

/** 엔진음 믹스 */
export const ENGINE_SOUND = {
  /** 1단 9기 풀스로틀을 근거리에서 들을 때 럼블 음량 */
  maxRumbleGain: 0.9,
  maxCrackleGain: 0.35,
  /** 진공에서도 남겨 두는 구조 전달 진동음 비율 (게임 연출) */
  vacuumFloor: 0.12,
  /** 이 거리 안에서는 최대 음량 [m] */
  referenceDistanceM: 150,
  /** 추적·온보드 카메라에서 가정하는 청취 거리 [m] */
  nearListenerDistanceM: 100,
  /** 럼블 저역 통과 필터 범위 [Hz] */
  minCutoffHz: 120,
  maxCutoffHz: 1_400,
  /** 크래클(타닥거리는 소리) 대역 [Hz] */
  crackleBandHz: 1_800,
  /** 크래클 음량 무작위 변동 폭 (0~1) */
  crackleJitter: 0.7,
  /** 초저역 진동 오실레이터 주파수 [Hz] */
  subRumbleHz: 38,
  subRumbleGain: 0.25,
  /** 노이즈 버퍼 길이 [s] */
  noiseBufferS: 2,
} as const;

/** 재생 간격 제한 [s] — 경고음이 너무 자주 울리지 않게 */
export const ALARM_INTERVAL_S = 1.2;

export interface ToneSpec {
  readonly type: OscillatorType;
  readonly freq: number;
  readonly endFreq?: number;
  readonly duration: number;
  readonly gain: number;
  readonly delay?: number;
}

export interface NoiseSpec {
  readonly filter: BiquadFilterType;
  readonly freq: number;
  readonly endFreq?: number;
  readonly duration: number;
  readonly gain: number;
  readonly delay?: number;
}

export interface SoundSpec {
  readonly tones?: readonly ToneSpec[];
  readonly noises?: readonly NoiseSpec[];
}

/** 효과음 정의 */
export const SOUNDS = {
  countdownBeep: { tones: [{ type: 'sine', freq: 880, duration: 0.12, gain: 0.25 }] },
  ignition: {
    noises: [{ filter: 'lowpass', freq: 150, endFreq: 1_500, duration: 1.6, gain: 0.6 }],
  },
  stageSeparation: {
    tones: [{ type: 'sine', freq: 95, endFreq: 40, duration: 0.45, gain: 0.7 }],
    noises: [{ filter: 'lowpass', freq: 500, endFreq: 120, duration: 0.35, gain: 0.6 }],
  },
  fairingSeparation: {
    noises: [
      { filter: 'highpass', freq: 2_500, duration: 0.15, gain: 0.5 },
      { filter: 'bandpass', freq: 3_000, endFreq: 800, duration: 1.2, gain: 0.25, delay: 0.05 },
    ],
  },
  sonicBoom: {
    noises: [
      { filter: 'lowpass', freq: 220, endFreq: 60, duration: 0.45, gain: 0.9 },
      { filter: 'lowpass', freq: 220, endFreq: 60, duration: 0.45, gain: 0.8, delay: 0.3 },
    ],
  },
  touchdown: {
    tones: [{ type: 'sine', freq: 70, endFreq: 30, duration: 0.6, gain: 0.7 }],
    noises: [{ filter: 'lowpass', freq: 400, endFreq: 100, duration: 0.5, gain: 0.5 }],
  },
  explosion: {
    noises: [
      { filter: 'lowpass', freq: 900, endFreq: 60, duration: 2.8, gain: 1 },
      { filter: 'bandpass', freq: 300, endFreq: 80, duration: 1.5, gain: 0.6, delay: 0.1 },
    ],
  },
  alarm: {
    tones: [
      { type: 'square', freq: 990, duration: 0.1, gain: 0.12 },
      { type: 'square', freq: 990, duration: 0.1, gain: 0.12, delay: 0.18 },
    ],
  },
  prompt: { tones: [{ type: 'sine', freq: 1_320, duration: 0.15, gain: 0.18 }] },
  success: {
    tones: [
      { type: 'triangle', freq: 523, duration: 0.25, gain: 0.25 },
      { type: 'triangle', freq: 659, duration: 0.25, gain: 0.25, delay: 0.15 },
      { type: 'triangle', freq: 784, duration: 0.25, gain: 0.25, delay: 0.3 },
      { type: 'triangle', freq: 1_047, duration: 0.6, gain: 0.25, delay: 0.45 },
    ],
  },
  failure: { tones: [{ type: 'sawtooth', freq: 220, endFreq: 110, duration: 1.2, gain: 0.18 }] },
} as const satisfies Record<string, SoundSpec>;

export type SoundName = keyof typeof SOUNDS;

/** 관제 음성 */
export const VOICE = {
  lang: 'ko',
  rate: 1.05,
  volume: 1,
  /** 카운트다운에서 숫자를 읽기 시작하는 T- [s] */
  countdownSpeakFromS: 10,
} as const;

/** 관제 음성 대사 (가상 관제 센터) */
export const VOICE_LINES = {
  ignition: '엔진 점화',
  liftoff: '이륙!',
  maxQ: '최대 동압 구간',
  meco: '메코',
  separation: '단 분리 확인',
  ses: '2단 점화',
  boosterReturn: '부스트백 시작',
  landingBurn: '착륙 연소',
  landed: '부스터 착륙 성공',
  boosterLost: '부스터 손실',
  seco: '세코',
  orbit: '궤도 진입 성공',
  missionFailed: '미션 실패',
} as const;
