import { NextResponse } from "next/server";
import { buildExportPdf } from "@/lib/pdf";
import { getLastThreeYearsRange } from "@/lib/gaps";
import { readStore, sortAddresses } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day));
}

function addressOverlapsRange(
  startDate: string,
  endDate: string | undefined,
  rangeStart: string,
  rangeEnd: string,
) {
  const addressStart = parseDate(startDate);
  const addressEnd = parseDate(endDate ?? rangeEnd);
  const start = parseDate(rangeStart);
  const end = parseDate(rangeEnd);
  if (!addressStart || !addressEnd || !start || !end) {
    return false;
  }
  return addressStart <= end && addressEnd >= start;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const range = getLastThreeYearsRange();
  const start = url.searchParams.get("start") ?? range.start;
  const end = url.searchParams.get("end") ?? range.end;

  const store = await readStore();
  const filteredAddresses = sortAddresses(
    store.addresses.filter((address) =>
      addressOverlapsRange(address.startDate, address.endDate, start, end),
    ),
  );
  const addressIds = new Set(filteredAddresses.map((address) => address.id));
  const filteredDocuments = store.documents.filter((doc) =>
    addressIds.has(doc.addressId),
  );

  const pdfBytes = await buildExportPdf({
    addresses: filteredAddresses,
    documents: filteredDocuments,
    range: { start, end },
  });

  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="address-history.pdf"',
    },
  });
}
