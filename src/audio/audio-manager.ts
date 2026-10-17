/**
 * 사운드 총괄. 미션 상태를 읽고 이벤트를 구독해 소리를 낸다 (상태를 바꾸지 않음).
 * AudioContext는 브라우저 정책상 사용자 조작(클릭) 후에 unlock()으로 만든다.
 */
import {
  ALARM_INTERVAL_S,
  AUDIO,
  ENGINE_SOUND,
  SOUNDS,
  VOICE,
  VOICE_LINES,
  type SoundName,
} from '../data/audio-config';
import { BOOSTER_HEATING_LIMIT, STAGE1_ENGINE_COUNT } from '../data/booster-config';
import { STRUCTURE } from '../data/mission-config';
import { EARTH_RADIUS_M } from '../data/physics-constants';
import { CAMERA } from '../data/scene-config';
import { pressureRatio } from '../physics/atmosphere';
import { altitudeOf } from '../physics/gravity';
import type { Vec2 } from '../physics/vec2';
import type { Mission } from '../mission/mission';
import type { MissionContext } from '../mission/mission-types';
import type { CameraMode } from '../scene/camera-rig';
import { engineMix, SILENT_ENGINE, type EngineMix } from './audio-mix';
import { EngineSound } from './engine-sound';
import { createBrownNoise, createWhiteNoise, playSound } from './synth';
import { VoiceAnnouncer } from './voice';

function loadMuted(): boolean {
  try {
    return window.localStorage.getItem(AUDIO.muteStorageKey) === '1';
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(AUDIO.muteStorageKey, muted ? '1' : '0');
  } catch {
    // 저장소를 못 쓰는 환경(시크릿 모드 등)에서는 이번 세션에만 적용
  }
}

interface AudioGraph {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly engine: EngineSound;
  readonly white: AudioBuffer;
}

export class AudioManager {
  private graph: AudioGraph | null = null;
  private readonly voice = new VoiceAnnouncer();
  private muted = loadMuted();
  private paused = false;
  private unsubscribe: Array<() => void> = [];
  private lastAlarmS = -Infinity;
  private previousPrompt: string | null = null;

  constructor() {
    this.voice.setMuted(this.muted);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** 사용자 조작 직후 호출: 오디오 그래프 생성 및 재개 */
  unlock(): void {
    if (!this.graph) {
      const ctx = new AudioContext();
      const compressor = ctx.createDynamicsCompressor();
      compressor.connect(ctx.destination);
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : AUDIO.masterGain;
      master.connect(compressor);
      const white = createWhiteNoise(ctx);
      const engine = new EngineSound(ctx, master, createBrownNoise(ctx), white);
      this.graph = { ctx, master, engine, white };
    }
    if (!this.paused) void this.graph.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    saveMuted(this.muted);
    this.voice.setMuted(this.muted);
    if (this.graph) {
      this.graph.master.gain.setTargetAtTime(this.muted ? 0 : AUDIO.masterGain, this.graph.ctx.currentTime, AUDIO.smoothingS);
    }
    return this.muted;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.voice.setPaused(paused);
    if (!this.graph) return;
    if (paused) void this.graph.ctx.suspend();
    else void this.graph.ctx.resume();
  }

  private play(name: SoundName): void {
    const g = this.graph;
    if (!g || this.muted) return;
    playSound(g.ctx, g.master, g.white, SOUNDS[name]);
  }

  /** 새 미션에 연결 (재시작 시 이전 구독 해제) */
  bind(mission: Mission): void {
    this.unsubscribe.forEach((off) => off());
    this.voice.cancel();
    this.previousPrompt = null;
    this.lastAlarmS = -Infinity;
    const bus = mission.bus;
    const say = (line: keyof typeof VOICE_LINES, interrupt = false) => this.voice.say(VOICE_LINES[line], interrupt);

    this.unsubscribe = [
      bus.on('countdown:tick', ({ tMinusS }) => {
        if (tMinusS > VOICE.countdownSpeakFromS) return;
        this.play('countdownBeep');
        this.voice.say(String(tMinusS), true);
      }),
      bus.on('engine:ignition', ({ stage }) => {
        this.play('ignition');
        if (stage === 2) say('ses');
      }),
      bus.on('engine:cutoff', ({ stage }) => {
        if (stage === 2) say('seco');
      }),
      bus.on('phase:changed', ({ to }) => {
        if (to === 'LIFTOFF') say('liftoff', true);
        else if (to === 'MECO') say('meco');
        else if (to === 'BOOSTER_RETURN') say('boosterReturn');
      }),
      bus.on('maxq:entered', () => say('maxQ')),
      bus.on('stage:separated', () => {
        this.play('stageSeparation');
        say('separation');
      }),
      bus.on('fairing:separated', () => this.play('fairingSeparation')),
      bus.on('booster:step', ({ step }) => {
        if (step !== 'LANDING_BURN') return;
        // 착륙 직전 지상에서 들리는 이중 음속 폭음
        this.play('sonicBoom');
        say('landingBurn');
      }),
      bus.on('booster:touchdown', (o) => {
        this.play(o.landed ? 'touchdown' : 'explosion');
        say(o.landed ? 'landed' : 'boosterLost', true);
      }),
      bus.on('mission:ended', (r) => {
        if (!r.success) this.play('explosion');
        this.play(r.success ? 'success' : 'failure');
        say(r.success ? 'orbit' : 'missionFailed', true);
      }),
    ];
  }

  /** 매 렌더 프레임 호출 */
  update(ctx: MissionContext, cameraMode: CameraMode, running: boolean): void {
    const g = this.graph;
    if (!g) return;
    g.engine.update(running && ctx.flying ? this.currentEngineMix(ctx, cameraMode) : SILENT_ENGINE);
    if (!running) return;

    if (ctx.prompt && ctx.prompt !== this.previousPrompt) this.play('prompt');
    this.previousPrompt = ctx.prompt;

    const now = g.ctx.currentTime;
    if (this.alarmActive(ctx) && now - this.lastAlarmS >= ALARM_INTERVAL_S) {
      this.lastAlarmS = now;
      this.play('alarm');
    }
  }

  private alarmActive(ctx: MissionContext): boolean {
    const structural = !ctx.difficulty.autoThrottle && ctx.stats.loadRatio >= STRUCTURE.warningRatio;
    const p = ctx.boosterProgram;
    const heating = ctx.booster?.status === 'flying' && p !== null && p.telemetry.heating > BOOSTER_HEATING_LIMIT;
    return ctx.flying && (structural || heating);
  }

  /** 카메라가 보고 있는 기체의 엔진음 */
  private currentEngineMix(ctx: MissionContext, cameraMode: CameraMode): EngineMix {
    const b = ctx.booster;
    let source: Vec2;
    let throttle: number;
    let thrustFraction: number;
    if (cameraMode === 'booster' && b && b.status === 'flying') {
      source = b.pos;
      throttle = b.engines > 0 ? b.throttle : 0;
      thrustFraction = b.engines / STAGE1_ENGINE_COUNT;
    } else {
      const v = ctx.vehicle;
      source = v.pos;
      const propellant = v.activeStage === 1 ? v.stage1PropellantKg : v.stage2PropellantKg;
      throttle = propellant > 0 ? v.throttle : 0;
      thrustFraction =
        v.activeStage === 1 ? 1 : ctx.cfg.stage2.engine.thrustVacN / ctx.cfg.stage1.engine.thrustVacN;
    }
    return engineMix({
      throttle,
      thrustFraction,
      pressureRatio: pressureRatio(altitudeOf(source)),
      distanceM: this.listenerDistance(source, cameraMode),
    });
  }

  private listenerDistance(source: Vec2, cameraMode: CameraMode): number {
    if (cameraMode !== 'pad') return ENGINE_SOUND.nearListenerDistanceM;
    const o = CAMERA.padCameraOffset;
    return Math.hypot(source.x - o.x, source.y - (EARTH_RADIUS_M + o.y), o.z);
  }
}
