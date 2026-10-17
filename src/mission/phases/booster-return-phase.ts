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
import { t, type MessageKey } from '../../i18n';

/** 착지·추락 후 장면을 보여 주는 시간 [s] */
const AFTERMATH_S = 4;
/** 일반 모드: 권장 점화 고도의 이 배수 안으로 들어오면 점화 안내 */
const IGNITION_HINT_RATIO = 1.3;
/** 이 고도 아래에서는 배속 해제 [m] */
const WARP_LOCK_ALTITUDE_M = 12_000;

const STEP_MESSAGES: Partial<Record<BoosterStep, MessageKey>> = {
  COAST: 'msg.boosterStep.COAST',
  ENTRY_BURN: 'msg.boosterStep.ENTRY_BURN',
  DESCENT: 'msg.boosterStep.DESCENT',
  LANDING_BURN: 'msg.boosterStep.LANDING_BURN',
};

/** 리얼 모드: 비행 컴퓨터 권장과 현재 점화 상태가 다를 때의 안내 */
type AdviceStep = Exclude<BoosterStep, 'DONE'>;
const isAdviceStep = (step: BoosterStep): step is AdviceStep => step !== 'DONE';

function promptFor(ctx: MissionContext): string | null {
  const p = ctx.boosterProgram;
  if (!p || !canToggleEngine(p, ctx.difficulty)) return null;
  if (ctx.difficulty.autoPitch) {
    // 일반 모드: 착륙 연소 시점 안내
    if (p.engineRequest) return t('prompt.boosterCut');
    return p.telemetry.altitudeM <= p.ignitionAltitudeM * IGNITION_HINT_RATIO ? t('prompt.landingIgnite') : null;
  }
  // 리얼 모드: 비행 컴퓨터 권장을 따라 할지 말지는 플레이어가 정한다
  const step = p.step;
  const recommendOn = p.recommended.engines > 0;
  if (isAdviceStep(step) && recommendOn && !p.engineRequest) {
    return t('prompt.space', { action: t(`advice.${step}.ignite`) });
  }
  if (isAdviceStep(step) && !recommendOn && p.engineRequest) {
    return t('prompt.space', { action: t(`advice.${step}.cut`) });
  }
  if (p.step === 'BOOSTBACK' && p.attitudeHold === 'none' && !p.boostbackFired) return t('prompt.holdBoostback');
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
          ? t('msg.boosterReturn.auto')
          : mode.autoPitch
            ? t('msg.boosterReturn.normal')
            : t('msg.boosterReturn.real'),
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
          if (result.patch.legsDeployed) say(ctx, t('msg.legsDeployed'));
        }
        if (result.stepChanged) {
          ctx.bus.emit('booster:step', { step: result.stepChanged });
          const msg = STEP_MESSAGES[result.stepChanged];
          if (msg) say(ctx, t(msg));
        }
        if (result.destroyed) destroyBooster(ctx, t('outcome.boosterHeating'));
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
