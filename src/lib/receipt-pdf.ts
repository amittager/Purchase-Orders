import { readFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

import { convertOfficeDocumentToPdf } from "@/lib/office-convert";

/** The requester's original quote file, as read back from S3. */
export interface QuoteFile {
  bytes: Buffer;
  fileName: string;
}

const PAGE_MARGIN = 56;
const INK = rgb(0.09, 0.11, 0.15);

const STAMP_SIZE = 130;
const STAMP_ASSET_PATH = path.join(process.cwd(), "public", "sign.png");

let cachedStampBytes: Uint8Array | undefined;

/**
 * Loads the "APPROVED" stamp icon once and reuses it for every receipt.
 * Lives in `public/` (not `src/lib/assets/`) purely so it ships with the
 * build output the same way any other static file does; it's never served
 * directly — only read off disk here and embedded into the PDF below.
 */
async function loadStampBytes(): Promise<Uint8Array> {
  if (!cachedStampBytes) {
    cachedStampBytes = await readFile(STAMP_ASSET_PATH);
  }
  return cachedStampBytes;
}

type QuoteFileKind = "pdf" | "png" | "jpeg" | "office";

/** Derived from the file's extension — content type isn't stored in the DB, and the upload form already restricts extensions to this set (see `ALLOWED_QUOTE_TYPES` in `actions/orders.ts`). */
function resolveQuoteFileKind(fileName: string): QuoteFileKind {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "pdf":
      return "pdf";
    case "png":
      return "png";
    case "jpg":
    case "jpeg":
      return "jpeg";
    case "doc":
    case "docx":
    case "xls":
    case "xlsx":
      return "office";
    default:
      throw new Error(`Can't sign a "${ext}" file — unsupported quote file type.`);
  }
}

/** US Letter, matching the page size the old generated receipt used. */
const IMAGE_PAGE_SIZE: [number, number] = [612, 792];

/** Wraps a standalone image (the requester's quote file) in a one-page PDF, scaled to fit the page without upscaling. */
async function imageToPdfBytes(bytes: Buffer, kind: "png" | "jpeg"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const image = kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);

  const [pageWidth, pageHeight] = IMAGE_PAGE_SIZE;
  const maxWidth = pageWidth - PAGE_MARGIN * 2;
  const maxHeight = pageHeight - PAGE_MARGIN * 2;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;

  const page = doc.addPage(IMAGE_PAGE_SIZE);
  page.drawImage(image, {
    x: (pageWidth - drawWidth) / 2,
    y: (pageHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });

  return doc.save();
}

/** Converts the requester's quote file to PDF bytes if it isn't one already. PDFs pass through untouched. */
async function ensurePdfBytes(quoteFile: QuoteFile): Promise<Uint8Array | Buffer> {
  const kind = resolveQuoteFileKind(quoteFile.fileName);
  switch (kind) {
    case "pdf":
      return quoteFile.bytes;
    case "png":
    case "jpeg":
      return imageToPdfBytes(quoteFile.bytes, kind);
    case "office":
      return convertOfficeDocumentToPdf(quoteFile.bytes);
  }
}

/**
 * Builds the approval receipt by stamping the requester's own quote file —
 * not a freshly generated document. The file is converted to PDF first if
 * it isn't one already (image → single-page PDF; Word/Excel → PDF via
 * LibreOffice, see `office-convert.ts`), then the "APPROVED" stamp icon and
 * the sign-off date are drawn onto the last page, bottom-right, so the
 * receipt is visibly the same file the requester submitted.
 */
export async function stampApprovalOnQuoteFile(
  quoteFile: QuoteFile,
  approvedAt: Date,
): Promise<Buffer> {
  const pdfBytes = await ensurePdfBytes(quoteFile);
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  doc.setModificationDate(approvedAt);

  const stampBytes = await loadStampBytes();
  const stampImage = await doc.embedPng(stampBytes);

  // The sign-off date is a plain ASCII string (Date#toUTCString), so a
  // Standard-14 font is enough here — no need for a Hebrew-capable font
  // like the old fully-generated receipt used.
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const pages = doc.getPages();
  const page = pages[pages.length - 1];
  const { width, height } = page.getSize();

  // The stamp size below assumes a normal invoice/PO page. Client-uploaded
  // PDFs aren't guaranteed to be that big (unlike the old fully-generated
  // receipt, which always drew its own US Letter page), so shrink the stamp
  // to fit rather than letting it run off an unusually small page.
  const stampSize = Math.max(36, Math.min(STAMP_SIZE, width - PAGE_MARGIN, height - PAGE_MARGIN));
  const stampX = Math.max(4, width - PAGE_MARGIN - stampSize + 20);
  const stampY = Math.max(4, Math.min(PAGE_MARGIN + 34, height - stampSize - 16));

  // Slightly rotated so it reads like a physical rubber stamp rather than
  // a pasted image.
  page.drawImage(stampImage, {
    x: stampX,
    y: stampY,
    width: stampSize,
    height: stampSize,
    rotate: degrees(-12),
    opacity: 0.92,
  });

  const dateLabel = `Signed ${approvedAt.toUTCString()}`;
  const dateSize = 9;
  const dateWidth = font.widthOfTextAtSize(dateLabel, dateSize);
  page.drawText(dateLabel, {
    x: stampX + stampSize / 2 - dateWidth / 2,
    y: Math.max(4, stampY - 16),
    size: dateSize,
    font,
    color: INK,
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
