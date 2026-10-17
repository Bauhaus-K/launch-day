/**
 * 카메라 모드: 발사대 / 추적 / 온보드 / 갑판 / 부스터.
 * 모든 좌표는 플로팅 원점(초점 = 따라가는 기체 기준점) 기준 상대 좌표.
 * 연출: 트라우마 모델 카메라 흔들림, 단 분리 시네마틱 컷.
 */
import * as THREE from 'three';
import { EARTH_RADIUS_M } from '../data/physics-constants';
import { CAMERA, CAMERA_SHAKE, CINEMATIC, RENDER } from '../data/scene-config';
import { t } from '../i18n';

export type CameraMode = 'pad' | 'chase' | 'onboard' | 'deck' | 'booster';

export const cameraLabel = (mode: CameraMode): string => t(`camera.${mode}`);

/** 부스터를 따라가는(부스터가 초점인) 시점인지 */
export const isBoosterView = (mode: CameraMode): boolean => mode === 'booster' || mode === 'deck';

const ORDER: readonly CameraMode[] = ['pad', 'chase', 'onboard', 'deck', 'booster'];

export interface CameraTargets {
  /** 초점의 월드 좌표 */
  readonly focus: THREE.Vector3;
  /** 2단 기체 축 방향 (월드) */
  readonly axis: THREE.Vector3;
  /** 국지 연직 방향 */
  readonly up: THREE.Vector3;
  /** 2단 중앙의 상대 좌표 */
  readonly upperCenter: THREE.Vector3;
  /** 부스터 중앙의 상대 좌표 (없으면 null) */
  readonly boosterCenter: THREE.Vector3 | null;
  readonly boosterAxis: THREE.Vector3 | null;
  /** 착륙선 갑판 카메라 위치 (착륙선이 없으면 null) */
  readonly deckCamera: THREE.Vector3 | null;
  /** 착륙선 갑판 국지 연직 방향 */
  readonly deckUp: THREE.Vector3 | null;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'pad';
  private readonly smoothed = new THREE.Vector3();
  private initialized = false;
  private trauma = 0;
  private rumble = 0;
  private shakeTime = 0;
  private separationShotS = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(RENDER.baseFovDeg, aspect, RENDER.nearM, RENDER.farM);
  }

  /** 다음 사용 가능한 모드로 전환 */
  cycle(boosterAvailable: boolean, deckAvailable: boolean): CameraMode {
    let idx = ORDER.indexOf(this.mode);
    const unavailable = (m: CameraMode | undefined) =>
      (m === 'booster' && !boosterAvailable) || (m === 'deck' && !(boosterAvailable && deckAvailable));
    do {
      idx = (idx + 1) % ORDER.length;
    } while (unavailable(ORDER[idx]));
    this.setMode(ORDER[idx] ?? 'pad');
    return this.mode;
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.initialized = false;
  }

  /** 순간 충격 (점화·분리·착지 등). 0~1, 누적되며 시간에 따라 줄어든다 */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** 지속 진동 (엔진 굉음·동압 등) — 매 프레임 설정, 순간 충격보다 작으면 무시된다 */
  setRumble(amount: number): void {
    this.rumble = THREE.MathUtils.clamp(amount, 0, 1);
  }

  /** 단 분리 직후 두 기체를 함께 담는 측면 컷 */
  playSeparationShot(): void {
    this.separationShotS = CINEMATIC.separationShotS;
  }

  reset(): void {
    this.setMode('pad');
    this.trauma = 0;
    this.rumble = 0;
    this.separationShotS = 0;
  }

  update(t: CameraTargets, frameDt: number): void {
    if (isBoosterView(this.mode) && !t.boosterCenter) this.setMode('chase');
    if (this.mode === 'deck' && !t.deckCamera) this.setMode('booster');
    const cam = this.camera;
    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();
    let fov: number = RENDER.baseFovDeg;
    cam.up.copy(t.up);

    this.separationShotS = Math.max(0, this.separationShotS - frameDt);
    const separationShot =
      this.separationShotS > 0 && t.boosterCenter && (this.mode === 'chase' || this.mode === 'onboard');

    if (separationShot && t.boosterCenter) {
      // 두 기체 중간을 옆에서 바라본다 — 거리는 두 기체 간격에 맞춰 늘린다
      const mid = t.upperCenter.clone().lerp(t.boosterCenter, 0.5);
      const gap = t.upperCenter.distanceTo(t.boosterCenter);
      desired
        .copy(mid)
        .add(new THREE.Vector3(0, 0, CINEMATIC.separationSideM + gap * 1.2))
        .addScaledVector(t.up, 10);
      look.copy(mid);
      this.smoothTo(desired, frameDt);
    } else {
      switch (this.mode) {
        case 'pad': {
          const o = CAMERA.padCameraOffset;
          // 발사대 월드 좌표 (0, R) 기준 → 초점 상대 좌표
          desired.set(o.x - t.focus.x, EARTH_RADIUS_M + o.y - t.focus.y, o.z);
          look.copy(t.upperCenter).addScaledVector(t.axis, -20);
          fov = framingFov(desired.distanceTo(look), CAMERA.padCameraFramingM, CAMERA.padCameraMinFovDeg);
          cam.up.set(0, 1, 0);
          this.smoothed.copy(desired);
          break;
        }
        case 'chase': {
          const side = new THREE.Vector3(0, 0, 1);
          desired
            .copy(t.upperCenter)
            .addScaledVector(t.axis, -CAMERA.chaseBackM)
            .addScaledVector(side, CAMERA.chaseSideM)
            .addScaledVector(t.up, CAMERA.chaseUpM);
          look.copy(t.upperCenter).addScaledVector(t.axis, -15);
          this.smoothTo(desired, frameDt);
          break;
        }
        case 'onboard': {
          desired
            .copy(t.upperCenter)
            .addScaledVector(t.axis, CAMERA.onboardForwardM)
            .add(new THREE.Vector3(0, 0, CAMERA.onboardSideM));
          look.copy(desired).addScaledVector(t.axis, -100);
          cam.up.copy(t.axis);
          fov = CAMERA.onboardFovDeg;
          this.smoothed.copy(desired);
          break;
        }
        case 'deck': {
          // 착륙선 갑판에 고정된 카메라가 내려오는 부스터를 망원으로 추적
          const center = t.boosterCenter ?? t.upperCenter;
          desired.copy(t.deckCamera ?? center);
          look.copy(center);
          fov = framingFov(desired.distanceTo(look), CINEMATIC.deckFramingM, CINEMATIC.deckMinFovDeg);
          if (t.deckUp) cam.up.copy(t.deckUp);
          this.smoothed.copy(desired);
          break;
        }
        case 'booster': {
          // 옆에서 약간 위에서 내려다보는 시점 — 부스터와 아래 착륙선이 함께 보이도록
          const center = t.boosterCenter ?? t.upperCenter;
          desired
            .copy(center)
            .add(new THREE.Vector3(0, 0, CAMERA.boosterSideM))
            .addScaledVector(t.up, CAMERA.boosterUpM);
          look.copy(center).addScaledVector(t.up, -CAMERA.boosterLookDownM);
          this.smoothTo(desired, frameDt);
          break;
        }
      }
    }

    cam.position.copy(this.smoothed);
    cam.lookAt(look);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    this.applyShake(frameDt);
  }

  /** 시야각에 비례한 작은 회전으로 흔든다 (망원·광각 모두 같은 화면 비율로 흔들림) */
  private applyShake(frameDt: number): void {
    this.trauma = Math.max(0, this.trauma - CAMERA_SHAKE.decayPerS * frameDt);
    this.shakeTime += frameDt;
    const level = Math.max(this.trauma, this.rumble);
    if (level <= 0.001) return;
    const s = level * level;
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const amp = CAMERA_SHAKE.maxFovFraction * fovRad * s;
    const w = this.shakeTime * Math.PI * 2 * CAMERA_SHAKE.frequencyHz;
    this.camera.rotateX(amp * wobble(w, 0));
    this.camera.rotateY(amp * wobble(w, 2.1));
    this.camera.rotateZ(CAMERA_SHAKE.maxRollRad * s * wobble(w * 0.6, 4.3));
  }

  private smoothTo(desired: THREE.Vector3, frameDt: number): void {
    if (!this.initialized) {
      this.smoothed.copy(desired);
      this.initialized = true;
      return;
    }
    const k = 1 - Math.exp(-frameDt / CAMERA.smoothingS);
    this.smoothed.lerp(desired, k);
  }
}

/** 대상까지 거리에서 framingM 높이를 화면에 담는 시야각 [deg] */
function framingFov(distanceM: number, framingM: number, minFovDeg: number): number {
  return THREE.MathUtils.clamp(
    THREE.MathUtils.radToDeg(2 * Math.atan(framingM / 2 / distanceM)),
    minFovDeg,
    RENDER.baseFovDeg,
  );
}

/** 주파수가 서로소에 가까운 사인 합 — 규칙적으로 보이지 않는 부드러운 흔들림 (-1~1) */
function wobble(w: number, phase: number): number {
  return 0.5 * Math.sin(w + phase) + 0.3 * Math.sin(w * 2.31 + phase * 1.7) + 0.2 * Math.sin(w * 4.07 + phase * 0.3);
}
