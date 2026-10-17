/**
 * 대기 하늘 돔: 카메라를 감싸는 구에 하늘을 그린다 (깊이 테스트 없이 가장 먼저 그림).
 * - 지평선(밝고 옅은 하늘색) → 천정(짙은 파랑) 그라데이션, 태양 원반과 산란광
 * - 고도가 오르면 천정부터 검게 변하고, 지평선에 얇은 푸른 띠만 남는다
 * - 고도에 따라 지평선이 내려가는 각도(지구 곡률)를 반영한다
 * 물리적 산란 계산이 아닌 근사 모델 (게임용).
 */
import * as THREE from 'three';
import { EARTH_RADIUS_M } from '../data/physics-constants';
import { COLORS, SKY, SKY_BLACK_ALTITUDE_M } from '../data/scene-config';

const smoothstep = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

export class SkyDome {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly zenithLow = new THREE.Color(SKY.zenithLow);
  private readonly horizonLow = new THREE.Color(SKY.horizonLow);
  private readonly horizonHigh = new THREE.Color(SKY.horizonHigh);
  private readonly black = new THREE.Color(COLORS.skyHigh);
  /** 현재 고도의 지평선 색 (안개 색으로도 쓴다) */
  readonly horizonColor = new THREE.Color();

  constructor(sunDirection: THREE.Vector3) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uUp: { value: new THREE.Vector3(0, 1, 0) },
        uSun: { value: sunDirection.clone() },
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uHorizonDip: { value: 0 },
        uBandSharpness: { value: 3 },
        uSunGlow: { value: new THREE.Color(SKY.sunGlowColor) },
        uHaze: { value: 1 },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vDir;
        void main() {
          vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uUp;
        uniform vec3 uSun;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform float uHorizonDip;
        uniform float uBandSharpness;
        uniform vec3 uSunGlow;
        uniform float uHaze;
        varying vec3 vDir;
        void main() {
          #include <logdepthbuf_fragment>
          vec3 dir = normalize(vDir);
          // 지평선 기준 고도각 (지평선이 내려간 만큼 보정)
          float h = dot(dir, uUp) + uHorizonDip;
          float above = max(h, 0.0);
          vec3 color = mix(uHorizon, uZenith, 1.0 - exp(-above * uBandSharpness));
          // 지평선 아래(지구에 가려지지 않은 틈)는 지평선 색을 약간 어둡게
          color *= h < 0.0 ? 0.85 : 1.0;

          float cosSun = dot(dir, uSun);
          // 태양 주변 산란광 (미 산란 근사) — 대기가 짙을수록 넓고 밝다
          float mie = pow(max(cosSun, 0.0), 12.0) * 0.35 * uHaze + pow(max(cosSun, 0.0), 300.0) * 1.5;
          color += uSunGlow * mie;
          // 태양 원반 (HDR → 블룸)
          float disc = smoothstep(${SKY.sunDiscCos.toFixed(6)}, ${(SKY.sunDiscCos + (1 - SKY.sunDiscCos) * 0.4).toFixed(6)}, cosSun);
          color += uSunGlow * disc * ${SKY.sunDiscIntensity.toFixed(1)};
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY.domeRadiusM, 64, 32), material);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  /**
   * @param cameraPos 카메라 위치 (돔 중심)
   * @param up 국지 연직 방향
   * @param altitudeM 카메라(초점) 고도
   */
  update(cameraPos: THREE.Vector3, up: THREE.Vector3, altitudeM: number): void {
    this.mesh.position.copy(cameraPos);
    const u = this.mesh.material.uniforms;
    const skyT = smoothstep(0, SKY_BLACK_ALTITUDE_M, altitudeM);
    // 천정은 일찍 검어지고, 지평선은 늦게까지 푸른 띠로 남는다
    const zenithT = smoothstep(0, SKY_BLACK_ALTITUDE_M * 0.6, altitudeM);
    (u['uZenith']?.value as THREE.Color).copy(this.zenithLow).lerp(this.black, zenithT);
    this.horizonColor.copy(this.horizonLow).lerp(this.horizonHigh, skyT);
    (u['uHorizon']?.value as THREE.Color).copy(this.horizonColor);
    (u['uUp']?.value as THREE.Vector3).copy(up);
    const r = EARTH_RADIUS_M + Math.max(0, altitudeM);
    // 지평선이 수평선 아래로 내려간 각도의 사인값
    const dip = Math.sqrt(Math.max(0, 1 - (EARTH_RADIUS_M / r) ** 2));
    setValue(u, 'uHorizonDip', dip);
    // 고도가 높을수록 지평선 띠가 얇아진다
    setValue(u, 'uBandSharpness', 3 + skyT * 60);
    setValue(u, 'uHaze', 1 - skyT);
  }
}

function setValue(uniforms: Record<string, THREE.IUniform>, name: string, value: number): void {
  const u = uniforms[name];
  if (u) u.value = value;
}
