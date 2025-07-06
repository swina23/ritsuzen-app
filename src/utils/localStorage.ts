import { Competition } from '../types';

const STORAGE_KEY = 'ritsuzen-app-data';

export interface StorageData {
  currentCompetition: Competition | null;
  competitions: Competition[];
  lastUpdated: string;
}

// 現在の大会データを保存
export const saveCurrentCompetition = (competition: Competition | null): void => {
  try {
    const existingData = getStorageData();
    const updatedData: StorageData = {
      ...existingData,
      currentCompetition: competition,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
  } catch (error) {
    console.error('Failed to save competition to localStorage:', error);
  }
};

// 現在の大会データを読み込み
export const loadCurrentCompetition = (): Competition | null => {
  try {
    const data = getStorageData();
    return data.currentCompetition;
  } catch (error) {
    console.error('Failed to load competition from localStorage:', error);
    return null;
  }
};

// 大会を履歴に保存
export const saveCompetitionToHistory = (competition: Competition): void => {
  try {
    const existingData = getStorageData();
    const competitions = existingData.competitions.filter(c => c.id !== competition.id);
    competitions.unshift(competition); // 最新を先頭に追加
    
    // 最大50件まで保持
    const trimmedCompetitions = competitions.slice(0, 50);
    
    const updatedData: StorageData = {
      ...existingData,
      competitions: trimmedCompetitions,
      lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
  } catch (error) {
    console.error('Failed to save competition to history:', error);
  }
};

// 大会履歴を取得
export const getCompetitionHistory = (): Competition[] => {
  try {
    const data = getStorageData();
    return data.competitions;
  } catch (error) {
    console.error('Failed to load competition history:', error);
    return [];
  }
};

// 特定の大会を履歴から取得
export const getCompetitionById = (id: string): Competition | null => {
  try {
    const competitions = getCompetitionHistory();
    return competitions.find(c => c.id === id) || null;
  } catch (error) {
    console.error('Failed to get competition by id:', error);
    return null;
  }
};

// ストレージデータの初期化
const getStorageData = (): StorageData => {
  const defaultData: StorageData = {
    currentCompetition: null,
    competitions: [],
    lastUpdated: new Date().toISOString()
  };

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultData;
    
    const parsed = JSON.parse(stored);
    return {
      currentCompetition: parsed.currentCompetition || null,
      competitions: parsed.competitions || [],
      lastUpdated: parsed.lastUpdated || new Date().toISOString()
    };
  } catch (error) {
    console.error('Failed to parse stored data:', error);
    return defaultData;
  }
};

// データの完全削除
export const clearAllData = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear data:', error);
  }
};

// ストレージの使用量チェック（デバッグ用）
export const getStorageInfo = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    const size = data ? new Blob([data]).size : 0;
    const sizeKB = Math.round(size / 1024 * 100) / 100;
    
    return {
      size: `${sizeKB} KB`,
      itemCount: getCompetitionHistory().length,
      lastUpdated: getStorageData().lastUpdated
    };
  } catch (error) {
    return {
      size: 'Error',
      itemCount: 0,
      lastUpdated: 'Error'
    };
  }
};