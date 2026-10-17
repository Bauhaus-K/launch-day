/**
 * 결과 화면의 비행 리포트: 고도·속도·동압 그래프, 부스터 궤적, 데이터 표.
 */
import { STRUCTURE } from '../data/mission-config';
import type { FlightLog } from '../mission/flight-recorder';
import { formatMissionTime } from '../utils/format';
import { el } from './dom';
import { lineChart, type ChartPoint } from './line-chart';

const MPS_TO_KMH = 3.6;
/** 동압 그래프 종료 판단: 이륙 후 이 시간이 지난 뒤 이 동압 미만이면 대기권 이탈 */
const ASCENT_MIN_S = 10;
const NEGLIGIBLE_Q_PA = 50;
/** 데이터 표에 넣는 샘플 간격 [s] */
const TABLE_INTERVAL_S = 30;

const minutes = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;

export function flightReport(log: FlightLog): HTMLElement {
  const root = el('section', 'flight-report viz-root');
  root.append(el('h3', 'report-title', '비행 리포트'));
  const grid = el('div', 'chart-layout');
  const events = log.events.map((e) => ({ x: e.t, label: e.label }));
  const time = (p: ChartPoint) => formatMissionTime(p.x);

  grid.append(
    lineChart({
      title: '2단 고도 (km)',
      points: log.vehicle.map((s) => ({ x: s.t, y: s.altitudeM / 1000 })),
      colorVar: '--series-1',
      xLabel: '시간 (분:초)',
      formatXTick: minutes,
      formatYTick: (y) => y.toFixed(0),
      readout: (p) => [`${p.y.toFixed(1)} km`, time(p)],
      eventLines: events,
      yFromZero: true,
    }),
    lineChart({
      title: '2단 속도 (km/h)',
      points: log.vehicle.map((s) => ({ x: s.t, y: s.speedMps * MPS_TO_KMH })),
      colorVar: '--series-1',
      xLabel: '시간 (분:초)',
      formatXTick: minutes,
      formatYTick: (y) => (y >= 1000 ? `${(y / 1000).toFixed(0)}k` : y.toFixed(0)),
      readout: (p) => [`${p.y.toFixed(0)} km/h`, time(p)],
      eventLines: events,
      yFromZero: true,
    }),
    lineChart({
      title: '동압 q (kPa) — 상승 구간',
      points: ascentSamples(log).map((s) => ({ x: s.t, y: s.dynamicPressurePa / 1000 })),
      colorVar: '--series-1',
      xLabel: '시간 (분:초)',
      formatXTick: minutes,
      formatYTick: (y) => y.toFixed(0),
      readout: (p) => [`${p.y.toFixed(1)} kPa`, time(p)],
      refLine: { y: STRUCTURE.qLimitPa / 1000, label: '허용 동압' },
      eventLines: events.filter((e) => e.label === 'Max-Q' || e.label === 'MECO'),
      yFromZero: true,
    }),
    lineChart({
      title: '부스터 궤적 (다운레인지 km × 고도 km)',
      points: log.booster.map((b) => ({ x: b.downrangeM / 1000, y: b.altitudeM / 1000 })),
      colorVar: '--series-2',
      xLabel: '발사장에서 거리 (km)',
      formatXTick: (x) => x.toFixed(0),
      formatYTick: (y) => y.toFixed(0),
      readout: (p) => [`고도 ${p.y.toFixed(1)} km`, `거리 ${p.x.toFixed(1)} km`],
      marker:
        log.shipDownrangeM !== null ? { x: log.shipDownrangeM / 1000, y: 0, label: '착륙선' } : undefined,
      yFromZero: true,
    }),
  );
  root.append(grid);
  root.append(dataTable(log));
  return root;
}

/** 동압 그래프는 대기권을 벗어나 동압이 사라질 때까지만 그린다 */
function ascentSamples(log: FlightLog) {
  const end = log.vehicle.findIndex((s) => s.t > ASCENT_MIN_S && s.dynamicPressurePa < NEGLIGIBLE_Q_PA);
  return end === -1 ? log.vehicle : log.vehicle.slice(0, end + 1);
}

/** 그래프 값을 표로도 볼 수 있게 (색에 기대지 않는 접근 경로) */
function dataTable(log: FlightLog): HTMLElement {
  const details = el('details', 'report-table');
  details.append(el('summary', undefined, '데이터 표 보기'));
  const table = el('table', 'result-table');
  const head = el('tr');
  for (const h of ['시간', '사건', '고도 (km)', '속도 (km/h)', '동압 (kPa)']) head.append(el('th', undefined, h));
  table.append(head);

  const rows = log.vehicle.filter((s, i) => i === 0 || Math.floor(s.t / TABLE_INTERVAL_S) !== Math.floor((log.vehicle[i - 1]?.t ?? 0) / TABLE_INTERVAL_S));
  const marks = [...log.events];
  for (const s of rows) {
    const label = marks.filter((m) => m.t <= s.t).map((m) => m.label).join(', ');
    marks.splice(0, marks.filter((m) => m.t <= s.t).length);
    const tr = el('tr');
    tr.append(
      el('td', undefined, formatMissionTime(s.t)),
      el('td', 'detail', label),
      el('td', 'pts', (s.altitudeM / 1000).toFixed(1)),
      el('td', 'pts', (s.speedMps * MPS_TO_KMH).toFixed(0)),
      el('td', 'pts', (s.dynamicPressurePa / 1000).toFixed(1)),
    );
    table.append(tr);
  }
  details.append(table);
  return details;
}
