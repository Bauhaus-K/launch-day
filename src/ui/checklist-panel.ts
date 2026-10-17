/**
 * 발사 전 Go/No-Go 체크리스트 패널. 상태를 읽어 표시하고, 버튼 클릭은 콜백으로 넘긴다.
 */
import type { ChecklistDecision, CheckStatus } from '../mission/checklist';
import { awaitingDecision, checklistComplete, formatReading } from '../mission/checklist';
import type { MissionContext } from '../mission/mission-types';
import { el, setText } from './dom';

const STATUS_LABELS: Record<CheckStatus, string> = {
  pending: '대기',
  polling: '점검 중',
  hold: '홀드',
  go: 'GO',
  'go-missed': 'GO (한계 초과)',
};

interface Row {
  readonly root: HTMLElement;
  readonly reading: HTMLElement;
  readonly status: HTMLElement;
}

export class ChecklistPanel {
  readonly root = el('div', 'panel hud-checklist');
  private readonly list = el('div', 'check-list');
  private readonly footer = el('div', 'check-footer');
  private readonly goButton = el('button', 'btn check-go', 'GO  (Space)');
  private readonly noGoButton = el('button', 'btn check-nogo', 'NO-GO 홀드  (H)');
  private readonly note = el('div', 'check-note');
  private rows: Row[] = [];

  constructor(onDecision: (decision: ChecklistDecision) => void) {
    const head = el('div', 'check-head');
    head.append(el('span', undefined, '점검 항목'), el('span', undefined, '측정값'), el('span', undefined, '허용 기준'), el('span', undefined, '상태'));
    this.root.append(el('h3', undefined, '발사 전 점검 — Go / No-Go'), head, this.list, this.footer);
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
      const label = item.status === 'hold' ? `홀드 ${Math.max(0, s.holdRemainingS).toFixed(1)}s` : STATUS_LABELS[item.status];
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
      if (!manual) return '모든 항목 GO — 곧 카운트다운을 시작합니다';
      return s.missedFaults === 0
        ? '모든 항목 GO — Space로 카운트다운 시작'
        : `놓친 이상 ${s.missedFaults}건 — Space로 카운트다운 시작`;
    }
    if (!manual) return '비행 컴퓨터가 항목을 판단합니다';
    if (s.holdKind !== null) return '홀드 중 — 조치 후 다시 점검합니다';
    return '측정값이 허용 기준 안이면 GO, 벗어나면 NO-GO(홀드)';
  }
}
