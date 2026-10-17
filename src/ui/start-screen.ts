/**
 * 시작 화면: 난이도 선택.
 */
import type { BestRecords } from '../core/best-records';
import { DIFFICULTIES, type DifficultyConfig, type DifficultyId } from '../data/difficulty';
import { TARGET_ORBIT } from '../data/mission-config';
import { COMPANY_NAME, ROCKET_NAME } from '../data/rocket-specs';
import { el } from './dom';
import { GlossaryDialog } from './glossary-dialog';
import { getLocale, LOCALES, setLocale, t } from '../i18n';

export class StartScreen {
  readonly root = el('div', 'screen');
  private readonly recordLabels = new Map<DifficultyId, HTMLElement>();

  constructor(onSelect: (difficulty: DifficultyConfig) => void) {
    const card = el('div', 'panel screen-card');
    card.append(this.languagePicker());
    card.append(
      el('h1', undefined, 'LAUNCH DAY'),
      el(
        'p',
        'subtitle',
        t('start.subtitle', { company: COMPANY_NAME, rocket: ROCKET_NAME, alt: TARGET_ORBIT.altitudeM / 1000 }),
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
      t('start.keys.1'),
      t('start.keys.2'),
    ].join('<br>');
    card.append(keys);

    const glossary = new GlossaryDialog();
    const glossaryButton = el('button', 'btn glossary-button', t('glossary.open'));
    glossaryButton.type = 'button';
    glossaryButton.addEventListener('click', () => glossary.open());
    card.append(glossaryButton, glossary.root);

    card.append(
      el(
        'p',
        'disclaimer',
        t('start.disclaimer'),
      ),
    );
    this.root.append(card);
  }

  /** 언어 선택: 바꾸면 저장 후 페이지를 다시 불러온다 (모든 문구를 새 언어로) */
  private languagePicker(): HTMLElement {
    const picker = el('div', 'language-picker');
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', t('start.language'));
    for (const locale of LOCALES) {
      const button = el('button', 'lang-button', locale.nativeName);
      button.type = 'button';
      button.lang = locale.id;
      const active = locale.id === getLocale();
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      button.addEventListener('click', () => {
        if (locale.id === getLocale()) return;
        setLocale(locale.id);
        window.location.reload();
      });
      picker.append(button);
    }
    return picker;
  }

  /** 모드 카드에 최고 기록 표시 */
  showRecords(records: BestRecords): void {
    for (const [id, label] of this.recordLabels) {
      const best = records.get(id);
      label.textContent = best
        ? t('start.best', { grade: best.grade, score: best.score, landed: best.boosterLanded ? t('start.bestLanded') : '' })
        : t('start.noBest');
      label.classList.toggle('empty', best === null);
    }
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }
}
