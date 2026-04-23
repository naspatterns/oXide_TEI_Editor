/**
 * AI Context
 *
 * State management for the AI Assistant feature.
 * Follows the same pattern as EditorContext and SchemaContext.
 */

import { useReducer, useCallback, useRef, useMemo, type ReactNode } from 'react';
import type {
  AIState,
  AIMessage,
  AuthStatus,
  AIProvider,
  XMLContext,
  AIAction,
} from './types';
import { getProvider } from './providers';
import { parseAIResponse } from './utils/responseParser';
import { AIContext } from './useAI';

// ─── Initial State ───

const initialState: AIState = {
  authStatus: 'mock', // Start in mock mode (no auth required)
  provider: 'mock',
  user: null,
  messages: [],
  isLoading: false,
  error: null,
  model: 'mock-v1',
};

// ─── Actions ───

type Action =
  | { type: 'SET_AUTH_STATUS'; status: AuthStatus }
  | { type: 'SET_PROVIDER'; provider: AIProvider }
  | { type: 'SET_USER'; user: AIState['user'] }
  | { type: 'ADD_MESSAGE'; message: AIMessage }
  | { type: 'UPDATE_MESSAGE'; id: string; updates: Partial<AIMessage> }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'REMOVE_MESSAGE'; id: string };

function reducer(state: AIState, action: Action): AIState {
  switch (action.type) {
    case 'SET_AUTH_STATUS':
      return { ...state, authStatus: action.status };

    case 'SET_PROVIDER':
      return { ...state, provider: action.provider };

    case 'SET_USER':
      return { ...state, user: action.user };

    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.id ? { ...msg, ...action.updates } : msg,
        ),
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] };

    case 'REMOVE_MESSAGE':
      return {
        ...state,
        messages: state.messages.filter((msg) => msg.id !== action.id),
      };

    default:
      return state;
  }
}

// ─── Provider ───

export function AIProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Store the apply action handler in a ref so it survives re-renders
  // and can be updated imperatively by a child component (AIPanel) without
  // triggering a re-render cascade across all AI consumers.
  const applyActionHandlerRef = useRef<((action: AIAction) => void) | null>(null);

  const setApplyActionHandler = useCallback((handler: (action: AIAction) => void) => {
    applyActionHandlerRef.current = handler;
  }, []);

  const generateMessageId = useCallback(() => {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  const sendMessage = useCallback(
    async (content: string, context: XMLContext) => {
      // Add user message
      const userMessage: AIMessage = {
        id: generateMessageId(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      dispatch({ type: 'ADD_MESSAGE', message: userMessage });

      // Create placeholder for assistant response
      const assistantMessageId = generateMessageId();
      const assistantMessage: AIMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };
      dispatch({ type: 'ADD_MESSAGE', message: assistantMessage });
      dispatch({ type: 'SET_LOADING', isLoading: true });
      dispatch({ type: 'SET_ERROR', error: null });

      try {
        // Get the current provider
        const provider = getProvider(state.provider);

        // Send request
        const response = await provider.chat(
          [...state.messages, userMessage],
          context,
        );

        // Parse response for actions
        const { content: parsedContent, actions } = parseAIResponse(response);

        // Update assistant message with response
        dispatch({
          type: 'UPDATE_MESSAGE',
          id: assistantMessageId,
          updates: {
            content: parsedContent,
            isStreaming: false,
            actions: actions.length > 0 ? actions : undefined,
          },
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        dispatch({ type: 'SET_ERROR', error: errorMessage });
        dispatch({
          type: 'UPDATE_MESSAGE',
          id: assistantMessageId,
          updates: {
            content: `오류가 발생했습니다: ${errorMessage}`,
            isStreaming: false,
          },
        });
      } finally {
        dispatch({ type: 'SET_LOADING', isLoading: false });
      }
    },
    [state.messages, state.provider, generateMessageId],
  );

  const clearMessages = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' });
  }, []);

  const startMockMode = useCallback(() => {
    dispatch({ type: 'SET_AUTH_STATUS', status: 'mock' });
    dispatch({ type: 'SET_PROVIDER', provider: 'mock' });
    dispatch({
      type: 'SET_USER',
      user: { name: 'Guest (Mock Mode)' },
    });
  }, []);

  const logout = useCallback(() => {
    dispatch({ type: 'SET_AUTH_STATUS', status: 'unauthenticated' });
    dispatch({ type: 'SET_USER', user: null });
    dispatch({ type: 'CLEAR_MESSAGES' });
  }, []);

  const applyAction = useCallback((action: AIAction) => {
    const handler = applyActionHandlerRef.current;
    if (handler) {
      handler(action);
    } else {
      console.warn('No apply action handler set');
    }
  }, []);

  const value = useMemo(
    () => ({
      state,
      sendMessage,
      clearMessages,
      startMockMode,
      logout,
      applyAction,
      setApplyActionHandler,
    }),
    [state, sendMessage, clearMessages, startMockMode, logout, applyAction, setApplyActionHandler],
  );

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}
