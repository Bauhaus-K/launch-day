/**
 * 발사 전 Go/No-Go 체크리스트 항목.
 * 한계값은 실제 발사 규정(기상 발사 기준, 추진제 상태 등)의 개념을 참고해 단순화한 게임용 조정값이다.
 */

/** GO로 넘긴 이상 항목이 비행에 주는 영향 */
export type ChecklistEffect = 'structuralLoad' | 'propellantLoss' | 'none';

export interface ChecklistItemDef {
  readonly id: string;
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

export const CHECKLIST_ITEMS: readonly ChecklistItemDef[] = [
  {
    id: 'surface-wind',
    label: '지상풍',
    unit: 'kt',
    limitText: '30 kt 이하',
    normal: [4, 22],
    fault: [32, 41],
    decimals: 0,
    effect: 'none',
    missedMessage: '강한 지상풍 속 이륙 — 발사탑과 충돌할 뻔했습니다.',
    fixMessage: '돌풍이 잦아들 때까지 대기했습니다.',
  },
  {
    id: 'upper-wind',
    label: '고층풍 전단',
    unit: '%',
    limitText: '허용치의 100% 이하',
    normal: [35, 85],
    fault: [106, 135],
    decimals: 0,
    effect: 'structuralLoad',
    missedMessage: '고층풍이 강한 채 발사 — Max-Q 구간 구조 하중이 커집니다.',
    fixMessage: '새 기상 관측 풍선 자료로 비행 궤도를 다시 계산했습니다.',
  },
  {
    id: 'lightning',
    label: '낙뢰 (10 km 이내, 최근 30분)',
    unit: '회',
    limitText: '0회',
    normal: [0, 0],
    fault: [1, 4],
    decimals: 0,
    effect: 'none',
    missedMessage: '뇌우 근처 발사 — 로켓 배기 기둥이 번개를 유도할 수 있어 매우 위험합니다.',
    fixMessage: '뇌우 셀이 발사장을 벗어날 때까지 대기했습니다.',
  },
  {
    id: 'lox-temp',
    label: '1단 액체산소 온도',
    unit: 'K',
    limitText: '68.0 K 이하 (과냉각)',
    normal: [65.6, 67.6],
    fault: [68.4, 70.2],
    decimals: 1,
    effect: 'propellantLoss',
    missedMessage: '액체산소가 데워진 채 발사 — 밀도가 낮아 1단 추진제가 부족해집니다.',
    fixMessage: '탱크를 비우고 과냉각 액체산소를 다시 충전했습니다.',
  },
  {
    id: 'stage2-pressure',
    label: '2단 탱크 압력',
    unit: 'bar',
    limitText: '2.0 ~ 2.6 bar',
    normal: [2.05, 2.55],
    fault: [2.72, 2.98],
    decimals: 2,
    effect: 'none',
    missedMessage: '2단 탱크 과압 상태로 발사 — 다행히 버텼지만 위험한 판단이었습니다.',
    fixMessage: '가압 밸브를 조정해 압력을 정상 범위로 낮췄습니다.',
  },
  {
    id: 'fts-battery',
    label: '비행 종단 시스템 배터리',
    unit: '%',
    limitText: '90% 이상',
    normal: [92, 100],
    fault: [71, 86],
    decimals: 0,
    effect: 'none',
    missedMessage: '비행 종단 시스템이 불완전한 채 발사 — 안전 규정 위반입니다.',
    fixMessage: '배터리를 교체하고 자가 점검을 다시 했습니다.',
  },
  {
    id: 'range-safety',
    label: '안전 구역 침범 선박',
    unit: '척',
    limitText: '0척',
    normal: [0, 0],
    fault: [1, 2],
    decimals: 0,
    effect: 'none',
    missedMessage: '안전 구역 안에 선박이 있는데 발사 — 낙하물 위험 규정 위반입니다.',
    fixMessage: '해안경비대가 선박을 구역 밖으로 유도했습니다.',
  },
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
