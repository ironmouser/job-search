import { checkAiSafeguard, logAiCost, estimateTokens } from './ai-safeguard';

export interface DeepSeekMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface CallDeepSeekOptions {
    model?: string;
    messages: DeepSeekMessage[];
    jsonMode?: boolean;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
}

/**
 * Calls DeepSeek Chat Completions API with safeguard checks, cost logging, and retry logic.
 */
export async function callDeepSeek(options: CallDeepSeekOptions): Promise<string> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY is not set in environment variables.');
    }

    const preferredModel = options.model && options.model.startsWith('deepseek') ? options.model : 'deepseek-v4-flash';
    const modelsToTry = [preferredModel];

    const promptText = options.messages.map(m => m.content).join('\n');
    const inputTokens = estimateTokens(promptText);
    const estimatedCost = (inputTokens / 1_000_000) * 0.14 + ((options.maxTokens || 1000) / 1_000_000) * 0.28;

    await checkAiSafeguard(estimatedCost, preferredModel, options.userId);

    let lastError: Error | null = null;
    const maxAttempts = 3; // 1 initial try + 2 retries

    for (const modelName of modelsToTry) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const bodyPayload: any = {
                    model: modelName,
                    messages: options.messages,
                    temperature: options.temperature ?? 0.7,
                    max_tokens: options.maxTokens || 8192,
                };

                if (options.jsonMode) {
                    bodyPayload.response_format = { type: "json_object" };
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 22000); // 22s balanced timeout

                const res = await fetch('https://api.deepseek.com/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify(bodyPayload),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    const errMsg = errData.error?.message || `HTTP ${res.status} ${res.statusText}`;

                    // Transient rate limit or server error: calculate exponential backoff with jitter
                    if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts - 1) {
                        const retryAfterHeader = res.headers.get('retry-after');
                        const retryAfterSeconds = retryAfterHeader ? parseFloat(retryAfterHeader) : null;

                        // If provider explicitly demands waiting > 4s, trigger fallback immediately rather than stall
                        if (retryAfterSeconds && retryAfterSeconds > 4) {
                            console.warn(`[DeepSeek ${res.status}] Retry-After is ${retryAfterSeconds}s, triggering immediate Gemini fallback.`);
                            lastError = new Error(`DeepSeek rate limited (${modelName}): ${errMsg}`);
                            break;
                        }

                        const baseDelay = retryAfterSeconds ? retryAfterSeconds * 1000 : (attempt === 0 ? 1500 : 3000);
                        const jitter = Math.floor(Math.random() * 500);
                        const delayMs = baseDelay + jitter;

                        console.warn(`[DeepSeek ${res.status}] Retrying ${modelName} in ${delayMs}ms (attempt ${attempt + 1}/${maxAttempts}): ${errMsg}`);
                        await new Promise(r => setTimeout(r, delayMs));
                        continue;
                    }

                    console.warn(`[DeepSeek ${res.status}] Model ${modelName} failed, trying fallback: ${errMsg}`);
                    lastError = new Error(`DeepSeek API error (${modelName}): ${errMsg}`);
                    break; // Fall back to Gemini via callAI
                }

                const data = await res.json();
                const choice = data.choices?.[0];
                const content = choice?.message?.content || '';

                if (choice?.finish_reason === 'length') {
                    console.warn(`[DeepSeek ${modelName}] Response was truncated because it reached max_tokens limit (${bodyPayload.max_tokens}).`);
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
                if (attempt < maxAttempts - 1) {
                    const delayMs = (attempt === 0 ? 1500 : 3000) + Math.floor(Math.random() * 500);
                    console.warn(`Attempt ${attempt + 1} for ${modelName} failed, retrying in ${delayMs}ms:`, err.message);
                    await new Promise(r => setTimeout(r, delayMs));
                } else {
                    console.warn(`Attempt ${attempt + 1} for ${modelName} failed:`, err.message);
                }
            }
        }
    }

    throw lastError || new Error('All DeepSeek API attempts failed.');
}

export async function* streamDeepSeek(options: CallDeepSeekOptions): AsyncGenerator<string, void, unknown> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set');

    const preferredModel = options.model && options.model.startsWith('deepseek') ? options.model : 'deepseek-v4-flash';
    const bodyPayload = {
        model: preferredModel,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens || 1024,
        stream: true
    };

    const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No readable stream returned');

    const decoder = new TextDecoder();
    let buffer = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(trimmedLine.slice(6));
                        const content = data.choices[0]?.delta?.content;
                        if (content) yield content;
                    } catch (e) {}
                }
            }
        }
    } finally {
        // Always release the reader so the underlying TCP connection/buffer is freed.
        reader.cancel().catch(() => {});
    }
}
