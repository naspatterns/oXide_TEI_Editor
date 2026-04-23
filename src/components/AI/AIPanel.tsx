/**
 * AI Panel
 *
 * Main AI assistant panel component.
 * Displays chat messages, input field, and quick actions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAI } from '../../ai/useAI';
import { useEditor } from '../../store/useEditor';
import { useSchema } from '../../store/useSchema';
import { useCursor } from '../../store/useCursor';
import { useEditorActions } from '../../hooks/useEditorActions';
import { buildXMLContext } from '../../ai/utils/contextBuilder';
import type { AIAction, QuickAction } from '../../ai/types';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { AILoginPlaceholder } from './AILoginPlaceholder';
import { AIActions } from './AIActions';
import './AIPanel.css';

export function AIPanel() {
  const { state: aiState, sendMessage, clearMessages, startMockMode, applyAction, setApplyActionHandler } = useAI();
  const { state: editorState, getSelection } = useEditor();
  const { schema } = useSchema();
  const { line: cursorLine, column: cursorColumn } = useCursor();
  const editorActions = useEditorActions();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [hasSelection, setHasSelection] = useState(false);

  // Bounded message rendering. Only the most recent `visibleCount` messages
  // are placed in the DOM; older ones are revealed on demand via the
  // "Load older" button. Combined with `content-visibility: auto` on each
  // ChatMessage (see AIPanel.css), this keeps long sessions responsive
  // without pulling in a virtualization library — the AI feature is
  // mock-default-gated and not expected to hold thousands of messages.
  const MESSAGE_WINDOW_STEP = 50;
  const [visibleCount, setVisibleCount] = useState(MESSAGE_WINDOW_STEP);
  const totalMessages = aiState.messages.length;
  const windowStart = Math.max(0, totalMessages - visibleCount);
  const visibleMessages = useMemo(
    () => aiState.messages.slice(windowStart),
    [aiState.messages, windowStart],
  );
  const hiddenOlderCount = windowStart;
  const loadOlder = useCallback(
    () => setVisibleCount((prev) => prev + MESSAGE_WINDOW_STEP),
    [],
  );
  // Reset the window when the chat is cleared so the next session starts
  // at the default window size. Render-time "adjusting state when a prop
  // changes" pattern (avoids setState-in-effect).
  const [hadMessages, setHadMessages] = useState(totalMessages > 0);
  if (totalMessages > 0 && !hadMessages) {
    setHadMessages(true);
  } else if (totalMessages === 0 && hadMessages) {
    setHadMessages(false);
    setVisibleCount(MESSAGE_WINDOW_STEP);
  }

  // Poll selection state. Using state (not ref) so that AIActions re-renders
  // when selection appears/disappears. The conditional update keeps the
  // re-render rate at 0/sec while idle.
  useEffect(() => {
    const checkSelection = () => {
      const next = getSelection().length > 0;
      setHasSelection((prev) => (prev === next ? prev : next));
    };

    const interval = setInterval(checkSelection, 500);
    return () => clearInterval(interval);
  }, [getSelection]);

  // Set up the action handler. Imperative editor mutations go through
  // `useEditorActions` so this component never touches `view.dispatch` directly.
  useEffect(() => {
    const handleApplyAction = (action: AIAction) => {
      switch (action.type) {
        case 'wrap':
          if (action.payload.tagName) editorActions.wrapSelection(action.payload.tagName);
          break;
        case 'insert':
          if (action.payload.xml) editorActions.insertAtCursor(action.payload.xml);
          break;
        case 'replace':
          if (action.payload.xml) editorActions.replaceSelection(action.payload.xml);
          break;
        case 'navigate':
          if (action.payload.startLine) editorActions.goToLine(action.payload.startLine);
          break;
        // 'explain' doesn't need an editor action
      }
    };

    setApplyActionHandler(handleApplyAction);
  }, [editorActions, setApplyActionHandler]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiState.messages]);

  // Build context and send message. Cursor comes from CursorContext (live);
  // editorState provides content + errors.
  const handleSendMessage = useCallback(
    async (content: string) => {
      const context = buildXMLContext({
        content: editorState.content,
        cursorLine,
        cursorColumn,
        selection: getSelection() || undefined,
        errors: editorState.errors,
        schemaName: schema?.name,
      });

      await sendMessage(content, context);
    },
    [editorState, cursorLine, cursorColumn, schema, getSelection, sendMessage],
  );

  // Handle quick action
  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      let prompt = action.prompt;

      if (action.requiresSelection) {
        const selection = getSelection();
        if (selection) {
          prompt += `\n\n선택된 텍스트:\n\`\`\`xml\n${selection}\n\`\`\``;
        }
      }

      handleSendMessage(prompt);
    },
    [getSelection, handleSendMessage],
  );

  // Handle action from message
  const handleApplyAction = useCallback(
    (action: AIAction) => {
      applyAction(action);
    },
    [applyAction],
  );

  // Show login placeholder if not authenticated
  if (aiState.authStatus === 'unauthenticated') {
    return <AILoginPlaceholder onStartMockMode={startMockMode} />;
  }

  return (
    <div className="ai-panel">
      {/* Header */}
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <span className="ai-icon">🤖</span>
          <span>TEI Assistant</span>
          {aiState.authStatus === 'mock' && (
            <span className="mock-indicator">Mock</span>
          )}
        </div>
        <div className="ai-panel-actions">
          {aiState.messages.length > 0 && (
            <button
              className="ai-header-button"
              onClick={clearMessages}
              title="Clear chat history"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="ai-messages">
        {totalMessages === 0 ? (
          <div className="ai-welcome">
            <p>안녕하세요! TEI XML 인코딩을 도와드리겠습니다.</p>
            <p className="ai-welcome-hint">
              질문을 입력하거나 아래 Quick Actions를 사용해 보세요.
            </p>
          </div>
        ) : (
          <>
            {hiddenOlderCount > 0 && (
              <button
                type="button"
                className="ai-load-older"
                onClick={loadOlder}
                aria-label={`Load ${Math.min(MESSAGE_WINDOW_STEP, hiddenOlderCount)} older messages`}
              >
                ↑ Load {Math.min(MESSAGE_WINDOW_STEP, hiddenOlderCount)} older messages
                <span className="ai-load-older-total"> ({hiddenOlderCount} hidden)</span>
              </button>
            )}
            {visibleMessages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onApplyAction={handleApplyAction}
              />
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      <AIActions
        onAction={handleQuickAction}
        hasSelection={hasSelection}
        disabled={aiState.isLoading}
      />

      {/* Input */}
      <ChatInput
        onSend={handleSendMessage}
        disabled={aiState.isLoading}
        placeholder={aiState.isLoading ? '응답 대기 중...' : '메시지 입력... (Enter로 전송)'}
      />

      {/* Error display */}
      {aiState.error && (
        <div className="ai-error">
          ⚠️ {aiState.error}
        </div>
      )}
    </div>
  );
}
