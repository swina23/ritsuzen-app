import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import './LoginScreen.css';

interface LoginScreenProps {
  /** 閉じる操作。ログインは必須ではないので必ず閉じられるようにする */
  onClose: () => void;
}

/**
 * クラウド保存を使うためのログイン画面。
 *
 * ログインは**必須ではない**。未ログインでもこの端末への保存で全機能が使えるため、
 * この画面はアプリの入口ではなく「クラウド保存に切り替える」ための案内として開く。
 * 許可リストの判定は Firestore Security Rules 側でも行われるため、
 * ここでの表示制御はあくまで案内のためのもの。
 */
const LoginScreen: React.FC<LoginScreenProps> = ({ onClose }) => {
  const { status, user, error, signIn, logOut } = useAuth();

  if (status === 'unauthorized') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>クラウド保存</h1>
          <p className="login-error">
            このアカウントにはクラウド保存の利用が許可されていません。
          </p>
          <p className="login-note">
            ログイン中: <strong>{user?.email}</strong>
          </p>
          <p className="login-note">
            登録済みのアカウントに切り替えてください。
            追加が必要な場合は管理者にご連絡ください。
          </p>
          <p className="login-note">
            記録はこの端末に保存されており、そのまま入力を続けられます。
          </p>
          <button className="login-btn" onClick={logOut}>
            別のアカウントでログイン
          </button>
          <button className="login-close-btn" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>クラウド保存</h1>
        <p className="login-note">
          ログインすると記録がクラウドに保存され、複数の端末から入力・閲覧できるようになります。
          通算成績も全期間が集計対象になります。
        </p>
        <p className="login-note">
          ログインしなくても、この端末に保存する形で全機能をお使いいただけます。
        </p>
        {error && <p className="login-error">{error}</p>}
        <button className="login-btn" onClick={signIn}>
          Googleでログイン
        </button>
        <button className="login-close-btn" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
};

export default LoginScreen;
