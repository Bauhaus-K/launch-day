import { describe, expect, it } from 'vitest';
import { CHECKLIST_ITEMS, CHECKLIST_RULES } from '../src/data/checklist';
import {
  checklistComplete,
  checklistScoreRatio,
  correctDecision,
  createChecklist,
  currentItem,
  decide,
  launchConditions,
  updateChecklist,
} from '../src/mission/checklist';
import { createRng } from '../src/utils/random';

const rng = () => createRng(42);

describe('체크리스트 생성', () => {
  it('정해진 범위의 이상 항목 수, 이상 값은 이상 범위·정상 값은 정상 범위', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = createChecklist(createRng(seed));
      const faults = s.items.filter((i) => i.faulty);
      expect(faults.length).toBeGreaterThanOrEqual(CHECKLIST_RULES.faultCount[0]);
      expect(faults.length).toBeLessThanOrEqual(CHECKLIST_RULES.faultCount[1]);
      for (const item of s.items) {
        const [lo, hi] = item.faulty ? item.def.fault : item.def.normal;
        expect(item.reading).toBeGreaterThanOrEqual(lo);
        expect(item.reading).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('같은 시드면 같은 체크리스트', () => {
    expect(createChecklist(rng()).items.map((i) => i.reading)).toEqual(createChecklist(rng()).items.map((i) => i.reading));
  });

  it('정상·이상 범위는 겹치지 않는다', () => {
    for (const def of CHECKLIST_ITEMS) {
      const separated = def.fault[0] > def.normal[1] || def.fault[1] < def.normal[0];
      expect(separated, def.id).toBe(true);
    }
  });
});

describe('판단', () => {
  it('항상 정답으로 판단하면 감점 없이 끝나고 비행 영향도 없다', () => {
    const s = createChecklist(rng());
    const r = rng();
    for (let guard = 0; guard < 1000 && !checklistComplete(s); guard++) {
      const item = currentItem(s);
      if (item && s.holdKind === null) decide(s, correctDecision(item));
      updateChecklist(s, 0.5, r);
    }
    expect(checklistComplete(s)).toBe(true);
    expect(checklistScoreRatio(s)).toBe(1);
    expect(launchConditions(s)).toEqual({ structuralLoadFactor: 1, stage1PropellantLossFraction: 0 });
  });

  it('이상 항목을 홀드하면 조치 후 정상값으로 재점검한다', () => {
    const s = createChecklist(rng());
    while (!currentItem(s)?.faulty) decide(s, 'go');
    expect(decide(s, 'nogo')?.kind).toBe('correct-hold');
    expect(decide(s, 'go')).toBeNull(); // 홀드 중에는 판단 불가
    updateChecklist(s, CHECKLIST_RULES.holdDurationS + 0.1, rng());
    const item = currentItem(s);
    expect(item?.faulty).toBe(false);
    expect(item?.status).toBe('polling');
  });

  it('정상 항목 홀드는 불필요한 홀드, 이상 항목 GO는 놓친 이상', () => {
    const s = createChecklist(rng());
    while (currentItem(s)?.faulty) decide(s, 'go');
    expect(decide(s, 'nogo')?.kind).toBe('false-hold');
    expect(s.falseHolds).toBe(1);
    updateChecklist(s, CHECKLIST_RULES.holdDurationS + 0.1, rng());
    while (!checklistComplete(s)) decide(s, 'go');
    expect(s.missedFaults).toBe(s.faultCount);
    expect(checklistScoreRatio(s)).toBeLessThan(1);
  });

  it('놓친 고층풍·액체산소 이상은 비행 조건을 바꾼다', () => {
    const s = createChecklist(rng(), CHECKLIST_ITEMS.filter((d) => d.effect !== 'none'));
    for (const item of s.items) {
      item.faulty = true;
    }
    while (!checklistComplete(s)) decide(s, 'go');
    const c = launchConditions(s);
    expect(c.structuralLoadFactor).toBe(CHECKLIST_RULES.missedStructuralLoadFactor);
    expect(c.stage1PropellantLossFraction).toBe(CHECKLIST_RULES.missedPropellantLossFraction);
  });
});
