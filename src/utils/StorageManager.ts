/**
 * LocalStorage操作を抽象化するStorageManagerクラス
 * タイプセーフな操作とエラーハンドリングを提供
 */

import { Competition, ParticipantMaster } from '../types';
import { logStorageError } from './errorUtils';
import { formatJapaneseDateTime, getTodayJapaneseDate } from './dateUtils';

export interface StorageData {
  currentCompetition: Competition | null;
  competitions: Competition[];
  participantMasters: ParticipantMaster[];
  lastUpdated: string;
}

export interface StorageInfo {
  size: string;
  itemCount: number;
  lastUpdated: string;
  totalSize: string;
}

export interface ImportResult {
  success: boolean;
  imported?: number;
  error?: string;
}

export class StorageManager {
  private readonly STORAGE_KEY = 'ritsuzen-app-data';
  private readonly MAX_COMPETITIONS = 30;

  /**
   * ストレージからデータを安全に取得
   */
  private getStorageData(): StorageData {
    const defaultData: StorageData = {
      currentCompetition: null,
      competitions: [],
      participantMasters: [],
      lastUpdated: new Date().toISOString()
    };

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return defaultData;
      
      const parsed = JSON.parse(stored);
      return {
        currentCompetition: parsed.currentCompetition || null,
        competitions: parsed.competitions || [],
        participantMasters: parsed.participantMasters || [],
        lastUpdated: parsed.lastUpdated || new Date().toISOString()
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to parse stored data');
      console.error('Failed to parse stored data:', error);
      logStorageError(err, 'getStorageData', 'competition-data');
      return defaultData;
    }
  }

  /**
   * ストレージにデータを安全に保存
   */
  private saveStorageData(data: StorageData): void {
    try {
      const updatedData = {
        ...data,
        lastUpdated: new Date().toISOString()
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedData));
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to save data to localStorage');
      console.error('Failed to save data to localStorage:', error);
      logStorageError(err, 'saveStorageData', 'competition-data');
      throw new Error('ストレージへの保存に失敗しました');
    }
  }

  /**
   * IDを生成
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // === 現在の大会管理 ===
  
  /**
   * 現在の大会を保存
   */
  saveCurrentCompetition(competition: Competition | null): void {
    const data = this.getStorageData();
    data.currentCompetition = competition;
    this.saveStorageData(data);
  }

  /**
   * 現在の大会を読み込み
   */
  loadCurrentCompetition(): Competition | null {
    try {
      const data = this.getStorageData();
      return data.currentCompetition;
    } catch (error) {
      console.error('Failed to load current competition:', error);
      return null;
    }
  }

  // === 大会履歴管理 ===
  
  /**
   * 大会を履歴に保存
   */
  saveCompetitionToHistory(competition: Competition): void {
    const data = this.getStorageData();
    
    // 既存の同じIDの大会を削除
    const competitions = data.competitions.filter(c => c.id !== competition.id);
    
    // 最新を先頭に追加
    competitions.unshift(competition);
    
    // 最大件数まで保持
    data.competitions = competitions.slice(0, this.MAX_COMPETITIONS);
    
    this.saveStorageData(data);
  }

  /**
   * 大会履歴を取得
   */
  getCompetitionHistory(): Competition[] {
    try {
      const data = this.getStorageData();
      return data.competitions;
    } catch (error) {
      console.error('Failed to load competition history:', error);
      return [];
    }
  }

  /**
   * 特定の大会をIDで取得
   */
  getCompetitionById(id: string): Competition | null {
    try {
      const competitions = this.getCompetitionHistory();
      return competitions.find(c => c.id === id) || null;
    } catch (error) {
      console.error('Failed to get competition by id:', error);
      return null;
    }
  }

  // === 参加者マスター管理 ===
  
  /**
   * アクティブな参加者マスターを取得
   */
  getParticipantMasters(): ParticipantMaster[] {
    try {
      const data = this.getStorageData();
      return data.participantMasters.filter(master => master.isActive);
    } catch (error) {
      console.error('Failed to load participant masters:', error);
      return [];
    }
  }

  /**
   * 全参加者マスターを取得（非アクティブ含む）
   */
  getAllParticipantMasters(): ParticipantMaster[] {
    try {
      const data = this.getStorageData();
      return data.participantMasters;
    } catch (error) {
      console.error('Failed to load all participant masters:', error);
      return [];
    }
  }

  /**
   * 参加者マスターを保存
   */
  saveParticipantMaster(master: Omit<ParticipantMaster, 'id' | 'createdAt'>): ParticipantMaster {
    const data = this.getStorageData();
    
    const newMaster: ParticipantMaster = {
      ...master,
      id: this.generateId(),
      createdAt: new Date().toISOString()
    };
    
    data.participantMasters.push(newMaster);
    this.saveStorageData(data);
    
    return newMaster;
  }

  /**
   * 参加者マスターを更新
   */
  updateParticipantMaster(masterId: string, updates: Partial<ParticipantMaster>): void {
    const data = this.getStorageData();
    
    data.participantMasters = data.participantMasters.map(master => 
      master.id === masterId 
        ? { ...master, ...updates, lastUsed: new Date().toISOString() }
        : master
    );
    
    this.saveStorageData(data);
  }

  /**
   * 参加者マスターの使用回数を増加
   */
  incrementMasterUsage(masterId: string): void {
    const data = this.getStorageData();
    
    data.participantMasters = data.participantMasters.map(master => 
      master.id === masterId 
        ? { 
            ...master, 
            usageCount: master.usageCount + 1,
            lastUsed: new Date().toISOString() 
          }
        : master
    );
    
    this.saveStorageData(data);
  }

  /**
   * 参加者マスターを削除
   */
  deleteParticipantMaster(masterId: string): void {
    const data = this.getStorageData();
    data.participantMasters = data.participantMasters.filter(master => master.id !== masterId);
    this.saveStorageData(data);
  }

  /**
   * 名前で参加者マスターを検索
   */
  findMasterByName(name: string): ParticipantMaster | null {
    try {
      const masters = this.getParticipantMasters();
      return masters.find(master => master.name === name) || null;
    } catch (error) {
      console.error('Failed to find master by name:', error);
      return null;
    }
  }

  /**
   * 参加者マスターをインポート
   */
  importParticipantMasters(importData: any): ImportResult {
    try {
      if (!importData.participantMasters || !Array.isArray(importData.participantMasters)) {
        return { success: false, error: 'Invalid import data format' };
      }
      
      const data = this.getStorageData();
      const existingNames = new Set(data.participantMasters.map(m => m.name));
      
      const newMasters = importData.participantMasters
        .filter((master: any) => {
          return master.name && master.rank && !existingNames.has(master.name);
        })
        .map((master: any) => ({
          ...master,
          id: this.generateId(),
          createdAt: new Date().toISOString(),
          isActive: master.isActive !== undefined ? master.isActive : true,
          usageCount: master.usageCount || 0,
          lastUsed: master.lastUsed || new Date().toISOString()
        }));
      
      data.participantMasters.push(...newMasters);
      this.saveStorageData(data);
      
      return { success: true, imported: newMasters.length };
    } catch (error) {
      console.error('Failed to import participant masters:', error);
      return { success: false, error: 'インポートに失敗しました' };
    }
  }

  // === エクスポート機能 ===
  
  /**
   * 参加者マスターをエクスポート
   */
  exportParticipantMasters(): void {
    try {
      const masters = this.getAllParticipantMasters();
      const exportData = {
        participantMasters: masters,
        exportedAt: new Date().toISOString(),
        version: '1.0'
      };
      
      this.downloadAsFile(
        JSON.stringify(exportData, null, 2),
        `参加者マスター_${getTodayJapaneseDate()}.json`,
        'application/json'
      );
    } catch (error) {
      console.error('Failed to export participant masters:', error);
      throw new Error('エクスポートに失敗しました');
    }
  }

  // === ユーティリティ ===
  
  /**
   * ストレージ情報を取得
   */
  getStorageInfo(): StorageInfo {
    try {
      const dataString = localStorage.getItem(this.STORAGE_KEY);
      const size = dataString ? new Blob([dataString]).size : 0;
      const sizeKB = Math.round(size / 1024 * 100) / 100;
      
      const data = this.getStorageData();
      
      return {
        size: `${sizeKB} KB`,
        totalSize: `${sizeKB} KB`,
        itemCount: data.competitions.length,
        lastUpdated: formatJapaneseDateTime(data.lastUpdated)
      };
    } catch (error) {
      return {
        size: 'Error',
        totalSize: 'Error',
        itemCount: 0,
        lastUpdated: 'Error'
      };
    }
  }

  /**
   * 全データを削除
   */
  clearAllData(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw new Error('データ削除に失敗しました');
    }
  }

  /**
   * ファイルとしてダウンロード
   */
  private downloadAsFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// シングルトンインスタンスをエクスポート
export const storageManager = new StorageManager();