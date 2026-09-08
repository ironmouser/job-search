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

    const failedModels = new Set<string>();

    // Helper to invoke a model by identifier
    const tryInvokeModel = async (targetModel: string): Promise<string | null> => {
        const lower = targetModel.toLowerCase();
        try {
            if (lower.startsWith('glm') && hasGLM) {
                const res = await callGLM({
                    model: targetModel,
                    messages: messages as GLMMessage[],
                    jsonMode,
                    temperature,
                    maxTokens,
                    userId
                });
                if (res && res.trim().length > 0) return res;
            } else if (lower.startsWith('gemini') && hasGemini) {
                const res = await callGemini({
                    model: targetModel,
                    messages: messages as GeminiMessage[],
                    jsonMode,
                    temperature,
                    maxTokens,
                    userId
                });
                if (res && res.trim().length > 0) return res;
            } else if (lower.startsWith('deepseek') && hasDeepSeek) {
                const res = await callDeepSeek({
                    model: targetModel,
                    messages: messages as DeepSeekMessage[],
                    jsonMode,
                    temperature,
                    maxTokens,
                    userId
                });
                if (res && res.trim().length > 0) return res;
            } else if ((lower.startsWith('gpt') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) && hasOpenAI) {
                const res = await callOpenAI({
                    model: targetModel,
                    messages: messages as OpenAIMessage[],
                    jsonMode,
                    temperature,
                    maxTokens,
                    userId
                });
                if (res && res.trim().length > 0) return res;
            }
        } catch (err: any) {
            console.warn(`[callAI] Target model (${targetModel}) invocation failed:`, err.message);
        }
        failedModels.add(lower);
        return null;
    };

    // 1. Direct model override if specified
    if (model) {
        const directResult = await tryInvokeModel(model);
        if (directResult) return directResult;
        console.warn(`[callAI] Direct model (${model}) failed, falling back to fallbacks/task cascade...`);
    }

    // 2. Explicit caller-provided fallback models
    if (fallbackModels.length > 0) {
        for (const fbModel of fallbackModels) {
            if (failedModels.has(fbModel.toLowerCase())) continue;
            const fbResult = await tryInvokeModel(fbModel);
            if (fbResult) return fbResult;
        }
    }

    // 3. Task-based routing defaults
    switch (task) {
        case 'triage': {
            // Job page interpretation: GLM-5.3-Flash -> GPT-5 nano -> DeepSeek V4 Flash -> Gemini 3.1 Flash-Lite
            if (hasGLM && !failedModels.has('glm-5.3-flash')) {
                const res = await tryInvokeModel('glm-5.3-flash');
                if (res) return res;
            }
            if (hasOpenAI && !failedModels.has('gpt-5-nano')) {
                const res = await tryInvokeModel('gpt-5-nano');
                if (res) return res;
            }
            if (hasDeepSeek && !failedModels.has('deepseek-v4-flash')) {
                const res = await tryInvokeModel('deepseek-v4-flash');
                if (res) return res;
            }
            if (hasGemini && !failedModels.has('gemini-3.1-flash-lite')) {
                const res = await tryInvokeModel('gemini-3.1-flash-lite');
                if (res) return res;
            }
            break;
        }

        case 'format':
        case 'extract':
        case 'repair': {
            // JD extraction / Simple classification / Text format: GPT-5 nano -> GLM-5.3-Flash -> DeepSeek V4 Flash -> Gemini 3.1 Flash-Lite
            if (hasOpenAI && !failedModels.has('gpt-5-nano')) {
                const res = await tryInvokeModel('gpt-5-nano');
                if (res) return res;
            }
            if (hasGLM && !failedModels.has('glm-5.3-flash')) {
                const res = await tryInvokeModel('glm-5.3-flash');
                if (res) return res;
            }
            if (hasDeepSeek && !failedModels.has('deepseek-v4-flash')) {
                const res = await tryInvokeModel('deepseek-v4-flash');
                if (res) return res;
            }
            if (hasGemini && !failedModels.has('gemini-3.1-flash-lite')) {
                const res = await tryInvokeModel('gemini-3.1-flash-lite');
                if (res) return res;
            }
            break;
        }

        case 'score': {
            // Resume ↔ Job matching & Fit Scoring: GLM-5.3-Flash -> Gemini 3.1 Flash-Lite -> GPT-5 nano -> DeepSeek V4 Flash
            if (hasGLM && !failedModels.has('glm-5.3-flash')) {
                const res = await tryInvokeModel('glm-5.3-flash');
                if (res) return res;
            }
            if (hasGemini && !failedModels.has('gemini-3.1-flash-lite')) {
                const res = await tryInvokeModel('gemini-3.1-flash-lite');
                if (res) return res;
            }
            if (hasOpenAI && !failedModels.has('gpt-5-nano')) {
                const res = await tryInvokeModel('gpt-5-nano');
                if (res) return res;
            }
            if (hasDeepSeek && !failedModels.has('deepseek-v4-flash')) {
                const res = await tryInvokeModel('deepseek-v4-flash');
                if (res) return res;
            }
            break;
        }

        case 'qa': {
            // Application form field mapping / Screening Q&A: GLM-5.3-Flash -> DeepSeek V4 Flash -> Gemini 3.1 Flash-Lite -> GPT-5 nano
            if (hasGLM && !failedModels.has('glm-5.3-flash')) {
                const res = await tryInvokeModel('glm-5.3-flash');
                if (res) return res;
            }
            if (hasDeepSeek && !failedModels.has('deepseek-v4-flash')) {
                const res = await tryInvokeModel('deepseek-v4-flash');
                if (res) return res;
            }
            if (hasGemini && !failedModels.has('gemini-3.1-flash-lite')) {
                const res = await tryInvokeModel('gemini-3.1-flash-lite');
                if (res) return res;
            }
            if (hasOpenAI && !failedModels.has('gpt-5-nano')) {
                const res = await tryInvokeModel('gpt-5-nano');
                if (res) return res;
            }
            break;
        }

        case 'generate':
        default: {
            // Asset Generation (Resume/Cover Letter): DeepSeek V4 Flash -> GLM-5.3-Flash -> Gemini 3.1 Flash-Lite -> GPT-5 nano
            if (hasDeepSeek && !failedModels.has('deepseek-v4-flash')) {
                const res = await tryInvokeModel('deepseek-v4-flash');
                if (res) return res;
            }
            if (hasGLM && !failedModels.has('glm-5.3-flash')) {
                const res = await tryInvokeModel('glm-5.3-flash');
                if (res) return res;
            }
            if (hasGemini && !failedModels.has('gemini-3.1-flash-lite')) {
                const res = await tryInvokeModel('gemini-3.1-flash-lite');
                if (res) return res;
            }
            if (hasOpenAI && !failedModels.has('gpt-5-nano')) {
                const res = await tryInvokeModel('gpt-5-nano');
                if (res) return res;
            }
            break;
        }
    }

    throw new Error('No AI provider configured or all providers failed (check GLM_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY).');
}
