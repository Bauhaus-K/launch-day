/**
 * 키보드(와 터치 버튼) 입력. 누르고 있는 키(축)와 한 번 눌림(엣지) 이벤트를 구분한다.
 * 터치 버튼은 가상 키로 같은 경로를 쓴다.
 */
export type InputAction =
  | 'confirm'
  | 'camera'
  | 'warp'
  | 'pause'
  | 'mute'
  | 'holdRetrograde'
  | 'holdBoostback'
  | 'noGo'
  | 'commentary';

/** 누르고 있는 동안 유지되는 조작 (터치 버튼용) */
export type HeldControl = 'throttleUp' | 'throttleDown' | 'pitchUp' | 'pitchDown';

const virtualCode = (control: HeldControl) => `Virtual:${control}`;

const ACTION_KEYS: Record<string, InputAction> = {
  Space: 'confirm',
  KeyC: 'camera',
  KeyT: 'warp',
  Escape: 'pause',
  KeyM: 'mute',
  KeyR: 'holdRetrograde',
  KeyB: 'holdBoostback',
  KeyH: 'noGo',
  KeyN: 'commentary',
};

const THROTTLE_UP = ['KeyW', 'ShiftLeft', 'ShiftRight', virtualCode('throttleUp')];
const THROTTLE_DOWN = ['KeyS', 'ControlLeft', 'ControlRight', virtualCode('throttleDown')];
/** 피치 업 = 연직 쪽 */
const PITCH_UP = ['KeyA', 'ArrowLeft', 'ArrowUp', virtualCode('pitchUp')];
/** 피치 다운 = 수평(다운레인지) 쪽 */
const PITCH_DOWN = ['KeyD', 'ArrowRight', 'ArrowDown', virtualCode('pitchDown')];

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

  /** 터치 버튼: 누름/뗌 */
  setHeld(control: HeldControl, down: boolean): void {
    if (down) this.held.add(virtualCode(control));
    else this.held.delete(virtualCode(control));
  }

  /** 터치 버튼: 한 번 눌림 */
  trigger(action: InputAction): void {
    this.pressed.add(action);
  }

  /** 이번 프레임에 눌린 동작을 꺼내고 비운다 */
  consumePressed(): Set<InputAction> {
    const result = new Set(this.pressed);
    this.pressed.clear();
    return result;
  }
}
