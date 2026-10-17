/**
 * 재진입 플라스마 발광: 부스터가 엔진부를 앞세워 짙은 대기로 고속 진입할 때
 * 엔진부를 감싸는 충격층이 주황빛으로 달아오르는 연출. 가열량(½ρv³)에 비례한다.
 * 부스터 그룹의 자식으로 붙인다 (원점 = 1단 노즐 출구, +Y = 기체 축).
 */
import * as THREE from 'three';
import { EVENT_FX } from '../data/scene-config';
import { ROCKET_DIAMETER_M } from '../data/rocket-specs';

/** 발광 껍질: 반경 배율, 노즐 아래로 나온 길이, 위로 덮는 길이 [m] */
const SHELL_RADIUS_RATIO = 0.68;
const SHELL_BELOW_M = 7;
const SHELL_ABOVE_M = 12;

export class ReentryGlow {
  readonly mesh: THREE.Mesh<THREE.LatheGeometry, THREE.ShaderMaterial>;
  private time = 0;

  constructor() {
    const r = ROCKET_DIAMETER_M * SHELL_RADIUS_RATIO;
    // 아래쪽(진행 방향)이 둥글게 부푼 충격층 모양
    const points: THREE.Vector2[] = [];
    const STEPS = 20;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const y = -SHELL_BELOW_M + t * (SHELL_BELOW_M + SHELL_ABOVE_M);
      const nose = Math.min(1, t * 2.2);
      points.push(new THREE.Vector2(Math.max(0.05, r * Math.sin((nose * Math.PI) / 2)), y));
    }
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uIntensity: { value: 0 },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(EVENT_FX.plasmaColor) },
        uBelow: { value: SHELL_BELOW_M },
        uSpan: { value: SHELL_BELOW_M + SHELL_ABOVE_M },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        uniform float uBelow;
        uniform float uSpan;
        varying float vT;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vAngle;
        void main() {
          vT = (position.y + uBelow) / uSpan;
          vAngle = atan(position.z, position.x);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <logdepthbuf_pars_fragment>
        uniform float uIntensity;
        uniform float uTime;
        uniform vec3 uColor;
        varying float vT;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vAngle;
        void main() {
          #include <logdepthbuf_fragment>
          float facing = abs(dot(normalize(vNormal), normalize(vView)));
          // 가장자리(충격층 윤곽)가 더 밝게 보이는 림 효과
          float rim = pow(1.0 - facing, 1.5) * 0.8 + 0.25;
          // 진행 방향(아래)에서 가장 뜨겁고 위로 갈수록 흘러가며 식는다
          float heat = pow(1.0 - clamp(vT, 0.0, 1.0), 1.6);
          float ripple = 0.75 + 0.25 * sin(vAngle * 7.0 + uTime * 9.0 + vT * 14.0) * sin(uTime * 5.3 + vT * 23.0);
          float a = clamp(rim * heat * ripple * uIntensity, 0.0, 4.0);
          vec3 c = mix(uColor, vec3(1.0, 0.85, 0.7), heat * 0.5);
          gl_FragColor = vec4(c * a, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.LatheGeometry(points, 32), material);
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }

  /**
   * @param heatingRatio 가열량 / 허용 한계 (0이면 숨김)
   * @param dt 애니메이션 경과 시간 [s]
   */
  update(heatingRatio: number, dt: number): void {
    const level = THREE.MathUtils.clamp(
      (heatingRatio - EVENT_FX.plasmaStartRatio) / (1 - EVENT_FX.plasmaStartRatio),
      0,
      1.5,
    );
    this.mesh.visible = level > 0.001;
    if (!this.mesh.visible) return;
    this.time += dt;
    const u = this.mesh.material.uniforms;
    if (u['uIntensity']) u['uIntensity'].value = level * EVENT_FX.plasmaIntensity;
    if (u['uTime']) u['uTime'].value = this.time;
  }
}
