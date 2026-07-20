import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import './LoginScreen.css';

/**
 * 未ログイン時・未許可アカウント時に表示するログイン画面。
 * 許可リストの判定は Firestore Security Rules 側でも行われるため、
 * ここでの表示制御はあくまで案内のためのもの。
 */
const LoginScreen: React.FC = () => {
  const { status, user, error, signIn, logOut } = useAuth();

  if (status === 'unauthorized') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>射会記録アプリ</h1>
          <p className="login-error">
            このアカウントには利用が許可されていません。
          </p>
          <p className="login-note">
            ログイン中: <strong>{user?.email}</strong>
          </p>
          <p className="login-note">
            立禅の会で登録済みのアカウントに切り替えてください。
            追加が必要な場合は管理者にご連絡ください。
          </p>
          <button className="login-btn" onClick={logOut}>
            別のアカウントでログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>射会記録アプリ</h1>
        <p className="login-note">
          記録の閲覧・入力にはログインが必要です。
        </p>
        {error && <p className="login-error">{error}</p>}
        <button className="login-btn" onClick={signIn}>
          Googleでログイン
        </button>
      </div>
    </div>
  );
};

export default LoginScreen;
