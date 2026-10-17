import { STANDARD_GRAVITY } from '../data/physics-constants';
import type { EngineSpec } from '../rocket/vehicle-config';

/**
 * 대기압 비율에 따른 비추력 보간. 해면(1)과 진공(0) 사이를 선형 보간한다.
 */
export function effectiveIsp(engine: EngineSpec, pressureRatio: number): number {
  return engine.ispVacS + (engine.ispSeaLevelS - engine.ispVacS) * pressureRatio;
}

/** 스로틀에 따른 추진제 질량 유량 [kg/s]. 유량은 대기압과 무관하다고 가정한다. */
export function massFlowRate(engine: EngineSpec, throttle: number): number {
  return (throttle * engine.thrustVacN) / (engine.ispVacS * STANDARD_GRAVITY);
}

/** 현재 대기압에서의 추력 [N]. 동일 유량에서 추력은 Isp에 비례한다. */
export function thrustAt(engine: EngineSpec, throttle: number, pressureRatio: number): number {
  return massFlowRate(engine, throttle) * effectiveIsp(engine, pressureRatio) * STANDARD_GRAVITY;
}
