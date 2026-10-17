/**
 * 발사 전 Go/No-Go 체크리스트 미니게임 로직. 순수 데이터·함수 (렌더링·DOM 무관).
 *
 * 흐름: 항목을 하나씩 점검(polling) → 플레이어가 GO 또는 NO-GO(홀드)
 * - 이상 항목을 홀드: 조치 후 정상값으로 재점검 (정답)
 * - 정상 항목을 홀드: 불필요한 홀드 (감점) 후 같은 값으로 재점검
 * - 이상 항목을 GO: 놓친 이상으로 기록, 비행에 영향
 */
import { CHECKLIST_ITEMS, CHECKLIST_RULES, type ChecklistItemDef } from '../data/checklist';

export type CheckStatus = 'pending' | 'polling' | 'hold' | 'go' | 'go-missed';

export interface CheckItemState {
  readonly def: ChecklistItemDef;
  reading: number;
  faulty: boolean;
  status: CheckStatus;
}

export type ChecklistDecision = 'go' | 'nogo';

/** 판단 결과 (화면 메시지·소리용) */
export type DecisionOutcome =
  | { readonly kind: 'go'; readonly item: ChecklistItemDef }
  | { readonly kind: 'missed-fault'; readonly item: ChecklistItemDef }
  | { readonly kind: 'correct-hold'; readonly item: ChecklistItemDef }
  | { readonly kind: 'false-hold'; readonly item: ChecklistItemDef };

export interface ChecklistState {
  readonly items: CheckItemState[];
  /** 현재 점검 중인 항목 인덱스 (모두 끝나면 items.length) */
  index: number;
  holdRemainingS: number;
  /** 홀드가 정답(조치)인지 오판인지 */
  holdKind: 'fix' | 'false' | null;
  missedFaults: number;
  falseHolds: number;
  /** 처음에 이상이었던 항목 수 */
  readonly faultCount: number;
  /** 현재 항목을 점검한 시간 (자동 판단용) [s] */
  pollingS: number;
}

const round = (v: number, decimals: number) => Number(v.toFixed(decimals));

function sample(range: readonly [number, number], decimals: number, rng: () => number): number {
  return round(range[0] + (range[1] - range[0]) * rng(), decimals);
}

/** 이상 항목을 무작위로 골라 체크리스트를 만든다 */
export function createChecklist(rng: () => number, defs: readonly ChecklistItemDef[] = CHECKLIST_ITEMS): ChecklistState {
  const [minFaults, maxFaults] = CHECKLIST_RULES.faultCount;
  const faultCount = Math.min(defs.length, minFaults + Math.floor(rng() * (maxFaults - minFaults + 1)));
  const order = defs.map((_, i) => i);
  // 피셔-예이츠 셔플로 이상 항목 선택
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j] ?? i, order[i] ?? j];
  }
  const faulty = new Set(order.slice(0, faultCount));
  const items = defs.map((def, i): CheckItemState => {
    const isFault = faulty.has(i);
    return {
      def,
      reading: sample(isFault ? def.fault : def.normal, def.decimals, rng),
      faulty: isFault,
      status: i === 0 ? 'polling' : 'pending',
    };
  });
  return { items, index: 0, holdRemainingS: 0, holdKind: null, missedFaults: 0, falseHolds: 0, faultCount, pollingS: 0 };
}

export const checklistComplete = (s: ChecklistState): boolean => s.index >= s.items.length;

/** 지금 GO/NO-GO 판단을 받을 수 있는지 (홀드 중·완료 후에는 불가) */
export const awaitingDecision = (s: ChecklistState): boolean => !checklistComplete(s) && s.holdKind === null;

export const currentItem = (s: ChecklistState): CheckItemState | null => s.items[s.index] ?? null;

function advance(s: ChecklistState): void {
  s.index++;
  s.pollingS = 0;
  const next = currentItem(s);
  if (next) next.status = 'polling';
}

export function decide(s: ChecklistState, decision: ChecklistDecision): DecisionOutcome | null {
  const item = currentItem(s);
  if (!item || !awaitingDecision(s)) return null;
  if (decision === 'go') {
    if (item.faulty) {
      item.status = 'go-missed';
      s.missedFaults++;
      advance(s);
      return { kind: 'missed-fault', item: item.def };
    }
    item.status = 'go';
    advance(s);
    return { kind: 'go', item: item.def };
  }
  item.status = 'hold';
  s.holdRemainingS = CHECKLIST_RULES.holdDurationS;
  s.holdKind = item.faulty ? 'fix' : 'false';
  if (!item.faulty) s.falseHolds++;
  return { kind: item.faulty ? 'correct-hold' : 'false-hold', item: item.def };
}

/**
 * 시간 진행. 홀드가 끝나면 (조치했으면 정상값으로 바꿔) 같은 항목을 다시 점검한다.
 * @param rng 조치 후 새 측정값용
 */
export function updateChecklist(s: ChecklistState, dt: number, rng: () => number): void {
  if (checklistComplete(s)) return;
  if (s.holdKind === null) {
    s.pollingS += dt;
    return;
  }
  s.holdRemainingS -= dt;
  if (s.holdRemainingS > 0) return;
  const item = currentItem(s);
  if (item && s.holdKind === 'fix') {
    item.faulty = false;
    item.reading = sample(item.def.normal, item.def.decimals, rng);
  }
  if (item) item.status = 'polling';
  s.holdKind = null;
  s.holdRemainingS = 0;
  s.pollingS = 0;
}

/** 관람 모드 비행 컴퓨터의 정답 판단 */
export const correctDecision = (item: CheckItemState): ChecklistDecision => (item.faulty ? 'nogo' : 'go');

/** 체크리스트 점수 비율 (0~1): 놓친 이상은 크게, 불필요한 홀드는 작게 감점 */
export function checklistScoreRatio(s: Pick<ChecklistState, 'missedFaults' | 'falseHolds'>): number {
  return Math.max(0, 1 - s.missedFaults * MISSED_FAULT_PENALTY - s.falseHolds * FALSE_HOLD_PENALTY);
}

/** 놓친 이상 1건당 감점 비율 */
export const MISSED_FAULT_PENALTY = 0.5;
/** 불필요한 홀드 1건당 감점 비율 */
export const FALSE_HOLD_PENALTY = 0.15;

/** 놓친 이상들이 비행에 주는 영향 */
export interface LaunchConditions {
  readonly structuralLoadFactor: number;
  readonly stage1PropellantLossFraction: number;
}

export const NOMINAL_CONDITIONS: LaunchConditions = { structuralLoadFactor: 1, stage1PropellantLossFraction: 0 };

export function launchConditions(s: ChecklistState): LaunchConditions {
  const missed = s.items.filter((i) => i.status === 'go-missed').map((i) => i.def.effect);
  return {
    structuralLoadFactor: missed.includes('structuralLoad') ? CHECKLIST_RULES.missedStructuralLoadFactor : 1,
    stage1PropellantLossFraction: missed.includes('propellantLoss') ? CHECKLIST_RULES.missedPropellantLossFraction : 0,
  };
}

/** 표시용 측정값 문자열 */
export const formatReading = (item: CheckItemState): string =>
  `${item.reading.toFixed(item.def.decimals)} ${item.def.unit}`;
