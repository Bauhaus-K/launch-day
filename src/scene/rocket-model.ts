/**
 * 로켓 3D 모델 (기본 도형으로 절차 생성). 축은 +Y.
 * - booster: 1단 + 인터스테이지, 원점 = 1단 노즐 출구
 * - upper: 2단 + 페어링, 원점 = 2단 노즐 출구
 * 탱크 표면: 재사용 부스터 그을음, 극저온 산소탱크 서리 (절차 텍스처 + 셰이더 보간)
 */
import * as THREE from 'three';
import { COLORS, LEG_DEPLOY_ANGLE_RAD, ROCKET_DETAIL } from '../data/scene-config';
import { MODEL_DIMENSIONS as D, ROCKET_DIAMETER_M } from '../data/rocket-specs';
import { createRocketDetailTexture } from './procedural-textures';
import { ReentryGlow } from './reentry-glow';

const R = ROCKET_DIAMETER_M / 2;

/** booster 원점에서 upper 원점까지의 축 방향 거리 [m] */
export const UPPER_STAGE_OFFSET_M =
  D.nozzleLengthM + D.stage1LengthM + D.interstageLengthM - D.stage2NozzleLengthM;

/** upper 원점 기준 기체 중앙(카메라 조준점)의 높이 [m] */
export const UPPER_STAGE_CENTER_M = D.stage2NozzleLengthM + D.stage2LengthM / 2;

/** 1단 엔진 배치: 중앙 1기 + 원형 8기 */
const OUTER_ENGINE_COUNT = 8;
const OUTER_ENGINE_RING_RATIO = 0.68;
const ENGINE_NOZZLE_RADIUS_M = 0.46;
const LEG_COUNT = 4;
const GRID_FIN_COUNT = 4;
const GRID_FIN_SIZE_M = 1.4;
const RADIAL_SEGMENTS = 32;

const whiteMat = () => new THREE.MeshStandardMaterial({ color: COLORS.rocketWhite, roughness: 0.45 });
const darkMat = () => new THREE.MeshStandardMaterial({ color: COLORS.interstage, roughness: 0.6 });
const nozzleMat = () =>
  new THREE.MeshStandardMaterial({ color: COLORS.nozzle, roughness: 0.4, metalness: 0.6 });

let detailTexture: THREE.DataTexture | null = null;

/** 그을음·서리 정도를 셰이더 uniform으로 바꿀 수 있는 탱크 재질 */
interface TankSurface {
  readonly material: THREE.MeshStandardMaterial;
  readonly soot: { value: number };
  readonly frost: { value: number };
}

function tankSurface(frostRange: readonly [number, number]): TankSurface {
  detailTexture ??= createRocketDetailTexture();
  const material = new THREE.MeshStandardMaterial({ color: COLORS.rocketWhite, roughness: 0.45, map: detailTexture });
  const soot = { value: 0 };
  const frost = { value: 0 };
  const frostColor = new THREE.Color(ROCKET_DETAIL.frostColor);
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uSoot'] = soot;
    shader.uniforms['uFrost'] = frost;
    shader.uniforms['uFrostRange'] = { value: new THREE.Vector2(frostRange[0], frostRange[1]) };
    shader.uniforms['uFrostColor'] = { value: frostColor };
    shader.fragmentShader =
      'uniform float uSoot;\nuniform float uFrost;\nuniform vec2 uFrostRange;\nuniform vec3 uFrostColor;\n' +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        /* glsl */ `
        vec4 detail = texture2D(map, vMapUv);
        // R: 그을음 (검은 갈색으로 어둡게)
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.06, 0.05), clamp(detail.r * uSoot * 2.0, 0.0, 0.95));
        // G: 서리 무늬 — 산소탱크 구간에서, 서리가 녹을수록 얼룩이 줄어든다
        float band = smoothstep(uFrostRange.x, uFrostRange.x + 0.04, vMapUv.y)
          * (1.0 - smoothstep(uFrostRange.y - 0.04, uFrostRange.y, vMapUv.y));
        float frostThreshold = 0.38 + (1.0 - uFrost) * 0.55;
        float frostMask = band * smoothstep(frostThreshold, frostThreshold + 0.1, detail.g);
        diffuseColor.rgb = mix(diffuseColor.rgb, uFrostColor * (0.9 + 0.2 * detail.g), frostMask * 0.95);
        `,
      );
  };
  return { material, soot, frost };
}

/** 기체 옆면을 따라 붙은 배선 덮개(레이스웨이) */
function raceway(length: number, y: number, angle: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(ROCKET_DETAIL.racewayDepthM, length, ROCKET_DETAIL.racewayWidthM),
    mat,
  );
  m.position.set(Math.cos(angle) * (R + ROCKET_DETAIL.racewayDepthM / 2), y, Math.sin(angle) * (R + ROCKET_DETAIL.racewayDepthM / 2));
  m.rotation.y = -angle;
  return m;
}

function buildBooster(legPivots: THREE.Group[], surface: TankSurface): THREE.Group {
  const group = new THREE.Group();
  const dark = darkMat();
  const nozzle = nozzleMat();

  const tank = new THREE.Mesh(new THREE.CylinderGeometry(R, R, D.stage1LengthM, RADIAL_SEGMENTS), surface.material);
  tank.position.y = D.nozzleLengthM + D.stage1LengthM / 2;
  group.add(tank);
  group.add(raceway(D.stage1LengthM - 1, D.nozzleLengthM + D.stage1LengthM / 2, Math.PI * 0.12, whiteMat()));

  // 엔진부 열차폐판 (노즐 위 어두운 바닥면)
  const heatShield = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.98, R * 0.98, 0.4, RADIAL_SEGMENTS), dark);
  heatShield.position.y = D.nozzleLengthM + 0.2;
  group.add(heatShield);

  const interstage = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, D.interstageLengthM, RADIAL_SEGMENTS, 1, true),
    dark,
  );
  interstage.position.y = D.nozzleLengthM + D.stage1LengthM + D.interstageLengthM / 2;
  group.add(interstage);

  // 엔진 노즐 9기
  const nozzleGeo = new THREE.CylinderGeometry(
    ENGINE_NOZZLE_RADIUS_M * 0.5,
    ENGINE_NOZZLE_RADIUS_M,
    D.nozzleLengthM,
    12,
    1,
    true,
  );
  const placeNozzle = (x: number, z: number) => {
    const m = new THREE.Mesh(nozzleGeo, nozzle);
    m.position.set(x, D.nozzleLengthM / 2, z);
    group.add(m);
  };
  placeNozzle(0, 0);
  for (let i = 0; i < OUTER_ENGINE_COUNT; i++) {
    const a = (i / OUTER_ENGINE_COUNT) * Math.PI * 2;
    placeNozzle(Math.cos(a) * R * OUTER_ENGINE_RING_RATIO, Math.sin(a) * R * OUTER_ENGINE_RING_RATIO);
  }

  // 착륙 다리: 아래쪽 경첩(pivot)에 달려 있고, 접힌 상태에서는 몸체를 따라 위로 향한다
  const legGeo = new THREE.BoxGeometry(0.5, D.legLengthM, 0.35);
  for (let i = 0; i < LEG_COUNT; i++) {
    const a = (i / LEG_COUNT) * Math.PI * 2 + Math.PI / 4;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * (R + 0.15), D.nozzleLengthM, Math.sin(a) * (R + 0.15));
    // 회전 후 pivot의 +X가 바깥쪽을 향한다
    pivot.rotation.y = -a;
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.y = D.legLengthM / 2;
    pivot.add(leg);
    group.add(pivot);
    legPivots.push(pivot);
  }

  // 그리드 핀 (상단)
  const finGeo = new THREE.BoxGeometry(GRID_FIN_SIZE_M, GRID_FIN_SIZE_M, 0.15);
  for (let i = 0; i < GRID_FIN_COUNT; i++) {
    const a = (i / GRID_FIN_COUNT) * Math.PI * 2;
    const fin = new THREE.Mesh(finGeo, dark);
    fin.position.set(
      Math.cos(a) * (R + 0.2),
      D.nozzleLengthM + D.stage1LengthM - 1.5,
      Math.sin(a) * (R + 0.2),
    );
    fin.rotation.y = -a + Math.PI / 2;
    group.add(fin);
  }
  return group;
}

/** 페어링 반쪽 (원통 + 오지브 노즈) */
function buildFairingHalf(phiStart: number): THREE.Mesh {
  const rf = D.fairingDiameterM / 2;
  const points: THREE.Vector2[] = [new THREE.Vector2(R, 0), new THREE.Vector2(rf, 1.2)];
  points.push(new THREE.Vector2(rf, D.fairingCylinderLengthM));
  const noseSteps = 12;
  for (let i = 1; i <= noseSteps; i++) {
    const t = i / noseSteps;
    // 탄젠트 오지브 근사
    const radius = rf * Math.sqrt(1 - t * t);
    points.push(new THREE.Vector2(Math.max(0.01, radius), D.fairingCylinderLengthM + t * D.fairingNoseLengthM));
  }
  const geometry = new THREE.LatheGeometry(points, RADIAL_SEGMENTS / 2, phiStart, Math.PI);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: COLORS.rocketWhite,
    roughness: 0.4,
    side: THREE.DoubleSide,
  }));
  mesh.position.y = D.stage2NozzleLengthM + D.stage2LengthM;
  return mesh;
}

function buildUpper(surface: TankSurface): { group: THREE.Group; fairingHalves: [THREE.Mesh, THREE.Mesh] } {
  const group = new THREE.Group();
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 1.4, D.stage2NozzleLengthM, 24, 1, true),
    nozzleMat(),
  );
  nozzle.position.y = D.stage2NozzleLengthM / 2;
  group.add(nozzle);

  const tank = new THREE.Mesh(new THREE.CylinderGeometry(R, R, D.stage2LengthM, RADIAL_SEGMENTS), surface.material);
  tank.position.y = D.stage2NozzleLengthM + D.stage2LengthM / 2;
  group.add(tank);
  group.add(raceway(D.stage2LengthM - 0.5, D.stage2NozzleLengthM + D.stage2LengthM / 2, Math.PI * 0.12, whiteMat()));

  const halves: [THREE.Mesh, THREE.Mesh] = [buildFairingHalf(0), buildFairingHalf(Math.PI)];
  group.add(...halves);
  return { group, fairingHalves: halves };
}

export class RocketModel {
  readonly booster: THREE.Group;
  readonly upper: THREE.Group;
  readonly fairingHalves: [THREE.Mesh, THREE.Mesh];
  readonly reentryGlow = new ReentryGlow();
  private readonly legPivots: THREE.Group[] = [];
  private readonly boosterSurface = tankSurface(ROCKET_DETAIL.stage1FrostRange);
  private readonly upperSurface = tankSurface(ROCKET_DETAIL.stage2FrostRange);

  constructor() {
    this.booster = buildBooster(this.legPivots, this.boosterSurface);
    const upper = buildUpper(this.upperSurface);
    this.upper = upper.group;
    this.fairingHalves = upper.fairingHalves;
    for (const root of [this.booster, this.upper]) {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
    }
    this.fairingHalves.forEach((h) => (h.castShadow = true));
    this.booster.add(this.reentryGlow.mesh);
  }

  /**
   * 표면 상태
   * @param boosterSoot 부스터 그을음 (0~1)
   * @param frost 산소탱크 서리 (0~1, 1단·2단 공통)
   */
  setSurface(boosterSoot: number, frost: number): void {
    this.boosterSurface.soot.value = boosterSoot;
    this.boosterSurface.frost.value = frost;
    this.upperSurface.frost.value = frost;
  }

  /** 착륙 다리 전개 정도 (0 접힘 ~ 1 펼침) */
  setLegDeploy(progress: number): void {
    const angle = -LEG_DEPLOY_ANGLE_RAD * Math.max(0, Math.min(1, progress));
    for (const pivot of this.legPivots) pivot.rotation.z = angle;
  }
}
