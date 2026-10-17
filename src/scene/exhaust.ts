/**
 * 엔진 배기 화염 (셰이더). 스로틀에 따라 길이가, 외기압이 낮을수록 폭이 커진다(진공 팽창).
 * - 노이즈가 노즐에서 끝으로 흘러가며 일렁인다
 * - 외기압이 높을 때(해면 근처) 충격 다이아몬드(마하 디스크) 줄무늬가 보인다
 * - HDR 밝기로 그려 후처리 블룸으로 빛나 보이게 한다
 * - 점화 순간 잠깐 크고 밝아지는 섬광
 */
import * as THREE from 'three';
import { COLORS, EXHAUST, FLAME_FX } from '../data/scene-config';

const CORE_LENGTH_RATIO = 0.45;
const CORE_RADIUS_RATIO = 0.55;
const OUTER_OPACITY = 0.85;
/** 진공에서 바깥 화염 불투명도 비율 */
const VACUUM_OPACITY_RATIO = 0.15;
/** 화염 단면 프로파일: 노즐 출구 반경 비율, 가장 굵은 지점(길이 비율) */
const PLUME_EXIT_RATIO = 0.75;
const PLUME_BULGE_AT = 0.22;
const PLUME_STEPS = 24;
const PLUME_RADIAL_SEGMENTS = 32;

/** 연기 파티클보다 나중에 그려 화염이 연기에 묻히지 않게 한다 */
export const FLAME_RENDER_ORDER = 2;

const flameVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uLength;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    vUv = uv;
    // 화염 길이로 정규화한 로컬 좌표 (스케일과 무관하게 노이즈 무늬가 일정하도록)
    vLocal = position / uLength;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`;

const flameFragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform float uScroll;
  uniform vec3 uInnerColor;
  uniform vec3 uOuterColor;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uShock;
  uniform float uDiamonds;
  uniform float uFlash;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  void main() {
    #include <logdepthbuf_fragment>
    float t = clamp(vUv.y, 0.0, 1.0); // 0 노즐 → 1 끝
    // 가장자리(시선과 면이 비스듬한 곳)를 부드럽게 흐려 원뿔 윤곽을 감춘다
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float edge = smoothstep(0.05, 0.7, facing);

    // 노즐 → 끝 방향으로 흘러가는 난류 노이즈 (두 옥타브)
    vec3 p = vLocal * vec3(9.0, 3.5, 9.0) + vec3(0.0, uTime * uScroll * 3.5, 0.0);
    float n = noise(p) * 0.65 + noise(p * 2.3 + 7.1) * 0.35;

    float falloff = pow(1.0 - t, 1.4);
    float diamonds = pow(0.5 + 0.5 * cos(t * uDiamonds * 6.2831853), 8.0) * (1.0 - t) * uShock;

    vec3 color = mix(uInnerColor, uOuterColor, smoothstep(0.0, 0.4, t + (1.0 - facing) * 0.3));
    float glow = falloff * (0.55 + 0.6 * n) + diamonds * ${FLAME_FX.shockDiamondBoost.toFixed(2)};
    float alpha = clamp(edge * (falloff * (0.45 + 0.55 * n) + diamonds) * uOpacity, 0.0, 1.0);
    vec3 emission = color * uIntensity * (1.0 + uFlash) * glow;
    // 미리 곱한 알파(premultiplied): 빛은 더하고, 알파만큼만 뒤를 가린다
    gl_FragColor = vec4(emission * alpha, alpha * 0.9);
  }
`;

/** 노즐(원점)에서 -Y로 뻗는 종 모양 화염 기둥 */
function plumeGeometry(radius: number, length: number): THREE.LatheGeometry {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= PLUME_STEPS; i++) {
    const t = i / PLUME_STEPS;
    const swell =
      t < PLUME_BULGE_AT
        ? PLUME_EXIT_RATIO + (1 - PLUME_EXIT_RATIO) * Math.sin(((t / PLUME_BULGE_AT) * Math.PI) / 2)
        : Math.cos((((t - PLUME_BULGE_AT) / (1 - PLUME_BULGE_AT)) * Math.PI) / 2);
    points.push(new THREE.Vector2(Math.max(0.001, radius * swell), -t * length));
  }
  return new THREE.LatheGeometry(points, PLUME_RADIAL_SEGMENTS);
}

function flameMesh(
  radius: number,
  length: number,
  inner: number,
  outer: number,
  intensity: number,
): THREE.Mesh<THREE.LatheGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uLength: { value: length },
      uTime: { value: 0 },
      uScroll: { value: FLAME_FX.scrollSpeed },
      uInnerColor: { value: new THREE.Color(inner) },
      uOuterColor: { value: new THREE.Color(outer) },
      uIntensity: { value: intensity },
      uOpacity: { value: 1 },
      uShock: { value: 0 },
      uDiamonds: { value: FLAME_FX.shockDiamondCount },
      uFlash: { value: 0 },
    },
    vertexShader: flameVertexShader,
    fragmentShader: flameFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(plumeGeometry(radius, length), material);
  mesh.renderOrder = FLAME_RENDER_ORDER;
  return mesh;
}

export class EngineFlame {
  readonly root = new THREE.Group();
  private readonly outer: THREE.Mesh<THREE.LatheGeometry, THREE.ShaderMaterial>;
  private readonly core: THREE.Mesh<THREE.LatheGeometry, THREE.ShaderMaterial>;
  private readonly light: THREE.PointLight;
  private time = 0;
  private flash = 0;
  private wasBurning = false;

  constructor(
    radius: number,
    length: number,
    outerColor: number,
    private readonly lightIntensity: number,
    private readonly shockDiamonds: boolean,
  ) {
    this.outer = flameMesh(radius, length, COLORS.flameCore, outerColor, FLAME_FX.outerIntensity);
    this.core = flameMesh(
      radius * CORE_RADIUS_RATIO,
      length * CORE_LENGTH_RATIO,
      COLORS.flameCore,
      outerColor,
      FLAME_FX.coreIntensity,
    );
    this.core.renderOrder = FLAME_RENDER_ORDER + 1;
    this.light = new THREE.PointLight(COLORS.flameOuter, 0, length * 20, 2);
    this.light.position.y = -length * 0.3;
    this.root.add(this.outer, this.core, this.light);
  }

  /** 엔진이 켜진 직후인지 (점화 섬광 진행 중이면 0~1) */
  get ignitionFlash(): number {
    return this.flash;
  }

  /**
   * @param throttle 0~1 (0이면 숨김)
   * @param pressureRatio 해면 대비 외기압 (0~1)
   * @param sizeScale 엔진 수 등에 따른 화염 크기 배율
   * @param dt 애니메이션 경과 시간 [s] (일시정지 중 0)
   */
  update(throttle: number, pressureRatio: number, sizeScale = 1, dt = 0): void {
    const burning = throttle > 0.01;
    this.root.visible = burning;
    if (burning && !this.wasBurning) this.flash = 1;
    this.wasBurning = burning;
    if (!burning) {
      this.light.intensity = 0;
      this.flash = 0;
      return;
    }
    this.time += dt;
    this.flash *= Math.exp(-dt / FLAME_FX.ignitionFlashDecayS);

    const w = this.time * Math.PI * 2 * FLAME_FX.flickerHz;
    const flicker = 1 + FLAME_FX.flickerAmount * (0.6 * Math.sin(w) + 0.4 * Math.sin(w * 1.73 + 1.3));
    const burst = 1 + FLAME_FX.ignitionFlashBoost * this.flash * 0.5;
    // 외기압이 충분히 낮아진 뒤(고고도)에야 화염이 크게 퍼지도록 3제곱 곡선
    const width = (1 + EXHAUST.vacuumExpansion * (1 - pressureRatio) ** 3) * flicker * sizeScale * burst;
    const len = (0.4 + 0.6 * throttle) * flicker * (1 + 0.8 * (1 - pressureRatio)) * sizeScale * burst;
    this.outer.scale.set(width, len, width);
    this.core.scale.set(Math.sqrt(width), len, Math.sqrt(width));

    const shock = this.shockDiamonds ? pressureRatio * pressureRatio * throttle : 0;
    // 고고도에서 넓게 퍼진 화염은 옅어진다
    const outerOpacity = OUTER_OPACITY * (VACUUM_OPACITY_RATIO + (1 - VACUUM_OPACITY_RATIO) * pressureRatio);
    for (const [mesh, opacity] of [
      [this.outer, outerOpacity],
      [this.core, 1],
    ] as const) {
      const u = mesh.material.uniforms;
      setUniform(u, 'uTime', this.time);
      setUniform(u, 'uOpacity', opacity);
      setUniform(u, 'uShock', shock);
      setUniform(u, 'uFlash', FLAME_FX.ignitionFlashBoost * this.flash);
    }
    this.light.intensity =
      this.lightIntensity * throttle * pressureRatio * (1 + FLAME_FX.ignitionFlashBoost * this.flash);
  }
}

function setUniform(uniforms: Record<string, THREE.IUniform>, name: string, value: number): void {
  const u = uniforms[name];
  if (u) u.value = value;
}

export const createStage1Flame = () =>
  new EngineFlame(EXHAUST.stage1FlameRadiusM, EXHAUST.stage1FlameLengthM, COLORS.flameOuter, 1.5e4, true);

export const createStage2Flame = () =>
  new EngineFlame(EXHAUST.stage2FlameRadiusM, EXHAUST.stage2FlameLengthM, COLORS.vacuumFlame, 0, false);
