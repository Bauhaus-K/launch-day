/** 작은 DOM 헬퍼 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 값이 바뀔 때만 textContent를 갱신 (레이아웃 비용 절감) */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** 내부에서 만든 고정 마크업 전용 (사용자 입력을 넣지 않는다) */
export function setHtml(node: HTMLElement, html: string): void {
  if (node.dataset['html'] !== html) {
    node.dataset['html'] = html;
    node.innerHTML = html;
  }
}
