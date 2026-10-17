/**
 * 카메라 모드: 발사대 / 추적 / 온보드 / 부스터.
 * 모든 좌표는 플로팅 원점(초점 = 2단 기준점) 기준 상대 좌표.
 */
import * as THREE from 'three';
import { EARTH_RADIUS_M } from '../data/physics-constants';
import { CAMERA, RENDER } from '../data/scene-config';
import { t } from '../i18n';

export type CameraMode = 'pad' | 'chase' | 'onboard' | 'booster';

export const cameraLabel = (mode: CameraMode): string => t(`camera.${mode}`);

const ORDER: readonly CameraMode[] = ['pad', 'chase', 'onboard', 'booster'];

export interface CameraTargets {
  /** 초점(2단 기준점)의 월드 좌표 */
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
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'pad';
  private readonly smoothed = new THREE.Vector3();
  private initialized = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(RENDER.baseFovDeg, aspect, RENDER.nearM, RENDER.farM);
  }

  /** 다음 사용 가능한 모드로 전환 */
  cycle(boosterAvailable: boolean): CameraMode {
    let idx = ORDER.indexOf(this.mode);
    do {
      idx = (idx + 1) % ORDER.length;
    } while (ORDER[idx] === 'booster' && !boosterAvailable);
    this.mode = ORDER[idx] ?? 'pad';
    this.initialized = false;
    return this.mode;
  }

  update(t: CameraTargets, frameDt: number): void {
    if (this.mode === 'booster' && !t.boosterCenter) {
      this.mode = 'chase';
      this.initialized = false;
    }
    const cam = this.camera;
    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();
    let fov: number = RENDER.baseFovDeg;
    cam.up.copy(t.up);

    switch (this.mode) {
      case 'pad': {
        const o = CAMERA.padCameraOffset;
        // 발사대 월드 좌표 (0, R) 기준 → 초점 상대 좌표
        desired.set(o.x - t.focus.x, EARTH_RADIUS_M + o.y - t.focus.y, o.z);
        look.copy(t.upperCenter).addScaledVector(t.axis, -20);
        const dist = desired.distanceTo(look);
        fov = THREE.MathUtils.clamp(
          THREE.MathUtils.radToDeg(2 * Math.atan(CAMERA.padCameraFramingM / 2 / dist)),
          CAMERA.padCameraMinFovDeg,
          RENDER.baseFovDeg,
        );
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

    cam.position.copy(this.smoothed);
    cam.lookAt(look);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
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
