/**
 * 작은 SVG 선 그래프 (라이브러리 없이). 단일 시리즈 + 기준선·사건선·표식, 십자선 툴팁.
 * 색은 CSS 변수(역할)로만 지정하고, 글자는 텍스트 색을 쓴다.
 */
import { el } from './dom';
import { t } from '../i18n';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 340;
const H = 180;
const M = { left: 46, right: 12, top: 12, bottom: 28 } as const;
const TICK_COUNT = 4;
/** 사건 라벨 겹침 방지: 최소 가로 간격, 줄 수, 줄 높이 (viewBox 단위) */
const EVENT_LABEL_MIN_GAP = 34;
const EVENT_LABEL_ROWS = 3;
const EVENT_LABEL_ROW_H = 10;

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

export interface LineChartSpec {
  readonly title: string;
  readonly points: readonly ChartPoint[];
  /** 선 색 CSS 변수 이름 (예: '--series-1') */
  readonly colorVar: string;
  readonly xLabel: string;
  readonly formatXTick: (x: number) => string;
  readonly formatYTick: (y: number) => string;
  /** 툴팁 문구 [값, 설명] */
  readonly readout: (p: ChartPoint) => readonly [string, string];
  readonly refLine?: { readonly y: number; readonly label: string };
  readonly eventLines?: readonly { readonly x: number; readonly label: string }[];
  readonly marker?: { readonly x: number; readonly y: number; readonly label: string };
  /** y축 최솟값을 0으로 고정 */
  readonly yFromZero?: boolean;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 1·2·5 단위의 보기 좋은 눈금 */
export function niceTicks(min: number, max: number, count = TICK_COUNT): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag);
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

export function lineChart(spec: LineChartSpec): HTMLElement {
  const figure = el('figure', 'chart');
  figure.append(el('figcaption', 'chart-title', spec.title));
  const pts = spec.points;
  if (pts.length < 2) {
    figure.append(el('p', 'chart-empty', t('chart.empty')));
    return figure;
  }

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  if (spec.marker) {
    xs.push(spec.marker.x);
    ys.push(spec.marker.y);
  }
  if (spec.refLine) ys.push(spec.refLine.y);
  const xTicks = niceTicks(Math.min(...xs), Math.max(...xs));
  const yTicks = niceTicks(spec.yFromZero ? 0 : Math.min(...ys), Math.max(...ys));
  const x0 = Math.min(Math.min(...xs), xTicks[0] ?? 0);
  const x1 = Math.max(Math.max(...xs), xTicks[xTicks.length - 1] ?? 1);
  const y0 = Math.min(spec.yFromZero ? 0 : Math.min(...ys), yTicks[0] ?? 0);
  const y1 = Math.max(Math.max(...ys), yTicks[yTicks.length - 1] ?? 1);
  const sx = (x: number) => M.left + ((x - x0) / (x1 - x0 || 1)) * (W - M.left - M.right);
  const sy = (y: number) => H - M.bottom - ((y - y0) / (y1 - y0 || 1)) * (H - M.top - M.bottom);

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', tabindex: 0 });
  root.setAttribute('aria-label', t('chart.aria', { title: spec.title }));

  // 격자와 축 눈금 (흐리게)
  for (const y of yTicks) {
    root.append(svg('line', { x1: M.left, x2: W - M.right, y1: sy(y), y2: sy(y), class: 'chart-gridline' }));
    const label = svg('text', { x: M.left - 6, y: sy(y) + 3, class: 'chart-tick', 'text-anchor': 'end' });
    label.textContent = spec.formatYTick(y);
    root.append(label);
  }
  for (const x of xTicks) {
    const label = svg('text', { x: sx(x), y: H - M.bottom + 14, class: 'chart-tick', 'text-anchor': 'middle' });
    label.textContent = spec.formatXTick(x);
    root.append(label);
  }
  const xLabel = svg('text', { x: W - M.right, y: H - 2, class: 'chart-tick', 'text-anchor': 'end' });
  xLabel.textContent = spec.xLabel;
  root.append(xLabel);
  root.append(svg('line', { x1: M.left, x2: W - M.right, y1: H - M.bottom, y2: H - M.bottom, class: 'chart-axis' }));

  // 사건선 (MECO, SES 등) — 가까운 라벨은 한 줄 아래로 내려 겹치지 않게
  let lastLabelX = -Infinity;
  let row = 0;
  for (const ev of spec.eventLines ?? []) {
    if (ev.x < x0 || ev.x > x1) continue;
    const ex = sx(ev.x);
    row = ex - lastLabelX < EVENT_LABEL_MIN_GAP ? (row + 1) % EVENT_LABEL_ROWS : 0;
    lastLabelX = ex;
    root.append(svg('line', { x1: ex, x2: ex, y1: M.top, y2: H - M.bottom, class: 'chart-event' }));
    // 오른쪽 끝에 가까우면 선 왼쪽에 라벨을 붙여 잘리지 않게
    const nearRight = ex > W - M.right - EVENT_LABEL_MIN_GAP;
    const label = svg('text', {
      x: nearRight ? ex - 3 : ex + 3,
      y: M.top + 8 + row * EVENT_LABEL_ROW_H,
      class: 'chart-event-label',
      'text-anchor': nearRight ? 'end' : 'start',
    });
    label.textContent = ev.label;
    root.append(label);
  }

  if (spec.refLine) {
    const y = sy(spec.refLine.y);
    root.append(svg('line', { x1: M.left, x2: W - M.right, y1: y, y2: y, class: 'chart-ref' }));
    const label = svg('text', { x: W - M.right, y: y - 4, class: 'chart-ref-label', 'text-anchor': 'end' });
    label.textContent = spec.refLine.label;
    root.append(label);
  }

  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  root.append(svg('path', { d, class: 'chart-line', style: `stroke: var(${spec.colorVar})` }));

  if (spec.marker) {
    const mx = sx(spec.marker.x);
    const my = sy(spec.marker.y);
    root.append(svg('rect', { x: mx - 5, y: my - 5, width: 10, height: 10, rx: 2, class: 'chart-marker' }));
    const label = svg('text', { x: mx, y: my - 9, class: 'chart-event-label', 'text-anchor': 'middle' });
    label.textContent = spec.marker.label;
    root.append(label);
  }

  // 십자선 + 툴팁
  const cross = svg('line', { y1: M.top, y2: H - M.bottom, class: 'chart-crosshair', visibility: 'hidden' });
  const dot = svg('circle', { r: 4, class: 'chart-dot', style: `fill: var(${spec.colorVar})`, visibility: 'hidden' });
  root.append(cross, dot);
  const tip = el('div', 'chart-tooltip');
  const tipValue = el('strong');
  const tipLabel = el('span');
  tip.append(tipValue, tipLabel);
  tip.hidden = true;

  let index = pts.length - 1;
  const show = (i: number) => {
    index = Math.max(0, Math.min(pts.length - 1, i));
    const p = pts[index];
    if (!p) return;
    const px = sx(p.x);
    const py = sy(p.y);
    cross.setAttribute('x1', String(px));
    cross.setAttribute('x2', String(px));
    dot.setAttribute('cx', String(px));
    dot.setAttribute('cy', String(py));
    cross.setAttribute('visibility', 'visible');
    dot.setAttribute('visibility', 'visible');
    const [value, label] = spec.readout(p);
    tipValue.textContent = value;
    tipLabel.textContent = label;
    tip.hidden = false;
    tip.style.left = `${(px / W) * 100}%`;
    tip.style.top = `${(py / H) * 100}%`;
    tip.classList.toggle('flip', px > W * 0.6);
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };

  root.addEventListener('pointermove', (e) => {
    const ctm = root.getScreenCTM();
    if (!ctm) return;
    const local = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    // 화면상 가장 가까운 점 (궤적처럼 x가 되돌아가는 그래프도 처리)
    let best = 0;
    let bestD = Infinity;
    pts.forEach((p, i) => {
      const dd = (sx(p.x) - local.x) ** 2 + ((sy(p.y) - local.y) / 3) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    });
    show(best);
  });
  root.addEventListener('pointerleave', hide);
  root.addEventListener('focus', () => show(index));
  root.addEventListener('blur', hide);
  root.addEventListener('keydown', (e) => {
    const stepSize = Math.max(1, Math.round(pts.length / 50));
    if (e.key === 'ArrowRight') show(index + stepSize);
    else if (e.key === 'ArrowLeft') show(index - stepSize);
    else return;
    e.preventDefault();
  });

  const plot = el('div', 'chart-plot');
  plot.append(root, tip);
  figure.append(plot);
  return figure;
}
