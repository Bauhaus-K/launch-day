/**
 * 미션 점수·등급 계산. 순수 함수.
 */
import { SCORING, TARGET_ORBIT } from '../data/mission-config';
import { checklistScoreRatio } from './checklist';
import { landingQuality, type BoosterOutcome } from './landing';

export interface ScoreItem {
  readonly label: string;
  readonly points: number;
  readonly max: number;
  readonly detail: string;
}

export interface ScoreInput {
  readonly success: boolean;
  readonly reason: string;
  readonly apoapsisAltitudeM: number;
  readonly periapsisAltitudeM: number;
  /** 2단 잔여 추진제 비율 (0~1) */
  readonly stage2FuelFraction: number;
  /** 누적 기체 스트레스 (0~1) */
  readonly stress: number;
  readonly maxDynamicPressurePa: number;
  readonly flightTimeS: number;
  /** 부스터 착륙 결과 (분리 전 실패 등으로 없으면 null) */
  readonly booster: BoosterOutcome | null;
  /** 발사 전 체크리스트 판단 결과 */
  readonly checklist: ChecklistSummary;
}

export interface ChecklistSummary {
  readonly faultCount: number;
  readonly missedFaults: number;
  readonly falseHolds: number;
}

export interface MissionResult extends ScoreInput {
  readonly score: number;
  readonly grade: string;
  readonly items: readonly ScoreItem[];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 목표 원궤도 대비 평균 고도 오차 [m] */
export function orbitError(apoapsisM: number, periapsisM: number): number {
  if (!Number.isFinite(apoapsisM)) return Infinity;
  return (Math.abs(apoapsisM - TARGET_ORBIT.altitudeM) + Math.abs(periapsisM - TARGET_ORBIT.altitudeM)) / 2;
}

export function computeResult(input: ScoreInput): MissionResult {
  const error = orbitError(input.apoapsisAltitudeM, input.periapsisAltitudeM);
  const orbitPoints = input.success
    ? SCORING.orbitAccuracyMax * clamp01(1 - error / SCORING.orbitErrorZeroM)
    : 0;
  const fuelPoints = input.success
    ? SCORING.fuelMax * clamp01(input.stage2FuelFraction / SCORING.fuelFullScoreFraction)
    : 0;
  const structurePoints = SCORING.structureMax * clamp01(1 - input.stress);
  const booster = input.booster;
  const landingPoints = booster?.landed
    ? SCORING.landingMax * (SCORING.landingBaseRatio + (1 - SCORING.landingBaseRatio) * landingQuality(booster))
    : 0;

  const checklistPoints = SCORING.checklistMax * checklistScoreRatio(input.checklist);
  const { faultCount, missedFaults, falseHolds } = input.checklist;

  const items: ScoreItem[] = [
    {
      label: '궤도 진입 정확도',
      points: Math.round(orbitPoints),
      max: SCORING.orbitAccuracyMax,
      detail: input.success ? `평균 고도 오차 ${(error / 1000).toFixed(1)} km` : '궤도 미진입',
    },
    {
      label: '남은 연료 (2단)',
      points: Math.round(fuelPoints),
      max: SCORING.fuelMax,
      detail: `${(input.stage2FuelFraction * 100).toFixed(1)}% 잔여`,
    },
    {
      label: 'Max-Q 기체 스트레스',
      points: Math.round(structurePoints),
      max: SCORING.structureMax,
      detail: `스트레스 ${(clamp01(input.stress) * 100).toFixed(0)}% · 최대 동압 ${(input.maxDynamicPressurePa / 1000).toFixed(1)} kPa`,
    },
    {
      label: '부스터 착륙',
      points: Math.round(landingPoints),
      max: SCORING.landingMax,
      detail: !booster
        ? '부스터 귀환 전 미션 종료'
        : booster.landed
          ? `중심에서 ${booster.distanceM.toFixed(1)} m · 하강 ${booster.verticalSpeedMps.toFixed(1)} m/s · 기울기 ${((booster.tiltRad * 180) / Math.PI).toFixed(1)}°`
          : booster.reason,
    },
    {
      label: '발사 전 체크리스트',
      points: Math.round(checklistPoints),
      max: SCORING.checklistMax,
      detail: `이상 ${faultCount}건 중 ${faultCount - missedFaults}건 발견 · 불필요한 홀드 ${falseHolds}회`,
    },
  ];

  const score = items.reduce((sum, item) => sum + item.points, 0);
  const grade = input.success
    ? (SCORING.grades.find((g) => score >= g.min)?.grade ?? 'D')
    : 'F';
  return { ...input, score, grade, items };
}
