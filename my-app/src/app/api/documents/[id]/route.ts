import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { deleteDocument, getDocumentById, getUploadPath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(_request: Request, { params }: RouteContext) {
  const document = await getDocumentById(params.id);
  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(getUploadPath(document));
  } catch {
    return NextResponse.json({ error: "Document file missing." }, { status: 404 });
  }
  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `attachment; filename="${document.originalName}"`,
    },
  });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const document = await deleteDocument(params.id);
  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
