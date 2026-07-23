/**
 * ストレージ情報表示コンポーネント
 *
 * 保存先(クラウド / この端末)で意味が変わるため、文言を出し分ける。
 * 端末保存では容量上限が現実的な制約になるので、そこにも触れておく。
 */

import React from 'react';
import { useStorageInfo } from '../../hooks/useStorage';

const StorageInfo: React.FC = React.memo(() => {
  const storageInfo = useStorageInfo();
  const isLocal = storageInfo.kind === 'local';

  return (
    <div className="storage-info">
      <h3>📊 ストレージ情報</h3>
      <div className="storage-stats">
        <div>
          <strong>保存先:</strong> {isLocal ? 'この端末' : 'クラウド'}
        </div>
        <div>
          <strong>データ項目数:</strong> {storageInfo.itemCount}
        </div>
        <div>
          <strong>使用容量:</strong> {storageInfo.totalSize}
        </div>
        <div>
          <strong>最終更新:</strong> {storageInfo.lastUpdated}
        </div>
      </div>
      <p className="storage-info-note">
        {isLocal
          ? '記録はこのブラウザだけに保存されています。他の端末からは見られません。'
            + 'ブラウザのデータを消すと記録も消えるため、データ管理からのバックアップをおすすめします。'
            + '（保存できる容量はブラウザ全体で5MB程度です）'
          : '記録はクラウドに保存されています。ログインすればどの端末からでも同じ記録を見られます。'}
      </p>
    </div>
  );
});

StorageInfo.displayName = 'StorageInfo';

export default StorageInfo;
