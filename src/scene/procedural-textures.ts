/**
 * 절차 생성 텍스처 (외부 이미지 에셋 없이 코드로 만든다 — 라이선스 걱정 없음).
 * - 연기 퍼프: 가장자리가 울퉁불퉁한 구름 덩어리 (알파)
 * - 로켓 표면 디테일: R = 그을음 농도, G = 서리 무늬 (원통 둘레 방향으로 이음매 없이 반복)
 */
import * as THREE from 'three';
import { TEXTURE_SEEDS } from '../data/scene-config';
import { createRng } from '../utils/random';

/** 격자 값 노이즈 (period 주기로 반복) */
function valueNoise(seed: number, periodX: number, periodY: number): (x: number, y: number) => number {
  const rng = createRng(seed);
  const grid = Float32Array.from({ length: periodX * periodY }, () => rng());
  const at = (ix: number, iy: number) =>
    grid[(((iy % periodY) + periodY) % periodY) * periodX + (((ix % periodX) + periodX) % periodX)] ?? 0;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx;
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx;
    return a + (b - a) * fy;
  };
}

/** 여러 옥타브를 더한 프랙탈 노이즈 (0~1). 가로 방향은 baseX 주기로 이음매 없이 반복 */
function fbm(seed: number, baseX: number, baseY: number, octaves: number): (u: number, v: number) => number {
  const layers = Array.from({ length: octaves }, (_, o) => ({
    noise: valueNoise(seed + o * 101, baseX << o, baseY << o),
    sx: baseX << o,
    sy: baseY << o,
    amp: 0.5 ** o,
  }));
  const total = layers.reduce((s, l) => s + l.amp, 0);
  return (u, v) => layers.reduce((s, l) => s + l.noise(u * l.sx, v * l.sy) * l.amp, 0) / total;
}

function dataTexture(size: { w: number; h: number }, pixel: (u: number, v: number) => [number, number, number, number]): THREE.DataTexture {
  const data = new Uint8Array(size.w * size.h * 4);
  for (let y = 0; y < size.h; y++) {
    for (let x = 0; x < size.w; x++) {
      const px = pixel((x + 0.5) / size.w, (y + 0.5) / size.h);
      data.set(px.map((c) => Math.round(THREE.MathUtils.clamp(c, 0, 1) * 255)), (y * size.w + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size.w, size.h, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** 연기 퍼프 (흰색, 알파에 모양) */
export function createPuffTexture(): THREE.DataTexture {
  const SIZE = 128;
  const noise = fbm(TEXTURE_SEEDS.puff, 4, 4, 4);
  return dataTexture({ w: SIZE, h: SIZE }, (u, v) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy) * 2;
    // 노이즈로 반경을 흔들어 둥근 원이 아닌 뭉게구름 모양으로
    const n = noise(u, v);
    const edge = 1 - THREE.MathUtils.smoothstep(r, 0.35 + 0.35 * n, 1);
    const alpha = edge * (0.55 + 0.45 * n);
    // 가운데가 조금 더 밝은 음영 (부피감)
    const shade = 0.82 + 0.18 * (1 - r) * n;
    return [shade, shade, shade, alpha];
  });
}

/**
 * 로켓 탱크 표면 디테일. UV: u = 둘레(0~1, 반복), v = 아래(0)→위(1).
 * R: 그을음 (아래쪽 엔진부에서 진하고 위로 갈수록 세로 줄무늬로 옅어짐)
 * G: 서리 무늬 (얼룩덜룩한 패치)
 */
export function createRocketDetailTexture(): THREE.DataTexture {
  const streaks = fbm(TEXTURE_SEEDS.soot, 24, 2, 3);
  const patches = fbm(TEXTURE_SEEDS.soot + 7, 6, 8, 4);
  const frost = fbm(TEXTURE_SEEDS.frost, 12, 24, 4);
  const texture = dataTexture({ w: 256, h: 512 }, (u, v) => {
    // 재진입 연소 배기가 아래에서 위로 기체를 감싸며 생기는 그을음
    const base = Math.exp(-v * 2.6);
    const streak = THREE.MathUtils.smoothstep(streaks(u, v), 0.35, 0.75);
    const patch = patches(u, v);
    const soot = Math.min(1, base * (0.55 + 0.45 * patch) + streak * 0.55 * (1 - v * 0.6));
    return [soot * 0.85, frost(u, v), 0, 1];
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}
