/**
 * データ読み込みセクションコンポーネント
 */

import React, { useRef, useCallback } from 'react';
import { importData } from '../../utils/dataExport';
import { storageManager } from '../../utils/StorageManager';

interface DataImportSectionProps {
  onStatusUpdate: (message: string) => void;
  onMastersUpdated: () => void;
}

const DataImportSection: React.FC<DataImportSectionProps> = React.memo(({ 
  onStatusUpdate, 
  onMastersUpdated 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterFileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = useCallback(async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      onStatusUpdate('❌ ファイルを選択してください');
      return;
    }

    try {
      const importResult = await importData(file);
      
      if (importResult.success && importResult.data) {
        // インポートしたデータをStorageManagerに保存
        if (importResult.data.competitions) {
          // 全データの場合
          for (const competition of importResult.data.competitions) {
            storageManager.saveCompetitionToHistory(competition);
          }
          onStatusUpdate(`✅ ${importResult.data.competitions.length}件の大会データをインポートしました！`);
        } else if (importResult.data.competition) {
          // 個別大会データの場合
          storageManager.saveCompetitionToHistory(importResult.data.competition);
          onStatusUpdate('✅ 大会データをインポートしました！');
        } else {
          onStatusUpdate('❌ インポート可能なデータが見つかりませんでした');
          return;
        }
        
        // ページリロードして最新状態を反映
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        onStatusUpdate(`❌ ${importResult.error}`);
      }
    } catch (error) {
      console.error('Import failed:', error);
      onStatusUpdate('❌ ファイルの読み込みに失敗しました');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onStatusUpdate]);

  const handleImportMasters = useCallback(async () => {
    const file = masterFileInputRef.current?.files?.[0];
    if (!file) {
      onStatusUpdate('❌ ファイルを選択してください');
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const importResult = storageManager.importParticipantMasters(data);
      
      if (importResult.success) {
        onStatusUpdate(`✅ ${importResult.imported}件のマスターをインポートしました`);
        onMastersUpdated();
      } else {
        onStatusUpdate(`❌ ${importResult.error}`);
      }
    } catch (error) {
      console.error('Master import failed:', error);
      onStatusUpdate('❌ マスターファイルの読み込みに失敗しました');
    } finally {
      if (masterFileInputRef.current) {
        masterFileInputRef.current.value = '';
      }
    }
  }, [onStatusUpdate, onMastersUpdated]);

  return (
    <div className="data-import-section">
      <h3>📥 データ読み込み</h3>
      
      <div className="import-group">
        <h4>🏹 大会データ</h4>
        <div className="import-controls">
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            style={{ display: 'none' }}
          />
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="import-btn"
          >
            📂 ファイル選択
          </button>
          <button onClick={handleImport} className="import-btn primary">
            📥 インポート
          </button>
        </div>
        <p className="import-note">
          ⚠️ 現在のデータは上書きされます
        </p>
      </div>

      <div className="import-group">
        <h4>👥 参加者マスター</h4>
        <div className="import-controls">
          <input
            type="file"
            accept=".json"
            ref={masterFileInputRef}
            style={{ display: 'none' }}
          />
          <button 
            onClick={() => masterFileInputRef.current?.click()} 
            className="import-btn"
          >
            📂 ファイル選択
          </button>
          <button onClick={handleImportMasters} className="import-btn primary">
            📥 インポート
          </button>
        </div>
        <p className="import-note">
          💡 既存のマスターに追加されます
        </p>
      </div>
    </div>
  );
});

DataImportSection.displayName = 'DataImportSection';

export default DataImportSection;