/**
 * データ読み込みセクションコンポーネント
 */

import React, { useRef, useCallback, useState } from 'react';
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedMasterFile, setSelectedMasterFile] = useState<File | null>(null);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSelectedFile(file || null);
  }, []);

  const handleImport = useCallback(async () => {
    if (!selectedFile) {
      onStatusUpdate('❌ ファイルを選択してください');
      return;
    }

    try {
      const importResult = await importData(selectedFile);
      
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
      setSelectedFile(null);
    }
  }, [selectedFile, onStatusUpdate]);

  const handleMasterFileSelect = useCallback(() => {
    masterFileInputRef.current?.click();
  }, []);

  const handleMasterFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSelectedMasterFile(file || null);
  }, []);

  const handleImportMasters = useCallback(async () => {
    if (!selectedMasterFile) {
      onStatusUpdate('❌ ファイルを選択してください');
      return;
    }

    try {
      const text = await selectedMasterFile.text();
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
      setSelectedMasterFile(null);
    }
  }, [selectedMasterFile, onStatusUpdate, onMastersUpdated]);

  return (
    <div className="data-import-section">
      <h3>📥 データ読み込み</h3>
      
      <div className="import-group">
        <h4>🏹 大会データ</h4>
        
        {/* Step 1: ファイル選択 */}
        <div className="import-step">
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button 
            onClick={handleFileSelect} 
            className="file-select-btn"
          >
            📁 ファイル選択
          </button>
          {selectedFile && (
            <div className="selected-file">
              ✓ {selectedFile.name}
            </div>
          )}
        </div>
        
        {/* Step 2: インポート実行 */}
        {selectedFile && (
          <div className="import-step">
            <button onClick={handleImport} className="import-btn">
              📥 インポート実行
            </button>
          </div>
        )}
        
        <p className="import-note">
          ⚠️ 現在のデータは上書きされます
        </p>
      </div>

      <div className="import-group">
        <h4>👥 参加者マスター</h4>
        
        {/* Step 1: ファイル選択 */}
        <div className="import-step">
          <input
            type="file"
            accept=".json"
            ref={masterFileInputRef}
            onChange={handleMasterFileChange}
            style={{ display: 'none' }}
          />
          <button 
            onClick={handleMasterFileSelect} 
            className="file-select-btn"
          >
            📁 ファイル選択
          </button>
          {selectedMasterFile && (
            <div className="selected-file">
              ✓ {selectedMasterFile.name}
            </div>
          )}
        </div>
        
        {/* Step 2: インポート実行 */}
        {selectedMasterFile && (
          <div className="import-step">
            <button onClick={handleImportMasters} className="import-btn">
              📥 インポート実行
            </button>
          </div>
        )}
        
        <p className="import-note">
          💡 既存のマスターに追加されます
        </p>
      </div>
    </div>
  );
});

DataImportSection.displayName = 'DataImportSection';

export default DataImportSection;