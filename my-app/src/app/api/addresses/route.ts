import { NextResponse } from "next/server";
import { createAddress, readStore, sortAddresses } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await readStore();
  return NextResponse.json({
    addresses: sortAddresses(store.addresses),
    documents: store.documents,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { line1, line2, town, county, postcode, country, startDate, endDate } =
    body ?? {};

  if (!line1 || !town || !postcode || !country || !startDate) {
    return NextResponse.json(
      { error: "Missing required address fields." },
      { status: 400 },
    );
  }

  const address = await createAddress({
    line1,
    line2,
    town,
    county,
    postcode,
    country,
    startDate,
    endDate: endDate || undefined,
  });

  return NextResponse.json({ address });
}
