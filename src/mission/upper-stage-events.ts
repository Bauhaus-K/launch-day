/**
 * 2단 자동 이벤트 (SES 이후 어느 단계에서든 처리): 페어링 분리, 부스터 조종 중 자동 SECO.
 */
import { PHASE_RULES } from '../data/mission-config';
import { jettisonFairing } from '../rocket/stack';
import { shouldAutoSeco } from './guidance';
import type { MissionContext } from './mission-types';
import { say } from './phases/phase-helpers';
import { t } from '../i18n';

/** 고도에 못 미쳐도 2단 점화 후 이 시간이 지나면 페어링을 분리한다 [s] (수동 조종으로 고도가 낮은 경우 대비) */
const FAIRING_TIMEOUT_S = 60;

export function updateFairing(ctx: MissionContext): void {
  if (!ctx.vehicle.fairingAttached || ctx.sesTimeS === null) return;
  const highEnough = ctx.telemetry.altitudeM >= PHASE_RULES.fairingSeparationAltitudeM;
  if (!highEnough && ctx.missionTimeS - ctx.sesTimeS < FAIRING_TIMEOUT_S) return;
  ctx.vehicle = jettisonFairing(ctx.vehicle);
  ctx.bus.emit('fairing:separated', { missionTimeS: ctx.missionTimeS });
  say(ctx, t('msg.fairing'), 'success');
}

/** 2단 엔진 정지 (SECO) */
export function cutUpperStage(ctx: MissionContext, message: string): void {
  if (!ctx.vehicle.enginesOn) return;
  ctx.vehicle = { ...ctx.vehicle, enginesOn: false };
  ctx.bus.emit('engine:cutoff', { stage: 2 });
  say(ctx, message, 'success');
}

/** 플레이어가 부스터를 조종하는 동안 2단은 비행 컴퓨터가 알아서 SECO 한다 */
export function autoUpperStageSeco(ctx: MissionContext): void {
  if (!ctx.vehicle.enginesOn) return;
  if (ctx.vehicle.stage2PropellantKg <= 0) cutUpperStage(ctx, t('msg.stage2Depleted'));
  else if (shouldAutoSeco(ctx.telemetry)) cutUpperStage(ctx, t('msg.secoAuto'));
}
