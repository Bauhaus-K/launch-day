/**
 * 무인 착륙선(바지선)과 주변 바다. 원점 = 갑판 중심(해면 높이), +Y = 국지 연직, +X = 다운레인지.
 * 로고·실제 선박명은 쓰지 않는다 (가상 착륙선).
 */
import * as THREE from 'three';
import { LANDING_DECK_HALF_LENGTH_M, LANDING_DECK_WIDTH_M } from '../data/booster-config';
import { CINEMATIC, COLORS, LANDING_SHIP } from '../data/scene-config';
import { surfacePoint } from '../physics/trajectory';
import type { Vec2 } from '../physics/vec2';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export class LandingShip {
  readonly root = new THREE.Group();
  private world: Vec2 | null = null;

  constructor() {
    const length = LANDING_DECK_HALF_LENGTH_M * 2;
    const width = LANDING_DECK_WIDTH_M;

    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(length, LANDING_SHIP.hullHeightM, width),
      new THREE.MeshStandardMaterial({ color: COLORS.shipHull, roughness: 0.8 }),
    );
    hull.position.y = -LANDING_SHIP.hullHeightM / 2;
    this.root.add(hull);

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(length - 2, 0.2, width - 2),
      new THREE.MeshStandardMaterial({ color: COLORS.shipDeck, roughness: 0.9 }),
    );
    deck.position.y = 0.1;
    this.root.add(deck);

    // 착륙 표적 (원과 십자선)
    const markMat = new THREE.MeshBasicMaterial({ color: COLORS.shipMarking });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(LANDING_SHIP.targetRadiusM - 1, LANDING_SHIP.targetRadiusM, 48),
      markMat,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    this.root.add(ring);
    for (const angle of [0, Math.PI / 2]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(LANDING_SHIP.targetRadiusM * 2, 1), markMat);
      bar.rotation.set(-Math.PI / 2, 0, angle);
      bar.position.y = 0.26;
      this.root.add(bar);
    }

    // 갑판 양옆 방호벽
    const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.shipHull, roughness: 0.7 });
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(length, LANDING_SHIP.wallHeightM, 1.5), wallMat);
      wall.position.set(0, LANDING_SHIP.wallHeightM / 2, side * (width / 2 - 0.75));
      this.root.add(wall);
    }

    // 착륙선 주변 바다 (거대한 지구 구의 다각형 오차를 가린다)
    const ocean = new THREE.Mesh(
      new THREE.CircleGeometry(LANDING_SHIP.oceanRadiusM, 64),
      new THREE.MeshStandardMaterial({ color: COLORS.ocean, roughness: 0.4, metalness: 0.1 }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -LANDING_SHIP.draftM;
    this.root.add(ocean);

    this.root.visible = false;
  }

  /** 착륙선 위치 설정 (null이면 숨김) */
  place(downrangeM: number | null): void {
    if (downrangeM === null) {
      this.world = null;
      this.root.visible = false;
      return;
    }
    this.world = surfacePoint(downrangeM);
    const up = new THREE.Vector3(this.world.x, this.world.y, 0).normalize();
    this.root.quaternion.setFromUnitVectors(Y_AXIS, up);
    this.root.visible = true;
  }

  get placed(): boolean {
    return this.world !== null;
  }

  update(focus: Vec2): void {
    if (!this.world) return;
    this.root.position.set(this.world.x - focus.x, this.world.y - focus.y, 0);
  }

  /** 갑판 카메라 위치 (초점 기준 상대 좌표, update 이후 호출). 착륙선이 없으면 null */
  deckCamera(): { position: THREE.Vector3; up: THREE.Vector3 } | null {
    if (!this.world) return null;
    const o = CINEMATIC.deckCameraOffset;
    const position = new THREE.Vector3(o.x, o.y, o.z).applyQuaternion(this.root.quaternion).add(this.root.position);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.root.quaternion);
    return { position, up };
  }
}
