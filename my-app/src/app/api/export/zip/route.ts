import { NextResponse } from "next/server";
import JSZip from "jszip";
import { promises as fs } from "fs";
import { getLastThreeYearsRange } from "@/lib/gaps";
import { getUploadPath, readStore, sortAddresses } from "@/lib/storage";

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

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
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

  const zip = new JSZip();
  zip.file(
    "addresses.json",
    JSON.stringify({ addresses: filteredAddresses, documents: filteredDocuments }, null, 2),
  );

  const docsFolder = zip.folder("documents");
  if (docsFolder) {
    for (const doc of filteredDocuments) {
      const buffer = await fs.readFile(getUploadPath(doc));
      const safeName = sanitizeFilename(doc.originalName);
      docsFolder.file(`${doc.id}-${safeName}`, buffer);
    }
  }

  const output = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(output, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="address-history.zip"',
    },
  });
}
