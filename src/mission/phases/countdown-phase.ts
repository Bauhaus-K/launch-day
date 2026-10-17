import { COUNTDOWN, TIME_WARP_STEPS } from '../../data/mission-config';
import { COUNTDOWN_CALLOUTS, PHASE_INFO } from '../../data/mission-timeline';
import type { Phase } from '../mission-types';
import { say } from './phase-helpers';

const MAX_WARP = TIME_WARP_STEPS[TIME_WARP_STEPS.length - 1] ?? 1;

export function createCountdownPhase(): Phase {
  /** 다음에 낼 콜아웃 인덱스 (COUNTDOWN_CALLOUTS는 T- 내림차순) */
  let nextCallout = 0;

  return {
    id: 'COUNTDOWN',
    title: PHASE_INFO.COUNTDOWN.title,
    enter(ctx) {
      ctx.missionTimeS = -COUNTDOWN.startS;
      ctx.flying = true;
      // 체크리스트에서 액체산소 온도 이상을 놓쳤다면 1단 추진제가 줄어든다
      const loss = ctx.launchConditions.stage1PropellantLossFraction;
      if (loss > 0) {
        ctx.vehicle = { ...ctx.vehicle, stage1PropellantKg: ctx.vehicle.stage1PropellantKg * (1 - loss) };
        say(ctx, `액체산소 밀도 저하 — 1단 추진제 ${(loss * 100).toFixed(0)}% 손실.`, 'danger');
      }
      nextCallout = 0;
    },
    update(ctx) {
      const t = ctx.missionTimeS;
      for (let c = COUNTDOWN_CALLOUTS[nextCallout]; c && -c.tMinusS <= t; c = COUNTDOWN_CALLOUTS[nextCallout]) {
        say(ctx, c.text);
        ctx.bus.emit('countdown:tick', { tMinusS: c.tMinusS });
        nextCallout++;
      }

      if (t >= -COUNTDOWN.ignitionS && !ctx.vehicle.enginesOn) {
        ctx.vehicle = { ...ctx.vehicle, enginesOn: true };
        ctx.bus.emit('engine:ignition', { stage: 1 });
      }

      if (t >= 0) {
        ctx.vehicle = { ...ctx.vehicle, clamped: false };
        return 'LIFTOFF';
      }
      return null;
    },
    maxWarp: (ctx) => (ctx.missionTimeS >= -COUNTDOWN.warpLockS ? 1 : MAX_WARP),
  };
}
