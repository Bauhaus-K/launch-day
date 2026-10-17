/**
 * 난이도 모드 정의.
 */
import { t } from '../i18n';
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
    label: t('difficulty.spectator.label'),
    description: t('difficulty.spectator.description'),
    autoPitch: true,
    autoThrottle: true,
    autoConfirm: true,
    autoSeco: true,
  },
  normal: {
    id: 'normal',
    label: t('difficulty.normal.label'),
    description: t('difficulty.normal.description'),
    autoPitch: true,
    autoThrottle: false,
    autoConfirm: false,
    autoSeco: true,
  },
  real: {
    id: 'real',
    label: t('difficulty.real.label'),
    description: t('difficulty.real.description'),
    autoPitch: false,
    autoThrottle: false,
    autoConfirm: false,
    autoSeco: false,
  },
};
