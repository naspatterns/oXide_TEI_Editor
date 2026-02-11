/**
 * AI Provider Interface
 *
 * Common interface that all AI providers must implement.
 * This allows easy swapping between Mock, OpenAI, Anthropic, etc.
 */

import type { AIMessage, AIProvider, XMLContext } from '../types';

/** Options for chat request */
export interface ChatOptions {
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Temperature (0-1) */
  temperature?: number;
  /** Whether to stream the response */
  stream?: boolean;
}

/** AI provider interface */
export interface IAIProvider {
  /** Provider identifier */
  readonly id: AIProvider;
  /** Provider display name */
  readonly name: string;

  /**
   * Send a chat message and get a response.
   * @param messages Chat history
   * @param context Current XML context
   * @param options Optional parameters
   * @returns Response text
   */
  chat(
    messages: AIMessage[],
    context: XMLContext,
    options?: ChatOptions,
  ): Promise<string>;

  /** Check if provider is available/configured */
  isAvailable(): boolean;
}
