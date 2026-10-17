/**
 * 로켓 구성 타입. 실제 값은 src/data/rocket-specs.ts 에 있다.
 */

export interface EngineSpec {
  /** 진공 추력 [N] (스로틀 100%) */
  readonly thrustVacN: number;
  /** 해면 비추력 [s] */
  readonly ispSeaLevelS: number;
  /** 진공 비추력 [s] */
  readonly ispVacS: number;
  /** 최소 스로틀 (0~1) */
  readonly minThrottle: number;
}

export interface StageSpec {
  readonly dryMassKg: number;
  readonly propellantMassKg: number;
  readonly engine: EngineSpec;
}

export interface StackConfig {
  readonly stage1: StageSpec;
  readonly stage2: StageSpec;
  readonly fairingMassKg: number;
  readonly payloadMassKg: number;
  readonly dragCoefficient: number;
  readonly referenceAreaM2: number;
}
