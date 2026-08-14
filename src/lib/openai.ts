import { checkAiSafeguard, logAiCost, estimateTokens } from './ai-safeguard';

export interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface CallOpenAIOptions {
    model?: string;
    fallbackModels?: string[];
    messages: OpenAIMessage[];
    jsonMode?: boolean;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
}

/**
 * Calls OpenAI Chat Completions API with safeguard checks, cost logging, and retry logic.
 */
export async function callOpenAI(options: CallOpenAIOptions): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set in environment variables.');
    }

    const preferredModel = options.model || 'gpt-5-nano';
    const modelsToTry = [preferredModel, ...(options.fallbackModels || [])].filter(
        (m, idx, arr) => arr.indexOf(m) === idx
    );

    const promptText = options.messages.map(m => m.content).join('\n');
    const inputTokens = estimateTokens(promptText);
    const estimatedCost = (inputTokens / 1_000_000) * 0.15 + ((options.maxTokens || 1000) / 1_000_000) * 0.60;

    await checkAiSafeguard(estimatedCost, preferredModel, options.userId);

    let lastError: Error | null = null;

    for (const modelName of modelsToTry) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const bodyPayload: any = {
                    model: modelName,
                    messages: options.messages,
                };

                if (options.temperature !== undefined) {
                    bodyPayload.temperature = options.temperature;
                }

                if (options.maxTokens) {
                    // Modern OpenAI models use max_completion_tokens, while older models accept max_tokens
                    bodyPayload.max_completion_tokens = options.maxTokens;
                }

                if (options.jsonMode) {
                    bodyPayload.response_format = { type: "json_object" };
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 45000);

                let res: Response;
                try {
                    res = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify(bodyPayload),
                        signal: controller.signal
                    });

                    // If max_completion_tokens failed with unsupported parameter, retry with max_tokens
                    if (!res.ok && res.status === 400 && bodyPayload.max_completion_tokens) {
                        const errData = await res.json().catch(() => ({}));
                        const errMsg = errData.error?.message || '';
                        if (errMsg.includes('max_completion_tokens') || errMsg.includes('Unsupported parameter')) {
                            delete bodyPayload.max_completion_tokens;
                            bodyPayload.max_tokens = options.maxTokens;
                            res = await fetch('https://api.openai.com/v1/chat/completions', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${apiKey}`,
                                },
                                body: JSON.stringify(bodyPayload),
                                signal: controller.signal
                            });
                        }
                    }
                } finally {
                    clearTimeout(timeoutId);
                }

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    const errMsg = errData.error?.message || `HTTP ${res.status} ${res.statusText}`;
                    if (res.status === 429 || res.status >= 500) {
                        const delayMs = (attempt + 1) * 2000;
                        console.warn(`[OpenAI ${res.status}] Retrying ${modelName} in ${delayMs}ms: ${errMsg}`);
                        await new Promise(r => setTimeout(r, delayMs));
                        continue;
                    }
                    console.warn(`[OpenAI ${res.status}] Model ${modelName} failed, trying fallback: ${errMsg}`);
                    lastError = new Error(`OpenAI API error (${modelName}): ${errMsg}`);
                    break; // Try next model in modelsToTry
                }

                const data = await res.json();
                const choice = data.choices?.[0];
                const rawContent = choice?.message?.content;
                let content = '';

                if (typeof rawContent === 'string') {
                    content = rawContent;
                } else if (Array.isArray(rawContent)) {
                    content = rawContent.map((p: any) => p.text || '').join('');
                }

                if (choice?.finish_reason === 'length') {
                    console.warn(`[OpenAI ${modelName}] Response was truncated because it reached max_tokens limit.`);
                }

                const usage = data.usage;
                if (usage) {
                    await logAiCost(modelName, usage.prompt_tokens, usage.completion_tokens, options.userId);
                } else {
                    await logAiCost(modelName, inputTokens, estimateTokens(content), options.userId);
                }

                return content;
            } catch (err: any) {
                lastError = err;
                console.warn(`Attempt ${attempt + 1} for ${modelName} failed:`, err.message);
            }
        }
    }

    throw lastError || new Error('All OpenAI API attempts failed.');
}
