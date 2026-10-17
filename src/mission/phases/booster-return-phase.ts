/**
 * BOOSTER_RETURN — 1단 부스터 귀환·착륙 (하이라이트 구간).
 * 플레이어 입력은 부스터로 가고, 2단은 그동안 비행 컴퓨터가 자동으로 궤도까지 비행한다.
 */
import { PHASE_INFO } from '../../data/mission-timeline';
import { destroyBooster } from '../booster-finish';
import type { BoosterStep } from '../booster-guidance';
import { canToggleEngine, updateBoosterProgram } from '../booster-program';
import type { MissionContext, Phase } from '../mission-types';
import { autoUpperStageSeco, updateFairing } from '../upper-stage-events';
import { say } from './phase-helpers';

/** 착지·추락 후 장면을 보여 주는 시간 [s] */
const AFTERMATH_S = 4;
/** 일반 모드: 권장 점화 고도의 이 배수 안으로 들어오면 점화 안내 */
const IGNITION_HINT_RATIO = 1.3;
/** 이 고도 아래에서는 배속 해제 [m] */
const WARP_LOCK_ALTITUDE_M = 12_000;

const STEP_MESSAGES: Partial<Record<BoosterStep, string>> = {
  COAST: '부스트백 종료. 그리드 핀 전개 — 관성 비행.',
  ENTRY_BURN: '재진입 연소 시작 — 엔진 3기 점화.',
  DESCENT: '대기권 하강 중. 그리드 핀으로 착륙선을 조준합니다.',
  LANDING_BURN: '착륙 연소 시작 — 중앙 엔진 1기.',
};

/** 리얼 모드: 비행 컴퓨터 권장과 현재 점화 상태가 다를 때의 안내 */
const REAL_MODE_ADVICE: Partial<Record<BoosterStep, { ignite: string; cut: string }>> = {
  BOOSTBACK: { ignite: '부스트백 점화 (3기)', cut: '부스트백 종료 — 착륙선 조준 완료' },
  COAST: { ignite: '재진입 연소 점화 (3기)', cut: '엔진 정지' },
  ENTRY_BURN: { ignite: '재진입 연소 재점화', cut: '재진입 연소 종료 — 감속 완료' },
  DESCENT: { ignite: '착륙 연소 점화! (1기)', cut: '엔진 정지' },
  LANDING_BURN: { ignite: '착륙 연소 재점화', cut: '엔진 정지 — 상승 중' },
};

function promptFor(ctx: MissionContext): string | null {
  const p = ctx.boosterProgram;
  if (!p || !canToggleEngine(p, ctx.difficulty)) return null;
  if (ctx.difficulty.autoPitch) {
    // 일반 모드: 착륙 연소 시점 안내
    if (p.engineRequest) return 'SPACE  부스터 엔진 정지';
    return p.telemetry.altitudeM <= p.ignitionAltitudeM * IGNITION_HINT_RATIO ? 'SPACE  착륙 연소 점화!' : null;
  }
  // 리얼 모드: 비행 컴퓨터 권장을 따라 할지 말지는 플레이어가 정한다
  const advice = REAL_MODE_ADVICE[p.step];
  const recommendOn = p.recommended.engines > 0;
  if (advice && recommendOn && !p.engineRequest) return `SPACE  ${advice.ignite}`;
  if (advice && !recommendOn && p.engineRequest) return `SPACE  ${advice.cut}`;
  if (p.step === 'BOOSTBACK' && p.attitudeHold === 'none' && !p.boostbackFired) return 'B  부스트백 자세 고정';
  return null;
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
            : '부스터 귀환 — B: 부스트백 자세 고정, R: 역추진 자세 고정, A/D: 수동 자세·그리드 핀, Space: 점화/정지.',
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
