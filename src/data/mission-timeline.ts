/**
 * 단계별 표시명·해설 자막과 카운트다운 관제 콜아웃. 문구는 src/i18n 사전에 있다.
 * 관제 대사는 실제 발사 중계의 흐름을 참고해 새로 작성한 가상 대사다.
 */
import { t } from '../i18n';
import type { PhaseId } from '../mission/mission-types';

export interface PhaseInfo {
  readonly title: string;
  /** 단계 진입 시 띄우는 교육용 해설 */
  readonly narration: string;
}

const PHASE_IDS: readonly PhaseId[] = [
  'PRE_LAUNCH',
  'COUNTDOWN',
  'LIFTOFF',
  'MAX_Q',
  'MECO',
  'STAGE_SEPARATION',
  'SES',
  'BOOSTER_RETURN',
  'ORBIT_INSERTION',
  'RESULT',
];

// 언어는 메뉴에서 바꾸면 페이지를 다시 불러오므로 모듈 로드 시점에 한 번 풀어도 된다
export const PHASE_INFO = Object.fromEntries(
  PHASE_IDS.map((id) => [id, { title: t(`phase.${id}.title`), narration: t(`phase.${id}.narration`) }]),
) as Record<PhaseId, PhaseInfo>;

export interface Callout {
  /** T- 초 */
  readonly tMinusS: number;
  readonly text: string;
}

export const COUNTDOWN_CALLOUTS: readonly Callout[] = [
  { tMinusS: 60, text: t('countdown.60') },
  { tMinusS: 45, text: t('countdown.45') },
  { tMinusS: 30, text: t('countdown.30') },
  { tMinusS: 15, text: t('countdown.15') },
  { tMinusS: 10, text: '10' },
  { tMinusS: 9, text: '9' },
  { tMinusS: 8, text: '8' },
  { tMinusS: 7, text: '7' },
  { tMinusS: 6, text: '6' },
  { tMinusS: 5, text: '5' },
  { tMinusS: 4, text: '4' },
  { tMinusS: 3, text: t('countdown.3') },
  { tMinusS: 2, text: '2' },
  { tMinusS: 1, text: '1' },
];
