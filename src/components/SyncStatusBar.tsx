/**
 * クラウド同期の状態を表示するバー
 *
 * 体育館は電波が弱いことがあるため、「保存されたのか」を利用者が判断できるようにする。
 * Firestoreはオフライン中の書き込みをローカルに溜めて自動で送信するので、
 * オフライン表示が出ていても入力を続けて問題ない。
 *
 * 的中を1本入力するたびに書き込みが走るため、素直に「同期中」を出すと
 * バーが入力のたびに出入りする。対策は2つ重ねてある:
 * 1. バー自体を画面下に浮かせる (App.css の position: fixed)。
 *    通常フローに置くと出入りのたびに下のコンテンツが動き、画面が上下に揺れる。
 *    iOS Safari はスクロールアンカリングを持たないので特に目立つ。
 * 2. 通信が正常なら数百ミリ秒で終わって知らせる意味もないため、
 *    一定時間終わらなかったときだけ表示する。
 * 1だけでも揺れは止まるが、素早く連打すると書き込みが途切れず
 * 「同期中」が出っぱなしになるので、2で通常時は無音にしている。
 *
 * ただし「同期中」のままいつまでも終わらないのは正常ではない。道場は電波が
 * 弱く、掴んだまま通らない状態では navigator.onLine が true のままなので
 * オフライン表示も出ない。この状態を「同期中」と同じ穏やかな見た目で出すと
 * 気づけないため、一定時間1件も送信できていなければ警告に切り替える。
 *
 * この端末に保存するモード(未ログイン)では通信も同期も無いので、
 * オフライン表示と同期中表示は出さない。保存の失敗だけは知らせる必要があるため、
 * エラー表示は保存先によらず出す。
 */

import React, { useEffect, useState } from 'react';
import { storageManager } from '../utils/StorageManager';
import { useCompletedWriteCount, useHasPendingWrites, useStorageKind } from '../hooks/useStorage';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

/** これ以上同期が終わらなければ「同期中」を出す (ミリ秒) */
const SYNCING_INDICATOR_DELAY_MS = 1500;

/**
 * これだけの間1件も送信が完了しなければ「未送信」の警告に切り替える (ミリ秒)。
 *
 * 未送信が残っているかではなく「直近に1件でも送信できたか」で測る。
 * 圏外で入力を続けると未送信件数は増え続け、快調に入力していても件数は
 * 0になりきらないため、件数では両者を区別できない。
 */
const UNSENT_WARNING_DELAY_MS = 15000;

const SyncStatusBar: React.FC = () => {
  const isOnline = useOnlineStatus();
  const hasPendingWrites = useHasPendingWrites();
  const completedWrites = useCompletedWriteCount();
  const storageKind = useStorageKind();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSyncing, setShowSyncing] = useState(false);
  const [showUnsent, setShowUnsent] = useState(false);

  useEffect(() => storageManager.onError(setErrorMessage), []);

  // 保存先が変わったら前の保存先のエラーは無関係になる。
  // このバーは保存先が変わってもアンマウントされないので、ここで自分で消す
  useEffect(() => {
    setErrorMessage(null);
  }, [storageKind]);

  // 「同期中」は未送信が残っている間だけ出す。
  // 送信が1件通るたびに引き直す必要は無いので completedWrites は見ない
  useEffect(() => {
    if (!hasPendingWrites) {
      setShowSyncing(false);
      return;
    }
    const timer = window.setTimeout(() => setShowSyncing(true), SYNCING_INDICATOR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hasPendingWrites]);

  /*
   * 「未送信」の警告。completedWrites を依存に入れているのは、送信が1件通るたびに
   * タイマーを引き直すため。通信が生きている限り警告は出ない。
   *
   * 一度出した警告は、未送信がすべて掃けるまで下ろさない (showUnsent が立っている
   * 間はタイマーを張り直さない)。電波が弱い場所では時々1件だけ通ることがあり、
   * そのたびに警告が引っ込むと、たまたま消えている瞬間を見て
   * 「送信できている」と誤解したまま道場を離れてしまう。
   */
  useEffect(() => {
    if (!hasPendingWrites) {
      setShowUnsent(false);
      return;
    }
    if (showUnsent) return;
    const timer = window.setTimeout(() => setShowUnsent(true), UNSENT_WARNING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hasPendingWrites, completedWrites, showUnsent]);

  if (errorMessage) {
    return (
      <div className="sync-status sync-status--error" role="status">
        <span>⚠️ {errorMessage}</span>
        <button className="sync-status-dismiss" onClick={() => setErrorMessage(null)}>
          閉じる
        </button>
      </div>
    );
  }

  // 端末保存モードでは通信状態も同期も関係ない
  if (storageKind !== 'cloud') {
    return null;
  }

  // 未送信が溜まっているなら、オフライン表示より具体的なこちらを優先する。
  // 「入力は残っている」と「まだ送れていない」の両方を伝える必要がある
  if (showUnsent) {
    return (
      <div className="sync-status sync-status--unsent" role="alert">
        ⚠️ まだ送信できていません。入力はこの端末に残っており、電波が戻ると自動で送信されます
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="sync-status sync-status--offline" role="status">
        📴 オフラインです。入力は端末に保存され、通信が戻ると自動で同期されます
      </div>
    );
  }

  if (showSyncing) {
    return (
      <div className="sync-status sync-status--syncing" role="status">
        🔄 同期中…
      </div>
    );
  }

  // 通常時は何も出さない (画面を狭めないため)
  return null;
};

export default SyncStatusBar;
