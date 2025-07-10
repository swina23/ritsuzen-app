/**
 * ステータスメッセージ管理用のカスタムフック
 */

import { useState, useCallback } from 'react';
import { STATUS_MESSAGE_TIMEOUT } from '../utils/constants';

interface UseStatusMessageReturn {
  status: string;
  showStatus: (message: string, timeout?: number) => void;
  clearStatus: () => void;
}

/**
 * ステータスメッセージを管理するカスタムフック
 * @param defaultTimeout - デフォルトの表示時間（ミリ秒）
 * @returns ステータス管理オブジェクト
 */
export const useStatusMessage = (defaultTimeout: number = STATUS_MESSAGE_TIMEOUT): UseStatusMessageReturn => {
  const [status, setStatus] = useState('');

  const showStatus = useCallback((message: string, timeout: number = defaultTimeout) => {
    setStatus(message);
    setTimeout(() => setStatus(''), timeout);
  }, [defaultTimeout]);

  const clearStatus = useCallback(() => {
    setStatus('');
  }, []);

  return {
    status,
    showStatus,
    clearStatus
  };
};