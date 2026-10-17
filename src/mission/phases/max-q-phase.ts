import { STRUCTURE } from '../../data/mission-config';
import { PHASE_INFO } from '../../data/mission-timeline';
import { STAGE1_LANDING_RESERVE_FRACTION } from '../../data/rocket-specs';
import type { Phase } from '../mission-types';
import { say } from './phase-helpers';
import { t } from '../../i18n';

/** 동압이 최댓값의 이 비율 아래로 내려가면 "Max-Q 통과"로 본다 */
const MAX_Q_PASSED_RATIO = 0.6;
/** 최대 동압이 이 값 이상일 때만 통과 판정 [Pa] (이륙 직후 오판 방지) */
const MAX_Q_MIN_PEAK_PA = 5_000;
/** 하중 경고 메시지 재표시 간격 [s] */
const WARNING_COOLDOWN_S = 4;

export function createMaxQPhase(): Phase {
  let enteredMaxQ = false;
  let passedMaxQ = false;
  let lastWarningAt = -Infinity;

  return {
    id: 'MAX_Q',
    title: PHASE_INFO.MAX_Q.title,
    enter() {
      enteredMaxQ = false;
      passedMaxQ = false;
      lastWarningAt = -Infinity;
    },
    update(ctx) {
      const { stats, telemetry } = ctx;

      if (!enteredMaxQ && stats.loadRatio >= STRUCTURE.warpLockRatio) {
        enteredMaxQ = true;
        ctx.bus.emit('maxq:entered', {});
        say(ctx, t('msg.maxQEntered'), 'warn');
      }
      if (
        !passedMaxQ &&
        stats.maxDynamicPressurePa >= MAX_Q_MIN_PEAK_PA &&
        telemetry.dynamicPressurePa < stats.maxDynamicPressurePa * MAX_Q_PASSED_RATIO
      ) {
        passedMaxQ = true;
        say(ctx, t('msg.maxQPassed', { kpa: (stats.maxDynamicPressurePa / 1000).toFixed(1) }), 'success');
      }

      if (
        !ctx.difficulty.autoThrottle &&
        stats.loadRatio >= STRUCTURE.warningRatio &&
        ctx.phaseTimeS - lastWarningAt > WARNING_COOLDOWN_S
      ) {
        lastWarningAt = ctx.phaseTimeS;
        say(ctx, t('msg.loadWarning'), 'danger');
      }

      const reserve = ctx.cfg.stage1.propellantMassKg * STAGE1_LANDING_RESERVE_FRACTION;
      if (ctx.vehicle.stage1PropellantKg <= reserve) return 'MECO';
      return null;
    },
    maxWarp: (ctx) => (ctx.stats.loadRatio >= STRUCTURE.warpLockRatio ? 1 : Infinity),
  };
}
