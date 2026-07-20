/**
 * クラウド同期の状態を表示するバー
 *
 * 体育館は電波が弱いことがあるため、「保存されたのか」を利用者が判断できるようにする。
 * Firestoreはオフライン中の書き込みをローカルに溜めて自動で送信するので、
 * オフライン表示が出ていても入力を続けて問題ない。
 */

import React, { useEffect, useState } from 'react';
import { storageManager } from '../utils/StorageManager';
import { useHasPendingWrites } from '../hooks/useStorage';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const SyncStatusBar: React.FC = () => {
  const isOnline = useOnlineStatus();
  const hasPendingWrites = useHasPendingWrites();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => storageManager.onError(setErrorMessage), []);

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

  if (hasPendingWrites) {
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
