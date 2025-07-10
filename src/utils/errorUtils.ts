/**
 * エラーハンドリングとロギングのユーティリティ
 */

import { ErrorInfo } from 'react';

export interface ErrorReport {
  id: string;
  timestamp: string;
  type: 'boundary' | 'async' | 'storage' | 'network';
  section?: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  errorInfo?: {
    componentStack?: string;
  };
  context: {
    userAgent: string;
    url: string;
    timestamp: string;
    sessionId: string;
  };
  userData?: {
    competitionId?: string;
    participantCount?: number;
    currentAction?: string;
  };
}

// セッション用のユニークID生成
const SESSION_ID = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * エラーレポートを生成
 */
export const createErrorReport = (
  error: Error,
  type: ErrorReport['type'],
  section?: string,
  errorInfo?: ErrorInfo,
  userData?: ErrorReport['userData']
): ErrorReport => {
  return {
    id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    type,
    section,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    errorInfo: errorInfo ? {
      componentStack: errorInfo.componentStack
    } : undefined,
    context: {
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      sessionId: SESSION_ID
    },
    userData
  };
};

/**
 * エラーレポートをLocalStorageに保存
 */
export const saveErrorReport = (errorReport: ErrorReport): void => {
  try {
    const existingReports = getErrorReports();
    existingReports.push(errorReport);
    
    // 最大20件まで保持
    const limitedReports = existingReports.slice(-20);
    localStorage.setItem('kyudo-error-reports', JSON.stringify(limitedReports));
    
    console.error('Error saved to local storage:', errorReport);
  } catch (e) {
    console.error('Failed to save error report:', e);
  }
};

/**
 * 保存されたエラーレポートを取得
 */
export const getErrorReports = (): ErrorReport[] => {
  try {
    const reports = localStorage.getItem('kyudo-error-reports');
    return reports ? JSON.parse(reports) : [];
  } catch (e) {
    console.error('Failed to load error reports:', e);
    return [];
  }
};

/**
 * エラーレポートをクリア
 */
export const clearErrorReports = (): void => {
  try {
    localStorage.removeItem('kyudo-error-reports');
  } catch (e) {
    console.error('Failed to clear error reports:', e);
  }
};

/**
 * 非同期処理のエラーをキャッチして記録
 */
export const logAsyncError = (
  error: Error,
  section: string,
  action?: string
): void => {
  const errorReport = createErrorReport(
    error,
    'async',
    section,
    undefined,
    { currentAction: action }
  );
  
  saveErrorReport(errorReport);
};

/**
 * ストレージ操作のエラーをキャッチして記録
 */
export const logStorageError = (
  error: Error,
  operation: string,
  dataType?: string
): void => {
  const errorReport = createErrorReport(
    error,
    'storage',
    `storage-${operation}`,
    undefined,
    { currentAction: `${operation} ${dataType || 'data'}` }
  );
  
  saveErrorReport(errorReport);
};

/**
 * ネットワーク関連のエラーを記録
 */
export const logNetworkError = (
  error: Error,
  endpoint?: string,
  method?: string
): void => {
  const errorReport = createErrorReport(
    error,
    'network',
    'network-request',
    undefined,
    { currentAction: `${method || 'REQUEST'} ${endpoint || 'unknown'}` }
  );
  
  saveErrorReport(errorReport);
};

/**
 * エラー統計を取得
 */
export const getErrorStatistics = (): {
  total: number;
  byType: Record<ErrorReport['type'], number>;
  bySection: Record<string, number>;
  recent24Hours: number;
} => {
  const reports = getErrorReports();
  const now = Date.now();
  const dayAgo = now - (24 * 60 * 60 * 1000);
  
  const stats = {
    total: reports.length,
    byType: {} as Record<ErrorReport['type'], number>,
    bySection: {} as Record<string, number>,
    recent24Hours: 0
  };
  
  reports.forEach(report => {
    // タイプ別集計
    stats.byType[report.type] = (stats.byType[report.type] || 0) + 1;
    
    // セクション別集計
    if (report.section) {
      stats.bySection[report.section] = (stats.bySection[report.section] || 0) + 1;
    }
    
    // 24時間以内のエラー数
    if (new Date(report.timestamp).getTime() > dayAgo) {
      stats.recent24Hours++;
    }
  });
  
  return stats;
};

/**
 * エラーレポートをJSON形式でエクスポート
 */
export const exportErrorReports = (): void => {
  try {
    const reports = getErrorReports();
    const stats = getErrorStatistics();
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      sessionId: SESSION_ID,
      statistics: stats,
      reports
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kyudo-error-reports-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export error reports:', error);
  }
};

/**
 * 安全なJSON.parse（エラー処理付き）
 */
export const safeJsonParse = <T>(jsonString: string, fallback: T): T => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    logStorageError(
      new Error(`JSON parse failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
      'parse',
      'json'
    );
    return fallback;
  }
};

/**
 * 安全なLocalStorage操作
 */
export const safeLocalStorage = {
  getItem: (key: string, fallback: string | null = null): string | null => {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (error) {
      logStorageError(
        error instanceof Error ? error : new Error('LocalStorage getItem failed'),
        'getItem',
        key
      );
      return fallback;
    }
  },
  
  setItem: (key: string, value: string): boolean => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      logStorageError(
        error instanceof Error ? error : new Error('LocalStorage setItem failed'),
        'setItem',
        key
      );
      return false;
    }
  },
  
  removeItem: (key: string): boolean => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      logStorageError(
        error instanceof Error ? error : new Error('LocalStorage removeItem failed'),
        'removeItem',
        key
      );
      return false;
    }
  }
};