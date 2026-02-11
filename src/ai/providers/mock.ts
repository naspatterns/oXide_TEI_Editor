/**
 * Mock AI Provider
 *
 * Development/testing provider that returns pre-defined responses.
 * Simulates realistic AI delays for UX testing.
 */

import type { AIMessage, XMLContext } from '../types';
import type { IAIProvider, ChatOptions } from './types';
import { getMockResponse } from '../prompts/mockResponses';

/** Simulate network delay */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class MockAIProvider implements IAIProvider {
  readonly id = 'mock' as const;
  readonly name = 'Mock (Development)';

  async chat(
    messages: AIMessage[],
    context: XMLContext,
    _options?: ChatOptions,
  ): Promise<string> {
    // Simulate realistic API delay (800-1500ms)
    await delay(800 + Math.random() * 700);

    // Get the last user message
    const lastUserMessage = [...messages]
      .reverse()
      .find(m => m.role === 'user');

    if (!lastUserMessage) {
      return '어떻게 도와드릴까요? TEI XML 인코딩에 대해 질문해 주세요.';
    }

    // Get appropriate mock response
    return getMockResponse(lastUserMessage.content, context);
  }

  isAvailable(): boolean {
    return true; // Always available
  }
}

/** Singleton instance */
export const mockProvider = new MockAIProvider();
