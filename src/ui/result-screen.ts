/**
 * 결과 화면: 등급·점수·미션 리포트.
 */
import type { SubmitOutcome } from '../core/best-records';
import type { FlightLog } from '../mission/flight-recorder';
import type { MissionResult } from '../mission/scoring';
import { flightReport } from './flight-charts';
import { formatKm, formatMissionTime } from '../utils/format';
import { el } from './dom';

export interface ResultActions {
  retry(): void;
  menu(): void;
}

export class ResultScreen {
  readonly root = el('div', 'screen');
  private readonly card = el('div', 'panel screen-card');

  constructor(private readonly actions: ResultActions) {
    this.root.append(this.card);
    this.setVisible(false);
  }

  show(result: MissionResult, record: SubmitOutcome, log: FlightLog): void {
    this.card.replaceChildren();

    const header = el('div', 'result-header');
    header.append(el('div', `result-grade ${result.grade}`, result.grade));
    const summary = el('div');
    summary.append(
      el('div', 'result-reason', result.reason),
      el('div', 'result-score', `총점 ${result.score} / 100 · 비행 시간 ${formatMissionTime(result.flightTimeS)}`),
      record.isNewBest
        ? el(
            'div',
            'result-record new',
            record.previous ? `신기록! (이전 최고 ${record.previous.grade} · ${record.previous.score}점)` : '첫 기록 저장!',
          )
        : el('div', 'result-record', `이 모드 최고 기록 ${record.best.grade} · ${record.best.score}점`),
    );
    header.append(summary);
    this.card.append(header);

    const table = el('table', 'result-table');
    const addRow = (label: string, points: string, detail: string) => {
      const tr = el('tr');
      tr.append(el('td', undefined, label), el('td', 'detail', detail), el('td', 'pts', points));
      table.append(tr);
    };
    for (const item of result.items) addRow(item.label, `${item.points} / ${item.max}`, item.detail);
    addRow(
      '최종 궤도',
      '',
      `원지점 ${formatKm(result.apoapsisAltitudeM)} · 근지점 ${formatKm(result.periapsisAltitudeM)}`,
    );
    this.card.append(table);
    this.card.append(flightReport(log));

    const actions = el('div', 'result-actions');
    const retry = el('button', 'btn', '다시 발사');
    retry.type = 'button';
    retry.addEventListener('click', () => this.actions.retry());
    const menu = el('button', 'btn', '모드 선택');
    menu.type = 'button';
    menu.addEventListener('click', () => this.actions.menu());
    actions.append(retry, menu);
    this.card.append(actions);

    this.setVisible(true);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }
}
