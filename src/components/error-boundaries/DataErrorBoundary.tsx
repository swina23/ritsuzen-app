/**
 * データ関連操作用のエラーバウンダリ
 * インポート/エクスポート、LocalStorage操作のエラーをキャッチ
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface DataErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface DataErrorBoundaryProps {
  children: ReactNode;
  operationType: 'import' | 'export' | 'storage' | 'general';
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

class DataErrorBoundary extends Component<DataErrorBoundaryProps, DataErrorBoundaryState> {
  constructor(props: DataErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<DataErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`DataErrorBoundary (${this.props.operationType}):`, error, errorInfo);
    
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private getErrorMessage = (): string => {
    const { operationType } = this.props;
    
    switch (operationType) {
      case 'import':
        return 'データの読み込み中にエラーが発生しました。ファイル形式を確認してください。';
      case 'export':
        return 'データの出力中にエラーが発生しました。しばらく待ってから再試行してください。';
      case 'storage':
        return 'データの保存中にエラーが発生しました。ストレージ容量を確認してください。';
      default:
        return 'データ操作中にエラーが発生しました。';
    }
  };

  private getActionText = (): string => {
    const { operationType } = this.props;
    
    switch (operationType) {
      case 'import':
        return '別のファイルを選択';
      case 'export':
        return '再度エクスポート';
      case 'storage':
        return '再度保存';
      default:
        return '再試行';
    }
  };

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="data-error-boundary">
          <div className="error-message">
            <h3>⚠️ {this.getErrorMessage()}</h3>
            <div className="error-actions">
              <button onClick={this.handleRetry} className="retry-btn">
                🔄 {this.getActionText()}
              </button>
            </div>
            
            {this.state.error && (
              <details className="error-details">
                <summary>詳細情報</summary>
                <p className="error-text">{this.state.error.message}</p>
              </details>
            )}
          </div>

          <style jsx>{`
            .data-error-boundary {
              padding: 20px;
              border: 1px solid #f44336;
              border-radius: 8px;
              background-color: #fff3f3;
              margin: 10px 0;
            }
            
            .error-message h3 {
              color: #d32f2f;
              margin: 0 0 16px 0;
              font-size: 16px;
            }
            
            .error-actions {
              margin-bottom: 16px;
            }
            
            .retry-btn {
              background-color: #2196f3;
              color: white;
              border: none;
              padding: 8px 16px;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
            }
            
            .retry-btn:hover {
              background-color: #1976d2;
            }
            
            .error-details {
              margin-top: 12px;
            }
            
            .error-details summary {
              cursor: pointer;
              font-size: 14px;
              color: #666;
            }
            
            .error-text {
              margin-top: 8px;
              padding: 8px;
              background-color: #f8f8f8;
              border-radius: 4px;
              font-family: monospace;
              font-size: 12px;
              color: #d32f2f;
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}

export default DataErrorBoundary;