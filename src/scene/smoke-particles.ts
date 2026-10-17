/**
 * 연기·증기·불꽃 파티클. 고정 크기 풀(오브젝트 풀링)을 재사용하며 하나의 Points 드로콜로 그린다.
 * 파티클 위치는 월드 좌표(배정밀도)로 저장하고, 매 프레임 초점 기준 상대 좌표로 GPU에 올린다.
 *
 * - 절차 생성 퍼프 텍스처를 파티클마다 다른 각도로 회전해 그린다 (뭉게구름 질감)
 * - 막 태어난 연기는 화염색으로 빛나고(glow), 화염 근처 연기는 화염빛을 받는다 (HDR → 블룸)
 * - 종류별 모양(PuffSpec): 배기 연기, 지면 구름, 물 분사 증기, 산소 벤팅, 냉가스, 물보라, 불덩이
 */
import * as THREE from 'three';
import { COLORS, PUFFS, SMOKE, type PuffSpec } from '../data/scene-config';
import type { Vec2 } from '../physics/vec2';
import { createPuffTexture } from './procedural-textures';

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 부력 방향 (국지 연직) */
  ux: number;
  uy: number;
  age: number;
  life: number;
  rotation: number;
  spin: number;
  spec: PuffSpec;
  color: THREE.Color;
}

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 연기를 비추는 화염 (월드 좌표, 세기 0~1) */
export interface FlameLight {
  readonly pos: Point3;
  readonly strength: number;
}

const rnd = () => Math.random() * 2 - 1;

export class SmokeParticles {
  readonly points: THREE.Points;
  private readonly pool: Particle[] = [];
  private readonly positions: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly colors: Float32Array;
  private readonly rotations: Float32Array;
  private readonly flameColor = new THREE.Color(COLORS.flameOuter);
  private readonly specColors = new Map<PuffSpec, THREE.Color>();
  private readonly carry = new Map<string, number>();
  private cursor = 0;

  constructor() {
    const n = SMOKE.poolSize;
    for (let i = 0; i < n; i++) {
      this.pool.push({
        alive: false,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ux: 0, uy: 1,
        age: 0, life: 1, rotation: 0, spin: 0,
        spec: PUFFS.exhaust,
        color: new THREE.Color(),
      });
    }
    this.positions = new Float32Array(n * 3);
    this.sizes = new Float32Array(n);
    this.alphas = new Float32Array(n);
    this.colors = new Float32Array(n * 3);
    this.rotations = new Float32Array(n);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute('rotation', new THREE.BufferAttribute(this.rotations, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        puff: { value: createPuffTexture() },
        viewportScale: { value: 800 },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        attribute float rotation;
        uniform float viewportScale;
        varying float vAlpha;
        varying vec3 vColor;
        varying vec2 vRot;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(1024.0, size * viewportScale / max(1.0, -mv.z));
          vAlpha = alpha;
          vColor = color;
          vRot = vec2(cos(rotation), sin(rotation));
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <logdepthbuf_pars_fragment>
        uniform sampler2D puff;
        varying float vAlpha;
        varying vec3 vColor;
        varying vec2 vRot;
        void main() {
          #include <logdepthbuf_fragment>
          vec2 d = gl_PointCoord - 0.5;
          vec2 uv = vec2(d.x * vRot.x - d.y * vRot.y, d.x * vRot.y + d.y * vRot.x) + 0.5;
          vec4 tex = texture2D(puff, uv);
          float a = vAlpha * tex.a;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vColor * tex.rgb, a);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;
  }

  /** 화면 높이와 시야각으로 포인트 크기 배율 갱신 */
  setViewport(heightPx: number, fovDeg: number): void {
    const material = this.points.material as THREE.ShaderMaterial;
    const uniform = material.uniforms['viewportScale'];
    if (uniform) uniform.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  private colorOf(spec: PuffSpec): THREE.Color {
    let c = this.specColors.get(spec);
    if (!c) {
      c = new THREE.Color(spec.color);
      this.specColors.set(spec, c);
    }
    return c;
  }

  /** 파티클 하나 생성 (풀에서 가장 오래된 것을 재사용) */
  spawn(pos: Point3, vel: Point3, spec: PuffSpec, up: Vec2): void {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    if (!p) return;
    p.alive = true;
    p.x = pos.x;
    p.y = pos.y;
    p.z = pos.z;
    p.vx = vel.x;
    p.vy = vel.y;
    p.vz = vel.z;
    p.ux = up.x;
    p.uy = up.y;
    p.age = 0;
    p.life = spec.minLifeS + Math.random() * (spec.maxLifeS - spec.minLifeS);
    p.rotation = Math.random() * Math.PI * 2;
    p.spin = rnd() * spec.spin;
    p.spec = spec;
    // 같은 종류라도 밝기를 조금씩 다르게
    p.color.copy(this.colorOf(spec)).multiplyScalar(0.88 + Math.random() * 0.2);
  }

  /** 한 지점에서 사방으로 퍼지는 파티클 묶음 */
  burst(center: Point3, count: number, spec: PuffSpec, speedMps: number, up: Vec2, drift: Point3 = { x: 0, y: 0, z: 0 }): void {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3().randomDirection().multiplyScalar(speedMps * (0.3 + 0.7 * Math.random()));
      this.spawn(center, { x: dir.x + drift.x, y: dir.y + drift.y, z: dir.z + drift.z }, spec, up);
    }
  }

  /**
   * 초당 rate개 비율로 연속 방출 (프레임 사이 남은 소수 부분은 key별로 이월)
   * @param emit 파티클 하나를 만드는 함수
   */
  stream(key: string, ratePerS: number, dt: number, emit: () => void): void {
    let c = (this.carry.get(key) ?? 0) + ratePerS * dt;
    while (c >= 1) {
      c -= 1;
      emit();
    }
    this.carry.set(key, c);
  }

  /**
   * 엔진 배기 연기
   * @param nozzle 노즐 출구 월드 좌표 (null이면 방출 안 함)
   * @param up 국지 연직 단위 벡터
   * @param altitudeM 노즐 고도
   * @param throttle 엔진 스로틀
   * @param dt 시뮬레이션 경과 시간(배속 반영)
   */
  emitExhaust(nozzle: Vec2 | null, up: Vec2, altitudeM: number, throttle: number, dt: number): void {
    if (!nozzle || throttle < 0.05 || altitudeM > SMOKE.maxAltitudeM) return;
    const nearGround = altitudeM < SMOKE.groundAltitudeM;
    if (nearGround) {
      // 지면에서 옆으로 퍼지는 구름 (발사대 기준 지면 높이)
      const s = SMOKE.groundSpreadSpeedMps;
      const gx = nozzle.x - up.x * altitudeM;
      const gy = nozzle.y - up.y * altitudeM;
      this.stream('ground', SMOKE.groundEmitRatePerS * throttle, dt, () =>
        this.spawn(
          { x: gx + up.x * 3, y: gy + up.y * 3, z: rnd() * 5 },
          { x: rnd() * s + up.x * Math.random() * s * 0.3, y: rnd() * s + up.y * Math.random() * s * 0.3, z: rnd() * s },
          PUFFS.groundCloud,
          up,
        ),
      );
    }
    const s = SMOKE.airSpreadSpeedMps;
    const origin = { x: nozzle.x, y: nozzle.y, z: 0 };
    this.stream('exhaust', SMOKE.emitRatePerS * throttle, dt, () =>
      this.spawn(origin, { x: rnd() * s, y: rnd() * s, z: rnd() * s }, PUFFS.exhaust, up),
    );
  }

  /**
   * @param flame 연기를 비추는 화염 (null이면 없음)
   */
  update(dt: number, focus: Vec2, flame: FlameLight | null): void {
    const light = flame && flame.strength > 0.01 ? flame : null;
    const range = SMOKE.flameLightRangeM;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p) continue;
      if (p.alive) {
        p.age += dt;
        if (p.age >= p.life) p.alive = false;
        const damp = Math.exp(-p.spec.drag * dt);
        p.vx = p.vx * damp + p.ux * p.spec.buoyancy * dt;
        p.vy = p.vy * damp + p.uy * p.spec.buoyancy * dt;
        p.vz *= damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.rotation += p.spin * dt;
      }
      const t = p.alive ? p.age / p.life : 1;
      this.positions[i * 3] = p.x - focus.x;
      this.positions[i * 3 + 1] = p.y - focus.y;
      this.positions[i * 3 + 2] = p.z;
      this.sizes[i] = p.spec.startSizeM + (p.spec.endSizeM - p.spec.startSizeM) * Math.sqrt(t);
      this.alphas[i] = p.alive ? p.spec.opacity * Math.min(1, t * 20) * (1 - t) ** 1.2 : 0;
      this.rotations[i] = p.rotation;

      // 막 태어난 연기의 화염색 발광 + 근처 화염이 비추는 빛
      let heat = p.spec.glow * Math.max(0, 1 - t / p.spec.glowFade) ** 2;
      if (light) {
        const dx = p.x - light.pos.x;
        const dy = p.y - light.pos.y;
        const dz = p.z - light.pos.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        heat += SMOKE.flameLightIntensity * light.strength * Math.exp(-d / range);
      }
      this.colors[i * 3] = p.color.r + this.flameColor.r * heat;
      this.colors[i * 3 + 1] = p.color.g + this.flameColor.g * heat;
      this.colors[i * 3 + 2] = p.color.b + this.flameColor.b * heat;
    }
    const geometry = this.points.geometry;
    for (const name of ['position', 'size', 'alpha', 'color', 'rotation']) {
      geometry.getAttribute(name).needsUpdate = true;
    }
  }

  reset(): void {
    for (const p of this.pool) p.alive = false;
    this.carry.clear();
  }
}
