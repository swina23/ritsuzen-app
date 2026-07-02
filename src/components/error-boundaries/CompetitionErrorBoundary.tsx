/**
 * 競技記録操作用のエラーバウンダリ
 * 射撃記録、参加者管理、計算処理のエラーをキャッチ
 */

import { Component, ErrorInfo, ReactNode } from 'react';

interface CompetitionErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface CompetitionErrorBoundaryProps {
  children: ReactNode;
  section: 'score-input' | 'participant-setup' | 'results' | 'general';
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

class CompetitionErrorBoundary extends Component<CompetitionErrorBoundaryProps, CompetitionErrorBoundaryState> {
  constructor(props: CompetitionErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<CompetitionErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`CompetitionErrorBoundary (${this.props.section}):`, error, errorInfo);
    
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private getErrorMessage = (): { title: string; description: string } => {
    const { section } = this.props;
    
    switch (section) {
      case 'score-input':
        return {
          title: '記録入力でエラーが発生しました',
          description: '射撃記録の保存中に問題が発生しました。データが正しく保存されていない可能性があります。'
        };
      case 'participant-setup':
        return {
          title: '参加者設定でエラーが発生しました',
          description: '参加者の追加や編集中に問題が発生しました。操作を再試行してください。'
        };
      case 'results':
        return {
          title: '結果表示でエラーが発生しました',
          description: 'ランキングの計算や表示中に問題が発生しました。データの整合性を確認してください。'
        };
      default:
        return {
          title: '競技操作でエラーが発生しました',
          description: '競技関連の処理中に予期しないエラーが発生しました。'
        };
    }
  };

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null
    });
  };

  private handleResetSection = () => {
    // セクション固有のリセット処理
    this.handleRetry();
    
    // 必要に応じてページリロード
    if (this.props.section === 'results') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      const { title, description } = this.getErrorMessage();
      
      return (
        <div className="competition-error-boundary">
          <div className="error-content">
            <div className="error-icon">⚠️</div>
            <h3>{title}</h3>
            <p>{description}</p>
            
            <div className="error-actions">
              <button onClick={this.handleRetry} className="retry-btn">
                🔄 再試行
              </button>
              {this.props.section !== 'general' && (
                <button onClick={this.handleResetSection} className="reset-btn">
                  🔃 セクションをリセット
                </button>
              )}
            </div>

            {this.state.error && (
              <details className="error-technical">
                <summary>技術的詳細</summary>
                <div className="error-details">
                  <p><strong>エラー:</strong> {this.state.error.message}</p>
                  {this.state.error.stack && (
                    <p><strong>場所:</strong> {this.state.error.stack.split('\n')[1]?.trim()}</p>
                  )}
                </div>
              </details>
            )}
          </div>

          <style>{`
            .competition-error-boundary {
              background: linear-gradient(135deg, #fff5f5 0%, #ffeaea 100%);
              border: 2px solid #ffcdd2;
              border-radius: 12px;
              padding: 24px;
              margin: 16px 0;
              text-align: center;
            }
            
            .error-content {
              max-width: 500px;
              margin: 0 auto;
            }
            
            .error-icon {
              font-size: 48px;
              margin-bottom: 16px;
            }
            
            .error-content h3 {
              color: #d32f2f;
              margin: 0 0 12px 0;
              font-size: 20px;
              font-weight: 600;
            }
            
            .error-content p {
              color: #666;
              margin: 0 0 20px 0;
              line-height: 1.6;
            }
            
            .error-actions {
              display: flex;
              gap: 12px;
              justify-content: center;
              margin-bottom: 20px;
            }
            
            .retry-btn, .reset-btn {
              padding: 12px 24px;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
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
            
            .reset-btn {
              background-color: #ff9800;
              color: white;
            }
            
            .reset-btn:hover {
              background-color: #f57c00;
            }
            
            .error-technical {
              text-align: left;
              border: 1px solid #e0e0e0;
              border-radius: 6px;
              margin-top: 16px;
            }
            
            .error-technical summary {
              padding: 12px;
              background-color: #f8f8f8;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
            }
            
            .error-details {
              padding: 12px;
              font-size: 12px;
              color: #555;
            }
            
            .error-details p {
              margin: 8px 0;
              word-break: break-word;
            }
            
            .error-details strong {
              color: #333;
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}

export default CompetitionErrorBoundary;