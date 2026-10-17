import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/data/difficulty';
import { FIXED_TIMESTEP_S, TARGET_ORBIT } from '../src/data/mission-config';
import { HELIOS9_STACK } from '../src/data/rocket-specs';
import { COUNTDOWN_CALLOUTS } from '../src/data/mission-timeline';
import { Mission } from '../src/mission/mission';
import { NO_INPUT, type PhaseId, type PilotInput } from '../src/mission/mission-types';
import { computeResult } from '../src/mission/scoring';

/** 일반 모드 플레이어 흉내: 권장 점화 고도에서 Space, 권장 스로틀을 W/S로 따라간다 */
function skilledNormalPilot(m: Mission): PilotInput {
  const p = m.ctx.boosterProgram;
  if (m.phase.id !== 'BOOSTER_RETURN') return { ...NO_INPUT, confirm: m.phase.id !== 'ORBIT_INSERTION' };
  if (!p) return NO_INPUT;
  const ignite = p.step === 'DESCENT' && !p.engineRequest && p.telemetry.altitudeM <= p.ignitionAltitudeM;
  const diff = p.recommended.throttle - p.manualThrottle;
  return { throttleAxis: Math.abs(diff) > 0.01 ? Math.sign(diff) : 0, pitchAxis: 0, confirm: ignite };
}

/** 부스터 조종·SECO 구간을 빼고 Space를 누른다 */
const confirmOutsideBooster = (m: Mission): PilotInput => ({
  ...NO_INPUT,
  confirm: m.phase.id !== 'BOOSTER_RETURN' && m.phase.id !== 'ORBIT_INSERTION',
});

/** 최대 시뮬레이션 시간 [s] */
const MAX_SIM_S = 1_500;

function runMission(mission: Mission, inputFor: (m: Mission) => PilotInput = () => NO_INPUT) {
  const phases: PhaseId[] = [];
  mission.bus.on('phase:changed', (e) => phases.push(e.to));
  mission.start();
  for (let t = 0; t < MAX_SIM_S && !mission.finished; t += FIXED_TIMESTEP_S) {
    mission.update(inputFor(mission), FIXED_TIMESTEP_S);
  }
  return phases;
}

describe('Mission 상태 머신', () => {
  it('관람 모드는 자동으로 궤도에 진입한다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.spectator);
    const phases = runMission(mission);

    expect(phases).toEqual([
      'PRE_LAUNCH',
      'COUNTDOWN',
      'LIFTOFF',
      'MAX_Q',
      'MECO',
      'STAGE_SEPARATION',
      'SES',
      'BOOSTER_RETURN',
      'ORBIT_INSERTION',
      'RESULT',
    ]);
    const result = mission.ctx.result;
    expect(result?.success).toBe(true);
    expect(result?.periapsisAltitudeM).toBeGreaterThan(TARGET_ORBIT.minPeriapsisM);
    // 자동 스로틀은 Max-Q 하중을 허용치 아래로 유지해야 한다
    expect(mission.ctx.stats.stress).toBe(0);
    expect(['S', 'A']).toContain(result?.grade);
    // 부스터도 자동으로 착륙선에 내려앉는다
    expect(result?.booster?.landed).toBe(true);
    expect(mission.ctx.booster?.status).toBe('landed');
  });

  it('일반 모드: 권장 시점에 착륙 연소를 직접 하면 부스터가 착륙한다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.normal);
    runMission(mission, skilledNormalPilot);
    expect(mission.ctx.result?.success).toBe(true);
    expect(mission.ctx.result?.booster?.landed).toBe(true);
  });

  it('일반 모드: 착륙 연소를 하지 않으면 부스터를 잃지만 궤도 미션은 계속된다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.normal);
    runMission(mission, confirmOutsideBooster);
    expect(mission.ctx.result?.booster?.landed).toBe(false);
    expect(mission.ctx.result?.success).toBe(true);
  });

  it('리얼 모드: 부스터를 조종하지 않으면 잃는다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.real);
    const phases = runMission(mission, confirmOutsideBooster);
    expect(phases).toContain('BOOSTER_RETURN');
    expect(mission.ctx.result?.booster?.landed).toBe(false);
  });

  it('일반 모드: Space 없이는 카운트다운이 시작되지 않는다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.normal);
    mission.start();
    for (let i = 0; i < 60 * 30; i++) mission.update(NO_INPUT, FIXED_TIMESTEP_S);
    expect(mission.phase.id).toBe('PRE_LAUNCH');
    expect(mission.ctx.prompt).not.toBeNull();
  });

  it('일반 모드: 스로틀을 줄이지 않으면 Max-Q 스트레스가 쌓인다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.normal);
    runMission(mission, () => ({ ...NO_INPUT, confirm: true }));
    expect(mission.ctx.stats.stress).toBeGreaterThan(0);
    expect(mission.ctx.result).not.toBeNull();
  });

  it('리얼 모드: 자세를 수직으로 고정하면 궤도에 오르지 못한다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.real);
    // 피치 업 입력을 계속 → 90° 유지, Space는 계속 눌러 단계만 진행
    runMission(mission, () => ({ throttleAxis: -1, pitchAxis: 1, confirm: true }));
    expect(mission.ctx.result?.success).toBe(false);
    expect(mission.ctx.result?.grade).toBe('F');
  });

  it('카운트다운 콜아웃은 T-60부터 빠짐없이 한 번씩 나온다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.spectator);
    const texts: string[] = [];
    mission.bus.on('mission:message', (m) => texts.push(m.text));
    mission.start();
    while (mission.phase.id !== 'LIFTOFF') mission.update(NO_INPUT, FIXED_TIMESTEP_S);
    expect(texts.slice(0, COUNTDOWN_CALLOUTS.length)).toEqual(COUNTDOWN_CALLOUTS.map((c) => c.text));
  });

  it('카운트다운 중 T-10 이후에는 배속이 1x로 제한된다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.spectator);
    mission.start();
    while (mission.phase.id !== 'COUNTDOWN') mission.update(NO_INPUT, FIXED_TIMESTEP_S);
    expect(mission.maxWarp()).toBeGreaterThan(1);
    while (mission.ctx.missionTimeS < -5) mission.update(NO_INPUT, FIXED_TIMESTEP_S);
    expect(mission.maxWarp()).toBe(1);
  });
});

describe('scoring', () => {
  const base = {
    success: true,
    reason: '',
    apoapsisAltitudeM: TARGET_ORBIT.altitudeM,
    periapsisAltitudeM: TARGET_ORBIT.altitudeM,
    stage2FuelFraction: 0.1,
    stress: 0,
    maxDynamicPressurePa: 25_000,
    flightTimeS: 500,
    booster: {
      landed: true,
      reason: '',
      verticalSpeedMps: 0,
      horizontalSpeedMps: 0,
      distanceM: 0,
      tiltRad: 0,
    },
  };

  it('완벽한 궤도·연료 여유·무손상이면 100점 S등급', () => {
    const r = computeResult(base);
    expect(r.score).toBe(100);
    expect(r.grade).toBe('S');
  });

  it('실패하면 F등급', () => {
    expect(computeResult({ ...base, success: false }).grade).toBe('F');
  });

  it('부스터를 잃으면 착륙 점수가 0', () => {
    const r = computeResult({ ...base, booster: { ...base.booster, landed: false } });
    expect(r.items.find((i) => i.label === '부스터 착륙')?.points).toBe(0);
    expect(r.score).toBeLessThan(computeResult(base).score);
  });

  it('스트레스가 높을수록 감점', () => {
    expect(computeResult({ ...base, stress: 0.5 }).score).toBeLessThan(computeResult(base).score);
  });
});
