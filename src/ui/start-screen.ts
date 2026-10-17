/**
 * 시작 화면: 난이도 선택.
 */
import { DIFFICULTIES, type DifficultyConfig } from '../data/difficulty';
import { TARGET_ORBIT } from '../data/mission-config';
import { COMPANY_NAME, ROCKET_NAME } from '../data/rocket-specs';
import { el } from './dom';

export class StartScreen {
  readonly root = el('div', 'screen');

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
      button.append(el('h3', undefined, difficulty.label), el('p', undefined, difficulty.description));
      button.addEventListener('click', () => onSelect(difficulty));
      list.append(button);
    }
    card.append(list);

    const keys = el('div', 'keys');
    keys.innerHTML = [
      '<kbd>Space</kbd> 다음 단계 승인 / 점화 &nbsp; <kbd>W</kbd><kbd>S</kbd> 또는 <kbd>Shift</kbd><kbd>Ctrl</kbd> 스로틀',
      '<kbd>A</kbd><kbd>D</kbd> / 방향키 피치 &nbsp; <kbd>C</kbd> 카메라 &nbsp; <kbd>T</kbd> 시간 배속 &nbsp; <kbd>Esc</kbd> 일시정지',
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

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }
}
