import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const order = await prisma.paperTrade.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ error: "Paper trade not found" }, { status: 404 });
  }
  if (order.status !== "PENDING") {
    return NextResponse.json({ error: "Only pending orders can be cancelled" }, { status: 400 });
  }

  const cancelled = await prisma.paperTrade.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ paperTrade: cancelled });
}
