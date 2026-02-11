/**
 * AI Quick Actions
 *
 * Pre-defined action buttons for common TEI tasks.
 */

import { memo } from 'react';
import { QUICK_ACTIONS } from '../../ai/prompts/templates';
import type { QuickAction } from '../../ai/types';
import './AIPanel.css';

interface AIActionsProps {
  onAction: (action: QuickAction) => void;
  hasSelection?: boolean;
  disabled?: boolean;
}

export const AIActions = memo(function AIActions({
  onAction,
  hasSelection = false,
  disabled = false,
}: AIActionsProps) {
  return (
    <div className="ai-quick-actions">
      <div className="quick-actions-label">Quick Actions:</div>
      <div className="quick-actions-buttons">
        {QUICK_ACTIONS.map(action => {
          const isDisabled = disabled || (action.requiresSelection && !hasSelection);

          return (
            <button
              key={action.id}
              className="quick-action-button"
              onClick={() => onAction(action)}
              disabled={isDisabled}
              title={
                isDisabled && action.requiresSelection
                  ? '텍스트를 먼저 선택하세요'
                  : action.description
              }
            >
              <span className="quick-action-icon">{action.icon}</span>
              <span className="quick-action-label">{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
