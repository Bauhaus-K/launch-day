/**
 * 모바일 터치 조작 버튼. 터치 기기에서만 보이며, 키보드와 같은 입력 경로(가상 키)를 쓴다.
 */
import type { HeldControl, InputAction, KeyboardInput } from '../core/input';
import { t, type MessageKey } from '../i18n';
import { el } from './dom';

/** 터치 기기인지 (손가락이 주 입력 장치) */
export function isTouchDevice(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches === true || 'ontouchstart' in window;
}

export class TouchControls {
  readonly root = el('div', 'touch-controls');

  constructor(private readonly input: KeyboardInput) {
    const left = el('div', 'touch-cluster touch-left');
    left.append(this.heldButton('pitchUp', 'touch.pitchUp'), this.heldButton('pitchDown', 'touch.pitchDown'));

    const right = el('div', 'touch-cluster touch-right');
    right.append(
      this.heldButton('throttleUp', 'touch.throttleUp'),
      this.heldButton('throttleDown', 'touch.throttleDown'),
    );

    const center = el('div', 'touch-cluster touch-center');
    center.append(this.tapButton('confirm', 'touch.go', 'primary'), this.tapButton('noGo', 'touch.noGo'));

    const top = el('div', 'touch-cluster touch-top');
    top.append(
      this.tapButton('camera', 'touch.camera'),
      this.tapButton('warp', 'touch.warp'),
      this.tapButton('holdBoostback', 'touch.holdBoostback'),
      this.tapButton('holdRetrograde', 'touch.holdRetrograde'),
      this.tapButton('pause', 'touch.pause'),
    );

    this.root.append(left, right, center, top);
    this.setVisible(false);
  }

  /** 누르고 있는 동안 유지 (스로틀·자세) */
  private heldButton(control: HeldControl, label: MessageKey): HTMLButtonElement {
    const button = el('button', 'touch-button', t(label));
    button.type = 'button';
    const release = () => {
      this.input.setHeld(control, false);
      button.classList.remove('active');
    };
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      this.input.setHeld(control, true);
      button.classList.add('active');
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    return button;
  }

  /** 한 번 누르기 (승인·카메라 등) */
  private tapButton(action: InputAction, label: MessageKey, variant = ''): HTMLButtonElement {
    const button = el('button', `touch-button ${variant}`.trim(), t(label));
    button.type = 'button';
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.trigger(action);
    });
    return button;
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }
}
