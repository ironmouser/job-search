import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider } = await params;
    if (!provider) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 });
    }

    const normProvider = provider.toLowerCase().trim();

    await prisma.connectedJobBoard.deleteMany({
      where: {
        userId: session.user.id,
        provider: normProvider,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Disconnected ${normProvider} account`,
    });
  } catch (error: any) {
    console.error('[ConnectedAccounts DELETE] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to disconnect account' },
      { status: 500 }
    );
  }
}
