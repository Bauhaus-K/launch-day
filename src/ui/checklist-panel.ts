/**
 * 발사 전 Go/No-Go 체크리스트 패널. 상태를 읽어 표시하고, 버튼 클릭은 콜백으로 넘긴다.
 */
import type { ChecklistDecision, CheckStatus } from '../mission/checklist';
import { awaitingDecision, checklistComplete, formatReading } from '../mission/checklist';
import type { MissionContext } from '../mission/mission-types';
import { el, setText } from './dom';
import { t } from '../i18n';

const statusLabel = (status: CheckStatus): string => t(`cl.status.${status}`);

interface Row {
  readonly root: HTMLElement;
  readonly reading: HTMLElement;
  readonly status: HTMLElement;
}

export class ChecklistPanel {
  readonly root = el('div', 'panel hud-checklist');
  private readonly list = el('div', 'check-list');
  private readonly footer = el('div', 'check-footer');
  private readonly goButton = el('button', 'btn check-go', t('cl.goButton'));
  private readonly noGoButton = el('button', 'btn check-nogo', t('cl.noGoButton'));
  private readonly note = el('div', 'check-note');
  private rows: Row[] = [];

  constructor(onDecision: (decision: ChecklistDecision) => void) {
    const head = el('div', 'check-head');
    head.append(
      el('span', undefined, t('cl.col.item')),
      el('span', undefined, t('cl.col.reading')),
      el('span', undefined, t('cl.col.limit')),
      el('span', undefined, t('cl.col.status')),
    );
    this.root.append(el('h3', undefined, t('cl.title')), head, this.list, this.footer);
    this.goButton.type = 'button';
    this.noGoButton.type = 'button';
    // 클릭 후 포커스가 남아 Space가 버튼을 다시 누르지 않도록 즉시 해제
    this.goButton.addEventListener('click', () => {
      this.goButton.blur();
      onDecision('go');
    });
    this.noGoButton.addEventListener('click', () => {
      this.noGoButton.blur();
      onDecision('nogo');
    });
    this.footer.append(this.goButton, this.noGoButton, this.note);
  }

  /** 새 미션의 항목으로 목록을 다시 만든다 */
  bind(ctx: MissionContext): void {
    this.list.replaceChildren();
    this.rows = ctx.checklist.items.map((item) => {
      const root = el('div', 'check-item');
      const reading = el('span', 'reading');
      const status = el('span', 'state');
      root.append(el('span', 'name', item.def.label), reading, el('span', 'limit', item.def.limitText), status);
      this.list.append(root);
      return { root, reading, status };
    });
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  update(ctx: MissionContext): void {
    const s = ctx.checklist;
    s.items.forEach((item, i) => {
      const row = this.rows[i];
      if (!row) return;
      const revealed = item.status !== 'pending';
      setText(row.reading, revealed ? formatReading(item) : '—');
      const label =
        item.status === 'hold'
          ? t('cl.holdTimer', { seconds: Math.max(0, s.holdRemainingS).toFixed(1) })
          : statusLabel(item.status);
      setText(row.status, label);
      row.root.className = `check-item ${item.status}`;
    });

    const manual = !ctx.difficulty.autoConfirm;
    const canDecide = manual && awaitingDecision(s);
    this.goButton.style.display = manual && !checklistComplete(s) ? '' : 'none';
    this.noGoButton.style.display = this.goButton.style.display;
    this.goButton.disabled = !canDecide;
    this.noGoButton.disabled = !canDecide;

    setText(this.note, this.noteText(ctx, manual));
  }

  private noteText(ctx: MissionContext, manual: boolean): string {
    const s = ctx.checklist;
    if (checklistComplete(s)) {
      if (!manual) return t('cl.note.autoDone');
      return s.missedFaults === 0
        ? t('cl.note.done')
        : t('cl.note.doneMissed', { count: s.missedFaults });
    }
    if (!manual) return t('cl.note.auto');
    if (s.holdKind !== null) return t('cl.note.hold');
    return t('cl.note.manual');
  }
}
