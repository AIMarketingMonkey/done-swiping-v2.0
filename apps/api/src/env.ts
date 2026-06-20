import { config } from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load .env from the repo root so a single file serves all workspaces.
config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_DB_URL: z.string().optional(),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().optional(),
  BRAIN_MODEL: z.string().optional(),
  WORKER_MODEL: z.string().optional(),

  // Speech / TTS
  DEEPGRAM_API_KEY: z.string().optional(),
  CARTESIA_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),

  // LiveKit
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),

  // Embeddings
  EMBEDDINGS_API_KEY: z.string().optional(),
  EMBEDDINGS_MODEL: z.string().optional(),

  // Identity verification
  IDV_PROVIDER: z.string().optional(),
  IDV_API_KEY: z.string().optional(),
  IDV_WEBHOOK_SECRET: z.string().optional(),
  // Yoti-specific credentials (optional — required only when IDV_DEV_MODE is false)
  IDV_SDK_ID: z.string().optional(),
  IDV_PEM: z.string().optional(),
  // Dev-mock mode: set to "true" or "1" to bypass real Yoti calls during local testing.
  // MUST be false (or unset) in production.
  IDV_DEV_MODE: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Stripe Price ID for the premium subscription (e.g. price_xxx). */
  STRIPE_PRICE_PREMIUM: z.string().optional(),

  // Observability / comms
  SENTRY_DSN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  // App
  APP_REGION: z.string().optional(),
  API_PORT: z.coerce.number().default(8787),
  API_PUBLIC_URL: z.string().optional(),
  /** Deep-link scheme used to redirect back into the mobile app after Stripe checkout. */
  APP_DEEP_LINK: z.string().default('doneswiping://'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

/**
 * Require an env var at the point of use (not at startup). Throws a clear error
 * so the missing key is reported only when the relevant feature is invoked.
 */
export function requireEnv<K extends keyof typeof env>(name: K): NonNullable<(typeof env)[K]> {
  const val = env[name];
  if (val === undefined || val === null || val === '') {
    throw new Error(
      `Missing required environment variable: ${String(name)}. ` +
        `Set it in the repo-root .env file or in the process environment.`,
    );
  }
  return val as NonNullable<(typeof env)[K]>;
}
