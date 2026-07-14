import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchSingleJobJSearch } from '@/lib/jsearch';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: jobId } = await params;
        if (!jobId) {
            return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }

        // 1. Fetch the job
        const { data: job, error: fetchError } = await supabase
            .from('jobs')
            .select('*')
            .eq('id', jobId)
            .single();

        if (fetchError || !job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        if (!job.url) {
            return NextResponse.json({ error: 'Job has no URL' }, { status: 400 });
        }

        let scrapedData: any = null;

        // 2. Try Firecrawl Primary
        if (process.env.FIRECRAWL_API_KEY) {
            console.log(`Attempting Firecrawl for ${job.url}...`);
            try {
                const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`
                    },
                    body: JSON.stringify({
                        url: job.url,
                        formats: ['markdown'],
                        onlyMainContent: true
                    })
                });

                if (fcRes.ok) {
                    const fcData = await fcRes.json();
                    if (fcData.success && fcData.data?.markdown) {
                        scrapedData = { description: fcData.data.markdown };
                        console.log("Successfully fetched via Firecrawl.");
                    }
                } else {
                    console.warn(`Firecrawl failed with status: ${fcRes.status}`);
                }
            } catch (e) {
                console.error("Firecrawl request error:", e);
            }
        }

        // 3. JSearch Backup
        if (!scrapedData) {
            console.log("Falling back to JSearch...");
            try {
                scrapedData = await fetchSingleJobJSearch(job.title, job.company);
            } catch (e) {
                console.error("JSearch fallback error:", e);
            }
        }

        if (!scrapedData || !scrapedData.description) {
            return NextResponse.json({ error: 'Failed to scrape full details from both Firecrawl and Apify (Upstream timeout or block)' }, { status: 502 });
        }

        const updatePayload: any = {
            description: scrapedData.description,
            status: 'discovered' 
        };

        if (scrapedData.salary_range) updatePayload.salary_range = scrapedData.salary_range;
        if (scrapedData.location && job.location?.includes('Unknown')) updatePayload.location = scrapedData.location;

        // 4. Update the job
        const { error: updateError } = await supabase
            .from('jobs')
            .update(updatePayload)
            .eq('id', jobId);

        if (updateError) {
            throw updateError;
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error fetching job details:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
