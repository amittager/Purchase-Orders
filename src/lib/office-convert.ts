import { promisify } from "node:util";

import libre from "libreoffice-convert";

const convertAsync = promisify(libre.convert);

/**
 * Converts a Word/Excel file to PDF by shelling out to a local LibreOffice
 * install (via `libreoffice-convert`). Only called for quote files that
 * aren't already a PDF or an image — see `resolveQuoteFileKind` in
 * `receipt-pdf.ts`.
 *
 * Requires LibreOffice (`soffice`) to be installed on the machine running
 * this app — see the "Approval receipts" section of README.md.
 */
export async function convertOfficeDocumentToPdf(bytes: Buffer): Promise<Buffer> {
  try {
    const pdf = await convertAsync(bytes, ".pdf", undefined);
    return pdf;
  } catch (err) {
    throw new Error(
      "Could not convert the uploaded Word/Excel file to PDF. This server " +
        "needs LibreOffice installed (the `soffice` binary on PATH) to " +
        "convert Word/Excel quote files for the approval receipt — see " +
        "README.md.",
      { cause: err },
    );
  }
}
