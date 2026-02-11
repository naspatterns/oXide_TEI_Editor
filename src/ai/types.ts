/**
 * AI Assistant Types
 *
 * OAuth-ready type definitions for AI integration.
 * Currently implemented: Mock mode (backend-less)
 * Future: Google/OpenAI OAuth integration
 */

// ─── Authentication Types ───

/** Authentication status */
export type AuthStatus = 'unauthenticated' | 'mock' | 'authenticated';

/** Supported AI providers */
export type AIProvider = 'mock' | 'google' | 'openai' | 'anthropic';

/** User information (from OAuth) */
export interface AIUser {
  name: string;
  email?: string;
  avatar?: string;
}

// ─── Message Types ───

/** Chat message role */
export type MessageRole = 'user' | 'assistant' | 'system';

/** AI action type for XML operations */
export type AIActionType = 'insert' | 'replace' | 'wrap' | 'navigate' | 'explain';

/**
 * Parsed action from AI response.
 * Extracted from ```xml-action blocks.
 */
export interface AIAction {
  type: AIActionType;
  payload: {
    /** XML content to insert/replace */
    xml?: string;
    /** Target line number (1-based) */
    startLine?: number;
    /** End line for replace operations */
    endLine?: number;
    /** Tag name for wrap operations */
    tagName?: string;
    /** Human-readable explanation */
    explanation?: string;
  };
}

/** Chat message */
export interface AIMessage {
  /** Unique message ID */
  id: string;
  /** Message role */
  role: MessageRole;
  /** Message content (markdown supported) */
  content: string;
  /** Timestamp (ms since epoch) */
  timestamp: number;
  /** Whether the message is still streaming */
  isStreaming?: boolean;
  /** Parsed xml-action blocks from the response */
  actions?: AIAction[];
}

// ─── State Types ───

/** AI assistant state */
export interface AIState {
  /** Current authentication status */
  authStatus: AuthStatus;
  /** Current AI provider */
  provider: AIProvider;
  /** User information (null if not authenticated) */
  user: AIUser | null;
  /** Chat message history */
  messages: AIMessage[];
  /** Whether AI is processing a request */
  isLoading: boolean;
  /** Error message (if any) */
  error: string | null;
  /** Current model selection (for future use) */
  model: string;
}

// ─── Context Types ───

/** XML context sent to AI */
export interface XMLContext {
  /** Current document content */
  content: string;
  /** Current cursor line (1-based) */
  cursorLine: number;
  /** Current cursor column (1-based) */
  cursorColumn: number;
  /** Selected text (if any) */
  selection?: string;
  /** Current element path (breadcrumb) */
  elementPath?: string;
  /** Current validation errors */
  errors?: Array<{
    line: number;
    message: string;
    severity: 'error' | 'warning';
  }>;
  /** Current schema name */
  schemaName?: string;
}

// ─── Quick Action Types ───

/** Quick action definition */
export interface QuickAction {
  /** Unique action ID */
  id: string;
  /** Display label */
  label: string;
  /** Action icon (emoji) */
  icon: string;
  /** Description (tooltip) */
  description: string;
  /** Pre-defined prompt for this action */
  prompt: string;
  /** Whether this action requires text selection */
  requiresSelection?: boolean;
}

// ─── Provider Interface ───

/** AI provider interface (for dependency injection) */
export interface AIProviderInterface {
  /** Provider identifier */
  readonly id: AIProvider;
  /** Provider display name */
  readonly name: string;
  /** Send a chat message and get a response */
  chat(messages: AIMessage[], context: XMLContext): Promise<string>;
  /** Check if provider is available */
  isAvailable(): boolean;
}
