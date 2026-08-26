import { callOpenAI, OpenAIMessage } from './openai';
import { callDeepSeek, DeepSeekMessage } from './deepseek';
import { callGemini, GeminiMessage } from './gemini';

export type AiTaskType = 'triage' | 'format' | 'score' | 'extract' | 'generate' | 'qa' | 'repair';

export interface CallAIOptions {
    task?: AiTaskType;
    model?: string;
    fallbackModels?: string[];
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    jsonMode?: boolean;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
}

/**
 * Centralized AI router that dispatches tasks to the appropriate model provider
 * (Gemini 3.1 Flash-Lite, DeepSeek V4 Flash, and OpenAI GPT-5 nano) with automatic fallbacks.
 */
export async function callAI(options: CallAIOptions): Promise<string> {
    const { task = 'generate', model, fallbackModels = [], messages, jsonMode, temperature, maxTokens, userId } = options;

    const hasGemini = !!process.env.GEMINI_API_KEY;
    const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;
    const hasOpenAI = !!process.env.OPENAI_API_KEY;

    // Direct model override if specified — wrapped in try/catch to fall back to task routing if the requested model fails
    if (model) {
        if (model.startsWith('gemini')) {
            if (hasGemini) {
                try {
                    return await callGemini({
                        model,
                        fallbackModels,
                        messages: messages as GeminiMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI] Direct Gemini model (${model}) failed, falling back to task cascade:`, err.message);
                }
            }
        } else if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) {
            if (hasOpenAI) {
                try {
                    return await callOpenAI({
                        model,
                        fallbackModels,
                        messages: messages as OpenAIMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI] Direct OpenAI model (${model}) failed, falling back to task cascade:`, err.message);
                }
            }
        } else if (model.startsWith('deepseek')) {
            if (hasDeepSeek) {
                try {
                    return await callDeepSeek({
                        model,
                        messages: messages as DeepSeekMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI] Direct DeepSeek model (${model}) failed, falling back to task cascade:`, err.message);
                }
            }
        }
    }

    // Task-based routing defaults
    switch (task) {
        case 'format':
        case 'triage':
        case 'extract':
        case 'repair': {
            // Light tasks: GPT-5 nano -> DeepSeek V4 Flash -> Gemini 3.1 Flash-Lite
            if (hasOpenAI) {
                try {
                    return await callOpenAI({
                        model: 'gpt-5-nano',
                        fallbackModels: ['deepseek-v4-flash', 'gemini-3.1-flash-lite', ...fallbackModels],
                        messages: messages as OpenAIMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:${task}] OpenAI failed, attempting DeepSeek/Gemini fallback:`, err.message);
                }
            }
            if (hasDeepSeek) {
                try {
                    return await callDeepSeek({
                        model: 'deepseek-v4-flash',
                        messages: messages as DeepSeekMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:${task}] DeepSeek failed, attempting Gemini fallback:`, err.message);
                }
            }
            if (hasGemini) {
                return await callGemini({
                    model: 'gemini-3.1-flash-lite',
                    fallbackModels: ['gemini-3.7-flash', ...fallbackModels],
                    messages: messages as GeminiMessage[],
                    jsonMode,
                    temperature,
                    maxTokens,
                    userId
                });
            }
            break;
        }

        case 'score': {
            // Match scoring: Gemini 3.1 Flash-Lite -> GPT-5 nano -> DeepSeek V4 Flash
            if (hasGemini) {
                try {
                    return await callGemini({
                        model: 'gemini-3.1-flash-lite',
                        fallbackModels: ['gemini-3.7-flash', ...fallbackModels],
                        messages: messages as GeminiMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:score] Gemini failed, attempting OpenAI fallback:`, err.message);
                }
            }
            if (hasOpenAI) {
                try {
                    return await callOpenAI({
                        model: 'gpt-5-nano',
                        fallbackModels,
                        messages: messages as OpenAIMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:score] OpenAI failed, attempting DeepSeek fallback:`, err.message);
                }
            }
            if (hasDeepSeek) {
                return await callDeepSeek({
                    model: 'deepseek-v4-flash',
                    messages: messages as DeepSeekMessage[],
                    jsonMode,
                    temperature,
                    maxTokens,
                    userId
                });
            }
            break;
        }

        case 'qa': {
            // Screening Q&A: DeepSeek V4 Flash -> Gemini 3.1 Flash-Lite -> OpenAI GPT-5 nano
            if (hasDeepSeek) {
                try {
                    return await callDeepSeek({
                        model: 'deepseek-v4-flash',
                        messages: messages as DeepSeekMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:qa] DeepSeek failed, attempting Gemini fallback:`, err.message);
                }
            }
            if (hasGemini) {
                try {
                    return await callGemini({
                        model: 'gemini-3.1-flash-lite',
                        fallbackModels: ['gemini-3.7-flash', ...fallbackModels],
                        messages: messages as GeminiMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:qa] Gemini failed, attempting OpenAI fallback:`, err.message);
                }
            }
            if (hasOpenAI) {
                return await callOpenAI({
                    model: 'gpt-5-nano',
                    fallbackModels,
                    messages: messages as OpenAIMessage[],
                    jsonMode,
                    temperature,
                    maxTokens,
                    userId
                });
            }
            break;
        }

        case 'generate':
        default: {
            // Asset Generation: DeepSeek V4 Flash -> Gemini 3.1 Flash-Lite -> OpenAI GPT-5 nano
            if (hasDeepSeek) {
                try {
                    return await callDeepSeek({
                        model: 'deepseek-v4-flash',
                        messages: messages as DeepSeekMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:generate] DeepSeek failed, attempting Gemini fallback:`, err.message);
                }
            }
            if (hasGemini) {
                try {
                    return await callGemini({
                        model: 'gemini-3.1-flash-lite',
                        fallbackModels: ['gemini-3.7-flash', ...fallbackModels],
                        messages: messages as GeminiMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:generate] Gemini failed, attempting OpenAI fallback:`, err.message);
                }
            }
            if (hasOpenAI) {
                return await callOpenAI({
                    model: 'gpt-5-nano',
                    fallbackModels,
                    messages: messages as OpenAIMessage[],
                    jsonMode,
                    temperature,
                    maxTokens,
                    userId
                });
            }
            break;
        }
    }

    throw new Error('No AI provider configured or all providers failed (check GEMINI_API_KEY, DEEPSEEK_API_KEY, OPENAI_API_KEY).');
}
