/**
 * 미션 상태 머신. 고정 타임스텝마다 update()를 호출한다.
 * 순서: 조종 명령 결정 → 물리 적분 → 통계·실패 판정 → 단계 업데이트/전환
 */
import { EventBus } from '../core/event-bus';
import { CONTROLS, PHASE_RULES, STRUCTURE } from '../data/mission-config';
import type { DifficultyConfig } from '../data/difficulty';
import { stepBooster } from '../physics/booster-flight';
import { computeTelemetry, stepVehicle } from '../physics/flight';
import { createInitialVehicle } from '../rocket/stack';
import type { StackConfig } from '../rocket/vehicle-config';
import { checkBoosterTouchdown } from './booster-finish';
import { createFlightLog, markEvent, recordBoosterEnd, recordFlight } from './flight-recorder';
import { guidancePitch, guidanceThrottle, structuralLoadPa } from './guidance';
import type { MissionContext, MissionEvents, Phase, PhaseId, PilotInput } from './mission-types';
import { createBoosterReturnPhase } from './phases/booster-return-phase';
import { createChecklist, NOMINAL_CONDITIONS } from './checklist';
import { createCountdownPhase } from './phases/countdown-phase';
import { liftoffPhase } from './phases/liftoff-phase';
import { createMaxQPhase } from './phases/max-q-phase';
import { mecoPhase } from './phases/meco-phase';
import { createOrbitInsertionPhase } from './phases/orbit-insertion-phase';
import { createPreLaunchPhase } from './phases/pre-launch-phase';
import { createRng } from '../utils/random';
import { resultPhase } from './phases/result-phase';
import { sesPhase } from './phases/ses-phase';
import { stageSeparationPhase } from './phases/stage-separation-phase';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface MissionOptions {
  /** 난수 시드 (체크리스트 이상 항목 등). 생략하면 매번 다르다 */
  readonly seed?: number;
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

export class Mission {
  readonly bus = new EventBus<MissionEvents>();
  readonly ctx: MissionContext;
  private readonly phases: Partial<Record<PhaseId, Phase>>;
  private current: Phase;

  constructor(cfg: StackConfig, difficulty: DifficultyConfig, options: MissionOptions = {}) {
    const vehicle = createInitialVehicle(cfg);
    const rng = createRng(options.seed ?? randomSeed());
    const telemetry = computeTelemetry(vehicle, cfg);
    this.ctx = {
      cfg,
      difficulty,
      bus: this.bus,
      vehicle,
      previousVehiclePos: vehicle.pos,
      booster: null,
      previousBoosterPos: null,
      boosterProgram: null,
      boosterCommand: { engines: 0, throttle: 0, pitchRad: 0, finSteer: 0 },
      sesTimeS: null,
      telemetry,
      command: { throttle: 1, pitchRad: Math.PI / 2 },
      recommended: { throttle: 1, pitchRad: Math.PI / 2 },
      missionTimeS: 0,
      phaseTimeS: 0,
      flying: false,
      stats: { maxDynamicPressurePa: 0, maxLoadRatio: 0, stress: 0, loadRatio: 0 },
      prompt: null,
      outcome: null,
      result: null,
      flightLog: createFlightLog(),
      rng,
      checklist: createChecklist(rng),
      launchConditions: NOMINAL_CONDITIONS,
    };
    this.recordEvents();

    const preLaunch = createPreLaunchPhase();
    const list: Phase[] = [
      preLaunch,
      createCountdownPhase(),
      liftoffPhase,
      createMaxQPhase(),
      mecoPhase,
      stageSeparationPhase,
      sesPhase,
      createBoosterReturnPhase(),
      createOrbitInsertionPhase(),
      resultPhase,
    ];
    this.phases = Object.fromEntries(list.map((p) => [p.id, p]));
    this.current = preLaunch;
  }

  /** 그래프에 표시할 주요 사건 시각 기록 */
  private recordEvents(): void {
    const ctx = this.ctx;
    const log = ctx.flightLog;
    this.bus.on('maxq:entered', () => markEvent(log, ctx.missionTimeS, 'Max-Q'));
    this.bus.on('phase:changed', ({ to }) => {
      if (to === 'MECO') markEvent(log, ctx.missionTimeS, 'MECO');
      else if (to === 'SES') markEvent(log, ctx.missionTimeS, 'SES');
    });
    this.bus.on('engine:cutoff', ({ stage }) => {
      if (stage === 2) markEvent(log, ctx.missionTimeS, 'SECO');
    });
    this.bus.on('booster:touchdown', () => recordBoosterEnd(log, ctx));
  }

  /** 첫 단계 진입. 이벤트 구독을 마친 뒤 호출한다 */
  start(): void {
    this.enterPhase(this.current, null);
  }

  get phase(): Phase {
    return this.current;
  }

  get finished(): boolean {
    return this.current.id === 'RESULT';
  }

  /** 현재 허용되는 최대 시간 배속 */
  maxWarp(): number {
    return this.current.maxWarp(this.ctx);
  }

  update(input: PilotInput, dt: number): void {
    const ctx = this.ctx;
    if (this.finished) return;

    ctx.phaseTimeS += dt;
    if (ctx.flying) {
      ctx.missionTimeS += dt;
      this.applyControls(input, dt);
      this.stepPhysics(dt);
      this.updateStats(dt);
      recordFlight(ctx.flightLog, ctx);
      const failure = this.checkFailure();
      if (failure) {
        ctx.outcome = { success: false, reason: failure };
        this.transition('RESULT');
        return;
      }
    }

    const next = this.current.update(ctx, input, dt);
    if (next) this.transition(next);
  }

  private applyControls(input: PilotInput, dt: number): void {
    const ctx = this.ctx;
    const { vehicle, telemetry, difficulty } = ctx;

    const onPad = vehicle.clamped || ctx.missionTimeS < 0;
    ctx.recommended = {
      throttle: vehicle.activeStage === 1 ? guidanceThrottle(telemetry) : 1,
      pitchRad: onPad ? Math.PI / 2 : guidancePitch(vehicle, telemetry, ctx.cfg),
    };

    // 부스터 조종 단계에서는 2단이 완전 자동 비행
    const auto = this.current.controlsBooster === true;
    const throttle = difficulty.autoThrottle || auto
      ? ctx.recommended.throttle
      : clamp(ctx.command.throttle + input.throttleAxis * CONTROLS.throttleRatePerS * dt, 0, 1);

    let pitchRad: number;
    if (difficulty.autoPitch || onPad || auto) {
      pitchRad = ctx.recommended.pitchRad;
    } else {
      pitchRad = clamp(
        ctx.command.pitchRad + input.pitchAxis * CONTROLS.pitchRateRadPerS * dt,
        CONTROLS.minPitchRad,
        CONTROLS.maxPitchRad,
      );
    }
    ctx.command = { throttle, pitchRad };
  }

  private stepPhysics(dt: number): void {
    const ctx = this.ctx;
    ctx.previousVehiclePos = ctx.vehicle.pos;
    ctx.vehicle = stepVehicle(ctx.vehicle, ctx.command, ctx.cfg, dt);
    ctx.telemetry = computeTelemetry(ctx.vehicle, ctx.cfg);

    if (ctx.booster) {
      ctx.previousBoosterPos = ctx.booster.pos;
      ctx.booster = stepBooster(ctx.booster, ctx.boosterCommand, ctx.cfg, dt);
      checkBoosterTouchdown(ctx);
    }
  }

  private updateStats(dt: number): void {
    const { stats, telemetry, launchConditions } = this.ctx;
    // 체크리스트에서 고층풍 이상을 놓쳤다면 실제 하중이 더 크다
    const load = structuralLoadPa(telemetry) * launchConditions.structuralLoadFactor;
    stats.loadRatio = load / STRUCTURE.qLimitPa;
    stats.maxLoadRatio = Math.max(stats.maxLoadRatio, stats.loadRatio);
    stats.maxDynamicPressurePa = Math.max(stats.maxDynamicPressurePa, telemetry.dynamicPressurePa);
    if (stats.loadRatio > 1) {
      stats.stress = Math.min(1, stats.stress + (stats.loadRatio - 1) * STRUCTURE.stressRatePerS * dt);
    }
  }

  /** 실패 사유 또는 null */
  private checkFailure(): string | null {
    const ctx = this.ctx;
    if (ctx.stats.stress >= 1) return 'Max-Q 구간의 과도한 하중으로 기체가 파손되었습니다.';
    if (!ctx.vehicle.clamped && ctx.missionTimeS > PHASE_RULES.crashGraceS && ctx.telemetry.altitudeM < 0) {
      return '기체가 지표면과 충돌했습니다.';
    }
    return null;
  }

  private transition(id: PhaseId): void {
    const next = this.phases[id];
    if (!next) throw new Error(`등록되지 않은 단계: ${id}`);
    const from = this.current;
    from.exit?.(this.ctx);
    this.enterPhase(next, from.id);
  }

  private enterPhase(phase: Phase, from: PhaseId | null): void {
    this.current = phase;
    this.ctx.phaseTimeS = 0;
    this.ctx.prompt = null;
    phase.enter?.(this.ctx);
    this.bus.emit('phase:changed', { from, to: phase.id });
  }
}
