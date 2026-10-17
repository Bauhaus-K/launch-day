import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/data/difficulty';
import { FIXED_TIMESTEP_S, RECORDER } from '../src/data/mission-config';
import { HELIOS9_STACK } from '../src/data/rocket-specs';
import { Mission } from '../src/mission/mission';
import { NO_INPUT } from '../src/mission/mission-types';
import { niceTicks } from '../src/ui/line-chart';

describe('비행 기록', () => {
  it('발사 후 일정 간격으로 샘플을 남기고 주요 사건을 표시한다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.spectator);
    mission.start();
    while (mission.ctx.missionTimeS < 200) mission.update(NO_INPUT, FIXED_TIMESTEP_S);
    const log = mission.ctx.flightLog;

    expect(log.vehicle[0]?.t).toBeGreaterThanOrEqual(0);
    const gaps = log.vehicle.slice(1).map((s, i) => s.t - (log.vehicle[i]?.t ?? 0));
    for (const gap of gaps) expect(gap).toBeCloseTo(RECORDER.sampleIntervalS, 1);
    expect(log.events.map((e) => e.label)).toEqual(['Max-Q', 'MECO', 'SES']);
    // 분리 후 부스터 궤적과 착륙선 위치도 기록된다
    expect(log.booster.length).toBeGreaterThan(0);
    expect(log.shipDownrangeM).not.toBeNull();
  });
});

describe('그래프 눈금', () => {
  it('1·2·5 단위의 보기 좋은 값', () => {
    expect(niceTicks(0, 200)).toEqual([0, 50, 100, 150, 200]);
    expect(niceTicks(0, 7)).toEqual([0, 2, 4, 6]);
  });
});
