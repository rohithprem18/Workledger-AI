/**
 * The single outbound boundary to a language model.
 *
 * Every function returns `null` rather than throwing: an unavailable, slow,
 * rate-limited or misconfigured model is an ordinary condition here, and every
 * caller is required to have a deterministic answer ready regardless. Nothing
 * in the platform blocks on a model reply.
 *
 * Speaks the OpenAI-compatible chat protocol over plain `fetch`, which every
 * provider worth using on a free tier supports — Groq, Google Gemini,
 * OpenRouter and a local Ollama are all reachable by changing two environment
 * variables. No SDK, so nothing to keep in step and nothing added to the
 * serverless bundle.
 */

export interface AiConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  engineLabel: string;
  maxSourceChars: number;
  timeoutMs: number;
}

/**
 * Values pasted into a hosting dashboard or piped into a CLI often carry a
 * trailing newline or spaces, which turn a correct model name or URL into a
 * 404. Trim everything, and treat blank as unset.
 */
function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function aiConfig(): AiConfig {
  const apiKey = env('AI_API_KEY') ?? '';
  return {
    // Off unless explicitly enabled *and* a key exists, so a half-configured
    // deployment quietly uses the deterministic engines instead of failing.
    enabled: env('AI_ENABLED')?.toLowerCase() === 'true' && apiKey.length > 0,
    apiKey,
    // `/v1/chat/completions` is appended below, so accept a base URL given
    // either with or without its `/v1` suffix.
    baseUrl: (env('AI_BASE_URL') ?? 'https://api.groq.com/openai').replace(/\/+$/, '').replace(/\/v1$/, ''),
    model: env('AI_MODEL') ?? 'openai/gpt-oss-120b',
    engineLabel: env('AI_ENGINE_LABEL') ?? 'groq/gpt-oss-120b',
    maxSourceChars: Number(process.env.AI_MAX_SOURCE_CHARS ?? 24_000),
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 45_000),
  };
}

export function isAiEnabled(): boolean {
  return aiConfig().enabled;
}

export function engineLabel(): string {
  return aiConfig().engineLabel;
}

/**
 * Models to fall back to, best first, when the configured one has been
 * retired. Providers retire models regularly and answer with a 404, which
 * would otherwise silently turn every AI feature off.
 */
const PREFERRED_MODELS = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'qwen/qwen3-32b',
  'moonshotai/kimi-k2-instruct',
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
];

// Per warm instance: the replacement for a retired model, once found.
let substituteModel: string | null = null;

/** Asks the provider which models this key can use and picks the best one. */
async function findSubstituteModel(config: AiConfig, signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(`${config.baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: { id?: string }[] };
    const available = new Set((body.data ?? []).map((m) => m.id).filter((id): id is string => !!id));
    const pick =
      PREFERRED_MODELS.find((id) => available.has(id) && id !== config.model) ??
      // Nothing we know: any general chat model beats none. Speech, guard and
      // embedding models cannot answer a chat prompt.
      [...available].find((id) => !/whisper|tts|guard|embed|playai|orpheus|compound/i.test(id));
    return pick ?? null;
  } catch {
    return null;
  }
}

async function chat(
  config: AiConfig,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal,
): Promise<{ content: string | null; modelMissing: boolean }> {
  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      // Extraction and explanation are reporting tasks, not creative ones.
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    // The provider's own message ("model not found", "invalid API key")
    // is what makes a misconfiguration diagnosable from the logs.
    const detail = await response.text().catch(() => '');
    console.warn(
      `Model call failed: HTTP ${response.status} from ${config.baseUrl} (model "${model}"). ${detail.slice(0, 300)}`,
    );
    return { content: null, modelMissing: response.status === 404 && /model/i.test(detail) };
  }

  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content?.trim();
  return { content: content && content.length > 0 ? content : null, modelMissing: false };
}

/** Free-form completion. Null when disabled or when the call failed. */
export async function complete(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const config = aiConfig();
  if (!config.enabled) return null;

  // A model that never answers must not hold a serverless invocation open
  // until the platform kills it.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), config.timeoutMs);

  try {
    const model = substituteModel ?? config.model;
    const first = await chat(config, model, systemPrompt, userPrompt, abort.signal);
    if (!first.modelMissing) return first.content;

    // The configured model has been retired: switch to one the key can use.
    const replacement = await findSubstituteModel(config, abort.signal);
    if (!replacement) return null;
    console.warn(`Model "${model}" is unavailable; using "${replacement}" instead. Set AI_MODEL to keep this.`);
    substituteModel = replacement;
    return (await chat(config, replacement, systemPrompt, userPrompt, abort.signal)).content;
  } catch (error) {
    console.warn(
      'Model call failed, falling back to deterministic path:',
      error instanceof Error ? error.message : error,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Completion constrained to a single JSON object.
 *
 * Models routinely wrap JSON in ``` fences or bracket it with an apology, so
 * the span from the first brace to its matching close is isolated before
 * parsing — tracking string literals, so a brace inside a quoted value does
 * not end the object early.
 */
export async function completeJson<T = unknown>(
  systemPrompt: string,
  userPrompt: string,
): Promise<T | null> {
  const raw = await complete(systemPrompt, userPrompt);
  if (!raw) return null;

  const isolated = isolateJsonObject(raw);
  if (!isolated) {
    console.warn('Model returned no JSON object; ignoring.');
    return null;
  }
  try {
    return JSON.parse(isolated) as T;
  } catch {
    console.warn('Model returned malformed JSON; ignoring.');
    return null;
  }
}

export function isolateJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const char = raw[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString && char === '\\') {
      escaped = true;
    } else if (char === '"') {
      inString = !inString;
    } else if (!inString && char === '{') {
      depth++;
    } else if (!inString && char === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/** Trims on a paragraph boundary so a clause is not cut mid-sentence. */
export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.lastIndexOf('\n\n', limit);
  return text.slice(0, cut > limit / 2 ? cut : limit);
}
