import { PHASE_INFO } from '../../data/mission-timeline';
import type { Phase } from '../mission-types';
import { updateFairing } from '../upper-stage-events';
import { say } from './phase-helpers';

/** 2단 정상 연소를 확인한 뒤 부스터 조종으로 넘어가기까지 [s] */
const SES_STABLE_S = 3;

export const sesPhase: Phase = {
  id: 'SES',
  title: PHASE_INFO.SES.title,
  enter(ctx) {
    ctx.vehicle = { ...ctx.vehicle, enginesOn: true };
    ctx.sesTimeS = ctx.missionTimeS;
    ctx.bus.emit('engine:ignition', { stage: 2 });
    say(ctx, 'SES — 2단 엔진 점화. 정상 연소 중.', 'success');
  },
  update(ctx) {
    updateFairing(ctx);
    if (ctx.phaseTimeS < SES_STABLE_S) return null;
    return ctx.booster?.status === 'flying' ? 'BOOSTER_RETURN' : 'ORBIT_INSERTION';
  },
  maxWarp: () => 1,
};
