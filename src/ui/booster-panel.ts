/**
 * 부스터 귀환 구간 텔레메트리 패널. 미션 상태를 읽어 표시만 한다.
 */
import { BOOSTER_HEATING_LIMIT, TOUCHDOWN_LIMITS } from '../data/booster-config';
import { BOOSTER_STEP_LABELS } from '../mission/booster-guidance';
import type { AttitudeHold } from '../mission/booster-program';
import type { MissionContext } from '../mission/mission-types';
import { formatAltitude, formatPercent } from '../utils/format';
import { el, setText } from './dom';

const HOLD_LABELS: Record<AttitudeHold, string> = {
  none: '수동 (B·R로 고정)',
  boostback: '부스트백 방향 (B)',
  retrograde: '역추진·착륙 자세 (R)',
};

/** 이 거리 미만은 m로, 이상은 km로 표시 [m] */
const KM_DISPLAY_THRESHOLD_M = 2_000;

function formatOffset(m: number): string {
  const sign = m >= 0 ? '+' : '−';
  const abs = Math.abs(m);
  const text = abs < KM_DISPLAY_THRESHOLD_M ? `${abs.toFixed(0)} m` : `${(abs / 1000).toFixed(1)} km`;
  return `${sign}${text}`;
}

export class BoosterPanel {
  readonly root = el('div', 'panel hud-telemetry hud-booster');
  private readonly step = el('div', 'booster-step');
  private readonly values = new Map<string, HTMLElement>();
  private readonly heatFill = el('div', 'fill');
  private readonly heatBar = el('div', 'bar');

  constructor() {
    this.root.append(el('div', 'hud-mission-name', '1단 부스터 귀환'), this.step);
    this.row(this.root, 'alt', '고도');
    this.row(this.root, 'vs', '수직 속도');
    this.row(this.root, 'hs', '수평 속도');

    const engine = el('div', 'tel-section');
    this.row(engine, 'engine', '엔진');
    this.row(engine, 'hold', '자세 유지');
    this.row(engine, 'fuel', '추진제');
    this.row(engine, 'ignite', '착륙 연소 권장 점화');
    this.root.append(engine);

    const target = el('div', 'tel-section');
    this.row(target, 'impact', '예상 낙하점 (착륙선 기준)');
    this.row(target, 'offset', '현재 위치 (착륙선 기준)');
    this.row(target, 'legs', '착륙 다리');
    this.row(target, 'limits', '착지 한계');
    this.root.append(target);

    const heat = el('div', 'tel-section');
    this.row(heat, 'heat', '재진입 가열 손상');
    this.heatBar.append(this.heatFill);
    heat.append(this.heatBar);
    this.root.append(heat);

    const upper = el('div', 'tel-section');
    this.row(upper, 'upper', '2단 (자동 비행)');
    this.root.append(upper);
  }

  private row(parent: HTMLElement, key: string, label: string): void {
    const r = el('div', 'tel-row');
    const value = el('span', 'value', '-');
    r.append(el('span', 'label', label), value);
    parent.append(r);
    this.values.set(key, value);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  update(ctx: MissionContext): void {
    const p = ctx.boosterProgram;
    const b = ctx.booster;
    if (!p || !b) return;
    const t = p.telemetry;
    const set = (key: string, text: string) => {
      const node = this.values.get(key);
      if (node) setText(node, text);
    };

    setText(this.step, b.status === 'flying' ? BOOSTER_STEP_LABELS[p.step] : (p.outcome?.reason ?? ''));
    set('alt', formatAltitude(t.altitudeM));
    set('vs', `${t.verticalSpeedMps.toFixed(1)} m/s`);
    set('hs', `${t.horizontalSpeedMps.toFixed(1)} m/s`);
    set('engine', b.engines > 0 ? `${b.engines}기 · ${formatPercent(b.throttle)}` : '정지');
    set('fuel', `${(b.propellantKg / 1000).toFixed(1)} t`);
    set('hold', ctx.difficulty.autoPitch ? '비행 컴퓨터' : HOLD_LABELS[p.attitudeHold]);
    set('ignite', p.ignitionAltitudeM > 0 ? formatAltitude(p.ignitionAltitudeM) : '-');
    set('impact', t.impactErrorM === null ? '-' : formatOffset(t.impactErrorM));
    set('offset', formatOffset(t.shipOffsetM));
    set('legs', b.legsDeployed ? '전개' : '접힘');
    set(
      'limits',
      `≤${TOUCHDOWN_LIMITS.maxVerticalSpeedMps} m/s · ≤${((TOUCHDOWN_LIMITS.maxTiltRad * 180) / Math.PI).toFixed(0)}°`,
    );
    set('heat', `${formatPercent(Math.min(1, p.stress))} (가열 ${formatPercent(t.heating / BOOSTER_HEATING_LIMIT)})`);
    this.heatFill.style.width = `${Math.min(1, p.stress) * 100}%`;
    this.heatBar.className = t.heating > BOOSTER_HEATING_LIMIT ? 'bar danger' : 'bar';

    const v = ctx.telemetry;
    set('upper', `${(v.altitudeM / 1000).toFixed(0)} km · ${ctx.vehicle.enginesOn ? '연소 중' : 'SECO'}`);
  }
}
