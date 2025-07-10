/**
 * ストレージ情報表示コンポーネント
 */

import React from 'react';
import { storageManager } from '../../utils/StorageManager';

const StorageInfo: React.FC = () => {
  const storageInfo = storageManager.getStorageInfo();

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
};

export default StorageInfo;