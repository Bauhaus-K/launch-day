/**
 * 단계별 표시명·해설 자막과 카운트다운 관제 콜아웃.
 * 관제 대사는 실제 발사 중계의 흐름을 참고해 새로 작성한 가상 대사다.
 */
import type { PhaseId } from '../mission/mission-types';

export interface PhaseInfo {
  readonly title: string;
  /** 단계 진입 시 띄우는 교육용 해설 */
  readonly narration: string;
}

export const PHASE_INFO: Record<PhaseId, PhaseInfo> = {
  PRE_LAUNCH: {
    title: '발사 전 점검',
    narration: '기상, 추진제 충전, 각 시스템 상태를 확인합니다. 모든 항목이 GO여야 발사할 수 있습니다.',
  },
  COUNTDOWN: {
    title: '카운트다운',
    narration: '자동 발사 시퀀스가 진행됩니다. 엔진은 T-3초에 점화되고, T-0에 발사대 고정 장치가 풀립니다.',
  },
  LIFTOFF: {
    title: '이륙',
    narration: '추력이 기체 무게보다 커지면 로켓이 떠오릅니다. 발사탑을 벗어날 때까지 수직으로 상승합니다.',
  },
  MAX_Q: {
    title: 'Max-Q · 1단 상승',
    narration:
      '공기 밀도는 줄고 속도는 빨라지며, 기체가 받는 공기 압력(동압)이 최대가 되는 구간입니다. 스로틀을 줄여 하중을 견딥니다.',
  },
  MECO: {
    title: 'MECO',
    narration: '1단 주 엔진이 정지합니다. 부스터 귀환을 위한 연료를 남겨 둔 상태입니다.',
  },
  STAGE_SEPARATION: {
    title: '단 분리',
    narration: '1단과 2단이 분리됩니다. 무거운 1단을 버려서 2단이 훨씬 효율적으로 가속할 수 있습니다.',
  },
  SES: {
    title: '2단 점화 (SES)',
    narration: '진공용 엔진이 점화됩니다. 대기가 거의 없는 고도에 오르면 탑재체를 보호하던 페어링을 분리합니다.',
  },
  BOOSTER_RETURN: {
    title: '부스터 귀환',
    narration:
      '부스터가 몸을 뒤집어 엔진을 켜고(부스트백) 착륙선 쪽으로 방향을 틉니다. 재진입 연소로 속도를 줄이고, 그리드 핀으로 조준한 뒤 마지막 순간 착륙 연소로 멈춥니다.',
  },
  ORBIT_INSERTION: {
    title: '궤도 진입',
    narration:
      '수평 속도를 약 7.8 km/s까지 높이면 지구로 떨어지는 만큼 옆으로 나아가 궤도에 머물게 됩니다. 원지점과 근지점이 모두 목표 고도 근처가 되면 엔진을 끕니다(SECO).',
  },
  RESULT: {
    title: '미션 결과',
    narration: '',
  },
};

export interface Callout {
  /** T- 초 */
  readonly tMinusS: number;
  readonly text: string;
}

export const COUNTDOWN_CALLOUTS: readonly Callout[] = [
  { tMinusS: 60, text: '발사 감독: 카운트다운 시작. 모든 관제석 최종 확인 바랍니다.' },
  { tMinusS: 45, text: '발사 감독: 발사 승인. GO for launch.' },
  { tMinusS: 30, text: '비행 컴퓨터: 자동 발사 시퀀스 진입.' },
  { tMinusS: 15, text: '관제: 추진제 탱크 가압 완료.' },
  { tMinusS: 10, text: '10' },
  { tMinusS: 9, text: '9' },
  { tMinusS: 8, text: '8' },
  { tMinusS: 7, text: '7' },
  { tMinusS: 6, text: '6' },
  { tMinusS: 5, text: '5' },
  { tMinusS: 4, text: '4' },
  { tMinusS: 3, text: '3 — 엔진 점화 시퀀스 시작' },
  { tMinusS: 2, text: '2' },
  { tMinusS: 1, text: '1' },
];

/** 발사 전 점검 항목 (MVP: 자동 확인. 로드맵 4단계에서 미니게임으로 확장) */
export const PRELAUNCH_CHECKS: readonly string[] = [
  '기상 — 지상풍·고층풍 허용 범위',
  '1단 추진제 충전 완료',
  '2단 추진제 충전 완료',
  '비행 종단 시스템 정상',
  '발사장 안전 구역 확보',
];

/** 점검 항목 하나가 GO로 바뀌는 간격 [s] */
export const PRELAUNCH_CHECK_INTERVAL_S = 0.6;
