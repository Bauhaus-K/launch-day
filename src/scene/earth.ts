/**
 * 지구: 절차적 텍스처의 거대한 구 + 발사장 주변 고해상도 지면(캡) + 대기 발광 껍질.
 *
 * 구의 +Y 극이 발사대를 향하도록 그대로 두어, 극 주변의 조밀한 정점으로 지면 왜곡을 줄인다.
 * 플로팅 원점: 모든 메시는 "현재 초점(기체) 기준 상대 위치"에 배치한다.
 */
import * as THREE from 'three';
import { EARTH_RADIUS_M } from '../data/physics-constants';
import { COLORS, EARTH_VISUAL } from '../data/scene-config';
import type { Vec2 } from '../physics/vec2';
import { createRng, randomRange } from '../utils/random';

/** 발사장 동쪽(다운레인지) 해안선까지의 거리 [m] */
const COASTLINE_OFFSET_M = 2_500;
/** 해안선 굴곡 진폭 [m] */
const COASTLINE_WAVE_M = 1_200;

/** 발사장 기준 로컬 좌표(x 다운레인지, z 측면)에서 육지인지 */
function isLocalLand(x: number, z: number): boolean {
  const wave = Math.sin(z / 3_100) * COASTLINE_WAVE_M + Math.sin(z / 870 + 1.3) * COASTLINE_WAVE_M * 0.3;
  return x < COASTLINE_OFFSET_M + wave;
}

/** 텍스처에서 해안선 규칙을 적용할 극 주변 범위 [rad] (부스터 착륙 해역까지 바다로 덮는다) */
const LOCAL_REGION_ANGLE_RAD = 0.15;

function createEarthTexture(): THREE.CanvasTexture {
  const { textureWidth: w, textureHeight: h } = EARTH_VISUAL;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas를 사용할 수 없습니다');

  const ocean = g.createLinearGradient(0, 0, 0, h);
  ocean.addColorStop(0, COLORS.ocean);
  ocean.addColorStop(0.5, COLORS.oceanDeep);
  ocean.addColorStop(1, COLORS.ocean);
  g.fillStyle = ocean;
  g.fillRect(0, 0, w, h);

  // 대륙: 무작위 원 덩어리
  const rng = createRng(EARTH_VISUAL.seed);
  for (let i = 0; i < EARTH_VISUAL.continentCount; i++) {
    const cx = rng() * w;
    const cy = randomRange(rng, 0.12, 0.85) * h;
    const blobs = 6 + Math.floor(rng() * 14);
    g.fillStyle = rng() < 0.7 ? COLORS.land : COLORS.landDry;
    for (let b = 0; b < blobs; b++) {
      const r = randomRange(rng, 8, 60);
      g.beginPath();
      g.arc(cx + randomRange(rng, -90, 90), cy + randomRange(rng, -50, 50), r, 0, Math.PI * 2);
      g.fill();
    }
  }

  // 극지방 빙하 (발사장 반대편 극)
  g.fillStyle = COLORS.ice;
  g.fillRect(0, h * 0.94, w, h * 0.06);

  // 발사장 주변: 서쪽은 육지, 동쪽(다운레인지)은 바다
  const localRows = Math.ceil((LOCAL_REGION_ANGLE_RAD / Math.PI) * h);
  const image = g.getImageData(0, 0, w, localRows);
  const land = new THREE.Color(COLORS.land);
  const sea = new THREE.Color(COLORS.ocean);
  for (let y = 0; y < localRows; y++) {
    const theta = ((y + 0.5) / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const phi = ((x + 0.5) / w) * Math.PI * 2;
      // THREE.SphereGeometry 정점 공식과 동일한 방향
      const px = -Math.cos(phi) * Math.sin(theta) * EARTH_RADIUS_M;
      const pz = Math.sin(phi) * Math.sin(theta) * EARTH_RADIUS_M;
      const c = isLocalLand(px, pz) ? land : sea;
      const i = (y * w + x) * 4;
      image.data[i] = c.r * 255;
      image.data[i + 1] = c.g * 255;
      image.data[i + 2] = c.b * 255;
    }
  }
  g.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createLocalCap(capAngle: number): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(
    EARTH_RADIUS_M,
    EARTH_VISUAL.widthSegments,
    EARTH_VISUAL.localCapSegments,
    0,
    Math.PI * 2,
    0,
    capAngle,
  );
  // 정점을 발사대 기준 좌표로 옮겨 float32 정밀도 문제를 피한다
  geometry.translate(0, -EARTH_RADIUS_M, 0);

  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const land = new THREE.Color(COLORS.land);
  const sea = new THREE.Color(COLORS.ocean);
  const rng = createRng(EARTH_VISUAL.seed + 1);
  for (let i = 0; i < pos.count; i++) {
    const base = isLocalLand(pos.getX(i), pos.getZ(i)) ? land : sea;
    const shade = 0.9 + rng() * 0.15;
    colors[i * 3] = base.r * shade;
    colors[i * 3 + 1] = base.g * shade;
    colors[i * 3 + 2] = base.b * shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  return new THREE.Mesh(geometry, material);
}

function createAtmosphere(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(
    EARTH_RADIUS_M + EARTH_VISUAL.atmosphereThicknessM,
    128,
    64,
  );
  const material = new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(COLORS.atmosphereGlow) } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 glowColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        #include <logdepthbuf_fragment>
        float rim = 1.0 - max(dot(vNormal, vView), 0.0);
        float intensity = pow(rim, 3.0);
        gl_FragColor = vec4(glowColor, intensity * 0.9);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  return new THREE.Mesh(geometry, material);
}

export class Earth {
  readonly root = new THREE.Group();
  private readonly globe: THREE.Mesh;
  private readonly cap: THREE.Mesh;
  private readonly atmosphere: THREE.Mesh;

  constructor() {
    const capAngle = EARTH_VISUAL.localCapRadiusM / EARTH_RADIUS_M;
    const globeGeometry = new THREE.SphereGeometry(
      EARTH_RADIUS_M,
      EARTH_VISUAL.widthSegments,
      EARTH_VISUAL.heightSegments,
      0,
      Math.PI * 2,
      capAngle,
      Math.PI - capAngle,
    );
    this.globe = new THREE.Mesh(
      globeGeometry,
      new THREE.MeshStandardMaterial({ map: createEarthTexture(), roughness: 0.9, metalness: 0 }),
    );
    this.cap = createLocalCap(capAngle);
    this.atmosphere = createAtmosphere();
    this.root.add(this.globe, this.cap, this.atmosphere);
  }

  /** focus: 현재 렌더링 초점의 월드 좌표 */
  update(focus: Vec2): void {
    this.globe.position.set(-focus.x, -focus.y, 0);
    this.atmosphere.position.copy(this.globe.position);
    this.cap.position.set(-focus.x, EARTH_RADIUS_M - focus.y, 0);
  }
}
