import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

// ── helpers ───────────────────────────────────────────────────────────────────

function startOfDay() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function startOfMonth() {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

/** Normalise raw model name into a display provider label */
function modelToProvider(model: string): string {
    if (model.includes('claude')) return 'Anthropic (Claude)';
    if (model.includes('gemini')) return 'Google (Gemini)';
    if (model.includes('deepseek')) return 'DeepSeek';
    if (model.includes('gpt') || model.includes('openai') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) return 'OpenAI (GPT)';
    return 'Other';
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if ((session?.user as any)?.role !== 'SYSTEM_ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const todayStart   = startOfDay();
        const monthStart   = startOfMonth();

        // ── 1. Active system alerts ──────────────────────────────────────────
        const alerts = await prisma.systemAlert.findMany({
            where: { isResolved: false },
            orderBy: { createdAt: 'desc' }
        });

        // ── 2. AI cost — today total (legacy field kept for backward compat) ─
        const dailyCostResult = await prisma.aICostLog.aggregate({
            _sum: { costUsd: true },
            where: { createdAt: { gte: todayStart } }
        });

        // ── 3. AI cost — per-provider breakdown for today & this month ───────
        const [todayRows, monthRows] = await Promise.all([
            prisma.aICostLog.groupBy({
                by: ['model'],
                _sum: { costUsd: true },
                _count: { id: true },
                where: { createdAt: { gte: todayStart } },
                orderBy: { _sum: { costUsd: 'desc' } },
            }),
            prisma.aICostLog.groupBy({
                by: ['model'],
                _sum: { costUsd: true },
                _count: { id: true },
                where: { createdAt: { gte: monthStart } },
                orderBy: { _sum: { costUsd: 'desc' } },
            }),
        ]);

        // Merge into provider-level buckets
        function bucketsToProviders(rows: { model: string; _sum: { costUsd: number | null }; _count: { id: number } }[]) {
            const map: Record<string, { cost: number; calls: number }> = {};
            for (const row of rows) {
                const provider = modelToProvider(row.model);
                if (!map[provider]) map[provider] = { cost: 0, calls: 0 };
                map[provider].cost  += row._sum.costUsd ?? 0;
                map[provider].calls += row._count.id;
            }
            return Object.entries(map).map(([provider, data]) => ({ provider, ...data }));
        }

        const aiCostToday = {
            total: dailyCostResult._sum.costUsd ?? 0,
            byProvider: bucketsToProviders(todayRows as any),
        };

        const monthCostResult = await prisma.aICostLog.aggregate({
            _sum: { costUsd: true },
            where: { createdAt: { gte: monthStart } }
        });

        const aiCostMonth = {
            total: monthCostResult._sum.costUsd ?? 0,
            byProvider: bucketsToProviders(monthRows as any),
        };

        // ── 4. Scrape.do — live credit balance ───────────────────────────────
        let scrapeDoCredits: { remaining: number | null; total: number | null; plan: string | null; error?: string } = {
            remaining: null,
            total: null,
            plan: null,
        };

        const scrapeDoToken = process.env.SCRAPEDO_API_KEY;
        if (scrapeDoToken) {
            try {
                const sdRes = await fetch(`https://api.scrape.do/info?token=${scrapeDoToken}`, {
                    signal: AbortSignal.timeout(5000),
                });
                if (sdRes.ok) {
                    const sdData = await sdRes.json();
                    // Scrape.do /info returns: { remainingMonthlyRequests, monthlyRequests, plan, ... }
                    scrapeDoCredits = {
                        remaining: sdData.remainingMonthlyRequests ?? sdData.remaining ?? null,
                        total:     sdData.monthlyRequests          ?? sdData.total     ?? null,
                        plan:      sdData.plan                                          ?? null,
                    };
                } else {
                    scrapeDoCredits.error = `HTTP ${sdRes.status}`;
                }
            } catch (err: any) {
                scrapeDoCredits.error = err?.message ?? 'Unknown error';
            }
        } else {
            scrapeDoCredits.error = 'SCRAPEDO_API_KEY not configured';
        }

        // ── 5. AWS S3 — bucket object count & estimated size ─────────────────
        let s3Stats: { objectCount: number | null; totalSizeBytes: number | null; estimatedMonthlyCostUsd: number | null; error?: string } = {
            objectCount: null,
            totalSizeBytes: null,
            estimatedMonthlyCostUsd: null,
        };

        const s3Bucket = process.env.AWS_S3_BUCKET_NAME;
        const s3Region = process.env.AWS_REGION || 'us-east-1';
        const awsKey   = process.env.AWS_ACCESS_KEY_ID;
        const awsSec   = process.env.AWS_SECRET_ACCESS_KEY;

        if (s3Bucket && awsKey && awsSec) {
            try {
                const s3 = new S3Client({
                    region: s3Region,
                    credentials: { accessKeyId: awsKey, secretAccessKey: awsSec },
                });

                let objectCount = 0;
                let totalSizeBytes = 0;
                let continuationToken: string | undefined;

                // Paginate through all objects (up to 50 pages = 50k objects)
                for (let page = 0; page < 50; page++) {
                    const resp = await s3.send(new ListObjectsV2Command({
                        Bucket: s3Bucket,
                        ContinuationToken: continuationToken,
                        MaxKeys: 1000,
                    }));

                    objectCount    += resp.KeyCount ?? 0;
                    totalSizeBytes += (resp.Contents ?? []).reduce((sum, obj) => sum + (obj.Size ?? 0), 0);

                    if (!resp.IsTruncated) break;
                    continuationToken = resp.NextContinuationToken;
                }

                // S3 Standard pricing: $0.023/GB-month storage, $0.09/GB transfer (estimate 20% of storage transferred)
                const gbStored = totalSizeBytes / 1_073_741_824;
                const estimatedMonthlyCostUsd = parseFloat((gbStored * 0.023 + gbStored * 0.2 * 0.09).toFixed(4));

                s3Stats = { objectCount, totalSizeBytes, estimatedMonthlyCostUsd };
            } catch (err: any) {
                s3Stats.error = err?.message ?? 'Unknown error';
            }
        } else {
            s3Stats.error = 'AWS credentials not configured';
        }

        return NextResponse.json({
            alerts,
            // Legacy field — kept for the existing header badge
            dailyCost: dailyCostResult._sum.costUsd ?? 0,
            // New cost dashboard fields
            aiCostToday,
            aiCostMonth,
            scrapeDoCredits,
            s3Stats,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ── POST (resolve alert) ──────────────────────────────────────────────────────

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if ((session?.user as any)?.role !== 'SYSTEM_ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { alertId } = await request.json();

        await prisma.systemAlert.update({
            where: { id: alertId },
            data: { isResolved: true }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
