import { TIME_WARP_STEPS } from '../data/mission-config';

/** 플레이어가 고른 배속과, 위험 구간 제한을 반영한 실제 배속 */
export class TimeWarp {
  private index = 0;

  get selected(): number {
    return TIME_WARP_STEPS[this.index] ?? 1;
  }

  cycle(): void {
    this.index = (this.index + 1) % TIME_WARP_STEPS.length;
  }

  reset(): void {
    this.index = 0;
  }

  /** 단계가 허용하는 최대 배속을 넘지 않는 실제 배속 */
  effective(maxAllowed: number): number {
    return Math.max(1, Math.min(this.selected, maxAllowed));
  }
}
