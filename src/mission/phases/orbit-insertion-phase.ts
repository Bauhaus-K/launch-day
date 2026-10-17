import { PHASE_RULES, TARGET_ORBIT } from '../../data/mission-config';
import { PHASE_INFO } from '../../data/mission-timeline';
import { shouldAutoSeco } from '../guidance';
import type { Phase } from '../mission-types';
import { cutUpperStage, updateFairing } from '../upper-stage-events';
import { t } from '../../i18n';

/** 근지점이 목표의 이 거리 이내로 다가오면 배속 해제 [m] */
const WARP_LOCK_PERIAPSIS_MARGIN_M = 40_000;

export function createOrbitInsertionPhase(): Phase {
  let secoAtS: number | null = null;

  return {
    id: 'ORBIT_INSERTION',
    title: PHASE_INFO.ORBIT_INSERTION.title,
    enter(ctx) {
      // 부스터 조종 중에 이미 SECO 했을 수 있다
      secoAtS = ctx.vehicle.enginesOn ? null : 0;
    },
    update(ctx, input) {
      const { telemetry, vehicle } = ctx;
      updateFairing(ctx);

      if (secoAtS === null) {
        if (!ctx.difficulty.autoSeco) ctx.prompt = t('prompt.seco');
        if (vehicle.stage2PropellantKg <= 0) {
          cutUpperStage(ctx, t('msg.stage2Depleted'));
        } else if (ctx.difficulty.autoSeco ? shouldAutoSeco(telemetry) : input.confirm) {
          cutUpperStage(ctx, t('msg.seco'));
        }
        if (!ctx.vehicle.enginesOn) {
          secoAtS = ctx.phaseTimeS;
          ctx.prompt = null;
        }
        return null;
      }

      if (ctx.phaseTimeS - secoAtS < PHASE_RULES.secoToResultS) return null;

      const pe = telemetry.orbit.periapsisAltitudeM;
      if (pe >= TARGET_ORBIT.minPeriapsisM && Number.isFinite(telemetry.orbit.apoapsisAltitudeM)) {
        ctx.outcome = { success: true, reason: t('outcome.orbitSuccess') };
      } else if (!Number.isFinite(telemetry.orbit.apoapsisAltitudeM)) {
        ctx.outcome = { success: false, reason: t('outcome.escape') };
      } else {
        ctx.outcome = {
          success: false,
          reason: t('outcome.orbitFailed', { pe: (pe / 1000).toFixed(0), min: TARGET_ORBIT.minPeriapsisM / 1000 }),
        };
      }
      return 'RESULT';
    },
    maxWarp(ctx) {
      if (secoAtS !== null) return 1;
      const pe = ctx.telemetry.orbit.periapsisAltitudeM;
      return pe >= TARGET_ORBIT.altitudeM - WARP_LOCK_PERIAPSIS_MARGIN_M ? 1 : Infinity;
    },
  };
}
