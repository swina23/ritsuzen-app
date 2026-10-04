/**
 * 計時（組ごとの所要時間）のロジック
 *
 * 1組が本座で揖をした時点からスタートし、最後の人が最後の矢を射終えた時点でストップする。
 * ストップすると次の組が同時にスタートする（普段は前の組の最後の矢と同時に揖をするため）。
 * 準備の遅れや休憩で同時でなかったときは、自動スタートを取り消して待機に戻す。
 */

import { Competition, GroupTiming, Participant, TimerState } from '../types';
import {
  DEFAULT_FINAL_BELL_SECONDS,
  WARNING_BELL_OFFSET_SECONDS,
  BELL_NOTICE_LEAD_SECONDS
} from './constants';

export const INITIAL_TIMER_STATE: TimerState = {
  roundNumber: 1,
  group: 1,
  startedAt: null,
  autoStarted: false
};

/** 本鈴として使える値か。予鈴（30秒前）が0秒より後に来る長さが必要 */
export const isValidFinalBellSeconds = (seconds: unknown): seconds is number =>
  typeof seconds === 'number' && Number.isFinite(seconds) && seconds > WARNING_BELL_OFFSET_SECONDS;

export const getFinalBellSeconds = (competition: Competition): number =>
  isValidFinalBellSeconds(competition.finalBellSeconds) ? competition.finalBellSeconds : DEFAULT_FINAL_BELL_SECONDS;

export const getWarningBellSeconds = (finalBellSeconds: number): number =>
  Math.max(0, finalBellSeconds - WARNING_BELL_OFFSET_SECONDS);

/**
 * 計時の対象になるグループ番号（昇順）。
 * グループ番号は移動で歯抜けになり得るので、1〜N を仮定せず実際の番号を集める。
 * グループ未設定の人は grouping.ts の groupParticipants と同じく1組目に数える
 */
export const getGroupNumbers = (participants: Participant[]): number[] => {
  const numbers = [...new Set(participants.map(p => p.group || 1))].sort((a, b) => a - b);
  return numbers.length > 0 ? numbers : [1];
};

/**
 * 実際に計る組の番号。
 * 待機中に組分けを変えると、保存している組番号が無くなることがある。
 * そのときは次に大きい番号の組（無ければ最初の組）を計る
 */
export const resolveTimerGroup = (group: number, groupNumbers: number[]): number =>
  groupNumbers.includes(group) ? group : (groupNumbers.find(g => g > group) ?? groupNumbers[0]);

/** 指定の組の次に計る組。最後の立の最後の組なら null */
export const getNextTarget = (
  roundNumber: number,
  group: number,
  groupNumbers: number[],
  roundsCount: number
): { roundNumber: number; group: number } | null => {
  const laterGroup = groupNumbers.find(g => g > group);
  if (laterGroup !== undefined) return { roundNumber, group: laterGroup };
  if (roundNumber >= roundsCount) return null;
  return { roundNumber: roundNumber + 1, group: groupNumbers[0] };
};

/** 全組の計測が終わったか */
export const isTimingComplete = (timer: TimerState, roundsCount: number): boolean =>
  timer.roundNumber > roundsCount;

/**
 * ストップ。今の組の記録を残し、次の組を同じ時刻からスタートする。
 * 最後の組なら止めるだけ。同じ組の記録が既にあれば（計り直し）置き換える。
 * 前の組を計り直したときは次の組も記録済みのことが多い。そのまま自動スタートすると
 * 取り消し忘れで正しい記録を上書きしてしまうので、その組を選んだ待機にとどめる
 */
export const stopTimer = (
  competition: Competition,
  now: number
): { groupTimings: GroupTiming[]; timer: TimerState } => {
  const timer = competition.timer ?? INITIAL_TIMER_STATE;
  const groupTimings = competition.groupTimings ?? [];
  if (timer.startedAt === null) return { groupTimings, timer };

  const timing: GroupTiming = {
    roundNumber: timer.roundNumber,
    group: timer.group,
    startedAt: timer.startedAt,
    endedAt: now
  };
  const nextTimings = [
    ...groupTimings.filter(t => !(t.roundNumber === timing.roundNumber && t.group === timing.group)),
    timing
  ].sort((a, b) => a.roundNumber - b.roundNumber || a.group - b.group);

  const groupNumbers = getGroupNumbers(competition.participants);
  const next = getNextTarget(timer.roundNumber, timer.group, groupNumbers, competition.roundsCount);
  const nextRecorded =
    next !== null && nextTimings.some(t => t.roundNumber === next.roundNumber && t.group === next.group);
  const nextTimer: TimerState = next
    ? { ...next, startedAt: nextRecorded ? null : now, autoStarted: !nextRecorded }
    : { roundNumber: competition.roundsCount + 1, group: groupNumbers[0], startedAt: null, autoStarted: false };

  return { groupTimings: nextTimings, timer: nextTimer };
};

/** 経過ミリ秒を秒に。端末の時計が戻った場合に負にならないよう0で止める */
export const toElapsedSeconds = (startedAt: number, now: number): number =>
  Math.max(0, Math.floor((now - startedAt) / 1000));

export const getTimingSeconds = (timing: GroupTiming): number =>
  toElapsedSeconds(timing.startedAt, timing.endedAt);

/** 本鈴を過ぎたか。表示が8:00になった時点で本鈴とみなす */
export const isOverFinalBell = (seconds: number, finalBellSeconds: number): boolean =>
  seconds >= finalBellSeconds;

export type TimerPhase = 'idle' | 'running' | 'soon' | 'warning' | 'finalSoon' | 'over';

export const getTimerPhase = (
  elapsedSeconds: number | null,
  finalBellSeconds: number
): TimerPhase => {
  if (elapsedSeconds === null) return 'idle';
  const warningBellSeconds = getWarningBellSeconds(finalBellSeconds);
  if (isOverFinalBell(elapsedSeconds, finalBellSeconds)) return 'over';
  // 鈴は係の人が鳴らすので、どちらも数秒前に予告して準備できるようにする
  if (elapsedSeconds >= finalBellSeconds - BELL_NOTICE_LEAD_SECONDS) return 'finalSoon';
  if (elapsedSeconds >= warningBellSeconds) return 'warning';
  if (elapsedSeconds >= warningBellSeconds - BELL_NOTICE_LEAD_SECONDS) return 'soon';
  return 'running';
};

/** 秒を m:ss に */
export const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};
