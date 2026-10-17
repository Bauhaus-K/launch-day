/**
 * Three.js 씬 총괄. 미션 상태를 읽어서 그리기만 한다 (상태를 바꾸지 않음).
 * 플로팅 원점: 매 프레임 카메라가 따라가는 기체(2단 또는 부스터)의 보간 위치를 원점으로 두고
 * 나머지를 상대 배치한다.
 */
import * as THREE from 'three';
import { EARTH_MU } from '../data/physics-constants';
import { LEG_DEPLOY_DURATION_S } from '../data/booster-config';
import { MODEL_DIMENSIONS } from '../data/rocket-specs';
import {
  BOOSTER_FLAME_SCALE,
  CAMERA_SHAKE,
  COLORS,
  RENDER,
  SEPARATION_VISUAL,
  SKY_BLACK_ALTITUDE_M,
  STAR_COUNT,
  STAR_SPHERE_RADIUS_M,
  STARS_FADE_END_M,
  STARS_FADE_START_M,
} from '../data/scene-config';
import { pressureRatio } from '../physics/atmosphere';
import { bodyAxis, radialUnit } from '../physics/flight';
import { altitudeOf } from '../physics/gravity';
import { length, lerp, sub, vec2, type Vec2 } from '../physics/vec2';
import type { Mission } from '../mission/mission';
import type { MissionContext } from '../mission/mission-types';
import { CameraRig, isBoosterView, type CameraMode } from './camera-rig';
import { Earth } from './earth';
import { createStage1Flame, createStage2Flame, type EngineFlame } from './exhaust';
import { LandingShip } from './landing-ship';
import { LaunchPad } from './launch-pad';
import { PostProcessing } from './post-processing';
import { RocketModel, UPPER_STAGE_CENTER_M, UPPER_STAGE_OFFSET_M } from './rocket-model';
import { SmokeParticles } from './smoke-particles';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const SUN_DIRECTION = new THREE.Vector3(0.6, 1, 0.45).normalize();
const BOOSTER_CENTER_M = MODEL_DIMENSIONS.nozzleLengthM + MODEL_DIMENSIONS.stage1LengthM / 2;

const smoothstep = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
const toV3 = (v: Vec2) => new THREE.Vector3(v.x, v.y, 0);

interface FairingFlight {
  readonly startTimeS: number;
  readonly pos: Vec2;
  readonly vel: Vec2;
  readonly gravity: Vec2;
  readonly side: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
}

export class SceneManager {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly rig: CameraRig;
  private readonly post: PostProcessing;
  private readonly earth = new Earth();
  private readonly pad = new LaunchPad();
  private readonly ship = new LandingShip();
  private readonly rocket = new RocketModel();
  private readonly stage1Flame: EngineFlame = createStage1Flame();
  private readonly stage2Flame: EngineFlame = createStage2Flame();
  private readonly smoke = new SmokeParticles();
  private readonly stars: THREE.Points;
  private readonly hemi: THREE.HemisphereLight;
  private readonly skyLow = new THREE.Color(COLORS.skyLow);
  private readonly skyHigh = new THREE.Color(COLORS.skyHigh);
  private readonly background = new THREE.Color();

  private legDeployStartS: number | null = null;
  private fairing: FairingFlight | null = null;
  private unsubscribe: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.post = new PostProcessing(this.renderer, this.scene, this.rig.camera);

    const sun = new THREE.DirectionalLight(COLORS.sun, 2.6);
    sun.position.copy(SUN_DIRECTION);
    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x3a4a2a, 1.1);
    this.scene.add(sun, this.hemi);

    this.stars = this.createStars();
    this.rocket.booster.add(this.stage1Flame.root);
    this.rocket.upper.add(this.stage2Flame.root);
    this.scene.add(
      this.earth.root,
      this.pad.root,
      this.ship.root,
      this.rocket.booster,
      this.rocket.upper,
      this.smoke.points,
      this.stars,
    );

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get cameraMode(): CameraMode {
    return this.rig.mode;
  }

  cycleCamera(boosterAvailable: boolean): CameraMode {
    return this.rig.cycle(boosterAvailable, this.ship.placed);
  }

  /** 새 미션에 연결 (재시작 시 연출 상태 초기화) */
  bind(mission: Mission): void {
    this.unsubscribe.forEach((off) => off());
    this.smoke.reset();
    this.fairing = null;
    this.legDeployStartS = null;
    this.rocket.setLegDeploy(0);
    this.ship.place(null);
    this.rig.reset();
    for (const half of this.rocket.fairingHalves) {
      half.position.set(0, MODEL_DIMENSIONS.stage2NozzleLengthM + MODEL_DIMENSIONS.stage2LengthM, 0);
      half.quaternion.identity();
      this.rocket.upper.add(half);
    }

    const ctx = mission.ctx;
    const bus = mission.bus;
    const impulse = CAMERA_SHAKE.impulse;
    this.unsubscribe = [
      bus.on('stage:separated', () => {
        this.ship.place(ctx.boosterProgram?.shipDownrangeM ?? null);
        this.rig.addTrauma(impulse.separation);
        this.rig.playSeparationShot();
      }),
      // 부스터 귀환 구간에서는 카메라가 부스터를 따라가고, 끝나면 2단으로 돌아온다
      bus.on('phase:changed', (e) => {
        if (e.to === 'BOOSTER_RETURN') this.rig.setMode('booster');
        else if (e.from === 'BOOSTER_RETURN') this.rig.setMode('chase');
      }),
      bus.on('fairing:separated', () => {
        this.startFairingFlight(ctx);
        this.rig.addTrauma(impulse.fairing);
      }),
      bus.on('engine:ignition', ({ stage }) => {
        this.rig.addTrauma(stage === 1 ? impulse.stage1Ignition : impulse.stage2Ignition);
        if (stage === 1) this.post.triggerFlash(1);
      }),
      bus.on('booster:step', ({ step }) => {
        if (step === 'BOOSTBACK' || step === 'ENTRY_BURN' || step === 'LANDING_BURN') {
          this.rig.addTrauma(impulse.boosterBurn);
        }
        // 관람 모드: 착륙 연소부터 갑판 카메라로 자동 전환 (중계 화면 느낌)
        if (step === 'LANDING_BURN' && ctx.difficulty.id === 'spectator' && this.rig.mode === 'booster') {
          this.rig.setMode('deck');
        }
      }),
      bus.on('booster:touchdown', (o) => this.rig.addTrauma(o.landed ? impulse.touchdown : impulse.crash)),
    ];
  }

  private startFairingFlight(ctx: MissionContext): void {
    const axis = bodyAxis(ctx.vehicle.pos, ctx.vehicle.pitchRad);
    const r = length(ctx.vehicle.pos);
    const g = -EARTH_MU / (r * r * r);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, toV3(axis));
    this.fairing = {
      startTimeS: ctx.missionTimeS,
      pos: vec2(
        ctx.vehicle.pos.x + axis.x * UPPER_STAGE_OFFSET_M,
        ctx.vehicle.pos.y + axis.y * UPPER_STAGE_OFFSET_M,
      ),
      vel: ctx.vehicle.vel,
      gravity: vec2(ctx.vehicle.pos.x * g, ctx.vehicle.pos.y * g),
      side: new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion),
      quaternion,
    };
    for (const half of this.rocket.fairingHalves) this.scene.add(half);
  }

  private createStars(): THREE.Points {
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(STAR_SPHERE_RADIUS_M);
      positions.set([v.x, v.y, v.z], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return points;
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.renderer.getPixelRatio());
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
  }

  /**
   * @param alpha 물리 스텝 보간 비율
   * @param frameDt 실제 프레임 시간 [s]
   * @param simDt 이번 프레임에 진행된 시뮬레이션 시간 [s] (배속·일시정지 반영)
   */
  render(ctx: MissionContext, alpha: number, frameDt: number, simDt: number): void {
    const v = ctx.vehicle;
    const vehiclePos = lerp(ctx.previousVehiclePos, v.pos, alpha);
    const booster = ctx.booster && ctx.booster.status !== 'crashed' ? ctx.booster : null;
    const boosterPos = booster ? lerp(ctx.previousBoosterPos ?? booster.pos, booster.pos, alpha) : null;

    // 플로팅 원점: 부스터 카메라면 부스터, 아니면 2단
    const focus = isBoosterView(this.rig.mode) && boosterPos ? boosterPos : vehiclePos;
    // 화염·흔들림 애니메이션 시간 (일시정지 중에는 멈춘다)
    const animDt = simDt > 0 ? frameDt : 0;
    const altitude = altitudeOf(focus);
    const up = toV3(radialUnit(focus));

    this.earth.update(focus);
    this.pad.update(focus);
    this.ship.update(focus);

    // 2단(분리 전에는 스택 전체) 배치 — booster 원점 = 스택 기준점, upper는 축 방향 오프셋
    const vehicleRel = toV3(sub(vehiclePos, focus));
    const axis = toV3(bodyAxis(vehiclePos, v.pitchRad));
    const vehiclePr = pressureRatio(altitudeOf(vehiclePos));
    const stackQuat = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, axis);
    this.rocket.upper.position.copy(vehicleRel).addScaledVector(axis, UPPER_STAGE_OFFSET_M);
    this.rocket.upper.quaternion.copy(stackQuat);

    let boosterCenter: THREE.Vector3 | null = null;
    let boosterAxis: THREE.Vector3 | null = null;
    if (v.activeStage === 1) {
      this.rocket.booster.visible = true;
      this.rocket.booster.position.copy(vehicleRel);
      this.rocket.booster.quaternion.copy(stackQuat);
      this.stage1Flame.update(v.stage1PropellantKg > 0 ? v.throttle : 0, vehiclePr, 1, animDt);
      this.stage2Flame.update(0, vehiclePr);
    } else {
      this.stage2Flame.update(v.stage2PropellantKg > 0 ? v.throttle : 0, vehiclePr, 1, animDt);
      this.rocket.booster.visible = booster !== null;
      if (booster && boosterPos) {
        boosterAxis = toV3(bodyAxis(boosterPos, booster.pitchRad));
        this.rocket.booster.position.copy(toV3(sub(boosterPos, focus)));
        this.rocket.booster.quaternion.setFromUnitVectors(Y_AXIS, boosterAxis);
        boosterCenter = this.rocket.booster.position.clone().addScaledVector(boosterAxis, BOOSTER_CENTER_M);
        const flameScale = BOOSTER_FLAME_SCALE[booster.engines] ?? 1;
        this.stage1Flame.update(
          booster.engines > 0 ? booster.throttle : 0,
          pressureRatio(altitudeOf(boosterPos)),
          flameScale,
          animDt,
        );
        this.updateLegs(booster.legsDeployed, ctx.missionTimeS);
      } else {
        this.stage1Flame.update(0, vehiclePr);
      }
    }

    this.updateFairings(ctx, focus);

    // 연기 — 이륙 중 1단 노즐 위치에서 방출
    const nozzle = v.activeStage === 1 ? vehiclePos : null;
    this.smoke.emit(nozzle, radialUnit(vehiclePos), altitudeOf(vehiclePos), v.activeStage === 1 ? v.throttle : 0, simDt);
    this.smoke.update(simDt, focus);

    // 하늘·별·조명
    const skyT = smoothstep(0, SKY_BLACK_ALTITUDE_M, altitude);
    this.background.copy(this.skyLow).lerp(this.skyHigh, skyT);
    this.scene.background = this.background;
    (this.stars.material as THREE.PointsMaterial).opacity = smoothstep(
      STARS_FADE_START_M,
      STARS_FADE_END_M,
      altitude,
    );
    this.hemi.intensity = 1.1 * (1 - skyT) + 0.15;

    const upperCenter = vehicleRel.clone().addScaledVector(axis, UPPER_STAGE_OFFSET_M + UPPER_STAGE_CENTER_M);
    const deck = this.ship.deckCamera();
    this.rig.setRumble(simDt > 0 ? this.rumbleLevel(ctx) : 0);
    this.rig.update(
      {
        focus: toV3(focus),
        axis,
        up,
        upperCenter,
        boosterCenter,
        boosterAxis,
        deckCamera: deck?.position ?? null,
        deckUp: deck?.up ?? null,
      },
      frameDt,
    );
    this.stars.position.copy(this.rig.camera.position);
    this.smoke.setViewport(this.renderer.domElement.height, this.rig.camera.fov);

    this.post.render(frameDt);
  }

  /** 현재 카메라가 느끼는 지속 진동 (엔진 굉음·동압·착륙 연소) 0~1 */
  private rumbleLevel(ctx: MissionContext): number {
    const s = CAMERA_SHAKE;
    const v = ctx.vehicle;
    const mode = this.rig.mode;
    if (isBoosterView(mode)) {
      const b = ctx.booster;
      if (!b || b.status !== 'flying' || b.engines === 0) return 0;
      const low = 1 - smoothstep(0, s.boosterRumbleAltitudeM, altitudeOf(b.pos));
      return s.boosterRumble * b.throttle * low;
    }
    const burning =
      (v.activeStage === 1 ? v.stage1PropellantKg : v.stage2PropellantKg) > 0 ? v.throttle : 0;
    if (mode === 'pad') {
      if (v.activeStage !== 1) return 0;
      const low = 1 - smoothstep(0, s.padRumbleAltitudeM, altitudeOf(v.pos));
      return s.padRumble * burning * low;
    }
    const q = Math.min(1, ctx.telemetry.dynamicPressurePa / s.maxQReferencePa);
    const engine = mode === 'onboard' ? s.onboardEngineRumble * burning : 0;
    return Math.max(engine, s.maxQRumble * q * q);
  }

  private updateLegs(deployed: boolean, missionTimeS: number): void {
    if (!deployed) {
      this.legDeployStartS = null;
      this.rocket.setLegDeploy(0);
      return;
    }
    this.legDeployStartS ??= missionTimeS;
    this.rocket.setLegDeploy((missionTimeS - this.legDeployStartS) / LEG_DEPLOY_DURATION_S);
  }

  private updateFairings(ctx: MissionContext, focus: Vec2): void {
    const f = this.fairing;
    if (!f) return;
    const t = ctx.missionTimeS - f.startTimeS;
    const visible = t < SEPARATION_VISUAL.fairingVisibleS;
    this.rocket.fairingHalves.forEach((half, i) => {
      half.visible = visible;
      if (!visible) return;
      const sign = i === 0 ? 1 : -1;
      const x = f.pos.x + f.vel.x * t + 0.5 * f.gravity.x * t * t;
      const y = f.pos.y + f.vel.y * t + 0.5 * f.gravity.y * t * t;
      half.position
        .set(x - focus.x, y - focus.y, 0)
        .addScaledVector(f.side, sign * SEPARATION_VISUAL.fairingDriftMps * t);
      half.position.addScaledVector(
        new THREE.Vector3(0, 1, 0).applyQuaternion(f.quaternion),
        MODEL_DIMENSIONS.stage2NozzleLengthM + MODEL_DIMENSIONS.stage2LengthM,
      );
      const spin = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        -sign * SEPARATION_VISUAL.fairingSpinRadPerS * t,
      );
      half.quaternion.copy(f.quaternion).multiply(spin);
    });
  }
}
