import { PHASE_RULES } from '../../data/mission-config';
import { PHASE_INFO } from '../../data/mission-timeline';
import type { Phase } from '../mission-types';
import { say } from './phase-helpers';

export const mecoPhase: Phase = {
  id: 'MECO',
  title: PHASE_INFO.MECO.title,
  enter(ctx) {
    ctx.vehicle = { ...ctx.vehicle, enginesOn: false };
    ctx.bus.emit('engine:cutoff', { stage: 1 });
    say(ctx, 'MECO — 1단 주 엔진 정지. 부스터 귀환 연료 확보.', 'success');
  },
  update(ctx) {
    return ctx.phaseTimeS >= PHASE_RULES.mecoCoastS ? 'STAGE_SEPARATION' : null;
  },
  maxWarp: () => 1,
};
