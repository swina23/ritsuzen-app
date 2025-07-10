/**
 * メインのErrorBoundaryコンポーネント
 * アプリケーション全体のエラーキャッチと表示を担当
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // エラーIDを生成（デバッグ用）
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // エラー情報を状態に保存
    this.setState({
      error,
      errorInfo
    });

    // エラーをコンソールに記録
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // 外部エラーハンドラーを呼び出し
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // エラーレポートをlocalStorageに保存（デバッグ用）
    this.saveErrorReport(error, errorInfo);
  }

  private saveErrorReport = (error: Error, errorInfo: ErrorInfo) => {
    try {
      const errorReport = {
        id: this.state.errorId,
        timestamp: new Date().toISOString(),
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        errorInfo: {
          componentStack: errorInfo.componentStack
        },
        userAgent: navigator.userAgent,
        url: window.location.href
      };

      const existingReports = JSON.parse(localStorage.getItem('error-reports') || '[]');
      existingReports.push(errorReport);
      
      // 最大10件まで保持
      const limitedReports = existingReports.slice(-10);
      localStorage.setItem('error-reports', JSON.stringify(limitedReports));
    } catch (e) {
      console.error('Failed to save error report:', e);
    }
  };

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // カスタムfallbackが提供されている場合は使用
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // デフォルトのエラー表示
      return (
        <div className="error-boundary">
          <div className="error-container">
            <h2>🚨 エラーが発生しました</h2>
            <p>申し訳ございません。予期しないエラーが発生しました。</p>
            
            <div className="error-actions">
              <button 
                onClick={this.handleRetry}
                className="retry-btn"
              >
                🔄 再試行
              </button>
              <button 
                onClick={this.handleReload}
                className="reload-btn"
              >
                🔃 ページを再読み込み
              </button>
            </div>

            {this.props.showDetails && this.state.error && (
              <details className="error-details">
                <summary>エラー詳細 (ID: {this.state.errorId})</summary>
                <div className="error-content">
                  <h4>エラーメッセージ:</h4>
                  <pre>{this.state.error.message}</pre>
                  
                  <h4>スタックトレース:</h4>
                  <pre>{this.state.error.stack}</pre>
                  
                  {this.state.errorInfo && (
                    <>
                      <h4>コンポーネントスタック:</h4>
                      <pre>{this.state.errorInfo.componentStack}</pre>
                    </>
                  )}
                </div>
              </details>
            )}

            <div className="error-support">
              <p>
                問題が解決しない場合は、エラーID <code>{this.state.errorId}</code> 
                をお控えの上、サポートまでお問い合わせください。
              </p>
            </div>
          </div>

          <style jsx>{`
            .error-boundary {
              min-height: 400px;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
              background-color: #fafafa;
            }
            
            .error-container {
              max-width: 600px;
              text-align: center;
              background: white;
              border-radius: 8px;
              padding: 30px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
              border: 1px solid #f0f0f0;
            }
            
            .error-container h2 {
              color: #d32f2f;
              margin-bottom: 16px;
              font-size: 24px;
            }
            
            .error-container p {
              color: #666;
              margin-bottom: 24px;
              line-height: 1.6;
            }
            
            .error-actions {
              display: flex;
              gap: 12px;
              justify-content: center;
              margin-bottom: 24px;
            }
            
            .retry-btn, .reload-btn {
              padding: 10px 20px;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 16px;
              font-weight: 500;
              transition: all 0.2s;
            }
            
            .retry-btn {
              background-color: #2196f3;
              color: white;
            }
            
            .retry-btn:hover {
              background-color: #1976d2;
            }
            
            .reload-btn {
              background-color: #757575;
              color: white;
            }
            
            .reload-btn:hover {
              background-color: #616161;
            }
            
            .error-details {
              text-align: left;
              margin-top: 20px;
              border: 1px solid #e0e0e0;
              border-radius: 4px;
            }
            
            .error-details summary {
              padding: 12px;
              background-color: #f5f5f5;
              cursor: pointer;
              font-weight: 500;
            }
            
            .error-content {
              padding: 16px;
            }
            
            .error-content h4 {
              margin: 16px 0 8px 0;
              color: #333;
              font-size: 14px;
            }
            
            .error-content pre {
              background-color: #f8f8f8;
              border: 1px solid #e0e0e0;
              border-radius: 4px;
              padding: 12px;
              font-size: 12px;
              overflow-x: auto;
              white-space: pre-wrap;
              word-break: break-word;
            }
            
            .error-support {
              margin-top: 20px;
              padding-top: 20px;
              border-top: 1px solid #e0e0e0;
              font-size: 14px;
              color: #666;
            }
            
            .error-support code {
              background-color: #f0f0f0;
              padding: 2px 6px;
              border-radius: 3px;
              font-family: monospace;
              font-size: 12px;
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;