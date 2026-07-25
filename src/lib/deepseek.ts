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

    const preferredModel = options.model && options.model.startsWith('deepseek') ? options.model : 'deepseek-chat';
    const modelsToTry = [preferredModel];
    if (!modelsToTry.includes('deepseek-chat')) modelsToTry.push('deepseek-chat');
    if (!modelsToTry.includes('deepseek-reasoner')) modelsToTry.push('deepseek-reasoner');

    const promptText = options.messages.map(m => m.content).join('\n');
    const inputTokens = estimateTokens(promptText);
    const estimatedCost = (inputTokens / 1_000_000) * 0.14 + ((options.maxTokens || 1000) / 1_000_000) * 0.28;

    await checkAiSafeguard(estimatedCost, preferredModel, options.userId);

    let lastError: Error | null = null;

    for (const modelName of modelsToTry) {
        for (let attempt = 0; attempt < 3; attempt++) {
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

                const res = await fetch('https://api.deepseek.com/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify(bodyPayload),
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    const errMsg = errData.error?.message || `HTTP ${res.status} ${res.statusText}`;
                    if (res.status === 429 || res.status >= 500) {
                        const delayMs = (attempt + 1) * 2000;
                        console.warn(`[DeepSeek ${res.status}] Retrying ${modelName} in ${delayMs}ms: ${errMsg}`);
                        await new Promise(r => setTimeout(r, delayMs));
                        continue;
                    }
                    console.warn(`[DeepSeek ${res.status}] Model ${modelName} failed, trying fallback: ${errMsg}`);
                    lastError = new Error(`DeepSeek API error (${modelName}): ${errMsg}`);
                    break; // Try next model in modelsToTry
                }

                const data = await res.json();
                const content = data.choices?.[0]?.message?.content || '';

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

    throw lastError || new Error('All DeepSeek API attempts failed.');
}
