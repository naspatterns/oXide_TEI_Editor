/**
 * Chat Message Component
 *
 * Renders a single message in the AI chat.
 * Supports markdown rendering and action buttons.
 */

import { memo, useState } from 'react';
import type { AIMessage, AIAction } from '../../ai/types';
import './AIPanel.css';

interface ChatMessageProps {
  message: AIMessage;
  onApplyAction?: (action: AIAction) => void;
  onCopyCode?: (code: string) => void;
}

/**
 * Simple markdown renderer for common patterns.
 * Handles: headers, bold, italic, code blocks, inline code, lists
 */
function renderMarkdown(content: string): JSX.Element[] {
  const elements: JSX.Element[] = [];
  const lines = content.split('\n');
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = '';
  let key = 0;

  const processInlineMarkdown = (text: string): JSX.Element[] => {
    const parts: JSX.Element[] = [];
    let partKey = 0;

    // Process inline code first
    const codeRegex = /`([^`]+)`/g;
    let lastIndex = 0;
    let match;

    while ((match = codeRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <span key={partKey++}>
            {processTextFormatting(text.slice(lastIndex, match.index))}
          </span>,
        );
      }
      parts.push(
        <code key={partKey++} className="inline-code">
          {match[1]}
        </code>,
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(
        <span key={partKey++}>
          {processTextFormatting(text.slice(lastIndex))}
        </span>,
      );
    }

    return parts.length > 0 ? parts : [<span key={0}>{text}</span>];
  };

  const processTextFormatting = (text: string): string => {
    // Just return text for now, could add bold/italic processing
    return text;
  };

  for (const line of lines) {
    // Code block handling
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        elements.push(
          <pre key={key++} className="code-block" data-lang={codeBlockLang}>
            <code>{codeBlockContent.join('\n')}</code>
          </pre>,
        );
        codeBlockContent = [];
        codeBlockLang = '';
        inCodeBlock = false;
      } else {
        // Start code block
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Headers
    if (line.startsWith('## ')) {
      elements.push(
        <h3 key={key++} className="message-h2">
          {line.slice(3)}
        </h3>,
      );
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={key++} className="message-h3">
          {line.slice(4)}
        </h4>,
      );
      continue;
    }

    // List items
    if (line.startsWith('- ')) {
      elements.push(
        <li key={key++} className="message-list-item">
          {processInlineMarkdown(line.slice(2))}
        </li>,
      );
      continue;
    }

    // Regular paragraph (skip empty lines)
    if (line.trim()) {
      elements.push(
        <p key={key++} className="message-paragraph">
          {processInlineMarkdown(line)}
        </p>,
      );
    }
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockContent.length > 0) {
    elements.push(
      <pre key={key++} className="code-block" data-lang={codeBlockLang}>
        <code>{codeBlockContent.join('\n')}</code>
      </pre>,
    );
  }

  return elements;
}

export const ChatMessage = memo(function ChatMessage({
  message,
  onApplyAction,
  onCopyCode,
}: ChatMessageProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
      onCopyCode?.(content);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming;

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">
        {isUser ? '👤' : '🤖'}
      </div>
      <div className="message-content">
        {isStreaming ? (
          <div className="message-streaming">
            <span className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </div>
        ) : (
          <>
            <div className="message-text">
              {renderMarkdown(message.content)}
            </div>

            {/* Action buttons */}
            {message.actions && message.actions.length > 0 && (
              <div className="message-actions">
                {message.actions.map((action, index) => (
                  <button
                    key={index}
                    className="action-button apply"
                    onClick={() => onApplyAction?.(action)}
                    title={`Apply ${action.type} action`}
                  >
                    {action.type === 'insert' && '➕ 삽입'}
                    {action.type === 'replace' && '🔄 교체'}
                    {action.type === 'wrap' && '🏷️ 래핑'}
                    {action.type === 'navigate' && '📍 이동'}
                    {action.type === 'explain' && '💡 설명'}
                  </button>
                ))}
                {message.actions.some(a => a.payload.xml) && (
                  <button
                    className={`action-button copy ${copiedIndex === 0 ? 'copied' : ''}`}
                    onClick={() => {
                      const xml = message.actions?.find(a => a.payload.xml)?.payload.xml;
                      if (xml) handleCopy(xml, 0);
                    }}
                  >
                    {copiedIndex === 0 ? '✓ 복사됨' : '📋 복사'}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
