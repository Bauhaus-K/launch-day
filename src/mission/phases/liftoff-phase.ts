import { PHASE_RULES } from '../../data/mission-config';
import { PHASE_INFO } from '../../data/mission-timeline';
import { ROCKET_NAME } from '../../data/rocket-specs';
import type { Phase } from '../mission-types';
import { say } from './phase-helpers';

export const liftoffPhase: Phase = {
  id: 'LIFTOFF',
  title: PHASE_INFO.LIFTOFF.title,
  enter(ctx) {
    say(ctx, `이륙! ${ROCKET_NAME}가 발사대를 떠났습니다.`, 'success');
  },
  update(ctx) {
    if (ctx.telemetry.altitudeM >= PHASE_RULES.liftoffClearAltitudeM) {
      say(ctx, '발사탑 통과. 피치 프로그램 시작.');
      return 'MAX_Q';
    }
    return null;
  },
  maxWarp: () => 1,
};
