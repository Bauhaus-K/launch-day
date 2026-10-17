/**
 * 발사 전 Go/No-Go 체크리스트 항목.
 * 한계값은 실제 발사 규정(기상 발사 기준, 추진제 상태 등)의 개념을 참고해 단순화한 게임용 조정값이다.
 */
import { t } from '../i18n';

/** GO로 넘긴 이상 항목이 비행에 주는 영향 */
export type ChecklistEffect = 'structuralLoad' | 'propellantLoss' | 'none';

export type ChecklistId =
  | 'surface-wind'
  | 'upper-wind'
  | 'lightning'
  | 'lox-temp'
  | 'stage2-pressure'
  | 'fts-battery'
  | 'range-safety';

export interface ChecklistItemDef {
  readonly id: ChecklistId;
  /** 점검 항목 이름 */
  readonly label: string;
  /** 표시 단위 */
  readonly unit: string;
  /** 허용 기준 설명 */
  readonly limitText: string;
  /** 정상 범위에서 뽑는 측정값 [min, max] */
  readonly normal: readonly [number, number];
  /** 이상(한계 초과) 범위에서 뽑는 측정값 [min, max] */
  readonly fault: readonly [number, number];
  readonly decimals: number;
  readonly effect: ChecklistEffect;
  /** 이상 항목을 GO로 넘겼을 때 알려 주는 결과 (교육용) */
  readonly missedMessage: string;
  /** 홀드 후 조치 내용 */
  readonly fixMessage: string;
}

type ItemNumbers = Pick<ChecklistItemDef, 'normal' | 'fault' | 'decimals' | 'effect'>;

/** 숫자 기준값 + 사전의 문구로 항목을 만든다 (문구는 src/i18n) */
function item(id: ChecklistId, numbers: ItemNumbers): ChecklistItemDef {
  return {
    id,
    ...numbers,
    label: t(`checklist.${id}.label`),
    unit: t(`checklist.${id}.unit`),
    limitText: t(`checklist.${id}.limit`),
    missedMessage: t(`checklist.${id}.missed`),
    fixMessage: t(`checklist.${id}.fix`),
  };
}

export const CHECKLIST_ITEMS: readonly ChecklistItemDef[] = [
  // 한계 30 kt
  item('surface-wind', { normal: [4, 22], fault: [32, 41], decimals: 0, effect: 'none' }),
  // 한계 허용치의 100%
  item('upper-wind', { normal: [35, 85], fault: [106, 135], decimals: 0, effect: 'structuralLoad' }),
  // 한계 0회
  item('lightning', { normal: [0, 0], fault: [1, 4], decimals: 0, effect: 'none' }),
  // 한계 68.0 K (과냉각 액체산소)
  item('lox-temp', { normal: [65.6, 67.6], fault: [68.4, 70.2], decimals: 1, effect: 'propellantLoss' }),
  // 허용 2.0 ~ 2.6 bar
  item('stage2-pressure', { normal: [2.05, 2.55], fault: [2.72, 2.98], decimals: 2, effect: 'none' }),
  // 한계 90% 이상
  item('fts-battery', { normal: [92, 100], fault: [71, 86], decimals: 0, effect: 'none' }),
  // 한계 0척
  item('range-safety', { normal: [0, 0], fault: [1, 2], decimals: 0, effect: 'none' }),
];

export const CHECKLIST_RULES = {
  /** 미션마다 한계를 넘는 항목 수 [최소, 최대] */
  faultCount: [1, 2] as const,
  /** 홀드(조치·재점검)에 걸리는 시간 [s] */
  holdDurationS: 3,
  /** 관람 모드에서 비행 컴퓨터가 판단하기까지 걸리는 시간 [s] */
  autoDecideDelayS: 1.4,
  /** 이상 항목을 GO로 넘겼을 때: 구조 하중 배율, 1단 추진제 손실 비율 — 게임용 조정값 */
  missedStructuralLoadFactor: 1.2,
  missedPropellantLossFraction: 0.03,
} as const;
