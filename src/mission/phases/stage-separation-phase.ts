import { PHASE_RULES } from '../../data/mission-config';
import { PHASE_INFO } from '../../data/mission-timeline';
import { separateStages } from '../../rocket/stack';
import { createBoosterProgram } from '../booster-program';
import type { Phase } from '../mission-types';
import { confirmed, say } from './phase-helpers';
import { t } from '../../i18n';

export const stageSeparationPhase: Phase = {
  id: 'STAGE_SEPARATION',
  title: PHASE_INFO.STAGE_SEPARATION.title,
  enter(ctx) {
    const { upperStage, booster } = separateStages(ctx.vehicle, ctx.cfg);
    ctx.vehicle = upperStage;
    ctx.booster = booster;
    ctx.previousBoosterPos = booster.pos;
    ctx.boosterProgram = createBoosterProgram(booster, ctx.cfg);
    ctx.boosterCommand = { engines: 0, throttle: 0, pitchRad: booster.pitchRad, finSteer: 0 };
    ctx.bus.emit('stage:separated', { missionTimeS: ctx.missionTimeS });
    say(ctx, t('msg.separation'), 'success');
  },
  update(ctx, input) {
    if (ctx.phaseTimeS < PHASE_RULES.separationSettleS) return null;
    ctx.prompt = t('prompt.ses');
    const autoDelay = PHASE_RULES.separationSettleS + PHASE_RULES.autoSesDelayS;
    return confirmed(ctx, input.confirm, autoDelay) ? 'SES' : null;
  },
  maxWarp: () => 1,
};
