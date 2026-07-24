import { prisma } from './prisma';
import { sendSystemAlertEmail } from './mailer';

const DAILY_CUMULATIVE_LIMIT = 5.00;

export async function checkAiSafeguard(estimatedCostUsd: number, modelName: string, userId?: string) {
    // 1. Get total cost for today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const costResult = await prisma.aICostLog.aggregate({
        _sum: {
            costUsd: true
        },
        where: {
            createdAt: { gte: startOfDay }
        }
    });

    const currentDailyCost = costResult._sum.costUsd || 0;
    const projectedCost = currentDailyCost + estimatedCostUsd;

    if (projectedCost > DAILY_CUMULATIVE_LIMIT) {
        const message = `AI Safeguard Blocked Request: Daily cumulative AI cost would exceed limit. Projected: $${projectedCost.toFixed(4)} / Limit: $${DAILY_CUMULATIVE_LIMIT.toFixed(2)}`;
        
        // Log to Admin System Alerts
        await prisma.systemAlert.create({
            data: {
                type: 'HIGH_COST_BLOCKED',
                message,
                metadata: {
                    modelName,
                    userId,
                    currentDailyCost,
                    estimatedCostUsd
                }
            }
        });

        // Send Emergency Email
        await sendSystemAlertEmail(
            'High AI Usage Blocked',
            `<p>The AI safeguard has automatically blocked a request.</p>
             <p><strong>Reason:</strong> Daily cumulative AI cost limit exceeded.</p>
             <ul>
                <li>Current Daily Cost: $${currentDailyCost.toFixed(4)}</li>
                <li>Estimated Request Cost: $${estimatedCostUsd.toFixed(4)}</li>
                <li>Limit: $${DAILY_CUMULATIVE_LIMIT.toFixed(2)}</li>
                <li>Model: ${modelName}</li>
                <li>User ID: ${userId || 'System'}</li>
             </ul>
             <p>Please log into the Admin dashboard to review system alerts.</p>`
        );

        throw new Error(message);
    }
}

export async function logAiCost(model: string, inputTokens: number, outputTokens: number, userId?: string) {
    let costUsd = 0;

    // Approximate Pricing (as of 2024/2025)
    if (model.includes('gemini-2.5-flash-lite')) {
        costUsd = (inputTokens / 1_000_000) * 0.075 + (outputTokens / 1_000_000) * 0.30;
    } else if (model.includes('gemini-2.5-flash')) {
        costUsd = (inputTokens / 1_000_000) * 0.075 + (outputTokens / 1_000_000) * 0.30;
    } else if (model.includes('gemini-1.5-pro')) {
        costUsd = (inputTokens / 1_000_000) * 1.25 + (outputTokens / 1_000_000) * 5.00;
    } else if (model.includes('claude-3-5-sonnet')) {
        costUsd = (inputTokens / 1_000_000) * 3.00 + (outputTokens / 1_000_000) * 15.00;
    } else if (model.includes('claude-haiku')) {
        costUsd = (inputTokens / 1_000_000) * 0.25 + (outputTokens / 1_000_000) * 1.25;
    } else {
        // Fallback generic cost
        costUsd = (inputTokens / 1_000_000) * 0.10 + (outputTokens / 1_000_000) * 0.50;
    }

    if (costUsd > 0) {
        await prisma.aICostLog.create({
            data: {
                model,
                inputTokens,
                outputTokens,
                costUsd,
                userId
            }
        });
    }
}

export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}
