/**
 * 교육용 해설 자막과 용어 사전 설정. 문구는 src/i18n 사전(commentary.*, glossary.*)에 있다.
 */

export const COMMENTARY = {
  /** 해설 한 개를 보여 주는 시간 [ms] */
  lifetimeMs: 13_000,
  /** 해설 켜짐/꺼짐 설정을 저장하는 localStorage 키 */
  storageKey: 'launch-day:commentary',
  /** 해설을 띄우는 카운트다운 시각 T- [s] (엔진 선점화 설명) */
  ignitionTMinusS: 3,
} as const;

/** 용어 사전 항목 (표시 순서 = 비행 순서) */
export const GLOSSARY_TERMS = [
  'goNoGo',
  'fts',
  'twr',
  'isp',
  'gravityTurn',
  'q',
  'maxQ',
  'meco',
  'staging',
  'ses',
  'fairing',
  'boostback',
  'entryBurn',
  'gridFins',
  'hoverslam',
  'droneship',
  'orbitalSpeed',
  'apoapsis',
  'seco',
] as const;

export type GlossaryTerm = (typeof GLOSSARY_TERMS)[number];
