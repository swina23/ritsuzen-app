/**
 * ブラウザのオンライン/オフライン状態を購読するフック
 *
 * navigator.onLine は「ネットワークに繋がっているか」しか見ておらず、
 * Firestoreに到達できるかまでは保証しない。あくまで表示用の目安として使う。
 */

import { useSyncExternalStore } from 'react';

const subscribe = (callback: () => void): (() => void) => {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
};

const getSnapshot = (): boolean => navigator.onLine;

export const useOnlineStatus = (): boolean => useSyncExternalStore(subscribe, getSnapshot);
