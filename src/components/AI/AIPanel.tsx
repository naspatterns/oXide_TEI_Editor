/**
 * AI Panel
 *
 * Main AI assistant panel component.
 * Displays chat messages, input field, and quick actions.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useAI } from '../../ai/AIContext';
import { useEditor } from '../../store/EditorContext';
import { useSchema } from '../../store/SchemaContext';
import { buildXMLContext } from '../../ai/utils/contextBuilder';
import type { AIAction, QuickAction } from '../../ai/types';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { AILoginPlaceholder } from './AILoginPlaceholder';
import { AIActions } from './AIActions';
import './AIPanel.css';

export function AIPanel() {
  const { state: aiState, sendMessage, clearMessages, startMockMode, applyAction, setApplyActionHandler } = useAI();
  const { state: editorState, getSelection, wrapSelection, editorViewRef } = useEditor();
  const { schema } = useSchema();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasSelection = useRef(false);

  // Update selection state
  useEffect(() => {
    const checkSelection = () => {
      const selection = getSelection();
      hasSelection.current = selection.length > 0;
    };

    // Check periodically (simple approach)
    const interval = setInterval(checkSelection, 500);
    return () => clearInterval(interval);
  }, [getSelection]);

  // Set up the action handler
  useEffect(() => {
    const handleApplyAction = (action: AIAction) => {
      const view = editorViewRef.current;
      if (!view) return;

      switch (action.type) {
        case 'wrap': {
          if (action.payload.tagName) {
            wrapSelection(action.payload.tagName);
          }
          break;
        }
        case 'insert': {
          if (action.payload.xml) {
            const { from } = view.state.selection.main;
            view.dispatch({
              changes: { from, insert: action.payload.xml },
            });
            view.focus();
          }
          break;
        }
        case 'replace': {
          if (action.payload.xml) {
            const { from, to } = view.state.selection.main;
            view.dispatch({
              changes: { from, to, insert: action.payload.xml },
            });
            view.focus();
          }
          break;
        }
        case 'navigate': {
          if (action.payload.startLine) {
            const line = view.state.doc.line(action.payload.startLine);
            view.dispatch({
              selection: { anchor: line.from },
              scrollIntoView: true,
            });
            view.focus();
          }
          break;
        }
        // 'explain' doesn't need editor action
      }
    };

    setApplyActionHandler(handleApplyAction);
  }, [editorViewRef, wrapSelection, setApplyActionHandler]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiState.messages]);

  // Build context and send message
  const handleSendMessage = useCallback(
    async (content: string) => {
      const context = buildXMLContext({
        content: editorState.content,
        cursorLine: editorState.cursorLine,
        cursorColumn: editorState.cursorColumn,
        selection: getSelection() || undefined,
        errors: editorState.errors,
        schemaName: schema?.name,
      });

      await sendMessage(content, context);
    },
    [editorState, schema, getSelection, sendMessage],
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
        {aiState.messages.length === 0 ? (
          <div className="ai-welcome">
            <p>안녕하세요! TEI XML 인코딩을 도와드리겠습니다.</p>
            <p className="ai-welcome-hint">
              질문을 입력하거나 아래 Quick Actions를 사용해 보세요.
            </p>
          </div>
        ) : (
          aiState.messages.map(message => (
            <ChatMessage
              key={message.id}
              message={message}
              onApplyAction={handleApplyAction}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      <AIActions
        onAction={handleQuickAction}
        hasSelection={hasSelection.current}
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
