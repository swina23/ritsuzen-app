/**
 * ステータスメッセージ表示コンポーネント
 */

import React from 'react';

interface StatusMessageProps {
  message: string;
}

const StatusMessage: React.FC<StatusMessageProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="import-status">
      <p>{message}</p>
    </div>
  );
};

export default StatusMessage;