import React, { useState, useRef } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';
import { exportAllData, exportCompetition, importData, ExportData } from '../utils/dataExport';
import { getCompetitionHistory, clearAllData, getStorageInfo, saveCurrentCompetition, saveCompetitionToHistory } from '../utils/localStorage';

const DataManager: React.FC = () => {
  const { state } = useCompetition();
  const [importStatus, setImportStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storageInfo = getStorageInfo();
  const competitionHistory = getCompetitionHistory();

  const handleExportAll = () => {
    try {
      exportAllData();
      setImportStatus('✅ 全データを出力しました');
      setTimeout(() => setImportStatus(''), 3000);
    } catch (error) {
      setImportStatus('❌ 出力に失敗しました');
      setTimeout(() => setImportStatus(''), 3000);
    }
  };

  const handleExportCurrent = () => {
    if (!state.competition) {
      setImportStatus('❌ 出力する大会データがありません');
      setTimeout(() => setImportStatus(''), 3000);
      return;
    }

    try {
      exportCompetition(state.competition);
      setImportStatus('✅ 現在の大会データを出力しました');
      setTimeout(() => setImportStatus(''), 3000);
    } catch (error) {
      setImportStatus('❌ 出力に失敗しました');
      setTimeout(() => setImportStatus(''), 3000);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportStatus('📥 データを読み込み中...');

    try {
      const importedData: ExportData = await importData(file);
      
      // 全データ形式の場合
      if (importedData.competitions) {
        // 現在の大会をセット
        if (importedData.currentCompetition) {
          saveCurrentCompetition(importedData.currentCompetition);
        }
        
        // 履歴をセット
        for (const competition of importedData.competitions) {
          saveCompetitionToHistory(competition);
        }
        
        setImportStatus(`✅ ${importedData.competitions.length}件の大会データを読み込みました`);
      }
      // 個別大会データ形式の場合
      else if (importedData.competition) {
        saveCompetitionToHistory(importedData.competition);
        
        // 進行中の大会の場合は現在の大会としてもセット
        if (importedData.competition.status !== 'finished') {
          saveCurrentCompetition(importedData.competition);
        }
        
        setImportStatus(`✅ 大会「${importedData.competition.name}」を読み込みました`);
      }
      
      // ページリロードで反映
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error) {
      setImportStatus(`❌ ${(error as Error).message}`);
      setTimeout(() => setImportStatus(''), 5000);
    }

    // ファイル入力をリセット
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearAll = () => {
    if (window.confirm('⚠️ 全てのデータを削除しますか？\nこの操作は取り消せません。')) {
      clearAllData();
      setImportStatus('✅ 全データを削除しました');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  return (
    <div className="data-manager">
      <h2>データ管理</h2>
      
      <div className="storage-info">
        <h3>ストレージ情報</h3>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">保存済み大会:</span>
            <span className="value">{storageInfo.itemCount}件</span>
          </div>
          <div className="info-item">
            <span className="label">使用容量:</span>
            <span className="value">{storageInfo.size}</span>
          </div>
          <div className="info-item">
            <span className="label">最終更新:</span>
            <span className="value">{new Date(storageInfo.lastUpdated).toLocaleString('ja-JP')}</span>
          </div>
        </div>
      </div>

      <div className="export-section">
        <h3>📤 データ出力</h3>
        <div className="button-group">
          <button onClick={handleExportAll} className="export-btn">
            📦 全データ出力
          </button>
          <button 
            onClick={handleExportCurrent} 
            className="export-btn"
            disabled={!state.competition}
          >
            📄 現在の大会出力
          </button>
        </div>
        <p className="description">
          JSONファイルとしてダウンロードされます。他の端末でのデータ読み込みに使用できます。
        </p>
      </div>

      <div className="import-section">
        <h3>📥 データ読み込み</h3>
        <div className="button-group">
          <label className="import-btn">
            📁 ファイルを選択
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </label>
        </div>
        <p className="description">
          出力したJSONファイルからデータを読み込みます。既存のデータに追加されます。
        </p>
      </div>

      {importStatus && (
        <div className="status-message">
          {importStatus}
        </div>
      )}

      <div className="history-section">
        <h3>📚 大会履歴</h3>
        {competitionHistory.length === 0 ? (
          <p>保存された大会がありません</p>
        ) : (
          <div className="history-list">
            {competitionHistory.slice(0, 10).map((competition) => (
              <div key={competition.id} className="history-item">
                <div className="competition-info">
                  <strong>{competition.name}</strong>
                  <span className="date">{competition.date}</span>
                  <span className="participants">{competition.participants.length}名参加</span>
                  <span className={`status ${competition.status}`}>
                    {competition.status === 'finished' && '完了'}
                    {competition.status === 'inProgress' && '進行中'}
                    {competition.status === 'created' && '作成済み'}
                  </span>
                </div>
              </div>
            ))}
            {competitionHistory.length > 10 && (
              <p className="more-text">他 {competitionHistory.length - 10}件...</p>
            )}
          </div>
        )}
      </div>

      <div className="danger-section">
        <h3>⚠️ 危険な操作</h3>
        <button onClick={handleClearAll} className="danger-btn">
          🗑️ 全データ削除
        </button>
        <p className="description">
          全ての保存されたデータを削除します。この操作は取り消せません。
        </p>
      </div>
    </div>
  );
};

export default DataManager;