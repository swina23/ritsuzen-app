/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VARIANT?: string;
}

// strictImportMetaEnv を有効にすると ImportMetaEnv のインデックスシグネチャが
// 外れ、未宣言の VITE_* 変数へのアクセスが型エラーになる(タイポ検出)。
interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}
