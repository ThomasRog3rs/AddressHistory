import { NextResponse } from "next/server";
import { deleteAddress, updateAddress } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function PUT(request: Request, { params }: RouteContext) {
  const body = await request.json();
  const updates = {
    line1: body?.line1,
    line2: body?.line2,
    town: body?.town,
    county: body?.county,
    postcode: body?.postcode,
    country: body?.country,
    startDate: body?.startDate,
    endDate: body?.endDate || undefined,
  };

  const updated = await updateAddress(params.id, updates);
  if (!updated) {
    return NextResponse.json({ error: "Address not found." }, { status: 404 });
  }

  return NextResponse.json({ address: updated });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  await deleteAddress(params.id);
  return NextResponse.json({ ok: true });
}
