/**
 * 고정 타임스텝 게임 루프. 물리는 FIXED_TIMESTEP_S 단위로 갱신하고,
 * 렌더링에는 남은 시간 비율(alpha)을 넘겨 보간하게 한다.
 * 시간 배속은 프레임당 스텝 횟수를 늘리는 방식이다.
 */
import { FIXED_TIMESTEP_S, MAX_FRAME_TIME_S } from '../data/mission-config';

export interface LoopCallbacks {
  /** 프레임 시작 시 1회 (입력 수집 등) */
  beginFrame(): void;
  /** 고정 스텝. stepIndex는 이번 프레임 내 몇 번째 스텝인지 */
  step(dt: number, stepIndex: number): void;
  /** 렌더링. alpha = 다음 스텝까지 진행 비율 (0~1) */
  render(alpha: number, frameDt: number): void;
  /** 현재 적용할 시간 배속 */
  timeScale(): number;
  paused(): boolean;
}

export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;

  constructor(private readonly callbacks: LoopCallbacks) {}

  start(): void {
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
  }

  private frame = (now: number): void => {
    const frameDt = Math.min(MAX_FRAME_TIME_S, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const cb = this.callbacks;

    cb.beginFrame();
    if (!cb.paused()) {
      this.accumulator += frameDt * cb.timeScale();
      let stepIndex = 0;
      while (this.accumulator >= FIXED_TIMESTEP_S) {
        cb.step(FIXED_TIMESTEP_S, stepIndex++);
        this.accumulator -= FIXED_TIMESTEP_S;
      }
    }
    cb.render(this.accumulator / FIXED_TIMESTEP_S, frameDt);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
