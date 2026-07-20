/**
 * ストレージ情報表示コンポーネント
 */

import React from 'react';
import { useStorageInfo } from '../../hooks/useStorage';

const StorageInfo: React.FC = React.memo(() => {
  const storageInfo = useStorageInfo();

  return (
    <div className="storage-info">
      <h3>📊 ストレージ情報</h3>
      <div className="storage-stats">
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
    </div>
  );
});

StorageInfo.displayName = 'StorageInfo';

export default StorageInfo;