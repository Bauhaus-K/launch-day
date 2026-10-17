/**
 * 2D 벡터 유틸리티 (불변). 궤도면 위의 2D 시뮬레이션에 사용한다.
 * 좌표계: 지구 중심 원점, +y = 발사대 방향(연직), +x = 다운레인지(발사 방향).
 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

export const ZERO: Vec2 = vec2(0, 0);

export const add = (a: Vec2, b: Vec2): Vec2 => vec2(a.x + b.x, a.y + b.y);

export const sub = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y);

export const scale = (a: Vec2, s: number): Vec2 => vec2(a.x * s, a.y * s);

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** 2D 외적의 z 성분 */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

export const length = (a: Vec2): number => Math.hypot(a.x, a.y);

export const normalize = (a: Vec2): Vec2 => {
  const len = length(a);
  return len > 0 ? scale(a, 1 / len) : ZERO;
};

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 =>
  vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
