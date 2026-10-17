import type { Vec2 } from '../physics/vec2';
import type { StackConfig } from './vehicle-config';

/**
 * 비행 중인 기체(1단+2단 스택 또는 2단 단독)의 상태. 불변 객체로 다룬다.
 */
export interface VehicleState {
  /** 지구 중심 기준 위치 [m] */
  readonly pos: Vec2;
  /** 관성 좌표계 속도 [m/s] */
  readonly vel: Vec2;
  readonly stage1PropellantKg: number;
  readonly stage2PropellantKg: number;
  /** 현재 연소 중(또는 연소 예정)인 단 */
  readonly activeStage: 1 | 2;
  readonly fairingAttached: boolean;
  /** 엔진 점화 명령 여부 */
  readonly enginesOn: boolean;
  /** 실제 스로틀 (0~1, 명령값을 향해 서서히 변함) */
  readonly throttle: number;
  /** 실제 피치각 — 국지 수평선 기준 [rad], 90° = 연직 상승 */
  readonly pitchRad: number;
  /** 발사대 고정 클램프에 묶여 있는지 */
  readonly clamped: boolean;
}

/** 매 스텝 유도/플레이어가 내리는 명령 */
export interface VehicleCommand {
  readonly throttle: number;
  readonly pitchRad: number;
}

export function vehicleMassKg(state: VehicleState, cfg: StackConfig): number {
  let mass = cfg.payloadMassKg + cfg.stage2.dryMassKg + state.stage2PropellantKg;
  if (state.fairingAttached) mass += cfg.fairingMassKg;
  if (state.activeStage === 1) mass += cfg.stage1.dryMassKg + state.stage1PropellantKg;
  return mass;
}

export function activePropellantKg(state: VehicleState): number {
  return state.activeStage === 1 ? state.stage1PropellantKg : state.stage2PropellantKg;
}

export function activeStageSpec(state: VehicleState, cfg: StackConfig) {
  return state.activeStage === 1 ? cfg.stage1 : cfg.stage2;
}
