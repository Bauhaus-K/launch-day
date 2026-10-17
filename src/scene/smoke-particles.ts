/**
 * 배기 연기 파티클. 고정 크기 풀(오브젝트 풀링)을 재사용하며 하나의 Points 드로콜로 그린다.
 * 파티클 위치는 월드 좌표(배정밀도)로 저장하고, 매 프레임 초점 기준 상대 좌표로 GPU에 올린다.
 */
import * as THREE from 'three';
import { COLORS, SMOKE } from '../data/scene-config';
import type { Vec2 } from '../physics/vec2';

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
}

export class SmokeParticles {
  readonly points: THREE.Points;
  private readonly pool: Particle[] = [];
  private readonly positions: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private cursor = 0;
  private emitCarry = 0;

  constructor() {
    const n = SMOKE.poolSize;
    for (let i = 0; i < n; i++) {
      this.pool.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1 });
    }
    this.positions = new Float32Array(n * 3);
    this.sizes = new Float32Array(n);
    this.alphas = new Float32Array(n);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(COLORS.smoke) },
        viewportScale: { value: 800 },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float size;
        attribute float alpha;
        uniform float viewportScale;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(512.0, size * viewportScale / max(1.0, -mv.z));
          vAlpha = alpha;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <logdepthbuf_pars_fragment>
        uniform vec3 color;
        varying float vAlpha;
        void main() {
          #include <logdepthbuf_fragment>
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d) * 4.0;
          if (r > 1.0) discard;
          gl_FragColor = vec4(color, vAlpha * (1.0 - r));
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

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    if (!p) return;
    p.alive = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.age = 0;
    p.life = SMOKE.minLifeS + Math.random() * (SMOKE.maxLifeS - SMOKE.minLifeS);
  }

  /**
   * @param nozzle 노즐 출구 월드 좌표 (null이면 방출 안 함)
   * @param up 국지 연직 단위 벡터
   * @param altitudeM 노즐 고도
   * @param throttle 엔진 스로틀
   * @param dt 시뮬레이션 경과 시간(배속 반영)
   */
  emit(nozzle: Vec2 | null, up: Vec2, altitudeM: number, throttle: number, dt: number): void {
    if (!nozzle || throttle < 0.05 || altitudeM > SMOKE.maxAltitudeM) return;
    const nearGround = altitudeM < SMOKE.groundAltitudeM;
    const rate = SMOKE.emitRatePerS + (nearGround ? SMOKE.groundEmitRatePerS : 0);
    this.emitCarry += rate * throttle * dt;
    const rnd = () => Math.random() * 2 - 1;
    while (this.emitCarry >= 1) {
      this.emitCarry -= 1;
      if (nearGround) {
        // 지면에서 옆으로 퍼지는 구름 (발사대 기준 지면 높이)
        const s = SMOKE.groundSpreadSpeedMps;
        const gx = nozzle.x - up.x * altitudeM;
        const gy = nozzle.y - up.y * altitudeM;
        this.spawn(gx, gy + 3, rnd() * 5, rnd() * s, Math.random() * s * 0.3, rnd() * s);
      } else {
        const s = SMOKE.airSpreadSpeedMps;
        this.spawn(nozzle.x, nozzle.y, 0, rnd() * s, rnd() * s, rnd() * s);
      }
    }
  }

  update(dt: number, focus: Vec2): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p) continue;
      if (p.alive) {
        p.age += dt;
        if (p.age >= p.life) p.alive = false;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
      const t = p.alive ? p.age / p.life : 1;
      this.positions[i * 3] = p.x - focus.x;
      this.positions[i * 3 + 1] = p.y - focus.y;
      this.positions[i * 3 + 2] = p.z;
      this.sizes[i] = SMOKE.startSizeM + (SMOKE.endSizeM - SMOKE.startSizeM) * Math.sqrt(t);
      this.alphas[i] = p.alive ? 0.55 * (1 - t) : 0;
    }
    const geometry = this.points.geometry;
    for (const name of ['position', 'size', 'alpha']) {
      const attr = geometry.getAttribute(name);
      attr.needsUpdate = true;
    }
  }

  reset(): void {
    for (const p of this.pool) p.alive = false;
  }
}
