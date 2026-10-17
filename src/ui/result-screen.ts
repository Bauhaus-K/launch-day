/**
 * 결과 화면: 등급·점수·미션 리포트.
 */
import type { SubmitOutcome } from '../core/best-records';
import type { FlightLog } from '../mission/flight-recorder';
import type { MissionResult } from '../mission/scoring';
import { flightReport } from './flight-charts';
import { formatKm, formatMissionTime } from '../utils/format';
import { el } from './dom';
import { t } from '../i18n';

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
      el('div', 'result-score', t('result.score', { score: result.score, time: formatMissionTime(result.flightTimeS) })),
      record.isNewBest
        ? el(
            'div',
            'result-record new',
            record.previous
              ? t('result.newBest', { grade: record.previous.grade, score: record.previous.score })
              : t('result.firstRecord'),
          )
        : el('div', 'result-record', t('result.best', { grade: record.best.grade, score: record.best.score })),
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
      t('result.finalOrbit'),
      '',
      t('result.finalOrbitDetail', { ap: formatKm(result.apoapsisAltitudeM), pe: formatKm(result.periapsisAltitudeM) }),
    );
    this.card.append(table);
    this.card.append(flightReport(log));

    const actions = el('div', 'result-actions');
    const retry = el('button', 'btn', t('result.retry'));
    retry.type = 'button';
    retry.addEventListener('click', () => this.actions.retry());
    const menu = el('button', 'btn', t('result.menu'));
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
