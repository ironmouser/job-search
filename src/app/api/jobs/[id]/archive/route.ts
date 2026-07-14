import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Toggle is_archived
    // First, fetch current state
    const { data: job, error: fetchError } = await supabase
        .from('jobs')
        .select('is_archived')
        .eq('id', id)
        .single();
        
    if (fetchError) throw fetchError;

    const newArchivedState = !job.is_archived;

    const { data, error } = await supabase
      .from('jobs')
      .update({ is_archived: newArchivedState })
      .eq('id', id)
      .select();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error archiving job:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to archive job' },
      { status: 500 }
    );
  }
}
