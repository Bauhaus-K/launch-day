/**
 * 로켓 용어 사전 창 (시작 화면에서 연다). 네이티브 <dialog>라 Esc로 닫히고 포커스가 갇힌다.
 */
import { GLOSSARY_TERMS } from '../data/education';
import { t } from '../i18n';
import { el } from './dom';

export class GlossaryDialog {
  readonly root = el('dialog', 'panel glossary');

  constructor() {
    this.root.setAttribute('aria-labelledby', 'glossary-title');
    const title = el('h2', undefined, t('glossary.title'));
    title.id = 'glossary-title';
    const list = el('dl', 'glossary-list');
    for (const id of GLOSSARY_TERMS) {
      list.append(el('dt', undefined, t(`glossary.${id}.term`)), el('dd', undefined, t(`glossary.${id}.def`)));
    }
    const close = el('button', 'btn', t('glossary.close'));
    close.type = 'button';
    close.addEventListener('click', () => this.root.close());
    // 바깥(배경) 클릭으로도 닫기
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.root.close();
    });
    // 닫기 버튼을 제목 옆에 두어, 열릴 때 포커스가 가도 목록이 맨 위에서 시작하게 한다
    const header = el('div', 'glossary-header');
    header.append(title, close);
    this.root.append(header, list);
  }

  open(): void {
    if (!this.root.open) this.root.showModal();
  }
}
