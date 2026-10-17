/**
 * 비행 기록: 결과 화면 그래프용 텔레메트리 샘플. 순수 데이터 (렌더링과 무관).
 */
import { RECORDER } from '../data/mission-config';
import { altitudeOf } from '../physics/gravity';
import { downrangeDistance } from '../physics/trajectory';
import type { MissionContext } from './mission-types';

export interface FlightSample {
  /** 발사 기준 시간 [s] */
  readonly t: number;
  readonly altitudeM: number;
  readonly speedMps: number;
  readonly dynamicPressurePa: number;
}

export interface BoosterTrackPoint {
  readonly t: number;
  readonly downrangeM: number;
  readonly altitudeM: number;
}

export interface FlightEventMark {
  readonly t: number;
  readonly label: string;
}

export interface FlightLog {
  readonly vehicle: FlightSample[];
  readonly booster: BoosterTrackPoint[];
  readonly events: FlightEventMark[];
  shipDownrangeM: number | null;
  nextSampleS: number;
}

export function createFlightLog(): FlightLog {
  return { vehicle: [], booster: [], events: [], shipDownrangeM: null, nextSampleS: 0 };
}

export function markEvent(log: FlightLog, t: number, label: string): void {
  log.events.push({ t, label });
}

/** 매 물리 스텝 호출. 샘플 간격마다 한 번씩 기록한다 */
export function recordFlight(log: FlightLog, ctx: MissionContext): void {
  const t = ctx.missionTimeS;
  if (t < 0 || t < log.nextSampleS) return;
  log.nextSampleS = t + RECORDER.sampleIntervalS;

  const tel = ctx.telemetry;
  log.vehicle.push({
    t,
    altitudeM: Math.max(0, tel.altitudeM),
    speedMps: tel.speedMps,
    dynamicPressurePa: tel.dynamicPressurePa,
  });

  const b = ctx.booster;
  if (b && b.status === 'flying') {
    log.booster.push({ t, downrangeM: downrangeDistance(b.pos), altitudeM: Math.max(0, altitudeOf(b.pos)) });
  }
  if (ctx.boosterProgram) log.shipDownrangeM = ctx.boosterProgram.shipDownrangeM;
}

/** 부스터 착지/추락 순간의 마지막 지점 */
export function recordBoosterEnd(log: FlightLog, ctx: MissionContext): void {
  const b = ctx.booster;
  if (!b) return;
  log.booster.push({ t: ctx.missionTimeS, downrangeM: downrangeDistance(b.pos), altitudeM: Math.max(0, altitudeOf(b.pos)) });
}
