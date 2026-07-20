import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// これらの値は秘密情報ではなく、ビルド後のJSに埋め込まれて公開される。
// アクセス制御は Firestore Security Rules で行う。
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// 環境変数の設定漏れは起動時に気付けるようにする。
// (未設定のままだと認証が不可解な失敗をするため)
const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  throw new Error(
    `Firebaseの環境変数が設定されていません: ${missingKeys.join(', ')}\n` +
    '.env.local (ローカル) または Vercelの環境変数を確認してください。'
  );
}

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

export const googleProvider = new GoogleAuthProvider();
// 共用端末で前回のアカウントに自動ログインせず、毎回選ばせる
googleProvider.setCustomParameters({ prompt: 'select_account' });
