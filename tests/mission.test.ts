import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/data/difficulty';
import { FIXED_TIMESTEP_S, TARGET_ORBIT } from '../src/data/mission-config';
import { HELIOS9_STACK } from '../src/data/rocket-specs';
import { COUNTDOWN_CALLOUTS } from '../src/data/mission-timeline';
import { Mission } from '../src/mission/mission';
import { NO_INPUT, type PhaseId, type PilotInput } from '../src/mission/mission-types';
import { computeResult } from '../src/mission/scoring';
import { awaitingDecision, checklistComplete, correctDecision, currentItem } from '../src/mission/checklist';
import { autoFinSteer } from '../src/mission/booster-guidance';
import { shouldAutoSeco } from '../src/mission/guidance';

/** 일반 모드 플레이어 흉내: 권장 점화 고도에서 Space, 권장 스로틀을 W/S로 따라간다 */
function skilledNormalPilot(m: Mission): PilotInput {
  const p = m.ctx.boosterProgram;
  if (m.phase.id !== 'BOOSTER_RETURN') return { ...NO_INPUT, confirm: m.phase.id !== 'ORBIT_INSERTION' };
  if (!p) return NO_INPUT;
  const ignite = p.step === 'DESCENT' && !p.engineRequest && p.telemetry.altitudeM <= p.ignitionAltitudeM;
  const diff = p.recommended.throttle - p.manualThrottle;
  return { throttleAxis: Math.abs(diff) > 0.01 ? Math.sign(diff) : 0, pitchAxis: 0, confirm: ignite };
}

/**
 * 리얼 모드 플레이어 흉내: 상승은 권장 피치·스로틀을 키로 따라가고, 부스터는 B/R 자세 고정과
 * 화면 안내(0.3초 이상 유지될 때만 Space)를 따른다. 그리드 핀은 A/D로 낙하점 오차를 줄인다.
 */
function createRealPilot(): (m: Mission) => PilotInput {
  let mismatchS = 0;
  return (m) => {
    const c = m.ctx;
    const p = c.boosterProgram;
    const b = c.booster;
    if (m.phase.id !== 'BOOSTER_RETURN' || !p || !b) {
      const dp = c.recommended.pitchRad - c.command.pitchRad;
      const dt = c.recommended.throttle - c.command.throttle;
      return {
        throttleAxis: Math.abs(dt) > 0.01 ? Math.sign(dt) : 0,
        pitchAxis: Math.abs(dp) > 0.002 ? Math.sign(dp) : 0,
        confirm: m.phase.id !== 'ORBIT_INSERTION' || shouldAutoSeco(c.telemetry),
      };
    }
    let hold: PilotInput['hold'] = null;
    if (p.step === 'BOOSTBACK' && !p.boostbackFired && p.attitudeHold !== 'boostback') hold = 'boostback';
    else if (p.step !== 'BOOSTBACK' && p.attitudeHold !== 'retrograde') hold = 'retrograde';
    mismatchS = (p.recommended.engines > 0) !== p.engineRequest ? mismatchS + FIXED_TIMESTEP_S : 0;
    const confirm = mismatchS >= 0.3;
    if (confirm) mismatchS = 0;
    const dthr = p.recommended.throttle - p.manualThrottle;
    let pitchAxis = 0;
    if (b.engines === 0 && b.finsDeployed) {
      const steer = autoFinSteer(p.telemetry);
      pitchAxis = Math.abs(steer) > 0.2 ? -Math.sign(steer) : 0;
    }
    return { throttleAxis: Math.abs(dthr) > 0.01 ? Math.sign(dthr) : 0, pitchAxis, confirm, hold };
  };
}

/** 부스터 조종·SECO 구간을 빼고 Space를 누른다 */
const confirmOutsideBooster = (m: Mission): PilotInput => ({
  ...NO_INPUT,
  confirm: m.phase.id !== 'BOOSTER_RETURN' && m.phase.id !== 'ORBIT_INSERTION',
});

/** 체크리스트 이상 항목 배치를 고정해 결과를 재현 가능하게 */
const TEST_SEED = 7;

/** 체크리스트를 정답으로 판단하고, 끝나면 카운트다운을 시작한다 */
function checklistInput(m: Mission): PilotInput {
  const s = m.ctx.checklist;
  const item = currentItem(s);
  if (checklistComplete(s)) return { ...NO_INPUT, confirm: true };
  if (!item || !awaitingDecision(s)) return NO_INPUT;
  return correctDecision(item) === 'go' ? { ...NO_INPUT, confirm: true } : { ...NO_INPUT, noGo: true };
}

/** 최대 시뮬레이션 시간 [s] */
const MAX_SIM_S = 1_500;

function runMission(mission: Mission, inputFor: (m: Mission) => PilotInput = () => NO_INPUT) {
  const phases: PhaseId[] = [];
  mission.bus.on('phase:changed', (e) => phases.push(e.to));
  mission.start();
  for (let t = 0; t < MAX_SIM_S && !mission.finished; t += FIXED_TIMESTEP_S) {
    const input = mission.phase.id === 'PRE_LAUNCH' ? checklistInput(mission) : inputFor(mission);
    mission.update(input, FIXED_TIMESTEP_S);
  }
  return phases;
}

describe('Mission 상태 머신', () => {
  it('관람 모드는 자동으로 궤도에 진입한다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.spectator, { seed: TEST_SEED });
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
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.normal, { seed: TEST_SEED });
    runMission(mission, skilledNormalPilot);
    expect(mission.ctx.result?.success).toBe(true);
    expect(mission.ctx.result?.booster?.landed).toBe(true);
  });

  it('일반 모드: 착륙 연소를 하지 않으면 부스터를 잃지만 궤도 미션은 계속된다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.normal, { seed: TEST_SEED });
    runMission(mission, confirmOutsideBooster);
    expect(mission.ctx.result?.booster?.landed).toBe(false);
    expect(mission.ctx.result?.success).toBe(true);
  });

  it('리얼 모드: 안내와 자세 고정(B/R)을 따르면 직접 착륙할 수 있다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.real, { seed: TEST_SEED });
    runMission(mission, createRealPilot());
    expect(mission.ctx.result?.success).toBe(true);
    expect(mission.ctx.result?.booster?.landed).toBe(true);
  });

  it('리얼 모드: 직접 자세를 조작하면 자세 고정이 풀린다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.real, { seed: TEST_SEED });
    mission.start();
    while (mission.phase.id !== 'BOOSTER_RETURN') {
      mission.update(confirmOutsideBooster(mission), FIXED_TIMESTEP_S);
    }
    mission.update({ ...NO_INPUT, hold: 'boostback' }, FIXED_TIMESTEP_S);
    expect(mission.ctx.boosterProgram?.attitudeHold).toBe('boostback');
    mission.update({ ...NO_INPUT, pitchAxis: 1 }, FIXED_TIMESTEP_S);
    expect(mission.ctx.boosterProgram?.attitudeHold).toBe('none');
  });

  it('리얼 모드: 부스터를 조종하지 않으면 잃는다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.real, { seed: TEST_SEED });
    const phases = runMission(mission, confirmOutsideBooster);
    expect(phases).toContain('BOOSTER_RETURN');
    expect(mission.ctx.result?.booster?.landed).toBe(false);
  });

  it('일반 모드: Space 없이는 카운트다운이 시작되지 않는다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.normal, { seed: TEST_SEED });
    mission.start();
    for (let i = 0; i < 60 * 30; i++) mission.update(NO_INPUT, FIXED_TIMESTEP_S);
    expect(mission.phase.id).toBe('PRE_LAUNCH');
    expect(mission.ctx.prompt).not.toBeNull();
  });

  it('일반 모드: 스로틀을 줄이지 않으면 Max-Q 스트레스가 쌓인다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.normal, { seed: TEST_SEED });
    runMission(mission, () => ({ ...NO_INPUT, confirm: true }));
    expect(mission.ctx.stats.stress).toBeGreaterThan(0);
    expect(mission.ctx.result).not.toBeNull();
  });

  it('리얼 모드: 자세를 수직으로 고정하면 궤도에 오르지 못한다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.real, { seed: TEST_SEED });
    // 피치 업 입력을 계속 → 90° 유지, Space는 계속 눌러 단계만 진행
    runMission(mission, () => ({ throttleAxis: -1, pitchAxis: 1, confirm: true }));
    expect(mission.ctx.result?.success).toBe(false);
    expect(mission.ctx.result?.grade).toBe('F');
  });

  it('체크리스트에서 이상을 GO로 넘기면 감점되고, 정답이면 만점', () => {
    const careless = new Mission(HELIOS9_STACK, DIFFICULTIES.normal, { seed: TEST_SEED });
    careless.start();
    while (careless.phase.id === 'PRE_LAUNCH') careless.update({ ...NO_INPUT, confirm: true }, FIXED_TIMESTEP_S);
    expect(careless.ctx.checklist.missedFaults).toBe(careless.ctx.checklist.faultCount);

    const careful = new Mission(HELIOS9_STACK, DIFFICULTIES.normal, { seed: TEST_SEED });
    careful.start();
    while (careful.phase.id === 'PRE_LAUNCH') careful.update(checklistInput(careful), FIXED_TIMESTEP_S);
    expect(careful.ctx.checklist.missedFaults).toBe(0);
    expect(careful.ctx.checklist.falseHolds).toBe(0);
  });

  it('카운트다운 콜아웃은 T-60부터 빠짐없이 한 번씩 나온다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.spectator, { seed: TEST_SEED });
    const texts: string[] = [];
    mission.bus.on('mission:message', (m) => {
      if (mission.phase.id === 'COUNTDOWN') texts.push(m.text);
    });
    mission.start();
    while (mission.phase.id !== 'LIFTOFF') mission.update(NO_INPUT, FIXED_TIMESTEP_S);
    expect(texts.slice(0, COUNTDOWN_CALLOUTS.length)).toEqual(COUNTDOWN_CALLOUTS.map((c) => c.text));
  });

  it('카운트다운 중 T-10 이후에는 배속이 1x로 제한된다', () => {
    const mission = new Mission(HELIOS9_STACK, DIFFICULTIES.spectator, { seed: TEST_SEED });
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
    checklist: { faultCount: 1, missedFaults: 0, falseHolds: 0 },
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

  it('체크리스트 실수는 감점', () => {
    const missed = computeResult({ ...base, checklist: { faultCount: 1, missedFaults: 1, falseHolds: 0 } });
    expect(missed.score).toBeLessThan(computeResult(base).score);
  });

  it('스트레스가 높을수록 감점', () => {
    expect(computeResult({ ...base, stress: 0.5 }).score).toBeLessThan(computeResult(base).score);
  });
});
