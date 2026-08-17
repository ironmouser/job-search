import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDeviceType } from "@/lib/device-detection";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const headerUa = req.headers.get("user-agent") || "";
    const clientUa = typeof body.userAgent === "string" ? body.userAgent : headerUa;

    const hints = {
      isMobile: typeof body.isMobile === "boolean" ? body.isMobile : undefined,
      maxTouchPoints: typeof body.maxTouchPoints === "number" ? body.maxTouchPoints : undefined,
      screenWidth: typeof body.screenWidth === "number" ? body.screenWidth : undefined,
    };

    const detectedDevice = parseDeviceType(clientUa || headerUa, hints);

    let dbUser: any = null;
    try {
      dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, regDeviceType: true, deviceLastUsed: true },
      });
    } catch {
      dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true },
      });
    }

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    try {
      const updateData: any = {
        deviceLastUsed: detectedDevice,
        lastUserAgent: (clientUa || headerUa).slice(0, 500),
      };

      if (!dbUser.regDeviceType) {
        updateData.regDeviceType = detectedDevice;
      }

      await prisma.user.update({
        where: { id: session.user.id },
        data: updateData,
      });
    } catch (updateErr) {
      console.warn("Failed to update user device fields:", updateErr);
    }

    return NextResponse.json({
      success: true,
      deviceType: detectedDevice,
    });
  } catch (error: any) {
    console.error("[DEVICE_TELEMETRY_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
