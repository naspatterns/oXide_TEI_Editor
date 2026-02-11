/**
 * AI Provider Factory
 *
 * Creates and manages AI provider instances.
 * Currently only Mock provider is available.
 * Future: Add OpenAI, Anthropic, Google providers.
 */

import type { AIProvider } from '../types';
import type { IAIProvider } from './types';
import { mockProvider } from './mock';

/** Provider registry */
const providers: Map<AIProvider, IAIProvider> = new Map([
  ['mock', mockProvider],
]);

/**
 * Get a provider by ID.
 * Falls back to mock provider if not found.
 */
export function getProvider(id: AIProvider): IAIProvider {
  return providers.get(id) ?? mockProvider;
}

/**
 * Get all available providers.
 */
export function getAvailableProviders(): IAIProvider[] {
  return Array.from(providers.values()).filter(p => p.isAvailable());
}

/**
 * Check if a provider is available.
 */
export function isProviderAvailable(id: AIProvider): boolean {
  const provider = providers.get(id);
  return provider?.isAvailable() ?? false;
}

export type { IAIProvider, ChatOptions } from './types';
