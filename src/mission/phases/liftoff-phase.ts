import { PHASE_RULES } from '../../data/mission-config';
import { PHASE_INFO } from '../../data/mission-timeline';
import { ROCKET_NAME } from '../../data/rocket-specs';
import type { Phase } from '../mission-types';
import { say } from './phase-helpers';
import { t } from '../../i18n';

export const liftoffPhase: Phase = {
  id: 'LIFTOFF',
  title: PHASE_INFO.LIFTOFF.title,
  enter(ctx) {
    say(ctx, t('msg.liftoff', { rocket: ROCKET_NAME }), 'success');
  },
  update(ctx) {
    if (ctx.telemetry.altitudeM >= PHASE_RULES.liftoffClearAltitudeM) {
      say(ctx, t('msg.towerCleared'));
      return 'MAX_Q';
    }
    return null;
  },
  maxWarp: () => 1,
};
