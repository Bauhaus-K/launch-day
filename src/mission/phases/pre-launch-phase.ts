import { TIME_WARP_STEPS } from '../../data/mission-config';
import { PHASE_INFO, PRELAUNCH_CHECK_INTERVAL_S, PRELAUNCH_CHECKS } from '../../data/mission-timeline';
import type { MissionContext, Phase, PhaseId, PilotInput } from '../mission-types';
import { confirmed } from './phase-helpers';

/** 완료된 점검 항목 수 (HUD도 같은 함수로 표시) */
export function completedChecks(phaseTimeS: number): number {
  return Math.min(PRELAUNCH_CHECKS.length, Math.floor(phaseTimeS / PRELAUNCH_CHECK_INTERVAL_S));
}

const ALL_CHECKS_TIME_S = PRELAUNCH_CHECKS.length * PRELAUNCH_CHECK_INTERVAL_S;

export const preLaunchPhase: Phase = {
  id: 'PRE_LAUNCH',
  title: PHASE_INFO.PRE_LAUNCH.title,
  enter(ctx) {
    ctx.flying = false;
  },
  update(ctx: MissionContext, input: PilotInput): PhaseId | null {
    if (completedChecks(ctx.phaseTimeS) < PRELAUNCH_CHECKS.length) return null;
    ctx.prompt = 'SPACE  카운트다운 시작';
    // 관람 모드: 점검 완료 후 1항목 간격만큼 기다렸다가 자동 진행
    if (confirmed(ctx, input.confirm, ALL_CHECKS_TIME_S + PRELAUNCH_CHECK_INTERVAL_S)) return 'COUNTDOWN';
    return null;
  },
  maxWarp: () => TIME_WARP_STEPS[0],
};
