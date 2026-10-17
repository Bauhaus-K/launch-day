/**
 * PRE_LAUNCH — 발사 전 Go/No-Go 체크리스트 미니게임.
 * 관람 모드는 비행 컴퓨터가 정답을 판단하고, 일반·리얼 모드는 플레이어가 Space(GO) / H(NO-GO)로 판단한다.
 */
import { CHECKLIST_RULES } from '../../data/checklist';
import { TIME_WARP_STEPS } from '../../data/mission-config';
import { PHASE_INFO } from '../../data/mission-timeline';
import {
  awaitingDecision,
  checklistComplete,
  correctDecision,
  currentItem,
  decide,
  launchConditions,
  updateChecklist,
  type ChecklistDecision,
  type DecisionOutcome,
} from '../checklist';
import type { MissionContext, Phase, PhaseId, PilotInput } from '../mission-types';
import { say } from './phase-helpers';

/** 체크리스트 완료 후 관람 모드가 카운트다운을 시작하기까지 [s] */
const AUTO_COUNTDOWN_DELAY_S = 1.5;

function announce(ctx: MissionContext, outcome: DecisionOutcome): void {
  const { item } = outcome;
  switch (outcome.kind) {
    case 'go':
      say(ctx, `${item.label}: GO`, 'success');
      break;
    case 'missed-fault':
      say(ctx, `판단 오류 — ${item.label}은(는) 한계를 넘었습니다. ${item.missedMessage}`, 'danger');
      break;
    case 'correct-hold':
      say(ctx, `홀드 — ${item.label} 한계 초과 확인. ${item.fixMessage}`, 'warn');
      break;
    case 'false-hold':
      say(ctx, `불필요한 홀드 — ${item.label}은(는) 정상 범위였습니다. 다시 판단하세요.`, 'warn');
      break;
  }
  ctx.bus.emit('checklist:decision', outcome);
}

function playerDecision(ctx: MissionContext, input: PilotInput): ChecklistDecision | null {
  const s = ctx.checklist;
  const item = currentItem(s);
  if (!item) return null;
  if (ctx.difficulty.autoConfirm) {
    return s.pollingS >= CHECKLIST_RULES.autoDecideDelayS ? correctDecision(item) : null;
  }
  if (input.confirm) return 'go';
  if (input.noGo) return 'nogo';
  return null;
}

export function createPreLaunchPhase(): Phase {
  /** 체크리스트가 끝난 phaseTime (끝난 그 스텝의 Space가 카운트다운까지 넘기지 않게) */
  let completedAtS: number | null = null;

  return {
    id: 'PRE_LAUNCH',
    title: PHASE_INFO.PRE_LAUNCH.title,
    enter(ctx) {
      ctx.flying = false;
      completedAtS = null;
    },
    update(ctx: MissionContext, input: PilotInput, dt: number): PhaseId | null {
      const s = ctx.checklist;
      updateChecklist(s, dt, ctx.rng);

      if (!checklistComplete(s)) {
        if (!awaitingDecision(s)) {
          ctx.prompt = null;
          return null;
        }
        ctx.prompt = ctx.difficulty.autoConfirm ? null : 'SPACE  GO   ·   H  NO-GO (홀드)';
        const decision = playerDecision(ctx, input);
        const outcome = decision ? decide(s, decision) : null;
        if (outcome) announce(ctx, outcome);
        if (!checklistComplete(s)) return null;
        // 마지막 항목을 방금 끝냈다
        completedAtS = ctx.phaseTimeS;
        ctx.launchConditions = launchConditions(s);
        const missed = s.missedFaults;
        say(
          ctx,
          missed === 0 ? '모든 항목 GO. 발사 준비 완료.' : `점검 완료 — 놓친 이상 ${missed}건을 안고 발사합니다.`,
          missed === 0 ? 'success' : 'danger',
        );
        return null;
      }

      ctx.prompt = 'SPACE  카운트다운 시작';
      const since = ctx.phaseTimeS - (completedAtS ?? 0);
      if (ctx.difficulty.autoConfirm) return since >= AUTO_COUNTDOWN_DELAY_S ? 'COUNTDOWN' : null;
      return input.confirm && since > 0 ? 'COUNTDOWN' : null;
    },
    maxWarp: () => TIME_WARP_STEPS[0],
  };
}
