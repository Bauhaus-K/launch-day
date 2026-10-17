/**
 * 부스터 귀환 구간 텔레메트리 패널. 미션 상태를 읽어 표시만 한다.
 */
import { BOOSTER_HEATING_LIMIT, TOUCHDOWN_LIMITS } from '../data/booster-config';
import { boosterStepLabel } from '../mission/booster-guidance';
import type { AttitudeHold } from '../mission/booster-program';
import type { MissionContext } from '../mission/mission-types';
import { formatAltitude, formatPercent } from '../utils/format';
import { el, setText } from './dom';
import { t } from '../i18n';

const holdLabel = (hold: AttitudeHold): string => t(`hold.${hold}`);

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
    this.root.append(el('div', 'hud-mission-name', t('bp.title')), this.step);
    this.row(this.root, 'alt', t('tel.altitude'));
    this.row(this.root, 'vs', t('tel.verticalSpeed'));
    this.row(this.root, 'hs', t('tel.horizontalSpeed'));

    const engine = el('div', 'tel-section');
    this.row(engine, 'engine', t('bp.engine'));
    this.row(engine, 'hold', t('bp.hold'));
    this.row(engine, 'fuel', t('bp.fuel'));
    this.row(engine, 'ignite', t('bp.ignite'));
    this.root.append(engine);

    const target = el('div', 'tel-section');
    this.row(target, 'impact', t('bp.impact'));
    this.row(target, 'offset', t('bp.offset'));
    this.row(target, 'legs', t('bp.legs'));
    this.row(target, 'limits', t('bp.limits'));
    this.root.append(target);

    const heat = el('div', 'tel-section');
    this.row(heat, 'heat', t('bp.heat'));
    this.heatBar.append(this.heatFill);
    heat.append(this.heatBar);
    this.root.append(heat);

    const upper = el('div', 'tel-section');
    this.row(upper, 'upper', t('bp.upper'));
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
    const tel = p.telemetry;
    const set = (key: string, text: string) => {
      const node = this.values.get(key);
      if (node) setText(node, text);
    };

    setText(this.step, b.status === 'flying' ? boosterStepLabel(p.step) : (p.outcome?.reason ?? ''));
    set('alt', formatAltitude(tel.altitudeM));
    set('vs', `${tel.verticalSpeedMps.toFixed(1)} m/s`);
    set('hs', `${tel.horizontalSpeedMps.toFixed(1)} m/s`);
    set('engine', b.engines > 0 ? t('bp.engineValue', { count: b.engines, throttle: formatPercent(b.throttle) }) : t('bp.engineOff'));
    set('fuel', `${(b.propellantKg / 1000).toFixed(1)} t`);
    set('hold', ctx.difficulty.autoPitch ? t('bp.flightComputer') : holdLabel(p.attitudeHold));
    set('ignite', p.ignitionAltitudeM > 0 ? formatAltitude(p.ignitionAltitudeM) : '-');
    set('impact', tel.impactErrorM === null ? '-' : formatOffset(tel.impactErrorM));
    set('offset', formatOffset(tel.shipOffsetM));
    set('legs', b.legsDeployed ? t('bp.legsDeployed') : t('bp.legsStowed'));
    set(
      'limits',
      `≤${TOUCHDOWN_LIMITS.maxVerticalSpeedMps} m/s · ≤${((TOUCHDOWN_LIMITS.maxTiltRad * 180) / Math.PI).toFixed(0)}°`,
    );
    set('heat', t('bp.heatValue', { stress: formatPercent(Math.min(1, p.stress)), heating: formatPercent(tel.heating / BOOSTER_HEATING_LIMIT) }));
    this.heatFill.style.width = `${Math.min(1, p.stress) * 100}%`;
    this.heatBar.className = tel.heating > BOOSTER_HEATING_LIMIT ? 'bar danger' : 'bar';

    const v = ctx.telemetry;
    set('upper', t('bp.upperValue', { alt: (v.altitudeM / 1000).toFixed(0), state: ctx.vehicle.enginesOn ? t('bp.burning') : 'SECO' }));
  }
}
