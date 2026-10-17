/**
 * 엔진 배기 화염. 스로틀에 따라 길이가, 외기압이 낮을수록 폭이 커진다(진공 팽창).
 */
import * as THREE from 'three';
import { COLORS, EXHAUST } from '../data/scene-config';

const CORE_LENGTH_RATIO = 0.45;
const CORE_RADIUS_RATIO = 0.55;
const OUTER_OPACITY = 0.7;
/** 진공에서 바깥 화염 불투명도 비율 */
const VACUUM_OPACITY_RATIO = 0.15;

/** 연기 파티클보다 나중에 그려 화염이 연기에 묻히지 않게 한다 */
export const FLAME_RENDER_ORDER = 2;

function flameCone(radius: number, length: number, color: number, opacity: number): THREE.Mesh {
  const geometry = new THREE.ConeGeometry(radius, length, 24, 1, true);
  // 꼭짓점이 아래(-Y)를 향하고 밑면이 원점에 오도록
  geometry.rotateX(Math.PI);
  geometry.translate(0, -length / 2, 0);
  // 밝은 낮 하늘에서도 보이도록 가산 혼합 대신 일반 혼합 사용
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = FLAME_RENDER_ORDER;
  return mesh;
}

export class EngineFlame {
  readonly root = new THREE.Group();
  private readonly outer: THREE.Mesh;
  private readonly core: THREE.Mesh;
  private readonly light: THREE.PointLight;

  constructor(
    radius: number,
    length: number,
    outerColor: number,
    private readonly lightIntensity: number,
  ) {
    this.outer = flameCone(radius, length, outerColor, OUTER_OPACITY);
    this.core = flameCone(radius * CORE_RADIUS_RATIO, length * CORE_LENGTH_RATIO, COLORS.flameCore, 0.95);
    this.core.renderOrder = FLAME_RENDER_ORDER + 1;
    this.light = new THREE.PointLight(COLORS.flameOuter, 0, length * 20, 2);
    this.light.position.y = -length * 0.3;
    this.root.add(this.outer, this.core, this.light);
  }

  /**
   * @param throttle 0~1 (0이면 숨김)
   * @param pressureRatio 해면 대비 외기압 (0~1)
   * @param sizeScale 엔진 수 등에 따른 화염 크기 배율
   */
  update(throttle: number, pressureRatio: number, sizeScale = 1): void {
    const visible = throttle > 0.01;
    this.root.visible = visible;
    if (!visible) {
      this.light.intensity = 0;
      return;
    }
    const flicker = 1 + (Math.random() - 0.5) * EXHAUST.flickerAmount * 2;
    // 외기압이 충분히 낮아진 뒤(고고도)에야 화염이 크게 퍼지도록 3제곱 곡선
    const width = (1 + EXHAUST.vacuumExpansion * (1 - pressureRatio) ** 3) * flicker * sizeScale;
    const len = (0.4 + 0.6 * throttle) * flicker * (1 + 0.8 * (1 - pressureRatio)) * sizeScale;
    this.outer.scale.set(width, len, width);
    // 고고도에서 넓게 퍼진 화염은 옅어진다
    (this.outer.material as THREE.MeshBasicMaterial).opacity =
      OUTER_OPACITY * (VACUUM_OPACITY_RATIO + (1 - VACUUM_OPACITY_RATIO) * pressureRatio);
    this.core.scale.set(Math.sqrt(width), len, Math.sqrt(width));
    this.light.intensity = this.lightIntensity * throttle * pressureRatio;
  }
}

export const createStage1Flame = () =>
  new EngineFlame(EXHAUST.stage1FlameRadiusM, EXHAUST.stage1FlameLengthM, COLORS.flameOuter, 1.5e4);

export const createStage2Flame = () =>
  new EngineFlame(EXHAUST.stage2FlameRadiusM, EXHAUST.stage2FlameLengthM, COLORS.vacuumFlame, 0);
