import type { EventBus } from '../core/event-bus';
import type { FlightTelemetry } from '../physics/flight';
import type { Vec2 } from '../physics/vec2';
import type { StackConfig } from '../rocket/vehicle-config';
import type { BoosterCommand, BoosterState } from '../rocket/booster-state';
import type { VehicleCommand, VehicleState } from '../rocket/vehicle-state';
import type { DifficultyConfig } from '../data/difficulty';
import type { BoosterProgram } from './booster-program';
import type { BoosterStep } from './booster-guidance';
import type { FlightLog } from './flight-recorder';
import type { BoosterOutcome } from './landing';
import type { MissionResult } from './scoring';

export type PhaseId =
  | 'PRE_LAUNCH'
  | 'COUNTDOWN'
  | 'LIFTOFF'
  | 'MAX_Q'
  | 'MECO'
  | 'STAGE_SEPARATION'
  | 'SES'
  | 'BOOSTER_RETURN'
  | 'ORBIT_INSERTION'
  | 'RESULT';

export type MessageTone = 'info' | 'success' | 'warn' | 'danger';

export interface MissionEvents {
  'phase:changed': { readonly from: PhaseId | null; readonly to: PhaseId };
  'mission:message': { readonly text: string; readonly tone: MessageTone };
  /** 카운트다운 콜아웃 시각 (T- 초) */
  'countdown:tick': { readonly tMinusS: number };
  'maxq:entered': Record<string, never>;
  'engine:ignition': { readonly stage: 1 | 2 };
  'engine:cutoff': { readonly stage: 1 | 2 };
  'stage:separated': { readonly missionTimeS: number };
  'fairing:separated': { readonly missionTimeS: number };
  'booster:step': { readonly step: BoosterStep };
  'booster:touchdown': BoosterOutcome;
  'mission:ended': MissionResult;
}

/** 한 물리 스텝 동안의 플레이어 입력 */
export interface PilotInput {
  /** -1(감소) ~ 1(증가) */
  readonly throttleAxis: number;
  /** -1(피치 다운, 수평 쪽) ~ 1(피치 업, 연직 쪽) */
  readonly pitchAxis: number;
  /** 리얼 모드 부스터 자세 유지 토글 요청 (R: 역추진, B: 부스트백, 해당 프레임 첫 스텝에서만) */
  readonly hold?: 'retrograde' | 'boostback' | null;
  /** Space: 다음 단계 승인 / 점화 (해당 프레임 첫 스텝에서만 true) */
  readonly confirm: boolean;
}

export const NO_INPUT: PilotInput = { throttleAxis: 0, pitchAxis: 0, confirm: false };

export interface MissionStats {
  maxDynamicPressurePa: number;
  /** 최대 구조 하중 비율 (하중 / 허용치) */
  maxLoadRatio: number;
  /** 누적 기체 스트레스 (0~1, 1이면 파손) */
  stress: number;
  /** 현재 구조 하중 비율 */
  loadRatio: number;
}

export interface MissionOutcome {
  readonly success: boolean;
  readonly reason: string;
}

/** 미션 전체 상태. 단계(Phase)들이 읽고 바꾼다. 씬·HUD는 읽기만 한다. */
export interface MissionContext {
  readonly cfg: StackConfig;
  readonly difficulty: DifficultyConfig;
  readonly bus: EventBus<MissionEvents>;
  vehicle: VehicleState;
  /** 직전 스텝 위치 (렌더링 보간용) */
  previousVehiclePos: Vec2;
  /** 분리된 1단 부스터 (분리 전 null) */
  booster: BoosterState | null;
  previousBoosterPos: Vec2 | null;
  /** 부스터 귀환 프로그램 (분리 전 null) */
  boosterProgram: BoosterProgram | null;
  /** 다음 물리 스텝에 부스터에 적용할 명령 */
  boosterCommand: BoosterCommand;
  /** 2단 점화 시각 (페어링 분리 타임아웃 기준) */
  sesTimeS: number | null;
  telemetry: FlightTelemetry;
  /** 플레이어/유도가 내리는 현재 명령 */
  command: VehicleCommand;
  /** 자동 유도 권장값 (리얼 모드 HUD 표시용) */
  recommended: VehicleCommand;
  /** 발사 기준 미션 시간 [s] (카운트다운 중 음수) */
  missionTimeS: number;
  /** 현재 단계 진입 후 경과 시간 [s] */
  phaseTimeS: number;
  /** 물리 시뮬레이션이 돌고 있는지 (발사 전·결과 화면에서는 false) */
  flying: boolean;
  stats: MissionStats;
  /** HUD 하단에 띄울 조작 안내 (null이면 없음) */
  prompt: string | null;
  outcome: MissionOutcome | null;
  result: MissionResult | null;
  /** 결과 화면 그래프용 비행 기록 */
  readonly flightLog: FlightLog;
}

export interface Phase {
  readonly id: PhaseId;
  /** HUD 표시용 이름 */
  readonly title: string;
  enter?(ctx: MissionContext): void;
  /** 다음 단계로 넘어가야 하면 그 id를, 아니면 null을 돌려준다 */
  update(ctx: MissionContext, input: PilotInput, dt: number): PhaseId | null;
  exit?(ctx: MissionContext): void;
  /** true면 플레이어 입력이 부스터로 가고, 2단은 완전 자동 비행 */
  readonly controlsBooster?: boolean;
  /** 이 단계에서 허용하는 최대 시간 배속 */
  maxWarp(ctx: MissionContext): number;
}
