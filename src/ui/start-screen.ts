/**
 * 시작 화면: 난이도 선택.
 */
import type { BestRecords } from '../core/best-records';
import { DIFFICULTIES, type DifficultyConfig, type DifficultyId } from '../data/difficulty';
import { TARGET_ORBIT } from '../data/mission-config';
import { COMPANY_NAME, ROCKET_NAME } from '../data/rocket-specs';
import { el } from './dom';

export class StartScreen {
  readonly root = el('div', 'screen');
  private readonly recordLabels = new Map<DifficultyId, HTMLElement>();

  constructor(onSelect: (difficulty: DifficultyConfig) => void) {
    const card = el('div', 'panel screen-card');
    card.append(
      el('h1', undefined, 'LAUNCH DAY'),
      el(
        'p',
        'subtitle',
        `${COMPANY_NAME}의 재사용 로켓 「${ROCKET_NAME}」를 고도 ${TARGET_ORBIT.altitudeM / 1000} km 원궤도에 올려 보세요.`,
      ),
    );

    const list = el('div', 'mode-list');
    for (const difficulty of Object.values(DIFFICULTIES)) {
      const button = el('button', 'mode-card');
      button.type = 'button';
      const record = el('div', 'mode-record');
      this.recordLabels.set(difficulty.id, record);
      button.append(el('h3', undefined, difficulty.label), el('p', undefined, difficulty.description), record);
      button.addEventListener('click', () => onSelect(difficulty));
      list.append(button);
    }
    card.append(list);

    const keys = el('div', 'keys');
    keys.innerHTML = [
      '<kbd>Space</kbd> 다음 단계 승인 / 점화 &nbsp; <kbd>W</kbd><kbd>S</kbd> 또는 <kbd>Shift</kbd><kbd>Ctrl</kbd> 스로틀',
      '<kbd>A</kbd><kbd>D</kbd> / 방향키 피치 &nbsp; <kbd>C</kbd> 카메라 &nbsp; <kbd>T</kbd> 시간 배속 &nbsp; <kbd>M</kbd> 소리 켜기/끄기 &nbsp; <kbd>Esc</kbd> 일시정지',
    ].join('<br>');
    card.append(keys);

    card.append(
      el(
        'p',
        'disclaimer',
        '실제 재사용 로켓 발사 과정에서 영감을 받은 시뮬레이션 게임입니다. 등장하는 로켓·회사명은 가상이며 특정 기업과 관련이 없습니다.',
      ),
    );
    this.root.append(card);
  }

  /** 모드 카드에 최고 기록 표시 */
  showRecords(records: BestRecords): void {
    for (const [id, label] of this.recordLabels) {
      const best = records.get(id);
      label.textContent = best
        ? `최고 기록  ${best.grade} · ${best.score}점${best.boosterLanded ? ' · 부스터 착륙' : ''}`
        : '최고 기록  없음';
      label.classList.toggle('empty', best === null);
    }
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }
}
