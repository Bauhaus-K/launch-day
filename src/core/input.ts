/**
 * 키보드 입력. 누르고 있는 키(축)와 한 번 눌림(엣지) 이벤트를 구분한다.
 */
export type InputAction = 'confirm' | 'camera' | 'warp' | 'pause' | 'mute';

const ACTION_KEYS: Record<string, InputAction> = {
  Space: 'confirm',
  KeyC: 'camera',
  KeyT: 'warp',
  Escape: 'pause',
  KeyM: 'mute',
};

const THROTTLE_UP = ['KeyW', 'ShiftLeft', 'ShiftRight'];
const THROTTLE_DOWN = ['KeyS', 'ControlLeft', 'ControlRight'];
/** 피치 업 = 연직 쪽 */
const PITCH_UP = ['KeyA', 'ArrowLeft', 'ArrowUp'];
/** 피치 다운 = 수평(다운레인지) 쪽 */
const PITCH_DOWN = ['KeyD', 'ArrowRight', 'ArrowDown'];

export class KeyboardInput {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<InputAction>();

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      const action = ACTION_KEYS[e.code];
      if (action) {
        if (!e.repeat) this.pressed.add(action);
        e.preventDefault();
      }
      if (e.code.startsWith('Arrow') || e.code.startsWith('Control')) e.preventDefault();
      this.held.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.held.delete(e.code));
    target.addEventListener('blur', () => this.held.clear());
  }

  private any(codes: readonly string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  get throttleAxis(): number {
    return (this.any(THROTTLE_UP) ? 1 : 0) - (this.any(THROTTLE_DOWN) ? 1 : 0);
  }

  get pitchAxis(): number {
    return (this.any(PITCH_UP) ? 1 : 0) - (this.any(PITCH_DOWN) ? 1 : 0);
  }

  /** 이번 프레임에 눌린 동작을 꺼내고 비운다 */
  consumePressed(): Set<InputAction> {
    const result = new Set(this.pressed);
    this.pressed.clear();
    return result;
  }
}
