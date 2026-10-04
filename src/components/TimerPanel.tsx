import React, { useEffect, useMemo, useState } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';
import { CANCEL_AUTO_START_WINDOW_SECONDS } from '../utils/constants';
import {
  formatDuration,
  getFinalBellSeconds,
  getGroupNumbers,
  getNextTarget,
  getTimerPhase,
  getTimingSeconds,
  getWarningBellSeconds,
  INITIAL_TIMER_STATE,
  isOverFinalBell,
  isTimingComplete,
  resolveTimerGroup,
  TimerPhase,
  toElapsedSeconds
} from '../utils/timing';
import { formatGroup } from '../utils/formatters';
import './TimerPanel.css';

const PHASE_LABELS: Record<TimerPhase, string> = {
  idle: '待機中',
  running: '計測中',
  soon: 'まもなく予鈴',
  warning: '予鈴',
  finalSoon: 'まもなく本鈴',
  over: '本鈴'
};

// 円形メーターの寸法（viewBox 200×200 の中心に置く）
const GAUGE_RADIUS = 86;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

/** メーター上の角度（上が0度、時計回り）にある点 */
const pointOnCircle = (degrees: number, radius: number) => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: 100 + radius * Math.cos(radians), y: 100 + radius * Math.sin(radians) };
};

/**
 * 記録入力画面の右に置く計時パネル。
 *
 * 実際のベルは係の人が鳴らすので、ここでは音を出さず「まもなく予鈴」「予鈴」「本鈴」を
 * 色と文字で知らせるだけにしている。
 */
const TimerPanel: React.FC = () => {
  const { state, startTimer, stopTimer, cancelTimerStart, selectTimerTarget } = useCompetition();
  const competition = state.competition;
  const timer = competition?.timer ?? INITIAL_TIMER_STATE;
  const running = timer.startedAt !== null;

  // 表示の更新用。経過時間そのものは保存した開始時刻から毎回計算する
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  const groupNumbers = useMemo(
    () => getGroupNumbers(competition?.participants ?? []),
    [competition?.participants]
  );

  if (!competition) return null;

  const isFinished = competition.status === 'finished';
  const finalBellSeconds = getFinalBellSeconds(competition);
  const warningBellSeconds = getWarningBellSeconds(finalBellSeconds);
  const complete = isTimingComplete(timer, competition.roundsCount);
  const groupTimings = competition.groupTimings ?? [];
  // 待機中に組分けを変えて選んでいた組が無くなっても、実際に計る組を見せる
  const targetGroup = running ? timer.group : resolveTimerGroup(timer.group, groupNumbers);

  // 開始直後は now が開始時刻より古いことがあるが、toElapsedSeconds が0で止める
  const elapsedSeconds = timer.startedAt !== null ? toElapsedSeconds(timer.startedAt, now) : null;
  const phase = getTimerPhase(elapsedSeconds, finalBellSeconds);
  const overSeconds = elapsedSeconds !== null ? elapsedSeconds - finalBellSeconds : 0;

  const canCancelStart =
    running &&
    timer.autoStarted &&
    timer.startedAt !== null &&
    now - timer.startedAt < CANCEL_AUTO_START_WINDOW_SECONDS * 1000;

  const isLastGroup =
    getNextTarget(timer.roundNumber, targetGroup, groupNumbers, competition.roundsCount) === null;

  const progress = elapsedSeconds !== null ? Math.min(elapsedSeconds / finalBellSeconds, 1) : 0;
  const warningAngle = (warningBellSeconds / finalBellSeconds) * 360;
  const warningTickInner = pointOnCircle(warningAngle, GAUGE_RADIUS - 14);
  const warningTickOuter = pointOnCircle(warningAngle, GAUGE_RADIUS + 14);

  const roundOptions = Array.from({ length: competition.roundsCount }, (_, i) => i + 1);

  return (
    <aside className={`timer-panel phase-${phase}`} aria-label="計時">
      <div className="timer-target">
        {complete ? '全組の計測が終わりました' : `${timer.roundNumber}立目 ${formatGroup(targetGroup)}`}
      </div>

      <div className="timer-gauge">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle className="timer-gauge-track" cx="100" cy="100" r={GAUGE_RADIUS} />
          <circle
            className="timer-gauge-progress"
            cx="100"
            cy="100"
            r={GAUGE_RADIUS}
            strokeDasharray={GAUGE_CIRCUMFERENCE}
            strokeDashoffset={GAUGE_CIRCUMFERENCE * (1 - progress)}
            transform="rotate(-90 100 100)"
          />
          <line
            className="timer-gauge-tick warning"
            x1={warningTickInner.x}
            y1={warningTickInner.y}
            x2={warningTickOuter.x}
            y2={warningTickOuter.y}
          />
          <line className="timer-gauge-tick final" x1="100" y1={100 - GAUGE_RADIUS - 14} x2="100" y2={100 - GAUGE_RADIUS + 14} />
        </svg>
        <div className="timer-gauge-center">
          <div className="timer-display" role="timer">
            {formatDuration(elapsedSeconds ?? 0)}
          </div>
          <div className="timer-phase">{PHASE_LABELS[phase]}</div>
          {phase === 'over' && (
            <div className="timer-over">超過 +{formatDuration(overSeconds)}</div>
          )}
        </div>
      </div>

      <div className="timer-bells">
        <span className="bell warning">予鈴 {formatDuration(warningBellSeconds)}</span>
        <span className="bell final">本鈴 {formatDuration(finalBellSeconds)}</span>
      </div>

      {!isFinished && (
        <div className="timer-controls">
          {!running && !complete && (
            <>
              <button type="button" className="timer-btn start" onClick={startTimer}>
                スタート
              </button>
              <p className="timer-hint">揖をしたらスタートを押してください</p>
            </>
          )}
          {running && (
            <>
              <button type="button" className="timer-btn stop" onClick={stopTimer}>
                ストップ
              </button>
              <p className="timer-hint">
                {isLastGroup
                  ? '最後の矢を射終えたら押してください'
                  : '最後の矢を射終えたら押してください。次の組が同時にスタートします'}
              </p>
              {canCancelStart && (
                <>
                  <button type="button" className="timer-btn cancel" onClick={cancelTimerStart}>
                    スタートを取り消す
                  </button>
                  <p className="timer-hint">次の組の揖が遅れたときや、休憩をはさむときに押してください</p>
                </>
              )}
            </>
          )}

          {!running && (
            <div className="timer-target-select">
              <span>次に計る組:</span>
              <select
                aria-label="立目"
                value={complete ? '' : timer.roundNumber}
                onChange={(e) => selectTimerTarget(Number(e.target.value), complete ? groupNumbers[0] : targetGroup)}
              >
                {complete && <option value="" disabled>選択</option>}
                {roundOptions.map(round => (
                  <option key={round} value={round}>{round}立目</option>
                ))}
              </select>
              <select
                aria-label="グループ"
                value={complete ? '' : targetGroup}
                disabled={complete}
                onChange={(e) => selectTimerTarget(timer.roundNumber, Number(e.target.value))}
              >
                {complete && <option value="" disabled>-</option>}
                {groupNumbers.map(group => (
                  <option key={group} value={group}>{formatGroup(group)}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="timer-records">
        <h4>計測記録</h4>
        {groupTimings.length === 0 ? (
          <p className="timer-records-empty">まだありません</p>
        ) : (
          <table>
            <tbody>
              {groupTimings.map(timing => {
                const seconds = getTimingSeconds(timing);
                return (
                  <tr key={`${timing.roundNumber}-${timing.group}`}>
                    <td>{timing.roundNumber}立目</td>
                    <td>{formatGroup(timing.group)}</td>
                    <td className={isOverFinalBell(seconds, finalBellSeconds) ? 'over' : ''}>
                      {formatDuration(seconds)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  );
};

export default TimerPanel;
