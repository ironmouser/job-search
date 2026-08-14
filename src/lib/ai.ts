import { callOpenAI, OpenAIMessage } from './openai';
import { callDeepSeek, DeepSeekMessage } from './deepseek';

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
 * (OpenAI GPT-5 nano / GPT-5.6 luna vs. DeepSeek V4 Flash) with automatic fallbacks.
 */
export async function callAI(options: CallAIOptions): Promise<string> {
    const { task = 'generate', model, fallbackModels = [], messages, jsonMode, temperature, maxTokens, userId } = options;

    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;

    // Direct model override if specified
    if (model) {
        if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) {
            if (hasOpenAI) {
                return await callOpenAI({
                    model,
                    fallbackModels,
                    messages: messages as OpenAIMessage[],
                    jsonMode,
                    temperature,
                    maxTokens,
                    userId
                });
            }
        } else if (model.startsWith('deepseek')) {
            if (hasDeepSeek) {
                return await callDeepSeek({
                    model,
                    messages: messages as DeepSeekMessage[],
                    jsonMode,
                    temperature,
                    maxTokens,
                    userId
                });
            }
        }
    }

    // Task-based routing defaults
    switch (task) {
        case 'format':
        case 'triage':
        case 'extract':
        case 'repair': {
            // High-throughput light tasks: GPT-5 nano (fallback to GPT-5.6 luna, then DeepSeek V4 Flash)
            if (hasOpenAI) {
                try {
                    return await callOpenAI({
                        model: 'gpt-5-nano',
                        fallbackModels: ['gpt-5.6-luna', ...fallbackModels],
                        messages: messages as OpenAIMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:${task}] OpenAI failed, attempting DeepSeek fallback:`, err.message);
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
                    throw err;
                }
            } else if (hasDeepSeek) {
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

        case 'score':
        case 'qa': {
            // Scoring & Q&A analysis: GPT-5.6 luna (fallback to GPT-5 nano, then DeepSeek V4 Flash)
            if (hasOpenAI) {
                try {
                    return await callOpenAI({
                        model: 'gpt-5.6-luna',
                        fallbackModels: ['gpt-5-nano', ...fallbackModels],
                        messages: messages as OpenAIMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:${task}] OpenAI failed, attempting DeepSeek fallback:`, err.message);
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
                    throw err;
                }
            } else if (hasDeepSeek) {
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

        case 'generate':
        default: {
            // Asset generation: Retained on DeepSeek V4 Flash
            if (hasDeepSeek) {
                return await callDeepSeek({
                    model: 'deepseek-v4-flash',
                    messages: messages as DeepSeekMessage[],
                    jsonMode,
                    temperature,
                    maxTokens,
                    userId
                });
            } else if (hasOpenAI) {
                return await callOpenAI({
                    model: 'gpt-5.6-luna',
                    fallbackModels: ['gpt-5-nano', ...fallbackModels],
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

    throw new Error('No AI provider configured (missing both OPENAI_API_KEY and DEEPSEEK_API_KEY).');
}
