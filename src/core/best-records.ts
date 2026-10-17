/**
 * 모드별 최고 기록. 브라우저 localStorage에 저장하며, 저장소를 못 쓰는 환경에서는 메모리에만 둔다.
 */
import type { DifficultyId } from '../data/difficulty';
import type { MissionResult } from '../mission/scoring';

export const BEST_RECORDS_STORAGE_KEY = 'launch-day:best-records';

export interface BestRecord {
  readonly score: number;
  readonly grade: string;
  readonly boosterLanded: boolean;
  /** 기록 시각 (ISO 문자열) */
  readonly achievedAt: string;
}

export interface SubmitOutcome {
  readonly isNewBest: boolean;
  /** 이번 결과 이전의 최고 기록 */
  readonly previous: BestRecord | null;
  readonly best: BestRecord;
}

/** localStorage와 같은 최소 인터페이스 (테스트에서 대체) */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type RecordTable = Partial<Record<DifficultyId, BestRecord>>;

function isBestRecord(v: unknown): v is BestRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r['score'] === 'number' && typeof r['grade'] === 'string';
}

export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class BestRecords {
  private table: RecordTable;

  constructor(private readonly storage: KeyValueStorage | null) {
    this.table = this.load();
  }

  private load(): RecordTable {
    try {
      const raw = this.storage?.getItem(BEST_RECORDS_STORAGE_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return {};
      const table: RecordTable = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (isBestRecord(value)) table[key as DifficultyId] = value;
      }
      return table;
    } catch {
      return {};
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(BEST_RECORDS_STORAGE_KEY, JSON.stringify(this.table));
    } catch {
      // 저장 공간이 없거나 막힌 경우: 이번 세션에서만 유지
    }
  }

  get(difficulty: DifficultyId): BestRecord | null {
    return this.table[difficulty] ?? null;
  }

  /** 결과를 반영한다. 점수가 더 높을 때만 갱신 (같으면 먼저 세운 기록 유지) */
  submit(difficulty: DifficultyId, result: MissionResult, now: Date = new Date()): SubmitOutcome {
    const previous = this.get(difficulty);
    const candidate: BestRecord = {
      score: result.score,
      grade: result.grade,
      boosterLanded: result.booster?.landed ?? false,
      achievedAt: now.toISOString(),
    };
    const isNewBest = previous === null || candidate.score > previous.score;
    if (isNewBest) {
      this.table = { ...this.table, [difficulty]: candidate };
      this.save();
    }
    return { isNewBest, previous, best: isNewBest ? candidate : previous };
  }
}
