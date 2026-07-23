/**
 * ステータスメッセージ表示コンポーネント
 */

import React from 'react';

interface StatusMessageProps {
  message: string;
}

const StatusMessage: React.FC<StatusMessageProps> = React.memo(({ message }) => {
  if (!message) return null;

  return (
    <div className="status-message">
      <p>{message}</p>
    </div>
  );
});

StatusMessage.displayName = 'StatusMessage';

export default StatusMessage;