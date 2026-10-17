/**
 * Three.js 씬 총괄. 미션 상태를 읽어서 그리기만 한다 (상태를 바꾸지 않음).
 * 플로팅 원점: 매 프레임 카메라가 따라가는 기체(2단 또는 부스터)의 보간 위치를 원점으로 두고
 * 나머지를 상대 배치한다.
 */
import * as THREE from 'three';
import { EARTH_MU, EARTH_RADIUS_M } from '../data/physics-constants';
import { BOOSTER_HEATING_LIMIT, LEG_DEPLOY_DURATION_S } from '../data/booster-config';
import { MODEL_DIMENSIONS, ROCKET_DIAMETER_M } from '../data/rocket-specs';
import {
  BOOSTER_FLAME_SCALE,
  CAMERA_SHAKE,
  COLORS,
  EVENT_FX,
  EXHAUST,
  FOG,
  PAD,
  PAD_VAPOR,
  PUFFS,
  RENDER,
  ROCKET_DETAIL,
  SEPARATION_VISUAL,
  SHADOW,
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
import type { MissionContext, PhaseId } from '../mission/mission-types';
import { CameraRig, isBoosterView, type CameraMode } from './camera-rig';
import { Earth } from './earth';
import { createStage1Flame, createStage2Flame, type EngineFlame } from './exhaust';
import { LandingShip } from './landing-ship';
import { LaunchPad } from './launch-pad';
import { PostProcessing } from './post-processing';
import { RocketModel, UPPER_STAGE_CENTER_M, UPPER_STAGE_OFFSET_M } from './rocket-model';
import { SkyDome } from './sky-dome';
import { SmokeParticles, type FlameLight, type Point3 } from './smoke-particles';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const SUN_DIRECTION = new THREE.Vector3(0.6, 1, 0.45).normalize();
const BOOSTER_CENTER_M = MODEL_DIMENSIONS.nozzleLengthM + MODEL_DIMENSIONS.stage1LengthM / 2;
/** 부스터 원점(노즐 출구)에서 1단 상단까지 [m] */
const BOOSTER_TOP_M = MODEL_DIMENSIONS.nozzleLengthM + MODEL_DIMENSIONS.stage1LengthM;
/** 액체산소 벤트 위치 (스택 원점 기준 축 방향 높이) [m] */
const LOX_VENT_HEIGHTS_M = [
  BOOSTER_TOP_M - 2,
  UPPER_STAGE_OFFSET_M + MODEL_DIMENSIONS.stage2NozzleLengthM + MODEL_DIMENSIONS.stage2LengthM - 1,
];
/** 연기를 비추는 화염 중심: 노즐에서 화염 길이의 이 비율만큼 뒤 */
const FLAME_LIGHT_OFFSET_RATIO = 0.4;
/** 발사대 물 분사 증기가 퍼지는 반경 [m] */
const DELUGE_RADIUS_M = 20;

const smoothstep = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
const toV3 = (v: Vec2) => new THREE.Vector3(v.x, v.y, 0);
const rnd = () => Math.random() * 2 - 1;
/** 2D 월드 좌표 + 축 방향 오프셋 → 3D 월드 점 */
const along = (p: Vec2, axis: Vec2, d: number, z = 0): Point3 => ({ x: p.x + axis.x * d, y: p.y + axis.y * d, z });

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
  private readonly sun: THREE.DirectionalLight;
  private readonly sky = new SkyDome(SUN_DIRECTION);
  private readonly fog = new THREE.FogExp2(0xffffff, FOG.densityPerM);

  private phase: PhaseId | null = null;
  /** 분리 후 부스터 엔진 누적 연소 시간 [s] (그을음 증가) */
  private boosterBurnS = 0;
  private boosterWasFlying = false;
  private legDeployStartS: number | null = null;
  private fairing: FairingFlight | null = null;
  private unsubscribe: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.post = new PostProcessing(this.renderer, this.scene, this.rig.camera);

    this.sun = this.createSun();
    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x3a4a2a, 1.1);
    this.scene.add(this.sun, this.sun.target, this.hemi, this.sky.mesh);
    this.scene.fog = this.fog;

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

  /** 그림자를 드리우는 태양광. 그림자 영역은 매 프레임 초점 주변으로 옮긴다 */
  private createSun(): THREE.DirectionalLight {
    const sun = new THREE.DirectionalLight(COLORS.sun, 2.6);
    sun.castShadow = true;
    const shadow = sun.shadow;
    shadow.mapSize.set(SHADOW.mapSize, SHADOW.mapSize);
    shadow.bias = SHADOW.bias;
    shadow.normalBias = SHADOW.normalBias;
    const cam = shadow.camera;
    cam.left = -SHADOW.halfExtentM;
    cam.right = SHADOW.halfExtentM;
    cam.top = SHADOW.halfExtentM;
    cam.bottom = -SHADOW.halfExtentM;
    cam.near = 1;
    cam.far = SHADOW.lightDistanceM * 2;
    cam.updateProjectionMatrix();
    return sun;
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
    this.phase = null;
    this.boosterBurnS = 0;
    this.boosterWasFlying = false;
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
        this.separationPuffs(ctx);
      }),
      // 부스터 귀환 구간에서는 카메라가 부스터를 따라가고, 끝나면 2단으로 돌아온다
      bus.on('phase:changed', (e) => {
        this.phase = e.to;
        if (e.to === 'BOOSTER_RETURN') this.rig.setMode('booster');
        else if (e.from === 'BOOSTER_RETURN') this.rig.setMode('chase');
      }),
      bus.on('fairing:separated', () => {
        this.startFairingFlight(ctx);
        this.rig.addTrauma(impulse.fairing);
      }),
      bus.on('engine:ignition', ({ stage }) => {
        this.rig.addTrauma(stage === 1 ? impulse.stage1Ignition : impulse.stage2Ignition);
        if (stage === 1) {
          this.post.triggerFlash(1);
          // 점화 순간 물 분사가 화염에 증발하며 거대한 증기 구름이 피어난다
          this.smoke.burst(
            { x: 0, y: EARTH_RADIUS_M + 4, z: 0 },
            PAD_VAPOR.ignitionBurstCount,
            PUFFS.delugeSteam,
            PAD_VAPOR.delugeSpeedMps * 1.6,
            vec2(0, 1),
          );
        }
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
      bus.on('booster:touchdown', (o) => {
        this.rig.addTrauma(o.landed ? impulse.touchdown : impulse.crash);
        const b = ctx.booster;
        if (o.landed && b) {
          this.smoke.burst(
            { x: b.pos.x, y: b.pos.y, z: 0 },
            EVENT_FX.touchdownBurstCount,
            PUFFS.spray,
            EVENT_FX.spraySpeedMps,
            radialUnit(b.pos),
          );
        }
      }),
    ];
  }

  /** 단 분리: 인터스테이지 냉가스 분출 + 부스터 상단 자세 제어 분사 */
  private separationPuffs(ctx: MissionContext): void {
    const v = ctx.vehicle;
    const axis = bodyAxis(v.pos, v.pitchRad);
    const up = radialUnit(v.pos);
    // 분출 가스는 기체 속도(수 km/s)를 그대로 물려받는다 — 안 그러면 순식간에 뒤로 처진다
    this.smoke.burst(
      along(v.pos, axis, UPPER_STAGE_OFFSET_M - 1),
      EVENT_FX.separationPuffCount,
      PUFFS.coldGas,
      EVENT_FX.separationPuffSpeedMps,
      up,
      { x: v.vel.x, y: v.vel.y, z: 0 },
    );
    const b = ctx.booster;
    if (!b) return;
    const bAxis = bodyAxis(b.pos, b.pitchRad);
    for (const side of [-1, 1]) {
      const top = along(b.pos, bAxis, BOOSTER_TOP_M - 3, side * (ROCKET_DIAMETER_M / 2 + 0.5));
      const drift = { x: b.vel.x, y: b.vel.y, z: side * EVENT_FX.rcsPuffSpeedMps };
      this.smoke.burst(top, EVENT_FX.rcsPuffCount, PUFFS.coldGas, EVENT_FX.rcsPuffSpeedMps * 0.4, up, drift);
    }
  }

  /** 발사 전: 발사대 물 분사 증기, 액체산소 벤팅 */
  private emitPadVapor(ctx: MissionContext, vehiclePos: Vec2, dt: number): void {
    const v = ctx.vehicle;
    const p = this.phase;
    const onPad = p === null || p === 'PRE_LAUNCH' || p === 'COUNTDOWN' || p === 'LIFTOFF';
    if (!onPad || dt <= 0) return;
    const up = radialUnit(vehiclePos);
    const axis = bodyAxis(vehiclePos, v.pitchRad);
    if (!v.enginesOn && p !== 'LIFTOFF') {
      // 극저온 산소가 증발해 벤트로 뿜어져 나오며 기체를 따라 흘러내린다
      const s = PAD_VAPOR.loxVentSpeedMps;
      LOX_VENT_HEIGHTS_M.forEach((h, i) => {
        for (const side of [-1, 1]) {
          this.smoke.stream(`lox${i}${side}`, PAD_VAPOR.loxVentRatePerS, dt, () =>
            this.smoke.spawn(
              along(vehiclePos, axis, h, side * (ROCKET_DIAMETER_M / 2 + 0.2)),
              { x: rnd() * s * 0.3, y: rnd() * s * 0.3, z: side * s * (0.6 + Math.random() * 0.6) },
              PUFFS.loxVent,
              up,
            ),
          );
        }
      });
    }
    // 물 분사: T-10초부터 패드에 물이 쏟아지고, 점화 후 화염에 증발해 증기가 크게 피어난다
    const tMinus = -ctx.missionTimeS;
    const delugeOn = p === 'LIFTOFF' || (p === 'COUNTDOWN' && tMinus <= PAD_VAPOR.delugeStartTMinusS);
    if (!delugeOn || altitudeOf(vehiclePos) > PAD_VAPOR.delugeMaxAltitudeM) return;
    const rate = v.enginesOn ? PAD_VAPOR.delugeIgnitionRatePerS : PAD_VAPOR.delugeRatePerS;
    const s = PAD_VAPOR.delugeSpeedMps;
    this.smoke.stream('deluge', rate, dt, () => {
      const a = Math.random() * Math.PI * 2;
      const r = PAD.padRadiusM * 0.2 + Math.random() * DELUGE_RADIUS_M;
      this.smoke.spawn(
        { x: Math.cos(a) * r, y: EARTH_RADIUS_M + 1, z: Math.sin(a) * r },
        { x: Math.cos(a) * s * Math.random(), y: s * (0.2 + Math.random() * 0.5), z: Math.sin(a) * s * Math.random() },
        PUFFS.delugeSteam,
        vec2(0, 1),
      );
    });
  }

  /** 착륙 연소가 갑판·바다를 때리며 퍼지는 물보라 */
  private emitLandingSpray(boosterPos: Vec2, engines: number, throttle: number, dt: number): void {
    const alt = altitudeOf(boosterPos);
    if (engines === 0 || alt > EVENT_FX.sprayAltitudeM || dt <= 0) return;
    const up = radialUnit(boosterPos);
    const tangent = vec2(up.y, -up.x);
    const near = 1 - alt / EVENT_FX.sprayAltitudeM;
    const s = EVENT_FX.spraySpeedMps;
    const ground = { x: boosterPos.x - up.x * alt, y: boosterPos.y - up.y * alt, z: 0 };
    this.smoke.stream('spray', EVENT_FX.sprayRatePerS * throttle * near, dt, () => {
      const a = Math.random() * Math.PI * 2;
      const h = Math.cos(a) * s * (0.5 + Math.random() * 0.5);
      const lift = s * 0.15 * Math.random();
      this.smoke.spawn(
        ground,
        { x: tangent.x * h + up.x * lift, y: tangent.y * h + up.y * lift, z: Math.sin(a) * s * (0.5 + Math.random() * 0.5) },
        PUFFS.spray,
        up,
      );
    });
  }

  /** 부스터 폭발: 불덩이 + 검은 연기 + 섬광 */
  private explode(pos: Vec2): void {
    const up = radialUnit(pos);
    const center = { x: pos.x + up.x * 10, y: pos.y + up.y * 10, z: 0 };
    this.smoke.burst(center, EVENT_FX.explosionFireballCount, PUFFS.fireball, EVENT_FX.explosionSpeedMps, up);
    this.smoke.burst(center, EVENT_FX.explosionSmokeCount, PUFFS.blackSmoke, EVENT_FX.explosionSpeedMps * 0.5, up);
    this.post.triggerFlash(0.8);
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
    // 파티클 시간: 비행 중엔 시뮬레이션 시간, 메뉴 배경(미션 시작 전)에서는 실제 시간
    const particleDt = simDt > 0 ? simDt : this.phase === null ? frameDt : 0;
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
    let flameLight: FlameLight | null = null;
    const stage1Throttle = v.stage1PropellantKg > 0 ? v.throttle : 0;
    if (v.activeStage === 1) {
      this.rocket.booster.visible = true;
      this.rocket.booster.position.copy(vehicleRel);
      this.rocket.booster.quaternion.copy(stackQuat);
      this.stage1Flame.update(stage1Throttle, vehiclePr, 1, animDt);
      this.stage2Flame.update(0, vehiclePr);
      flameLight = {
        pos: along(vehiclePos, bodyAxis(vehiclePos, v.pitchRad), -EXHAUST.stage1FlameLengthM * FLAME_LIGHT_OFFSET_RATIO),
        strength: stage1Throttle * vehiclePr,
      };
    } else {
      this.stage2Flame.update(v.stage2PropellantKg > 0 ? v.throttle : 0, vehiclePr, 1, animDt);
      this.rocket.booster.visible = booster !== null;
      if (booster && boosterPos) {
        boosterAxis = toV3(bodyAxis(boosterPos, booster.pitchRad));
        this.rocket.booster.position.copy(toV3(sub(boosterPos, focus)));
        this.rocket.booster.quaternion.setFromUnitVectors(Y_AXIS, boosterAxis);
        boosterCenter = this.rocket.booster.position.clone().addScaledVector(boosterAxis, BOOSTER_CENTER_M);
        const flameScale = BOOSTER_FLAME_SCALE[booster.engines] ?? 1;
        const boosterThrottle = booster.engines > 0 ? booster.throttle : 0;
        const boosterPr = pressureRatio(altitudeOf(boosterPos));
        this.stage1Flame.update(boosterThrottle, boosterPr, flameScale, animDt);
        this.updateLegs(booster.legsDeployed, ctx.missionTimeS);
        const flameBack = -EXHAUST.stage1FlameLengthM * FLAME_LIGHT_OFFSET_RATIO * flameScale;
        flameLight = {
          pos: along(boosterPos, bodyAxis(boosterPos, booster.pitchRad), flameBack),
          strength: boosterThrottle * boosterPr * flameScale,
        };
        if (boosterThrottle > 0) this.boosterBurnS += simDt;
        this.emitLandingSpray(boosterPos, booster.engines, boosterThrottle, particleDt);
        const heating = ctx.boosterProgram?.telemetry.heating ?? 0;
        this.rocket.reentryGlow.update(heating / BOOSTER_HEATING_LIMIT, animDt);
      } else {
        this.stage1Flame.update(0, vehiclePr);
      }
    }
    if (!booster) this.rocket.reentryGlow.update(0, 0);

    // 부스터 폭발 (착지 실패·공중 분해) — 상태가 비행 → 파괴로 바뀐 순간
    const crashedBooster = ctx.booster?.status === 'crashed' ? ctx.booster : null;
    if (this.boosterWasFlying && crashedBooster) this.explode(crashedBooster.pos);
    this.boosterWasFlying = ctx.booster?.status === 'flying';

    this.updateFairings(ctx, focus);
    this.updateSurface(ctx);

    // 연기·증기 — 이륙 중 1단 노즐 위치에서 방출
    const nozzle = v.activeStage === 1 ? vehiclePos : null;
    const exhaustThrottle = v.activeStage === 1 ? stage1Throttle : 0;
    this.smoke.emitExhaust(nozzle, radialUnit(vehiclePos), altitudeOf(vehiclePos), exhaustThrottle, simDt);
    this.emitPadVapor(ctx, vehiclePos, particleDt);
    this.smoke.update(particleDt, focus, flameLight);

    // 별·조명
    const skyT = smoothstep(0, SKY_BLACK_ALTITUDE_M, altitude);
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
    // 하늘 돔·원근 안개 (안개 색 = 현재 고도의 지평선 색, 밀도는 대기압에 비례)
    this.sky.update(this.rig.camera.position, up, altitude);
    this.fog.color.copy(this.sky.horizonColor);
    this.fog.density = FOG.densityPerM * pressureRatio(altitude);
    this.updateShadow(up, altitude);

    this.post.render(frameDt);
  }

  /** 그림자 영역을 초점 주변(낮은 고도면 그 아래 지면)으로 옮긴다 */
  private updateShadow(up: THREE.Vector3, altitude: number): void {
    const center = new THREE.Vector3();
    if (altitude < SHADOW.groundCenterAltitudeM) center.addScaledVector(up, -altitude);
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).addScaledVector(SUN_DIRECTION, SHADOW.lightDistanceM);
  }

  /** 그을음(재진입·착륙 연소 누적)과 산소탱크 서리(이륙 후 녹음) */
  private updateSurface(ctx: MissionContext): void {
    const soot = Math.min(1, ROCKET_DETAIL.boosterBaseSoot + this.boosterBurnS * ROCKET_DETAIL.sootPerBurnS);
    const p = this.phase;
    const onPad = p === null || p === 'PRE_LAUNCH' || p === 'COUNTDOWN';
    const frost = onPad ? 1 : 1 - smoothstep(0, ROCKET_DETAIL.frostFadeS, ctx.missionTimeS);
    this.rocket.setSurface(soot, frost);
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
