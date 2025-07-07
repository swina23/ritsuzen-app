import { Competition, ParticipantMaster } from '../types';

const STORAGE_KEY = 'ritsuzen-app-data';

export interface StorageData {
  currentCompetition: Competition | null;
  competitions: Competition[];
  participantMasters: ParticipantMaster[];
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
    
    // 最大30件まで保持（マスターデータを優先）
    const trimmedCompetitions = competitions.slice(0, 30);
    
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
    participantMasters: [],
    lastUpdated: new Date().toISOString()
  };

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultData;
    
    const parsed = JSON.parse(stored);
    return {
      currentCompetition: parsed.currentCompetition || null,
      competitions: parsed.competitions || [],
      participantMasters: parsed.participantMasters || [],
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

// 参加者マスター関連の機能
export const getParticipantMasters = (): ParticipantMaster[] => {
  try {
    const data = getStorageData();
    return data.participantMasters.filter(master => master.isActive);
  } catch (error) {
    console.error('Failed to load participant masters:', error);
    return [];
  }
};

export const getAllParticipantMasters = (): ParticipantMaster[] => {
  try {
    const data = getStorageData();
    return data.participantMasters;
  } catch (error) {
    console.error('Failed to load all participant masters:', error);
    return [];
  }
};

export const saveParticipantMaster = (master: Omit<ParticipantMaster, 'id' | 'createdAt'>): ParticipantMaster => {
  try {
    const existingData = getStorageData();
    const newMaster: ParticipantMaster = {
      ...master,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString()
    };
    
    const updatedMasters = [...existingData.participantMasters, newMaster];
    const updatedData: StorageData = {
      ...existingData,
      participantMasters: updatedMasters,
      lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
    return newMaster;
  } catch (error) {
    console.error('Failed to save participant master:', error);
    throw error;
  }
};

export const updateParticipantMaster = (masterId: string, updates: Partial<ParticipantMaster>): void => {
  try {
    const existingData = getStorageData();
    const updatedMasters = existingData.participantMasters.map(master => 
      master.id === masterId 
        ? { ...master, ...updates, lastUsed: new Date().toISOString() }
        : master
    );
    
    const updatedData: StorageData = {
      ...existingData,
      participantMasters: updatedMasters,
      lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
  } catch (error) {
    console.error('Failed to update participant master:', error);
  }
};

export const incrementMasterUsage = (masterId: string): void => {
  try {
    const existingData = getStorageData();
    const updatedMasters = existingData.participantMasters.map(master => 
      master.id === masterId 
        ? { 
            ...master, 
            usageCount: master.usageCount + 1,
            lastUsed: new Date().toISOString() 
          }
        : master
    );
    
    const updatedData: StorageData = {
      ...existingData,
      participantMasters: updatedMasters,
      lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
  } catch (error) {
    console.error('Failed to increment master usage:', error);
  }
};

export const deleteParticipantMaster = (masterId: string): void => {
  try {
    const existingData = getStorageData();
    const updatedMasters = existingData.participantMasters.filter(master => master.id !== masterId);
    
    const updatedData: StorageData = {
      ...existingData,
      participantMasters: updatedMasters,
      lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
  } catch (error) {
    console.error('Failed to delete participant master:', error);
  }
};

export const findMasterByName = (name: string): ParticipantMaster | null => {
  try {
    const masters = getParticipantMasters();
    return masters.find(master => master.name === name) || null;
  } catch (error) {
    console.error('Failed to find master by name:', error);
    return null;
  }
};

export const exportParticipantMasters = (): void => {
  try {
    const masters = getAllParticipantMasters();
    const data = {
      participantMasters: masters,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `参加者マスター_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export participant masters:', error);
  }
};

export const importParticipantMasters = (data: any): number => {
  try {
    if (!data.participantMasters || !Array.isArray(data.participantMasters)) {
      throw new Error('Invalid import data format');
    }
    
    const existingData = getStorageData();
    const existingNames = new Set(existingData.participantMasters.map(m => m.name));
    
    const newMasters = data.participantMasters.filter((master: any) => {
      return master.name && master.rank && !existingNames.has(master.name);
    }).map((master: any) => ({
      ...master,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      isActive: master.isActive !== undefined ? master.isActive : true,
      usageCount: master.usageCount || 0,
      lastUsed: master.lastUsed || new Date().toISOString()
    }));
    
    const updatedData: StorageData = {
      ...existingData,
      participantMasters: [...existingData.participantMasters, ...newMasters],
      lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
    return newMasters.length;
  } catch (error) {
    console.error('Failed to import participant masters:', error);
    return 0;
  }
};