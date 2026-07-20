/**
 * クラウド同期の状態を表示するバー
 *
 * 体育館は電波が弱いことがあるため、「保存されたのか」を利用者が判断できるようにする。
 * Firestoreはオフライン中の書き込みをローカルに溜めて自動で送信するので、
 * オフライン表示が出ていても入力を続けて問題ない。
 *
 * このバーは通常のレイアウトフローに置かれているため、表示・非表示が
 * 切り替わると下のコンテンツが上下に動く。的中を1本入力するたびに
 * 書き込みが走るので、素直に「同期中」を出すと入力のたびに画面が跳ねる。
 * 通信が正常なら数百ミリ秒で終わって知らせる意味もないため、
 * 一定時間終わらなかったときだけ表示する。
 */

import React, { useEffect, useState } from 'react';
import { storageManager } from '../utils/StorageManager';
import { useHasPendingWrites } from '../hooks/useStorage';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

/** これ以上同期が終わらなければ「同期中」を出す (ミリ秒) */
const SYNCING_INDICATOR_DELAY_MS = 1500;

const SyncStatusBar: React.FC = () => {
  const isOnline = useOnlineStatus();
  const hasPendingWrites = useHasPendingWrites();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSyncing, setShowSyncing] = useState(false);

  useEffect(() => storageManager.onError(setErrorMessage), []);

  useEffect(() => {
    if (!hasPendingWrites) {
      setShowSyncing(false);
      return;
    }
    const timer = window.setTimeout(() => setShowSyncing(true), SYNCING_INDICATOR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hasPendingWrites]);

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
