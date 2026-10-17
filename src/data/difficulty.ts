/**
 * 난이도 모드 정의.
 */
export type DifficultyId = 'spectator' | 'normal' | 'real';

export interface DifficultyConfig {
  readonly id: DifficultyId;
  readonly label: string;
  readonly description: string;
  /** 자세(피치)를 유도 컴퓨터가 제어 */
  readonly autoPitch: boolean;
  /** 스로틀을 유도 컴퓨터가 제어 */
  readonly autoThrottle: boolean;
  /** 단계 승인(Space)을 자동 처리 */
  readonly autoConfirm: boolean;
  /** 목표 궤도 도달 시 2단 엔진 자동 정지 */
  readonly autoSeco: boolean;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  spectator: {
    id: 'spectator',
    label: '관람 모드',
    description: '모든 비행을 자동으로 진행합니다. 해설을 보며 발사 과정을 감상하세요.',
    autoPitch: true,
    autoThrottle: true,
    autoConfirm: true,
    autoSeco: true,
  },
  normal: {
    id: 'normal',
    label: '일반 모드',
    description: '자세는 자동, 스로틀과 주요 단계 승인은 직접. Max-Q 구간에서 스로틀을 줄이세요.',
    autoPitch: true,
    autoThrottle: false,
    autoConfirm: false,
    autoSeco: true,
  },
  real: {
    id: 'real',
    label: '리얼 모드',
    description: '스로틀·자세·엔진 정지까지 전부 수동. HUD의 권장 피치를 참고하세요.',
    autoPitch: false,
    autoThrottle: false,
    autoConfirm: false,
    autoSeco: false,
  },
};
