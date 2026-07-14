import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateApplicationAnswer } from '@/lib/generator';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { question, tone, instruction } = body;

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Fetch job details
    const { data: job, error } = await supabase
      .from('jobs')
      .select('title, description, company')
      .eq('id', id)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const answer = await generateApplicationAnswer(
      job.title,
      job.description || '',
      job.company,
      question,
      tone,
      instruction
    );

    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error('Error generating QA:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
