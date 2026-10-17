import { describe, expect, it } from 'vitest';
import { BEST_RECORDS_STORAGE_KEY, BestRecords, type KeyValueStorage } from '../src/core/best-records';
import type { MissionResult } from '../src/mission/scoring';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

function result(score: number, grade = 'A'): MissionResult {
  return {
    success: true,
    reason: '',
    apoapsisAltitudeM: 200_000,
    periapsisAltitudeM: 200_000,
    stage2FuelFraction: 0.03,
    stress: 0,
    maxDynamicPressurePa: 20_000,
    flightTimeS: 500,
    booster: null,
    checklist: { faultCount: 1, missedFaults: 0, falseHolds: 0 },
    score,
    grade,
    items: [],
  };
}

describe('최고 기록', () => {
  it('첫 기록은 신기록이고 저장소에 저장된다', () => {
    const storage = memoryStorage();
    const records = new BestRecords(storage);
    const out = records.submit('normal', result(70, 'B'));
    expect(out.isNewBest).toBe(true);
    expect(out.previous).toBeNull();
    expect(new BestRecords(storage).get('normal')?.score).toBe(70);
  });

  it('더 높은 점수만 갱신하고, 같거나 낮으면 유지', () => {
    const records = new BestRecords(memoryStorage());
    records.submit('real', result(60, 'C'));
    expect(records.submit('real', result(60, 'C')).isNewBest).toBe(false);
    expect(records.submit('real', result(50, 'D')).isNewBest).toBe(false);
    const up = records.submit('real', result(85, 'A'));
    expect(up.isNewBest).toBe(true);
    expect(up.previous?.score).toBe(60);
    expect(records.get('real')?.grade).toBe('A');
  });

  it('모드별로 따로 저장된다', () => {
    const records = new BestRecords(memoryStorage());
    records.submit('spectator', result(90, 'S'));
    expect(records.get('normal')).toBeNull();
  });

  it('깨진 저장 데이터나 저장소 없음에도 동작한다', () => {
    expect(new BestRecords(memoryStorage({ [BEST_RECORDS_STORAGE_KEY]: '{not json' })).get('normal')).toBeNull();
    const noStorage = new BestRecords(null);
    expect(noStorage.submit('normal', result(10, 'D')).isNewBest).toBe(true);
    expect(noStorage.get('normal')?.score).toBe(10);
  });
});
