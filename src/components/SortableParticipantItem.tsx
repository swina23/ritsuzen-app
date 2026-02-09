import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Participant } from '../types';
import { formatRank } from '../utils/formatters';

interface SortableParticipantItemProps {
  participant: Participant;
  index: number;
  handicapEnabled: boolean;
  isFinished: boolean;
  onRemove: () => void;
  groupNum?: number;
}

const SortableParticipantItem: React.FC<SortableParticipantItemProps> = ({
  participant,
  index,
  handicapEnabled,
  isFinished,
  onRemove,
  groupNum
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: participant.id, disabled: isFinished });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const className = `participant-item ${groupNum ? `group-${groupNum}` : ''} ${isDragging ? 'dragging' : ''}`;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={className}
      {...attributes}
      {...listeners}
    >
      <span className="participant-info">
        <span className="drag-handle">⋮⋮</span>
        <span className="participant-order">{index + 1}.</span>
        {participant.name} ({formatRank(participant.rank)})
        {handicapEnabled && (
          <span className="handicap">
            ハンデ: {participant.rank * -2}
          </span>
        )}
      </span>
      <div className="participant-actions">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="remove-btn"
          disabled={isFinished}
        >
          削除
        </button>
      </div>
    </li>
  );
};

export default SortableParticipantItem;
