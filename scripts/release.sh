#!/bin/bash

CURRENT=$(node -p "require('./package.json').version")
PATCH=$(node -p "const v='$CURRENT'.split('.').map(Number); v[2]++; v.join('.')")
MINOR=$(node -p "const v='$CURRENT'.split('.').map(Number); v[1]++; v[2]=0; v.join('.')")
MAJOR=$(node -p "const v='$CURRENT'.split('.').map(Number); v[0]++; v[1]=0; v[2]=0; v.join('.')")

echo ""
echo "現在のバージョン: v$CURRENT"
echo ""
echo "  patch  → v$PATCH  (バグ修正)"
echo "  minor  → v$MINOR  (新機能追加)"
echo "  major  → v$MAJOR  (大きな変更)"
echo "  skip   → バージョンを変更しない"
echo ""
read -p "どれにしますか？ (patch/minor/major/skip): " CHOICE

case $CHOICE in
  patch|minor|major)
    npm version $CHOICE --message "chore: release v%s"
    echo ""
    echo "バージョンを v$(node -p "require('./package.json').version") に更新しました"
    echo ""
    read -p "このままpushしますか？ (y/n): " PUSH
    if [ "$PUSH" = "y" ]; then
      git push
      echo "pushしました → Vercelへ自動デプロイされます"
    fi
    ;;
  skip)
    echo "バージョンを変更しませんでした"
    ;;
  *)
    echo "無効な入力です。patch / minor / major / skip のいずれかを入力してください"
    exit 1
    ;;
esac
