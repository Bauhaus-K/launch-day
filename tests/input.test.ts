import { describe, expect, it } from 'vitest';
import { KeyboardInput } from '../src/core/input';

/** 이벤트를 등록만 받는 가짜 window (터치 경로만 시험) */
const fakeWindow = { addEventListener: () => undefined } as unknown as Window;

describe('터치 버튼 입력', () => {
  it('누르는 동안 축 값이 유지되고 떼면 0', () => {
    const input = new KeyboardInput(fakeWindow);
    input.setHeld('throttleUp', true);
    expect(input.throttleAxis).toBe(1);
    input.setHeld('pitchDown', true);
    expect(input.pitchAxis).toBe(-1);
    input.setHeld('throttleUp', false);
    input.setHeld('pitchDown', false);
    expect(input.throttleAxis).toBe(0);
    expect(input.pitchAxis).toBe(0);
  });

  it('한 번 누르기는 다음 프레임에 한 번만 전달된다', () => {
    const input = new KeyboardInput(fakeWindow);
    input.trigger('confirm');
    expect(input.consumePressed().has('confirm')).toBe(true);
    expect(input.consumePressed().has('confirm')).toBe(false);
  });
});
