/**
 * 교육용 해설 자막: 비행 사건마다 "왜 이렇게 하는지"를 짧게 설명한다.
 * 미션 이벤트를 구독해 표시만 하며, N 키로 켜고 끈다 (설정 저장).
 */
import { COMMENTARY } from '../data/education';
import { t, type MessageKey } from '../i18n';
import type { Mission } from '../mission/mission';
import { el, setText } from './dom';

function loadEnabled(): boolean {
  try {
    return window.localStorage.getItem(COMMENTARY.storageKey) !== '0';
  } catch {
    return true;
  }
}

export class Commentary {
  readonly root = el('div', 'panel hud-commentary hidden');
  private readonly text = el('p', 'commentary-text');
  private readonly queue: MessageKey[] = [];
  private enabled = loadEnabled();
  private timer = 0;
  private showing = false;
  private unsubscribe: Array<() => void> = [];

  constructor() {
    this.root.append(el('div', 'commentary-label', t('commentary.label')), this.text);
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      window.localStorage.setItem(COMMENTARY.storageKey, this.enabled ? '1' : '0');
    } catch {
      // 이번 세션에만 적용
    }
    if (!this.enabled) this.clear();
    return this.enabled;
  }

  bind(mission: Mission): void {
    this.unsubscribe.forEach((off) => off());
    this.clear();
    const bus = mission.bus;
    this.unsubscribe = [
      bus.on('countdown:tick', ({ tMinusS }) => {
        if (tMinusS === COMMENTARY.ignitionTMinusS) this.push('commentary.ignition');
      }),
      bus.on('phase:changed', ({ to }) => {
        if (to === 'LIFTOFF') this.push('commentary.twr');
        else if (to === 'MAX_Q') this.push('commentary.gravityTurn');
        else if (to === 'MECO') this.push('commentary.meco');
      }),
      bus.on('maxq:entered', () => this.push('commentary.maxQ')),
      bus.on('stage:separated', () => this.push('commentary.staging')),
      bus.on('fairing:separated', () => this.push('commentary.fairing')),
      bus.on('booster:step', ({ step }) => {
        if (step === 'COAST') this.push('commentary.boostback');
        else if (step === 'ENTRY_BURN') this.push('commentary.entryBurn');
        else if (step === 'DESCENT') this.push('commentary.gridFins');
        else if (step === 'LANDING_BURN') this.push('commentary.hoverslam');
      }),
      bus.on('engine:cutoff', ({ stage }) => {
        if (stage === 2) this.push('commentary.orbit');
      }),
    ];
  }

  /**
   * 해설 추가. 앞의 해설이 보이는 중이면 끝난 뒤 이어서 보여 준다.
   * 배속 중에 해설이 밀리지 않도록 대기열에는 가장 최근 것 하나만 남긴다.
   */
  private push(key: MessageKey): void {
    if (!this.enabled) return;
    this.queue.length = 0;
    this.queue.push(key);
    if (!this.showing) this.showNext();
  }

  private showNext(): void {
    const key = this.queue.shift();
    if (!key) {
      this.showing = false;
      this.root.classList.add('hidden');
      return;
    }
    this.showing = true;
    setText(this.text, t(key));
    this.root.classList.remove('hidden');
    this.timer = window.setTimeout(() => this.showNext(), COMMENTARY.lifetimeMs);
  }

  private clear(): void {
    window.clearTimeout(this.timer);
    this.queue.length = 0;
    this.showing = false;
    this.root.classList.add('hidden');
  }
}
