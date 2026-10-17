/**
 * BOOSTER_RETURN — 1단 부스터 귀환·착륙 (하이라이트 구간).
 * 플레이어 입력은 부스터로 가고, 2단은 그동안 비행 컴퓨터가 자동으로 궤도까지 비행한다.
 */
import { LANDING_BURN_MAX_ALTITUDE_M } from '../../data/booster-config';
import { PHASE_INFO } from '../../data/mission-timeline';
import { destroyBooster } from '../booster-finish';
import type { BoosterStep } from '../booster-guidance';
import { canToggleEngine, updateBoosterProgram } from '../booster-program';
import type { MissionContext, Phase } from '../mission-types';
import { autoUpperStageSeco, updateFairing } from '../upper-stage-events';
import { say } from './phase-helpers';

/** 착지·추락 후 장면을 보여 주는 시간 [s] */
const AFTERMATH_S = 4;
/** 이 고도 아래에서는 배속 해제 [m] */
const WARP_LOCK_ALTITUDE_M = 12_000;

const STEP_MESSAGES: Partial<Record<BoosterStep, string>> = {
  COAST: '부스트백 종료. 그리드 핀 전개 — 관성 비행.',
  ENTRY_BURN: '재진입 연소 시작 — 엔진 3기 점화.',
  DESCENT: '대기권 하강 중. 그리드 핀으로 착륙선을 조준합니다.',
  LANDING_BURN: '착륙 연소 시작 — 중앙 엔진 1기.',
};

function promptFor(ctx: MissionContext): string | null {
  const p = ctx.boosterProgram;
  if (!p || !canToggleEngine(p, ctx.difficulty)) return null;
  if (p.engineRequest) return 'SPACE  부스터 엔진 정지';
  if (ctx.difficulty.autoPitch) {
    // 일반 모드: 착륙 연소 시점 안내
    return p.telemetry.altitudeM <= p.ignitionAltitudeM * 1.3 ? 'SPACE  착륙 연소 점화!' : null;
  }
  const engines = p.telemetry.altitudeM > LANDING_BURN_MAX_ALTITUDE_M && p.step !== 'DESCENT' ? '3기' : '1기';
  return `SPACE  부스터 엔진 점화 (${engines})`;
}

export function createBoosterReturnPhase(): Phase {
  let doneAtS: number | null = null;

  return {
    id: 'BOOSTER_RETURN',
    title: PHASE_INFO.BOOSTER_RETURN.title,
    controlsBooster: true,
    enter(ctx) {
      doneAtS = null;
      const mode = ctx.difficulty;
      say(
        ctx,
        mode.autoConfirm
          ? '부스터 귀환 시작 — 비행 컴퓨터가 착륙선까지 유도합니다.'
          : mode.autoPitch
            ? '부스터 귀환 — 착륙 연소 점화(Space)와 스로틀(W/S)은 직접 조종하세요.'
            : '부스터 귀환 — 자세(A/D)로 뒤집고 Space로 점화해 착륙선까지 돌아오세요.',
        'warn',
      );
    },
    update(ctx, input, dt) {
      updateFairing(ctx);
      autoUpperStageSeco(ctx);

      const b = ctx.booster;
      const p = ctx.boosterProgram;
      if (!b || !p) return 'ORBIT_INSERTION';

      if (b.status === 'flying') {
        const result = updateBoosterProgram(p, b, input, ctx.difficulty, ctx.cfg, dt);
        ctx.boosterCommand = result.command;
        if (result.patch.finsDeployed || result.patch.legsDeployed) {
          ctx.booster = { ...b, ...result.patch };
          if (result.patch.legsDeployed) say(ctx, '착륙 다리 전개.');
        }
        if (result.stepChanged) {
          ctx.bus.emit('booster:step', { step: result.stepChanged });
          const msg = STEP_MESSAGES[result.stepChanged];
          if (msg) say(ctx, msg);
        }
        if (result.destroyed) destroyBooster(ctx, '재진입 가열로 부스터가 공중 분해되었습니다 (재진입 연소 부족)');
        ctx.prompt = promptFor(ctx);
        return null;
      }

      ctx.prompt = null;
      doneAtS ??= ctx.phaseTimeS;
      return ctx.phaseTimeS - doneAtS >= AFTERMATH_S ? 'ORBIT_INSERTION' : null;
    },
    maxWarp(ctx) {
      const p = ctx.boosterProgram;
      const b = ctx.booster;
      if (!p || !b || b.status !== 'flying') return 1;
      if (b.engines > 0 || p.telemetry.altitudeM < WARP_LOCK_ALTITUDE_M) return 1;
      return Infinity;
    },
  };
}
