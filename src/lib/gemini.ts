import { checkAiSafeguard, logAiCost, estimateTokens } from './ai-safeguard';

export interface GeminiMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface CallGeminiOptions {
    model?: string;
    fallbackModels?: string[];
    messages: GeminiMessage[];
    jsonMode?: boolean;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
}

/**
 * Calls Google Gemini API with safeguard checks, cost logging, retry logic, and fallback support.
 */
export async function callGemini(options: CallGeminiOptions): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set in environment variables.');
    }

    const preferredModel = options.model || 'gemini-3.1-flash-lite';
    const modelsToTry = [preferredModel, ...(options.fallbackModels || [])].filter(
        (m, idx, arr) => arr.indexOf(m) === idx
    );

    const promptText = options.messages.map(m => m.content).join('\n');
    const inputTokens = estimateTokens(promptText);
    const estimatedCost = (inputTokens / 1_000_000) * 0.25 + ((options.maxTokens || 2000) / 1_000_000) * 1.50;

    await checkAiSafeguard(estimatedCost, preferredModel, options.userId);

    // Separate system instruction if present
    const systemMessages = options.messages.filter(m => m.role === 'system');
    const nonSystemMessages = options.messages.filter(m => m.role !== 'system');

    // Build Gemini contents array
    const contents = (nonSystemMessages.length > 0 ? nonSystemMessages : options.messages).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    let lastError: Error | null = null;

    for (const modelName of modelsToTry) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const bodyPayload: any = {
                    contents,
                    generationConfig: {}
                };

                if (systemMessages.length > 0) {
                    bodyPayload.systemInstruction = {
                        parts: systemMessages.map(m => ({ text: m.content }))
                    };
                }

                if (options.temperature !== undefined) {
                    bodyPayload.generationConfig.temperature = options.temperature;
                }

                if (options.maxTokens) {
                    bodyPayload.generationConfig.maxOutputTokens = options.maxTokens;
                }

                if (options.jsonMode) {
                    bodyPayload.generationConfig.responseMimeType = 'application/json';
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 45000);

                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyPayload),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    const errMsg = errData.error?.message || `HTTP ${res.status} ${res.statusText}`;
                    if (res.status === 429 || res.status >= 500) {
                        const delayMs = (attempt + 1) * 2000;
                        console.warn(`[Gemini ${res.status}] Retrying ${modelName} in ${delayMs}ms: ${errMsg}`);
                        await new Promise(r => setTimeout(r, delayMs));
                        continue;
                    }
                    console.warn(`[Gemini ${res.status}] Model ${modelName} failed, trying fallback: ${errMsg}`);
                    lastError = new Error(`Gemini API error (${modelName}): ${errMsg}`);
                    break; // Try next model in modelsToTry
                }

                const data = await res.json();
                const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

                const usageMetadata = data.usageMetadata;
                if (usageMetadata) {
                    await logAiCost(
                        modelName,
                        usageMetadata.promptTokenCount || inputTokens,
                        usageMetadata.candidatesTokenCount || estimateTokens(textContent),
                        options.userId
                    );
                } else {
                    await logAiCost(modelName, inputTokens, estimateTokens(textContent), options.userId);
                }

                return textContent;
            } catch (err: any) {
                lastError = err;
                console.warn(`Attempt ${attempt + 1} for Gemini ${modelName} failed:`, err.message);
            }
        }
    }

    throw lastError || new Error('All Gemini API attempts failed.');
}
