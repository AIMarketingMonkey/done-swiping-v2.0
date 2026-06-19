import Anthropic from '@anthropic-ai/sdk';
import { requireEnv } from '../env.js';

// Re-export MODELS so callers can import both from this module.
export { MODELS } from '@done-swiping/shared';

let _client: Anthropic | null = null;

/** Returns a lazily-initialised Anthropic client. Throws if API key missing. */
export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  _client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  return _client;
}
