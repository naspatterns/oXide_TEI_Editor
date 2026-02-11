/**
 * AI Login Placeholder
 *
 * Shown when user is not authenticated.
 * Provides login buttons (disabled for now) and mock mode option.
 */

import { memo } from 'react';
import './AIPanel.css';

interface AILoginPlaceholderProps {
  onStartMockMode: () => void;
}

export const AILoginPlaceholder = memo(function AILoginPlaceholder({
  onStartMockMode,
}: AILoginPlaceholderProps) {
  const handleOAuthLogin = (provider: string) => {
    // Placeholder - will be implemented with backend
    alert(`${provider} 로그인은 백엔드 구축 후 지원됩니다.\n\n현재는 '체험 모드'를 사용해 주세요.`);
  };

  return (
    <div className="ai-login-placeholder">
      <div className="login-header">
        <span className="login-icon">🤖</span>
        <h3>AI Assistant</h3>
        <p>TEI XML 인코딩을 도와드리는 AI 어시스턴트입니다</p>
      </div>

      <div className="login-buttons">
        <button
          className="login-button google"
          onClick={() => handleOAuthLogin('Google')}
          disabled
          title="Coming soon"
        >
          <span className="login-icon-small">🔵</span>
          Google로 로그인
          <span className="coming-soon">준비 중</span>
        </button>

        <button
          className="login-button openai"
          onClick={() => handleOAuthLogin('OpenAI')}
          disabled
          title="Coming soon"
        >
          <span className="login-icon-small">⚫</span>
          OpenAI로 로그인
          <span className="coming-soon">준비 중</span>
        </button>

        <div className="login-divider">
          <span>또는</span>
        </div>

        <button
          className="login-button mock"
          onClick={onStartMockMode}
        >
          <span className="login-icon-small">🎮</span>
          체험 모드로 시작
          <span className="mock-badge">무료</span>
        </button>
      </div>

      <div className="login-footer">
        <p>
          체험 모드는 미리 준비된 응답을 제공합니다.
          <br />
          실제 AI 기능은 백엔드 구축 후 지원됩니다.
        </p>
      </div>
    </div>
  );
});
