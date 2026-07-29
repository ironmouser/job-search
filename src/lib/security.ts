import { prisma } from '@/lib/prisma';

export async function logSuspiciousActivity({
  type,
  message,
  userId,
  metadata = {},
}: {
  type: string;
  message: string;
  userId?: string;
  metadata?: Record<string, any>;
}) {
  try {
    let userDetails = null;
    if (userId) {
      userDetails = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true, role: true },
      });
    }

    await prisma.systemAlert.create({
      data: {
        type: `SECURITY_${type}`,
        message,
        metadata: {
          ...metadata,
          userId,
          userEmail: userDetails?.email,
          userName: userDetails?.name,
          userRole: userDetails?.role,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    // Suppress logging errors so we don't break the main application flow
    console.error('Failed to log suspicious activity:', err);
  }
}
