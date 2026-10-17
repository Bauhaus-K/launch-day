/**
 * 부스터 비행 종료 처리 (착지·추락·공중 분해). 미션 컨텍스트를 갱신하고 이벤트를 낸다.
 */
import { altitudeOf } from '../physics/gravity';
import { downrangeDistance, surfacePoint } from '../physics/trajectory';
import { vec2 } from '../physics/vec2';
import { computeBoosterTelemetry } from './booster-guidance';
import { evaluateTouchdown, type BoosterOutcome } from './landing';
import type { MissionContext } from './mission-types';

function finish(ctx: MissionContext, outcome: BoosterOutcome): void {
  const b = ctx.booster;
  const program = ctx.boosterProgram;
  if (!b || !program) return;
  program.outcome = outcome;
  program.step = 'DONE';
  ctx.booster = outcome.landed
    ? {
        ...b,
        // 갑판 위에 고정
        pos: surfacePoint(downrangeDistance(b.pos)),
        vel: vec2(0, 0),
        engines: 0,
        throttle: 0,
        status: 'landed',
      }
    : { ...b, engines: 0, throttle: 0, status: 'crashed' };
  ctx.previousBoosterPos = ctx.booster.pos;
  ctx.boosterCommand = { engines: 0, throttle: 0, pitchRad: b.pitchRad, finSteer: 0 };
  ctx.bus.emit('booster:step', { step: 'DONE' });
  ctx.bus.emit('booster:touchdown', outcome);
  ctx.bus.emit('mission:message', {
    text: outcome.landed ? `${outcome.reason} 착륙선 중심에서 ${outcome.distanceM.toFixed(1)} m` : `부스터 손실 — ${outcome.reason}`,
    tone: outcome.landed ? 'success' : 'danger',
  });
}

/** 비행 중인 부스터가 해면(갑판 높이)에 닿았는지 확인하고 판정 */
export function checkBoosterTouchdown(ctx: MissionContext): void {
  const b = ctx.booster;
  const program = ctx.boosterProgram;
  if (!b || !program || b.status !== 'flying' || altitudeOf(b.pos) > 0) return;
  const tel = computeBoosterTelemetry(b, program.shipDownrangeM, null);
  finish(ctx, evaluateTouchdown(tel, b.legsDeployed));
}

/** 재진입 하중 등으로 공중에서 부서짐 */
export function destroyBooster(ctx: MissionContext, reason: string): void {
  const b = ctx.booster;
  const program = ctx.boosterProgram;
  if (!b || !program || b.status !== 'flying') return;
  const tel = program.telemetry;
  finish(ctx, {
    landed: false,
    reason,
    verticalSpeedMps: Math.abs(tel.verticalSpeedMps),
    horizontalSpeedMps: Math.abs(tel.horizontalSpeedMps),
    distanceM: Math.abs(tel.shipOffsetM),
    tiltRad: tel.tiltRad,
  });
}
