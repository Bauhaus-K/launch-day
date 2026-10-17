/**
 * 타입 안전 이벤트 버스. 모듈 간 직접 의존을 줄이기 위해 사용한다.
 */
export type Listener<T> = (payload: T) => void;

export class EventBus<Events extends object> {
  private listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};

  /** 구독하고, 구독 해제 함수를 돌려준다 */
  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    const set = this.listeners[type] ?? new Set<Listener<Events[K]>>();
    set.add(listener);
    this.listeners[type] = set;
    return () => set.delete(listener);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    this.listeners[type]?.forEach((listener) => listener(payload));
  }

  clear(): void {
    this.listeners = {};
  }
}
