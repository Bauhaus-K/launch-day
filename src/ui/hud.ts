/**
 * 비행 중 HUD. 미션 상태를 읽어 표시만 하고, 메시지·해설은 이벤트 버스로 받는다.
 */
import { STRUCTURE, TARGET_ORBIT } from '../data/mission-config';
import { PHASE_INFO } from '../data/mission-timeline';
import { COMPANY_NAME, ROCKET_NAME } from '../data/rocket-specs';
import type { Mission } from '../mission/mission';
import type { MessageTone, PhaseId } from '../mission/mission-types';
import type { ChecklistDecision } from '../mission/checklist';
import {
  formatAltitude,
  formatDeg,
  formatKm,
  formatKpa,
  formatMissionTime,
  formatPercent,
  formatSpeedKmh,
} from '../utils/format';
import { BoosterPanel } from './booster-panel';
import { ChecklistPanel } from './checklist-panel';
import { el, setHtml, setText } from './dom';

/** 타임라인 바에 표시할 단계 */
const TIMELINE: readonly PhaseId[] = [
  'PRE_LAUNCH',
  'COUNTDOWN',
  'LIFTOFF',
  'MAX_Q',
  'MECO',
  'STAGE_SEPARATION',
  'SES',
  'BOOSTER_RETURN',
  'ORBIT_INSERTION',
];
const MAX_MESSAGES = 5;
const MESSAGE_LIFETIME_MS = 7_000;
const MESSAGE_FADE_MS = 600;
const NARRATION_LIFETIME_MS = 9_000;

interface Bar {
  root: HTMLElement;
  fill: HTMLElement;
  marker: HTMLElement;
}

function bar(): Bar {
  const root = el('div', 'bar');
  const fill = el('div', 'fill');
  const marker = el('div', 'marker');
  marker.style.display = 'none';
  root.append(fill, marker);
  return { root, fill, marker };
}

function setBar(b: Bar, fraction: number, state: '' | 'warn' | 'danger' = '', marker?: number): void {
  b.fill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  b.root.className = state ? `bar ${state}` : 'bar';
  if (marker === undefined) {
    b.marker.style.display = 'none';
  } else {
    b.marker.style.display = 'block';
    b.marker.style.left = `${Math.max(0, Math.min(1, marker)) * 100}%`;
  }
}

export class Hud {
  readonly root = el('div', 'hud');
  private readonly clock = el('div', 'hud-clock');
  private readonly phase = el('div', 'hud-phase');
  private readonly timeline = el('div', 'hud-timeline');
  private readonly warpChip = el('div', 'panel hud-chip');
  private readonly cameraChip = el('div', 'panel hud-chip');
  private readonly modeChip = el('div', 'panel hud-chip');
  private readonly soundChip = el('div', 'panel hud-chip');
  private readonly telemetry = el('div', 'panel hud-telemetry');
  private readonly boosterPanel = new BoosterPanel();
  private readonly messages = el('div', 'hud-messages');
  private readonly narration = el('div', 'panel hud-narration hidden');
  private readonly prompt = el('div', 'panel hud-prompt');
  private readonly checklist: ChecklistPanel;
  private readonly pauseOverlay = el('div', 'hud-pause', '일시정지  ·  Esc 로 계속');
  private readonly values = new Map<string, HTMLElement>();
  private readonly bars = {
    load: bar(),
    throttle: bar(),
    fuel1: bar(),
    fuel2: bar(),
  };
  private narrationTimer = 0;
  private unsubscribe: Array<() => void> = [];

  constructor(onChecklistDecision: (decision: ChecklistDecision) => void) {
    this.checklist = new ChecklistPanel(onChecklistDecision);
    const topLeft = el('div', 'panel hud-top-left');
    topLeft.append(el('div', 'hud-mission-name', `${COMPANY_NAME} · ${ROCKET_NAME}`), this.clock, this.phase, this.timeline);
    for (let i = 0; i < TIMELINE.length; i++) this.timeline.append(el('span'));

    const topRight = el('div', 'hud-top-right');
    topRight.append(this.modeChip, this.soundChip, this.cameraChip, this.warpChip);

    this.buildTelemetry();

    const help = el('div', 'hud-help');
    help.innerHTML = [
      '<kbd>Space</kbd> 승인/점화/GO · <kbd>H</kbd> NO-GO',
      '<kbd>W</kbd>/<kbd>S</kbd> 스로틀',
      '<kbd>A</kbd>/<kbd>D</kbd> 피치 (부스터 하강 중: 그리드 핀)',
      '리얼 모드 부스터: <kbd>B</kbd> 부스트백 · <kbd>R</kbd> 역추진 자세 고정',
      '<kbd>C</kbd> 카메라 · <kbd>T</kbd> 배속 · <kbd>M</kbd> 소리 · <kbd>Esc</kbd> 일시정지',
    ].join('<br>');

    this.prompt.style.display = 'none';
    this.pauseOverlay.style.display = 'none';
    this.root.append(
      topLeft,
      topRight,
      this.telemetry,
      this.boosterPanel.root,
      this.messages,
      this.narration,
      this.prompt,
      this.checklist.root,
      help,
      this.pauseOverlay,
    );
  }

  private row(parent: HTMLElement, key: string, label: string): void {
    const r = el('div', 'tel-row');
    const value = el('span', 'value', '-');
    r.append(el('span', 'label', label), value);
    parent.append(r);
    this.values.set(key, value);
  }

  private buildTelemetry(): void {
    const t = this.telemetry;
    this.row(t, 'alt', '고도');
    this.row(t, 'speed', '속도');
    this.row(t, 'vs', '수직 속도');
    this.row(t, 'hs', '수평 속도');

    const aero = el('div', 'tel-section');
    this.row(aero, 'q', '동압 (q)');
    this.row(aero, 'load', '구조 하중');
    aero.append(this.bars.load.root);
    this.row(aero, 'stress', '기체 스트레스');
    t.append(aero);

    const control = el('div', 'tel-section');
    this.row(control, 'throttle', '스로틀');
    control.append(this.bars.throttle.root);
    this.row(control, 'pitch', '피치 / 권장');
    t.append(control);

    const fuel = el('div', 'tel-section');
    this.row(fuel, 'fuel1', '1단 추진제');
    fuel.append(this.bars.fuel1.root);
    this.row(fuel, 'fuel2', '2단 추진제');
    fuel.append(this.bars.fuel2.root);
    t.append(fuel);

    const orbit = el('div', 'tel-section');
    this.row(orbit, 'ap', '원지점');
    this.row(orbit, 'pe', '근지점');
    this.row(orbit, 'target', '목표 궤도');
    t.append(orbit);
  }

  bind(mission: Mission): void {
    this.unsubscribe.forEach((off) => off());
    this.messages.replaceChildren();
    this.narration.classList.add('hidden');
    this.unsubscribe = [
      mission.bus.on('mission:message', (m) => this.pushMessage(m.text, m.tone)),
      mission.bus.on('phase:changed', (e) => this.showNarration(PHASE_INFO[e.to].narration)),
    ];
    setText(this.modeChip, mission.ctx.difficulty.label);
    this.checklist.bind(mission.ctx);
  }

  private pushMessage(text: string, tone: MessageTone): void {
    const node = el('div', `panel hud-message ${tone}`, text);
    this.messages.append(node);
    while (this.messages.children.length > MAX_MESSAGES) this.messages.firstElementChild?.remove();
    window.setTimeout(() => node.classList.add('fading'), MESSAGE_LIFETIME_MS);
    window.setTimeout(() => node.remove(), MESSAGE_LIFETIME_MS + MESSAGE_FADE_MS);
  }

  private showNarration(text: string): void {
    window.clearTimeout(this.narrationTimer);
    if (!text) {
      this.narration.classList.add('hidden');
      return;
    }
    this.narration.textContent = text;
    this.narration.classList.remove('hidden');
    this.narrationTimer = window.setTimeout(
      () => this.narration.classList.add('hidden'),
      NARRATION_LIFETIME_MS,
    );
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  update(
    mission: Mission,
    info: { warp: number; warpLocked: boolean; camera: string; paused: boolean; muted: boolean },
  ): void {
    const ctx = mission.ctx;
    const tel = ctx.telemetry;
    const v = ctx.vehicle;
    const phaseId = mission.phase.id;

    setText(this.clock, phaseId === 'PRE_LAUNCH' ? 'T-00:01:00' : formatMissionTime(ctx.missionTimeS));
    setText(this.phase, mission.phase.title);
    const currentIndex = TIMELINE.indexOf(phaseId);
    Array.from(this.timeline.children).forEach((node, i) => {
      node.className = i < currentIndex ? 'done' : i === currentIndex ? 'current' : '';
    });

    setHtml(this.warpChip, `배속 <b>${info.warp}x</b>${info.warpLocked ? ' (제한)' : ''}`);
    this.warpChip.classList.toggle('locked', info.warpLocked);
    setHtml(this.cameraChip, `카메라 <b>${info.camera}</b>`);
    setHtml(this.soundChip, `소리 <b>${info.muted ? '꺼짐' : '켜짐'}</b>`);
    this.pauseOverlay.style.display = info.paused ? '' : 'none';

    const set = (key: string, text: string) => {
      const node = this.values.get(key);
      if (node) setText(node, text);
    };
    set('alt', formatAltitude(tel.altitudeM));
    set('speed', formatSpeedKmh(tel.speedMps));
    set('vs', `${tel.verticalSpeedMps.toFixed(0)} m/s`);
    set('hs', `${tel.horizontalSpeedMps.toFixed(0)} m/s`);
    set('q', formatKpa(tel.dynamicPressurePa));
    set('load', formatPercent(ctx.stats.loadRatio));
    set('stress', formatPercent(ctx.stats.stress));
    const loadState = ctx.stats.loadRatio >= 1 ? 'danger' : ctx.stats.loadRatio >= STRUCTURE.warningRatio ? 'warn' : '';
    setBar(this.bars.load, ctx.stats.loadRatio, loadState, 1);

    set('throttle', v.enginesOn ? `${formatPercent(v.throttle)} (명령 ${formatPercent(ctx.command.throttle)})` : '엔진 정지');
    const showRecommendedThrottle = !ctx.difficulty.autoThrottle && v.activeStage === 1;
    setBar(this.bars.throttle, v.throttle, '', showRecommendedThrottle ? ctx.recommended.throttle : undefined);
    set('pitch', `${formatDeg(v.pitchRad)} / ${formatDeg(ctx.recommended.pitchRad)}`);

    const f1 = v.stage1PropellantKg / ctx.cfg.stage1.propellantMassKg;
    const f2 = v.stage2PropellantKg / ctx.cfg.stage2.propellantMassKg;
    set('fuel1', v.activeStage === 1 ? formatPercent(f1) : '분리됨');
    setBar(this.bars.fuel1, v.activeStage === 1 ? f1 : 0, f1 < 0.15 ? 'warn' : '');
    set('fuel2', formatPercent(f2));
    setBar(this.bars.fuel2, f2, f2 < 0.05 ? 'warn' : '');

    const orbitKnown = ctx.flying && tel.altitudeM > 1_000;
    set('ap', orbitKnown ? formatKm(tel.orbit.apoapsisAltitudeM) : '-');
    const pe = tel.orbit.periapsisAltitudeM;
    set('pe', !orbitKnown ? '-' : pe < 0 ? '지표 아래' : formatKm(pe));
    set('target', formatKm(TARGET_ORBIT.altitudeM));

    if (ctx.prompt) {
      setText(this.prompt, ctx.prompt);
      this.prompt.style.display = '';
    } else {
      this.prompt.style.display = 'none';
    }

    const boosterView = phaseId === 'BOOSTER_RETURN';
    this.telemetry.style.display = boosterView ? 'none' : '';
    this.boosterPanel.setVisible(boosterView);
    if (boosterView) this.boosterPanel.update(ctx);

    const inPreLaunch = phaseId === 'PRE_LAUNCH';
    this.checklist.setVisible(inPreLaunch);
    if (inPreLaunch) this.checklist.update(ctx);
    // 체크리스트 중에는 텔레메트리가 의미 없으므로 숨긴다
    if (inPreLaunch) this.telemetry.style.display = 'none';
  }
}
