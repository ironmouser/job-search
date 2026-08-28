import { callOpenAI, OpenAIMessage } from './openai';
import { callDeepSeek, DeepSeekMessage } from './deepseek';
import { callGemini, GeminiMessage } from './gemini';
import { callGLM, GLMMessage } from './glm';

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
 * (GLM-5.3-Flash, DeepSeek V4 Flash, Gemini 3.1 Flash-Lite, and OpenAI GPT-5 nano) with automatic fallbacks.
 */
export async function callAI(options: CallAIOptions): Promise<string> {
    const { task = 'generate', model, fallbackModels = [], messages, jsonMode, temperature, maxTokens, userId } = options;

    const hasGLM = !!(process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY);
    const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;
    const hasGemini = !!process.env.GEMINI_API_KEY;
    const hasOpenAI = !!process.env.OPENAI_API_KEY;

    // Direct model override if specified — wrapped in try/catch to fall back to task routing if the requested model fails
    if (model) {
        const lowerModel = model.toLowerCase();
        if (lowerModel.startsWith('glm')) {
            if (hasGLM) {
                try {
                    return await callGLM({
                        model,
                        fallbackModels,
                        messages: messages as GLMMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI] Direct GLM model (${model}) failed, falling back to task cascade:`, err.message);
                }
            }
        } else if (lowerModel.startsWith('gemini')) {
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
        } else if (lowerModel.startsWith('gpt') || lowerModel.startsWith('o1') || lowerModel.startsWith('o3') || lowerModel.startsWith('o4')) {
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
        } else if (lowerModel.startsWith('deepseek')) {
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
        case 'triage': {
            // Job page interpretation: GLM-5.3-Flash -> GPT-5 nano -> DeepSeek V4 Flash -> Gemini 3.1 Flash-Lite
            if (hasGLM) {
                try {
                    return await callGLM({
                        model: 'glm-5.3-flash',
                        fallbackModels: ['gpt-5-nano', 'deepseek-v4-flash', 'gemini-3.1-flash-lite', ...fallbackModels],
                        messages: messages as GLMMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:triage] GLM failed, attempting OpenAI/DeepSeek fallback:`, err.message);
                }
            }
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
                    console.warn(`[callAI:triage] OpenAI failed, attempting DeepSeek fallback:`, err.message);
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
                    console.warn(`[callAI:triage] DeepSeek failed, attempting Gemini fallback:`, err.message);
                }
            }
            if (hasGemini) {
                return await callGemini({
                    model: 'gemini-3.1-flash-lite',
                    fallbackModels,
                    messages: messages as GeminiMessage[],
                    jsonMode,
                    temperature,
                    maxTokens,
                    userId
                });
            }
            break;
        }

        case 'format':
        case 'extract':
        case 'repair': {
            // JD extraction / Simple classification / Text format: GPT-5 nano -> GLM-5.3-Flash -> DeepSeek V4 Flash -> Gemini 3.1 Flash-Lite
            if (hasOpenAI) {
                try {
                    return await callOpenAI({
                        model: 'gpt-5-nano',
                        fallbackModels: ['glm-5.3-flash', 'deepseek-v4-flash', 'gemini-3.1-flash-lite', ...fallbackModels],
                        messages: messages as OpenAIMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:${task}] OpenAI failed, attempting GLM/DeepSeek fallback:`, err.message);
                }
            }
            if (hasGLM) {
                try {
                    return await callGLM({
                        model: 'glm-5.3-flash',
                        fallbackModels: ['deepseek-v4-flash', 'gemini-3.1-flash-lite', ...fallbackModels],
                        messages: messages as GLMMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:${task}] GLM failed, attempting DeepSeek/Gemini fallback:`, err.message);
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
                    fallbackModels,
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
            // Resume ↔ Job matching & Fit Scoring: GLM-5.3-Flash -> Gemini 3.1 Flash-Lite -> GPT-5 nano -> DeepSeek V4 Flash
            if (hasGLM) {
                try {
                    return await callGLM({
                        model: 'glm-5.3-flash',
                        fallbackModels: ['gemini-3.1-flash-lite', 'gpt-5-nano', 'deepseek-v4-flash', ...fallbackModels],
                        messages: messages as GLMMessage[],
                        jsonMode,
                        temperature: temperature ?? 0.2,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:score] GLM failed, attempting Gemini fallback:`, err.message);
                }
            }
            if (hasGemini) {
                try {
                    return await callGemini({
                        model: 'gemini-3.1-flash-lite',
                        fallbackModels,
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
            // Application form field mapping / Screening Q&A: GLM-5.3-Flash -> DeepSeek V4 Flash -> Gemini 3.1 Flash-Lite -> GPT-5 nano
            if (hasGLM) {
                try {
                    return await callGLM({
                        model: 'glm-5.3-flash',
                        fallbackModels: ['deepseek-v4-flash', 'gemini-3.1-flash-lite', 'gpt-5-nano', ...fallbackModels],
                        messages: messages as GLMMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:qa] GLM failed, attempting DeepSeek fallback:`, err.message);
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
                    console.warn(`[callAI:qa] DeepSeek failed, attempting Gemini fallback:`, err.message);
                }
            }
            if (hasGemini) {
                try {
                    return await callGemini({
                        model: 'gemini-3.1-flash-lite',
                        fallbackModels,
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
            // Asset Generation (Resume/Cover Letter): DeepSeek V4 Flash -> GLM-5.3-Flash -> Gemini 3.1 Flash-Lite -> GPT-5 nano
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
                    console.warn(`[callAI:generate] DeepSeek failed, attempting GLM/Gemini fallback:`, err.message);
                }
            }
            if (hasGLM) {
                try {
                    return await callGLM({
                        model: 'glm-5.3-flash',
                        fallbackModels: ['gemini-3.1-flash-lite', 'gpt-5-nano', ...fallbackModels],
                        messages: messages as GLMMessage[],
                        jsonMode,
                        temperature,
                        maxTokens,
                        userId
                    });
                } catch (err: any) {
                    console.warn(`[callAI:generate] GLM failed, attempting Gemini fallback:`, err.message);
                }
            }
            if (hasGemini) {
                try {
                    return await callGemini({
                        model: 'gemini-3.1-flash-lite',
                        fallbackModels,
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

    throw new Error('No AI provider configured or all providers failed (check GLM_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY).');
}
