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
import { CameraRig, type CameraMode } from './camera-rig';
import { Earth } from './earth';
import { createStage1Flame, createStage2Flame, type EngineFlame } from './exhaust';
import { LandingShip } from './landing-ship';
import { LaunchPad } from './launch-pad';
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
    return this.rig.cycle(boosterAvailable);
  }

  /** 새 미션에 연결 (재시작 시 연출 상태 초기화) */
  bind(mission: Mission): void {
    this.unsubscribe.forEach((off) => off());
    this.smoke.reset();
    this.fairing = null;
    this.legDeployStartS = null;
    this.rocket.setLegDeploy(0);
    this.ship.place(null);
    this.rig.mode = 'pad';
    for (const half of this.rocket.fairingHalves) {
      half.position.set(0, MODEL_DIMENSIONS.stage2NozzleLengthM + MODEL_DIMENSIONS.stage2LengthM, 0);
      half.quaternion.identity();
      this.rocket.upper.add(half);
    }

    const ctx = mission.ctx;
    this.unsubscribe = [
      mission.bus.on('stage:separated', () => this.ship.place(ctx.boosterProgram?.shipDownrangeM ?? null)),
      // 부스터 귀환 구간에서는 카메라가 부스터를 따라가고, 끝나면 2단으로 돌아온다
      mission.bus.on('phase:changed', (e) => {
        if (e.to === 'BOOSTER_RETURN') this.rig.mode = 'booster';
        else if (e.from === 'BOOSTER_RETURN') this.rig.mode = 'chase';
      }),
      mission.bus.on('fairing:separated', () => this.startFairingFlight(ctx)),
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
    const focus = this.rig.mode === 'booster' && boosterPos ? boosterPos : vehiclePos;
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
      this.stage1Flame.update(v.stage1PropellantKg > 0 ? v.throttle : 0, vehiclePr);
      this.stage2Flame.update(0, vehiclePr);
    } else {
      this.stage2Flame.update(v.stage2PropellantKg > 0 ? v.throttle : 0, vehiclePr);
      this.rocket.booster.visible = booster !== null;
      if (booster && boosterPos) {
        boosterAxis = toV3(bodyAxis(boosterPos, booster.pitchRad));
        this.rocket.booster.position.copy(toV3(sub(boosterPos, focus)));
        this.rocket.booster.quaternion.setFromUnitVectors(Y_AXIS, boosterAxis);
        boosterCenter = this.rocket.booster.position.clone().addScaledVector(boosterAxis, BOOSTER_CENTER_M);
        const flameScale = BOOSTER_FLAME_SCALE[booster.engines] ?? 1;
        this.stage1Flame.update(booster.engines > 0 ? booster.throttle : 0, pressureRatio(altitudeOf(boosterPos)), flameScale);
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
    this.rig.update({ focus: toV3(focus), axis, up, upperCenter, boosterCenter, boosterAxis }, frameDt);
    this.stars.position.copy(this.rig.camera.position);
    this.smoke.setViewport(this.renderer.domElement.height, this.rig.camera.fov);

    this.renderer.render(this.scene, this.rig.camera);
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
