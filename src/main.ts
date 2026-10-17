/**
 * 진입점: 씬·UI·입력·미션을 연결하고 게임 루프를 시작한다.
 */
import './ui/styles.css';
import { AudioManager } from './audio/audio-manager';
import { GameLoop } from './core/game-loop';
import { KeyboardInput } from './core/input';
import { TimeWarp } from './core/time-warp';
import { DIFFICULTIES, type DifficultyConfig } from './data/difficulty';
import { FIXED_TIMESTEP_S } from './data/mission-config';
import { HELIOS9_STACK } from './data/rocket-specs';
import { Mission } from './mission/mission';
import { CAMERA_LABELS } from './scene/camera-rig';
import { SceneManager } from './scene/scene-manager';
import { Hud } from './ui/hud';
import { ResultScreen } from './ui/result-screen';
import { StartScreen } from './ui/start-screen';

/** 미션 종료 후 결과 화면을 띄우기까지 지연 [ms] */
const RESULT_DELAY_MS = 1_500;

class Game {
  private readonly scene: SceneManager;
  private readonly input = new KeyboardInput(window);
  private readonly warp = new TimeWarp();
  private readonly hud = new Hud();
  private readonly audio = new AudioManager();
  private readonly startScreen: StartScreen;
  private readonly resultScreen: ResultScreen;
  private mission: Mission;
  private running = false;
  private paused = false;
  private confirmPending = false;
  private stepsThisFrame = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.scene = new SceneManager(canvas);
    this.startScreen = new StartScreen((d) => this.startMission(d));
    this.resultScreen = new ResultScreen({
      retry: () => this.startMission(this.mission.ctx.difficulty),
      menu: () => this.showMenu(),
    });
    uiRoot.append(this.hud.root, this.startScreen.root, this.resultScreen.root);

    // 메뉴 뒤 배경용: 발사대 위 대기 중인 기체
    this.mission = new Mission(HELIOS9_STACK, DIFFICULTIES.spectator);
    this.scene.bind(this.mission);
    this.hud.setVisible(false);

    new GameLoop({
      beginFrame: () => this.beginFrame(),
      step: (dt) => this.step(dt),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
      timeScale: () => this.warp.effective(this.mission.maxWarp()),
      paused: () => this.paused || !this.running,
    }).start();
  }

  private startMission(difficulty: DifficultyConfig): void {
    // 클릭한 버튼에 포커스가 남아 Space가 버튼을 다시 누르지 않도록
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.mission = new Mission(HELIOS9_STACK, difficulty);
    // 클릭 직후라 브라우저가 오디오 재생을 허용한다
    this.audio.unlock();
    this.audio.setPaused(false);
    this.scene.bind(this.mission);
    this.hud.bind(this.mission);
    this.audio.bind(this.mission);
    this.mission.bus.on('mission:ended', (result) => {
      window.setTimeout(() => {
        this.running = false;
        this.hud.setVisible(false);
        this.resultScreen.show(result);
      }, RESULT_DELAY_MS);
    });
    this.warp.reset();
    this.paused = false;
    this.confirmPending = false;
    this.running = true;
    this.startScreen.setVisible(false);
    this.resultScreen.setVisible(false);
    this.hud.setVisible(true);
    this.mission.start();
  }

  private showMenu(): void {
    this.running = false;
    this.resultScreen.setVisible(false);
    this.hud.setVisible(false);
    this.mission = new Mission(HELIOS9_STACK, DIFFICULTIES.spectator);
    this.scene.bind(this.mission);
    this.audio.bind(this.mission);
    this.startScreen.setVisible(true);
  }

  /** 개발용: 입력 없이 시뮬레이션을 seconds만큼 즉시 진행 */
  debugSkip(seconds: number): string {
    const steps = Math.round(seconds / FIXED_TIMESTEP_S);
    for (let i = 0; i < steps && !this.mission.finished; i++) {
      this.mission.update({ throttleAxis: 0, pitchAxis: 0, confirm: false }, FIXED_TIMESTEP_S);
    }
    return `${this.mission.phase.id} T+${this.mission.ctx.missionTimeS.toFixed(1)}`;
  }

  private beginFrame(): void {
    this.stepsThisFrame = 0;
    const pressed = this.input.consumePressed();
    if (pressed.has('mute')) this.audio.toggleMute();
    if (!this.running) return;
    if (pressed.has('pause')) {
      this.paused = !this.paused;
      this.audio.setPaused(this.paused);
    }
    if (pressed.has('warp')) this.warp.cycle();
    if (pressed.has('camera')) this.scene.cycleCamera(this.mission.ctx.booster !== null);
    if (pressed.has('confirm')) this.confirmPending = true;
  }

  private step(dt: number): void {
    this.mission.update(
      {
        throttleAxis: this.input.throttleAxis,
        pitchAxis: this.input.pitchAxis,
        confirm: this.confirmPending,
      },
      dt,
    );
    // 승인 입력은 한 스텝에서만 소비
    this.confirmPending = false;
    this.stepsThisFrame++;
  }

  private render(alpha: number, frameDt: number): void {
    const simDt = this.stepsThisFrame * FIXED_TIMESTEP_S;
    this.scene.render(this.mission.ctx, alpha, frameDt, simDt);
    this.audio.update(this.mission.ctx, this.scene.cameraMode, this.running);
    if (this.running) {
      const maxWarp = this.mission.maxWarp();
      this.hud.update(this.mission, {
        warp: this.warp.effective(maxWarp),
        warpLocked: this.warp.selected > maxWarp,
        camera: CAMERA_LABELS[this.scene.cameraMode],
        paused: this.paused,
        muted: this.audio.isMuted,
      });
    }
  }
}

const canvas = document.getElementById('scene-canvas');
const uiRoot = document.getElementById('ui-root');
if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) throw new Error('필수 DOM 요소가 없습니다');
const game = new Game(canvas, uiRoot);

// 개발 모드 전용: 콘솔에서 미션 상태 확인·빨리 감기 (예: __launchDay.skip(120))
if (import.meta.env.DEV) {
  Object.assign(window, {
    __launchDay: {
      game,
      skip: (seconds: number) => game.debugSkip(seconds),
    },
  });
}
