import { checkAiSafeguard, logAiCost, estimateTokens } from './ai-safeguard';

export interface GLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
}

export interface CallGLMOptions {
    model?: string;
    fallbackModels?: string[];
    messages: GLMMessage[];
    jsonMode?: boolean;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
}

/**
 * Calls GLM (e.g. GLM-5.3-Flash) Chat Completions API with safeguard checks, cost logging, and retry logic.
 */
export async function callGLM(options: CallGLMOptions): Promise<string> {
    const apiKey = process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY;
    if (!apiKey) {
        throw new Error('GLM_API_KEY (or ZHIPU_API_KEY) is not set in environment variables.');
    }

    const baseUrl = (process.env.GLM_API_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
    const preferredModel = options.model && options.model.toLowerCase().startsWith('glm') ? options.model : 'glm-5.3-flash';
    const modelsToTry = [preferredModel, ...(options.fallbackModels || [])].filter(
        (m, idx, arr) => arr.indexOf(m) === idx
    );

    const promptText = options.messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
    const inputTokens = estimateTokens(promptText);
    const estimatedCost = (inputTokens / 1_000_000) * 0.10 + ((options.maxTokens || 1000) / 1_000_000) * 0.10;

    await checkAiSafeguard(estimatedCost, preferredModel, options.userId);

    let lastError: Error | null = null;
    const maxAttempts = 3;

    for (const modelName of modelsToTry) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const bodyPayload: any = {
                    model: modelName,
                    messages: options.messages,
                    temperature: options.temperature ?? 0.7,
                    max_tokens: options.maxTokens || 4096,
                };

                if (options.jsonMode) {
                    bodyPayload.response_format = { type: "json_object" };
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 25000);

                const res = await fetch(`${baseUrl}/chat/completions`, {
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

                    if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts - 1) {
                        const retryAfterHeader = res.headers.get('retry-after');
                        const retryAfterSeconds = retryAfterHeader ? parseFloat(retryAfterHeader) : null;
                        const delayMs = retryAfterSeconds ? retryAfterSeconds * 1000 : 1500;

                        console.warn(`[GLM ${res.status}] Retrying ${modelName} in ${delayMs}ms (attempt ${attempt + 1}/${maxAttempts}): ${errMsg}`);
                        await new Promise(r => setTimeout(r, delayMs));
                        continue;
                    }

                    console.warn(`[GLM ${res.status}] Model ${modelName} failed: ${errMsg}`);
                    lastError = new Error(`GLM API error (${modelName}): ${errMsg}`);
                    break;
                }

                const data = await res.json();
                const choice = data.choices?.[0];
                const content = choice?.message?.content || '';

                if (choice?.finish_reason === 'length') {
                    console.warn(`[GLM ${modelName}] Response was truncated because it reached max_tokens limit (${bodyPayload.max_tokens}).`);
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

    throw lastError || new Error('All GLM API attempts failed.');
}
