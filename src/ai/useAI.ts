import { createContext, useContext } from 'react';
import type { AIState, XMLContext, AIAction } from './types';

export interface AIContextValue {
  /** Current AI state */
  state: AIState;

  /** Send a message to the AI */
  sendMessage: (content: string, context: XMLContext) => Promise<void>;

  /** Clear chat history */
  clearMessages: () => void;

  /** Start mock mode (no login required) */
  startMockMode: () => void;

  /** Logout (placeholder for future OAuth) */
  logout: () => void;

  /** Apply an AI action to the editor */
  applyAction: (action: AIAction) => void;

  /** Set apply action handler (set by parent component) */
  setApplyActionHandler: (handler: (action: AIAction) => void) => void;
}

export const AIContext = createContext<AIContextValue | null>(null);

export function useAI(): AIContextValue {
  const ctx = useContext(AIContext);
  if (!ctx) {
    throw new Error('useAI must be used within AIProvider');
  }
  return ctx;
}
