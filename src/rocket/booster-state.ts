import type { Vec2 } from '../physics/vec2';

export type BoosterStatus = 'flying' | 'landed' | 'crashed';

/**
 * 분리된 1단 부스터의 상태. 불변 객체로 다룬다.
 * 피치는 국지 수평(다운레인지) 기준 [rad]: 90° 연직 위, 180° 발사장 방향 수평, -90° 연직 아래.
 */
export interface BoosterState {
  readonly pos: Vec2;
  readonly vel: Vec2;
  readonly dryMassKg: number;
  readonly propellantKg: number;
  /** 점화된 엔진 수 (0이면 꺼짐) */
  readonly engines: number;
  /** 실제 스로틀 (0~1) */
  readonly throttle: number;
  readonly pitchRad: number;
  /** 그리드 핀 조종량 (-1~1, +는 속도 방향 기준 왼쪽(반시계)으로 양력) */
  readonly finSteer: number;
  readonly finsDeployed: boolean;
  readonly legsDeployed: boolean;
  readonly status: BoosterStatus;
}

export interface BoosterCommand {
  readonly engines: number;
  readonly throttle: number;
  readonly pitchRad: number;
  readonly finSteer: number;
}

export const boosterMassKg = (b: BoosterState): number => b.dryMassKg + b.propellantKg;
