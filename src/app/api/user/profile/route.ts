import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { name, image } = await req.json();

    if (name !== undefined && (typeof name !== 'string' || name.length > 100)) {
      return new NextResponse("Invalid name length", { status: 400 });
    }
    if (image !== undefined && (typeof image !== 'string' || image.length > 1000 || !image.startsWith('http'))) {
      return new NextResponse("Invalid image URL", { status: 400 });
    }

    const user = await prisma.user.update({
      where: {
        email: session.user.email,
      },
      data: {
        name: name !== undefined ? name : undefined,
        image: image !== undefined ? image : undefined,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("[PROFILE_UPDATE_ERROR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
