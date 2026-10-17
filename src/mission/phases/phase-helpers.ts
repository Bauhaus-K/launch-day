import type { MessageTone, MissionContext } from '../mission-types';

export function say(ctx: MissionContext, text: string, tone: MessageTone = 'info'): void {
  ctx.bus.emit('mission:message', { text, tone });
}

/** 이번 스텝 동안 phaseTime이 threshold를 처음 넘었는지 */
export function crossed(ctx: MissionContext, dt: number, threshold: number): boolean {
  return ctx.phaseTimeS >= threshold && ctx.phaseTimeS - dt < threshold;
}

/** 승인 입력: 자동 승인 모드면 delay 경과 후 자동, 아니면 Space */
export function confirmed(ctx: MissionContext, confirm: boolean, autoDelayS: number): boolean {
  return ctx.difficulty.autoConfirm ? ctx.phaseTimeS >= autoDelayS : confirm;
}
