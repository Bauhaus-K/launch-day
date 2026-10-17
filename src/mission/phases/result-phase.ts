import { PHASE_INFO } from '../../data/mission-timeline';
import { computeResult } from '../scoring';
import type { Phase } from '../mission-types';
import { t } from '../../i18n';

export const resultPhase: Phase = {
  id: 'RESULT',
  title: PHASE_INFO.RESULT.title,
  enter(ctx) {
    ctx.flying = false;
    ctx.prompt = null;
    const outcome = ctx.outcome ?? { success: false, reason: t('outcome.aborted') };
    ctx.result = computeResult({
      success: outcome.success,
      reason: outcome.reason,
      apoapsisAltitudeM: ctx.telemetry.orbit.apoapsisAltitudeM,
      periapsisAltitudeM: ctx.telemetry.orbit.periapsisAltitudeM,
      stage2FuelFraction: ctx.vehicle.stage2PropellantKg / ctx.cfg.stage2.propellantMassKg,
      stress: ctx.stats.stress,
      maxDynamicPressurePa: ctx.stats.maxDynamicPressurePa,
      flightTimeS: Math.max(0, ctx.missionTimeS),
      booster: ctx.boosterProgram?.outcome ?? null,
      checklist: {
        faultCount: ctx.checklist.faultCount,
        missedFaults: ctx.checklist.missedFaults,
        falseHolds: ctx.checklist.falseHolds,
      },
    });
    ctx.bus.emit('mission:ended', ctx.result);
  },
  update: () => null,
  maxWarp: () => 1,
};
