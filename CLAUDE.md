# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要
- **名前**: seqimgs-player
- **説明**: 連番画像（シーケンス画像）を動画のように再生するプレイヤー
- **バンドラー**: Vite
- **言語**: JavaScript (ES6+), SCSS

## 開発環境
### 必要なコマンド
- **開発サーバー起動**: `npm run dev` / `npm start`
- **本番ビルド**: `npm run build`
- **プレビュー**: `npm run preview`
- **デプロイ**: `npm run deploy`

### ディレクトリ構造
```
/
├── src/
│   ├── index.html       # エントリーポイント
│   ├── index.js         # メインJavaScriptファイル（現在は最小構成）
│   └── index.scss       # メインスタイルファイル
├── src/
│   └── imgs/            # 連番画像ディレクトリ（takasaki_0000.webp ~ takasaki_xxxx.webp）
├── vite.config.js       # Vite設定（root: 'src', build.outDir: '../dist'）
└── package.json         # 依存関係・スクリプト
```

## 技術スタック
- **Vite**: 高速ビルドツール・開発サーバー
- **Babel**: ES6+トランスパイル（React preset含む）
- **Sass**: CSS拡張
- **Legacy Plugin**: 古いブラウザサポート

## アーキテクチャ概要
このプロジェクトは連番画像プレイヤーの実装を目的としています：
- `src/imgs/` に連番画像ファイル（takasaki_xxxx.webp形式）が格納
- メインの実装は `src/index.js` で行う予定
- プレイヤーUI要素は `src/index.html` の `#player` div内に構築

## 開発時の注意事項
- 開発サーバーは自動でブラウザを開く設定
- ビルド出力は `dist/` ディレクトリ
- IE11以外の古いブラウザをサポート
- GitHub Pagesへのデプロイが可能
- 連番画像ファイルの命名規則: `takasaki_xxxx.webp` (4桁ゼロパディング、将来的にライブラリのプロパティで指定可能予定)

## 言語・地域設定
- **主要言語**: 日本語
- **コミットメッセージ**: 日本語で記述
- **コメント・ドキュメント**: 日本語で記述

## よく使用するワークフロー
1. **新機能開発**: `npm run dev` で開発サーバー起動
2. **ビルド確認**: `npm run build` でビルド、`npm run preview` で確認
3. **デプロイ**: `npm run deploy` でGitHub Pagesに公開
