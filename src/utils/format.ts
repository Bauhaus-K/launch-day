/** 표시용 단위 변환·포맷 (내부 SI → 화면 표기) */
import { t } from '../i18n';

const MPS_TO_KMH = 3.6;

export const formatAltitude = (m: number): string =>
  m < 10_000 ? `${Math.max(0, m).toFixed(0)} m` : `${(m / 1000).toFixed(1)} km`;

export const formatSpeedKmh = (mps: number): string => `${(mps * MPS_TO_KMH).toFixed(0)} km/h`;

export const formatKm = (m: number): string =>
  Number.isFinite(m) ? `${(m / 1000).toFixed(1)} km` : t('format.escape');

export const formatKpa = (pa: number): string => `${(pa / 1000).toFixed(1)} kPa`;

export const formatDeg = (rad: number): string => `${((rad * 180) / Math.PI).toFixed(1)}°`;

export const formatPercent = (fraction: number): string => `${(fraction * 100).toFixed(0)}%`;

/** 미션 시간 T-00:00:00 / T+00:00:00 */
export function formatMissionTime(seconds: number): string {
  const sign = seconds < 0 ? '-' : '+';
  const total = Math.floor(Math.abs(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `T${sign}${pad(h)}:${pad(m)}:${pad(s)}`;
}
