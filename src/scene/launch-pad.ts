/**
 * 발사대: 콘크리트 패드, 격자형 발사탑, 화염 배출구. 원점 = 패드 중심 지면.
 */
import * as THREE from 'three';
import { EARTH_RADIUS_M } from '../data/physics-constants';
import { COLORS, PAD } from '../data/scene-config';
import type { Vec2 } from '../physics/vec2';

/** 탑 격자 한 칸 높이 [m] */
const TOWER_BAY_M = 5;
const BEAM_M = 0.5;
const PAD_THICKNESS_M = 1.5;
/** 피뢰탑 높이 [m] */
const LIGHTNING_MAST_HEIGHT_M = 110;
const LIGHTNING_MAST_DISTANCE_M = 70;

function buildTower(): THREE.Group {
  const tower = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: COLORS.tower, roughness: 0.8, metalness: 0.3 });
  const half = PAD.towerWidthM / 2;
  const post = new THREE.BoxGeometry(BEAM_M, PAD.towerHeightM, BEAM_M);
  for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]] as const) {
    const m = new THREE.Mesh(post, mat);
    m.position.set(x, PAD.towerHeightM / 2, z);
    tower.add(m);
  }
  const beamX = new THREE.BoxGeometry(PAD.towerWidthM, BEAM_M, BEAM_M);
  const beamZ = new THREE.BoxGeometry(BEAM_M, BEAM_M, PAD.towerWidthM);
  for (let y = TOWER_BAY_M; y <= PAD.towerHeightM; y += TOWER_BAY_M) {
    for (const z of [-half, half]) {
      const m = new THREE.Mesh(beamX, mat);
      m.position.set(0, y, z);
      tower.add(m);
    }
    for (const x of [-half, half]) {
      const m = new THREE.Mesh(beamZ, mat);
      m.position.set(x, y, 0);
      tower.add(m);
    }
  }
  // 승무원 접근 암 (기체 쪽으로 뻗은 다리)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(PAD.towerOffsetM - 2, 2, 2), mat);
  arm.position.set(PAD.towerOffsetM / 2, PAD.towerHeightM - 12, 0);
  tower.add(arm);
  tower.position.x = -PAD.towerOffsetM - half;
  return tower;
}

export class LaunchPad {
  readonly root = new THREE.Group();

  constructor() {
    const concrete = new THREE.MeshStandardMaterial({ color: COLORS.padConcrete, roughness: 0.95 });
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(PAD.padRadiusM, PAD.padRadiusM * 1.15, PAD_THICKNESS_M, 48),
      concrete,
    );
    pad.position.y = -PAD_THICKNESS_M / 2 + 0.05;
    this.root.add(pad);

    const trench = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.2, PAD.padRadiusM * 1.6),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 1 }),
    );
    trench.position.set(0, 0.06, PAD.padRadiusM * 0.4);
    this.root.add(trench);

    this.root.add(buildTower());

    const mastMat = new THREE.MeshStandardMaterial({ color: COLORS.tower });
    const mastGeo = new THREE.CylinderGeometry(0.4, 0.8, LIGHTNING_MAST_HEIGHT_M, 8);
    for (const [x, z] of [[-LIGHTNING_MAST_DISTANCE_M, 0], [LIGHTNING_MAST_DISTANCE_M * 0.5, -LIGHTNING_MAST_DISTANCE_M]] as const) {
      const mast = new THREE.Mesh(mastGeo, mastMat);
      mast.position.set(x, LIGHTNING_MAST_HEIGHT_M / 2, z);
      this.root.add(mast);
    }
  }

  update(focus: Vec2): void {
    this.root.position.set(-focus.x, EARTH_RADIUS_M - focus.y, 0);
  }
}
