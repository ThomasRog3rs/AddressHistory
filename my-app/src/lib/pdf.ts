import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { promises as fs } from "fs";
import type { Address, DocumentMeta } from "./storage";
import { getUploadPath, sortAddresses } from "./storage";

type PdfBuildOptions = {
  addresses: Address[];
  documents: DocumentMeta[];
  range: {
    start: string;
    end: string;
  };
};

const margin = 48;
const bodySize = 12;
const headingSize = 18;
const lineHeight = 16;

function wrapText(text: string, maxWidth: number, font: any, size: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) {
        lines.push(current);
      }
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function drawLines({
  pdf,
  page,
  lines,
  font,
  size,
  y,
}: {
  pdf: PDFDocument;
  page: any;
  lines: string[];
  font: any;
  size: number;
  y: number;
}) {
  let currentPage = page;
  let cursor = y;
  for (const line of lines) {
    if (cursor - lineHeight < margin) {
      currentPage = pdf.addPage();
      cursor = currentPage.getHeight() - margin;
    }
    currentPage.drawText(line, { x: margin, y: cursor, size, font });
    cursor -= lineHeight;
  }
  return { page: currentPage, y: cursor };
}

function formatAddress(address: Address) {
  const lines = [
    address.line1,
    address.line2,
    address.town,
    address.county,
    address.postcode,
    address.country,
  ].filter(Boolean) as string[];
  return lines.join(", ");
}

export async function buildExportPdf({ addresses, documents, range }: PdfBuildOptions) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const orderedAddresses = sortAddresses(addresses);
  const docsByAddress = new Map<string, DocumentMeta[]>();
  for (const doc of documents) {
    const list = docsByAddress.get(doc.addressId) ?? [];
    list.push(doc);
    docsByAddress.set(doc.addressId, list);
  }

  let page = pdf.addPage();
  const pageWidth = page.getWidth();
  let cursor = page.getHeight() - margin;

  page.drawText("UK Address History Export", {
    x: margin,
    y: cursor,
    size: headingSize,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });
  cursor -= headingSize + 10;

  const rangeLine = `Range: ${range.start} to ${range.end}`;
  page.drawText(rangeLine, { x: margin, y: cursor, size: bodySize, font });
  cursor -= lineHeight * 1.5;

  const summaryLines: string[] = ["Addresses included:"];
  orderedAddresses.forEach((address, index) => {
    const dateLine = `${address.startDate} to ${address.endDate ?? "Present"}`;
    summaryLines.push(
      `${index + 1}. ${formatAddress(address)} (${dateLine})`,
    );
  });

  const wrappedSummary = summaryLines.flatMap((line) =>
    wrapText(line, pageWidth - margin * 2, font, bodySize),
  );
  ({ page, y: cursor } = drawLines({
    pdf,
    page,
    lines: wrappedSummary,
    font,
    size: bodySize,
    y: cursor,
  }));

  for (const address of orderedAddresses) {
    page = pdf.addPage();
    cursor = page.getHeight() - margin;

    page.drawText("Address", { x: margin, y: cursor, size: headingSize, font: bold });
    cursor -= headingSize + 8;

    const addressLine = formatAddress(address);
    const dateLine = `Dates: ${address.startDate} to ${address.endDate ?? "Present"}`;
    const lines = [
      ...wrapText(addressLine, page.getWidth() - margin * 2, font, bodySize),
      dateLine,
    ];

    ({ page, y: cursor } = drawLines({
      pdf,
      page,
      lines,
      font,
      size: bodySize,
      y: cursor,
    }));

    const addressDocs = docsByAddress.get(address.id) ?? [];
    if (addressDocs.length > 0) {
      ({ page, y: cursor } = drawLines({
        pdf,
        page,
        lines: ["Documents:"],
        font: bold,
        size: bodySize,
        y: cursor - 6,
      }));

      const docLines = addressDocs.map((doc) => `- ${doc.originalName}`);
      ({ page, y: cursor } = drawLines({
        pdf,
        page,
        lines: docLines,
        font,
        size: bodySize,
        y: cursor,
      }));
    }

    for (const doc of addressDocs) {
      const fileBuffer = await fs.readFile(getUploadPath(doc));
      if (doc.mimeType === "application/pdf") {
        const sourcePdf = await PDFDocument.load(fileBuffer);
        const copiedPages = await pdf.copyPages(
          sourcePdf,
          sourcePdf.getPageIndices(),
        );
        copiedPages.forEach((copiedPage) => pdf.addPage(copiedPage));
        continue;
      }

      const image =
        doc.mimeType === "image/png"
          ? await pdf.embedPng(fileBuffer)
          : await pdf.embedJpg(fileBuffer);
      const imagePage = pdf.addPage();
      const { width: pageW, height: pageH } = imagePage.getSize();
      const maxWidth = pageW - margin * 2;
      const maxHeight = pageH - margin * 2;
      const scale = Math.min(
        maxWidth / image.width,
        maxHeight / image.height,
        1,
      );
      const scaled = image.scale(scale);
      imagePage.drawImage(image, {
        x: (pageW - scaled.width) / 2,
        y: (pageH - scaled.height) / 2,
        width: scaled.width,
        height: scaled.height,
      });
    }
  }

  return pdf.save();
}
