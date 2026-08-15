import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, degrees, rgb } from "pdf-lib";

export interface ApprovalReceiptData {
  orderNumber: string;
  title: string;
  vendorName: string;
  amount: string;
  currency: string;
  description?: string | null;
  requesterName?: string | null;
  requesterEmail: string;
  approverName?: string | null;
  approverEmail: string;
  decisionNotes?: string | null;
  approvedAt: Date;
}

const PAGE_MARGIN = 56;
const INK = rgb(0.09, 0.11, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const ACCENT = rgb(0.11, 0.42, 0.31);
const RULE = rgb(0.85, 0.86, 0.88);

const STAMP_SIZE = 130;
const STAMP_ASSET_PATH = path.join(process.cwd(), "public", "sign.png");

// Order fields are free text and routinely contain Hebrew (order titles,
// vendor names, notes, names) — the built-in Standard 14 fonts only cover
// WinAnsi (Latin) and throw on anything else, so the receipt embeds a real
// Hebrew-capable font instead. Alef is a static (non-variable) SIL-licensed
// font covering Hebrew + Latin + digits in one file — see public/fonts/Alef-OFL.txt.
const FONT_REGULAR_PATH = path.join(process.cwd(), "public", "fonts", "Alef-Regular.ttf");
const FONT_BOLD_PATH = path.join(process.cwd(), "public", "fonts", "Alef-Bold.ttf");

let cachedStampBytes: Uint8Array | undefined;
let cachedFontBytes: { regular: Uint8Array; bold: Uint8Array } | undefined;

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

async function loadFontBytes() {
  if (!cachedFontBytes) {
    const [regular, bold] = await Promise.all([
      readFile(FONT_REGULAR_PATH),
      readFile(FONT_BOLD_PATH),
    ]);
    cachedFontBytes = { regular, bold };
  }
  return cachedFontBytes;
}

const HEBREW_RE = /[֑-״]/; // Hebrew block: points, letters, punctuation

/**
 * pdf-lib's `drawText` always lays out glyphs left-to-right in string
 * order — it doesn't run the Unicode Bidi algorithm. For a string with no
 * Hebrew this is a no-op; for Hebrew (optionally mixed with Latin words or
 * numbers, e.g. "אישור הזמנה #1234") it reverses word order and, within
 * each Hebrew word, character order too, so the RTL reading order comes
 * out right when drawn by an LTR renderer. Numbers/Latin words keep their
 * internal order, matching how they'd actually appear embedded in Hebrew
 * text. This is a simplified stand-in for full bidi reordering, not a
 * spec-accurate implementation — good enough for the short, mostly
 * single-direction strings that make up a purchase order's fields.
 */
function toVisualOrder(text: string): string {
  if (!HEBREW_RE.test(text)) return text;
  const tokens = text.split(/(\s+)/);
  const visualTokens = tokens.map((token) =>
    HEBREW_RE.test(token) ? [...token].reverse().join("") : token,
  );
  return visualTokens.reverse().join("");
}

/**
 * Renders the human-readable approval receipt with pdf-lib: order details
 * plus the "APPROVED" stamp icon in place of a cryptographic signature.
 * This is now the full pipeline — there is no separate signing step.
 */
export async function generateApprovalReceipt(
  data: ApprovalReceiptData,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Approval Receipt - ${data.orderNumber}`);
  doc.setSubject("Purchase Order Approval Receipt");
  doc.setProducer("Procurement Order Management App");
  doc.setCreationDate(data.approvedAt);

  const page = doc.addPage([612, 792]); // US Letter
  const fontBytes = await loadFontBytes();
  const font = await doc.embedFont(fontBytes.regular, { subset: true });
  const bold = await doc.embedFont(fontBytes.bold, { subset: true });

  const { width, height } = page.getSize();
  let cursorY = height - PAGE_MARGIN;

  const writeLine = (
    text: string,
    opts: {
      size?: number;
      f?: PDFFont;
      color?: ReturnType<typeof rgb>;
      gap?: number;
    } = {},
  ) => {
    const size = opts.size ?? 11;
    page.drawText(toVisualOrder(text), {
      x: PAGE_MARGIN,
      y: cursorY,
      size,
      font: opts.f ?? font,
      color: opts.color ?? INK,
    });
    cursorY -= size + (opts.gap ?? 10);
  };

  const rule = () => {
    page.drawLine({
      start: { x: PAGE_MARGIN, y: cursorY },
      end: { x: width - PAGE_MARGIN, y: cursorY },
      thickness: 1,
      color: RULE,
    });
    cursorY -= 18;
  };

  const field = (label: string, value: string) => {
    page.drawText(label.toUpperCase(), {
      x: PAGE_MARGIN,
      y: cursorY,
      size: 8.5,
      font: bold,
      color: MUTED,
    });
    cursorY -= 13;
    page.drawText(toVisualOrder(value) || "—", {
      x: PAGE_MARGIN,
      y: cursorY,
      size: 11.5,
      font,
      color: INK,
    });
    cursorY -= 22;
  };

  writeLine("PURCHASE ORDER — APPROVAL RECEIPT", {
    size: 18,
    f: bold,
    gap: 4,
  });
  writeLine("Procurement Order Management App", {
    size: 10,
    color: MUTED,
    gap: 20,
  });
  rule();

  field("Order Number", data.orderNumber);
  field("Title", data.title);
  field("Vendor", data.vendorName);
  field("Amount", `${data.currency} ${data.amount}`);
  if (data.description) field("Description / Notes", data.description);

  rule();
  field("Requested By", `${data.requesterName ?? ""} <${data.requesterEmail}>`.trim());
  field("Approved By", `${data.approverName ?? ""} <${data.approverEmail}>`.trim());
  field(
    "Approved At",
    `${data.approvedAt.toUTCString()}`,
  );
  if (data.decisionNotes) field("Approver Notes", data.decisionNotes);

  rule();
  writeLine("STATUS: APPROVED", { size: 13, f: bold, color: ACCENT, gap: 24 });

  const disclaimer =
    "This document was generated automatically when the order was approved and " +
    "reflects the order details and decision on record in the Procurement Order " +
    "Management App at the time shown above. The approval stamp is a visual " +
    "marker of that decision, not a cryptographic signature.";
  drawWrapped(page, disclaimer, {
    x: PAGE_MARGIN,
    y: cursorY,
    maxWidth: width - PAGE_MARGIN * 2 - STAMP_SIZE - 24,
    size: 8.5,
    font,
    color: MUTED,
    lineHeight: 12,
  });

  // Stamp the "APPROVED" icon in the bottom-right corner, anchored to the
  // page rather than the text cursor above, and slightly rotated so it
  // reads like a physical rubber stamp rather than a pasted image.
  const stampBytes = await loadStampBytes();
  const stampImage = await doc.embedPng(stampBytes);
  page.drawImage(stampImage, {
    x: width - PAGE_MARGIN - STAMP_SIZE + 20,
    y: PAGE_MARGIN + 20,
    width: STAMP_SIZE,
    height: STAMP_SIZE,
    rotate: degrees(-12),
    opacity: 0.92,
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function drawWrapped(
  page: PDFPage,
  text: string,
  opts: {
    x: number;
    y: number;
    maxWidth: number;
    size: number;
    font: PDFFont;
    color: ReturnType<typeof rgb>;
    lineHeight: number;
  },
) {
  const words = text.split(" ");
  let line = "";
  let y = opts.y;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    const candidateWidth = opts.font.widthOfTextAtSize(candidate, opts.size);
    if (candidateWidth > opts.maxWidth && line) {
      page.drawText(line, { x: opts.x, y, size: opts.size, font: opts.font, color: opts.color });
      line = word;
      y -= opts.lineHeight;
    } else {
      line = candidate;
    }
  }
  if (line) {
    page.drawText(line, { x: opts.x, y, size: opts.size, font: opts.font, color: opts.color });
  }
}
