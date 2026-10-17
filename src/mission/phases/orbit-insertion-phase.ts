import { PHASE_RULES, TARGET_ORBIT } from '../../data/mission-config';
import { PHASE_INFO } from '../../data/mission-timeline';
import { shouldAutoSeco } from '../guidance';
import type { Phase } from '../mission-types';
import { cutUpperStage, updateFairing } from '../upper-stage-events';

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
        if (!ctx.difficulty.autoSeco) ctx.prompt = 'SPACE  2단 엔진 정지 (SECO)';
        if (vehicle.stage2PropellantKg <= 0) {
          cutUpperStage(ctx, '2단 추진제 고갈 — 엔진 정지.');
        } else if (ctx.difficulty.autoSeco ? shouldAutoSeco(telemetry) : input.confirm) {
          cutUpperStage(ctx, 'SECO — 2단 엔진 정지.');
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
        ctx.outcome = { success: true, reason: '궤도 진입 성공!' };
      } else if (!Number.isFinite(telemetry.orbit.apoapsisAltitudeM)) {
        ctx.outcome = { success: false, reason: '탈출 속도를 넘어 지구 궤도를 벗어났습니다.' };
      } else {
        ctx.outcome = {
          success: false,
          reason: `궤도 진입 실패 — 근지점 ${(pe / 1000).toFixed(0)} km (최소 ${TARGET_ORBIT.minPeriapsisM / 1000} km 필요)`,
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
