import { NextResponse } from "next/server";
import { createDocument, readStore } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

export async function POST(request: Request) {
  const formData = await request.formData();
  const addressId = formData.get("addressId");
  const file = formData.get("file");

  if (typeof addressId !== "string" || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing addressId or file upload." },
      { status: 400 },
    );
  }

  if (!allowedTypes.has(file.type)) {
    return NextResponse.json(
      { error: "Only PDF, PNG, and JPG files are allowed." },
      { status: 400 },
    );
  }

  const store = await readStore();
  const addressExists = store.addresses.some((address) => address.id === addressId);
  if (!addressExists) {
    return NextResponse.json(
      { error: "Address not found for upload." },
      { status: 404 },
    );
  }

  const document = await createDocument({
    addressId,
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
    data: await file.arrayBuffer(),
  });

  return NextResponse.json({ document });
}
