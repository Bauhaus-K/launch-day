import { PHASE_RULES } from '../../data/mission-config';
import { PHASE_INFO } from '../../data/mission-timeline';
import type { Phase } from '../mission-types';
import { say } from './phase-helpers';
import { t } from '../../i18n';

export const mecoPhase: Phase = {
  id: 'MECO',
  title: PHASE_INFO.MECO.title,
  enter(ctx) {
    ctx.vehicle = { ...ctx.vehicle, enginesOn: false };
    ctx.bus.emit('engine:cutoff', { stage: 1 });
    say(ctx, t('msg.meco'), 'success');
  },
  update(ctx) {
    return ctx.phaseTimeS >= PHASE_RULES.mecoCoastS ? 'STAGE_SEPARATION' : null;
  },
  maxWarp: () => 1,
};
