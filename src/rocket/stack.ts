/**
 * 1단·2단·페어링 스택의 상태 전이 (분리 이벤트). 순수 함수.
 */
import { STAGE_SEPARATION_PUSH_MPS } from '../data/rocket-specs';
import { EARTH_RADIUS_M } from '../data/physics-constants';
import { bodyAxis } from '../physics/flight';
import { add, scale, vec2 } from '../physics/vec2';
import type { BoosterState } from './booster-state';
import type { StackConfig } from './vehicle-config';
import type { VehicleState } from './vehicle-state';

/** 발사대 위, 추진제 만재 상태 */
export function createInitialVehicle(cfg: StackConfig): VehicleState {
  return {
    pos: vec2(0, EARTH_RADIUS_M),
    vel: vec2(0, 0),
    stage1PropellantKg: cfg.stage1.propellantMassKg,
    stage2PropellantKg: cfg.stage2.propellantMassKg,
    activeStage: 1,
    fairingAttached: true,
    enginesOn: false,
    throttle: 0,
    pitchRad: Math.PI / 2,
    clamped: true,
  };
}

export interface SeparationResult {
  readonly upperStage: VehicleState;
  readonly booster: BoosterState;
}

/** 1단/2단 분리: 2단은 엔진 꺼진 상태로 계속 비행, 1단은 귀환용 부스터가 된다 */
export function separateStages(state: VehicleState, cfg: StackConfig): SeparationResult {
  const axis = bodyAxis(state.pos, state.pitchRad);
  const booster: BoosterState = {
    pos: state.pos,
    vel: add(state.vel, scale(axis, -STAGE_SEPARATION_PUSH_MPS)),
    dryMassKg: cfg.stage1.dryMassKg,
    propellantKg: state.stage1PropellantKg,
    engines: 0,
    throttle: 0,
    pitchRad: state.pitchRad,
    finSteer: 0,
    finsDeployed: false,
    legsDeployed: false,
    status: 'flying',
  };
  const upperStage: VehicleState = {
    ...state,
    activeStage: 2,
    enginesOn: false,
    throttle: 0,
  };
  return { upperStage, booster };
}

export function jettisonFairing(state: VehicleState): VehicleState {
  return { ...state, fairingAttached: false };
}
