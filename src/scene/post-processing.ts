/**
 * 후처리 파이프라인: 씬 렌더 → 블룸 → 비네트 → 톤매핑(ACES)·sRGB 변환.
 * 화염은 HDR(1보다 밝은) 색으로 그려서 블룸 임계값을 넘는 부분만 번지게 한다.
 * three/addons 사용 (three 패키지에 포함, 추가 의존성 없음).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { POST } from '../data/scene-config';

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: POST.vignetteStrength },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = 1.0 - strength * smoothstep(0.2, 0.75, dot(d, d) * 2.0);
      gl_FragColor = vec4(c.rgb * v, c.a);
    }
  `,
};

export class PostProcessing {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloom: UnrealBloomPass;
  private flash = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = POST.exposure;

    // 후처리 렌더 타깃은 기본 안티에일리어싱이 없으므로 MSAA 타깃을 직접 만든다
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: POST.msaaSamples,
    });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(size, POST.bloomStrength, POST.bloomRadius, POST.bloomThreshold);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderPass(VignetteShader));
    this.composer.addPass(new OutputPass());
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  /** 점화 등 강한 빛 이벤트: 잠깐 노출을 올린다 (0~1) */
  triggerFlash(amount: number): void {
    this.flash = Math.max(this.flash, Math.min(1, amount));
  }

  render(frameDt: number): void {
    this.flash *= Math.exp(-frameDt / POST.flashDecayS);
    this.renderer.toneMappingExposure = POST.exposure + POST.flashExposureBoost * this.flash;
    this.composer.render(frameDt);
  }
}
