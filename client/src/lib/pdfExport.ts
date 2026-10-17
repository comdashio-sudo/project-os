// Real PDF download of what is on screen (G-069). The screen is rasterised exactly as the browser draws it, so Arabic shaping and
// right-to-left order are the browser's own, not a PDF library's: the file is a picture of the screen, paginated onto A4 landscape
// (text in it is not selectable — that is the stated trade-off, and the browser print route stays beside it for selectable text).
// html2canvas-pro (not html2canvas: the original throws on the oklch() colours the Tailwind 4 stylesheet uses — found by the live check, which the unit tests could not see) and jspdf are loaded on first use, so no one pays for them until a PDF is asked for.

export type PdfSlice = { sourceY: number; sourceHeight: number; drawHeightMm: number };

/** Cuts a canvas of the given pixel size into page-high slices for a page of the given millimetre size. Pure, so it is tested without a browser. */
export function planPdfPages(canvasWidth: number, canvasHeight: number, pageWidthMm: number, pageHeightMm: number, marginMm = 8): PdfSlice[] {
  if (!(canvasWidth > 0) || !(canvasHeight > 0)) return [];
  const usableWidth = pageWidthMm - 2 * marginMm;
  const usableHeight = pageHeightMm - 2 * marginMm;
  const pixelsPerMm = canvasWidth / usableWidth;
  const sliceHeightPx = Math.floor(usableHeight * pixelsPerMm);
  const slices: PdfSlice[] = [];
  for (let y = 0; y < canvasHeight; y += sliceHeightPx) {
    const sourceHeight = Math.min(sliceHeightPx, canvasHeight - y);
    slices.push({ sourceY: y, sourceHeight, drawHeightMm: sourceHeight / pixelsPerMm });
  }
  return slices;
}

/**
 * An ASCII-only file name ending in .pdf and the date. Non-ASCII names are deliberately not used: the browser the live check runs in saved a download
 * with any Arabic (or an em dash) in its name as "download", with no extension, which a person cannot open. The screen's Arabic title is printed in the file, not in its name.
 */
export function pdfFileName(base: string, stamp: Date = new Date()): string {
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 60) || "export";
  return `${cleaned}-${stamp.toISOString().slice(0, 10)}.pdf`;
}

export async function exportElementToPdf(element: HTMLElement, fileBase: string): Promise<string> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: false,
    logging: false,
    // The screen's own tools (filters, tabs, buttons) are not part of the report, exactly as in the print stylesheet.
    ignoreElements: node => node instanceof HTMLElement && (node.dataset.pdfIgnore !== undefined || node.classList.contains("print:hidden")),
  });
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const slices = planPdfPages(canvas.width, canvas.height, pageWidth, pageHeight, margin);
  slices.forEach((slice, index) => {
    const part = document.createElement("canvas");
    part.width = canvas.width;
    part.height = slice.sourceHeight;
    part.getContext("2d")!.drawImage(canvas, 0, slice.sourceY, canvas.width, slice.sourceHeight, 0, 0, canvas.width, slice.sourceHeight);
    if (index > 0) pdf.addPage();
    pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, pageWidth - 2 * margin, slice.drawHeightMm, undefined, "FAST");
  });
  const name = pdfFileName(fileBase);
  // Our own anchor rather than jsPDF's save(): the file name the person sees is then the one we chose (Arabic included), checked live.
  const url = URL.createObjectURL(pdf.output("blob"));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.rel = "noopener"; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}
