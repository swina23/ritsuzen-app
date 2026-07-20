import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { isAuthorizedEmail } from '../config/authorizedUsers';
import { storageManager } from '../utils/StorageManager';

export type AuthStatus =
  | 'loading'       // 認証状態の復元中
  | 'signedOut'     // 未ログイン
  | 'unauthorized'  // ログインはできたが許可リストに無いアカウント
  | 'signedIn';     // 利用可能

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // リロード後もログイン状態が復元される。完了するまでは 'loading'
    return onAuthStateChanged(auth, (nextUser) => {
      if (!nextUser) {
        // 共用端末での使用を前提としているため、ログアウト時には
        // Firestoreの購読とキャッシュを必ず破棄する。残したままだと
        // 次にログインした人に前の人の大会データが見えてしまう。
        storageManager.dispose();
        setUser(null);
        setStatus('signedOut');
        return;
      }
      const authorized = isAuthorizedEmail(nextUser.email);
      if (!authorized) {
        storageManager.dispose();
      }
      setUser(nextUser);
      setStatus(authorized ? 'signedIn' : 'unauthorized');
    });
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      // 成功後の状態遷移は onAuthStateChanged が行う
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return; // ユーザーが自分で閉じただけなのでエラー表示しない
      }
      setError(
        code === 'auth/popup-blocked'
          ? 'ログイン画面がブラウザにブロックされました。ポップアップを許可してから再度お試しください。'
          : 'ログインに失敗しました。通信状態を確認してから再度お試しください。'
      );
    }
  }, []);

  const logOut = useCallback(async () => {
    setError(null);
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({ status, user, error, signIn, logOut }),
    [status, user, error, signIn, logOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth は AuthProvider の内側で使用してください');
  }
  return context;
};
