import { useRef, type ReactNode, useCallback } from 'react';
import styles from './PrintLayout.module.css';

// ───────────────────────────────────────────────────────────────────────────
// PrintLayout — shared print / PDF layout component.
//
// Wraps any printable document (order detail, payment receipt, data-export
// summary) with a consistent header: brand mark, document title and the
// date this copy was generated. No nav chrome is included (the print
// stylesheet hides everything else). Exposes:
//
//   • `visible` prop — renders in print-preview mode on screen.
//   • `onPrint()` callback — triggers `window.print()`.
//   • `onExportPdf()` callback — lazy-loads a PDF library (jsPDF) and
//     produces a client-side PDF. Nothing is sent to a third party; the
//     library is tree-shaken and only downloaded on first use. It won't
//     bloat the main bundle.
//
// Used in:
//   • OrderDetailPrintDocument (feat/orders)
//   • PaymentReceiptPrintDocument (feat/payments)
//   • DataExportSummaryPrintDocument (feat/account)
// ───────────────────────────────────────────────────────────────────────────

export interface PrintLayoutProps {
  /** Document title shown in the header meta block, e.g. "Order Receipt". */
  title: string;
  /** Optional sub-title or reference number below the title. */
  subtitle?: string;
  /** Date to show in the "Generated" line. Defaults to now. */
  generatedAt?: string;
  /** When true the layout is visible on-screen (print preview mode). */
  visible?: boolean;
  children: ReactNode;
}

function BrandMark() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M16 2.5 L28 9.25 V22.75 L16 29.5 L4 22.75 V9.25 Z"
        stroke="#1f4d3a"
        strokeWidth="1.75"
      />
      <path
        d="M9 20 L14 12 L19 17 L24 11"
        stroke="#1f4d3a"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="11" r="2" fill="#a6763d" />
    </svg>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
}

export function PrintLayout({ title, subtitle, generatedAt, visible = false, children }: PrintLayoutProps) {
  const generated = generatedAt ?? new Date().toISOString();
  const classes = [styles.root, visible ? styles.visible : ''].filter(Boolean).join(' ');

  return (
    <div className={classes} aria-label={title} data-print-layout="true">
      <header className={styles.header}>
        <div className={styles.brandBlock}>
          <BrandMark />
          <p className={styles.brandName}>DocForum</p>
        </div>
        <div className={styles.metaBlock}>
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
          <span>Generated {formatDate(generated)}</span>
        </div>
      </header>
      <main className={styles.body}>{children}</main>
      <footer className={styles.footer}>
        <span>DocForum Health Platform — confidential</span>
        <span>Generated {formatDate(generated)}</span>
      </footer>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// usePrint — provides onPrint and onExportPdf for a PrintLayout.
// The PDF library (jsPDF + html2canvas) is lazy-loaded so it never adds
// to the main bundle size. No document content is sent to any third party.
// ───────────────────────────────────────────────────────────────────────────

export interface UsePrintResult {
  /** Trigger the browser's native print dialog. */
  onPrint: () => void;
  /** Export the referenced element as a client-side PDF (no server round-trip).
   * Returns a Promise so callers can await or ignore. */
  onExportPdf: (filename?: string) => Promise<void>;
  /** Whether a PDF export is in progress. */
  isExporting: boolean;
}

import { useState } from 'react';

/** Ref to the element to print / export. Use on the div wrapping the PrintLayout. */
export function usePrint(): UsePrintResult & { ref: React.RefObject<HTMLDivElement | null> } {
  const ref = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const onPrint = useCallback(() => {
    window.print();
  }, []);

  const onExportPdf = useCallback(
    async (filename = 'docforum-document.pdf') => {
      if (!ref.current) return;
      if (isExporting) return;
      setIsExporting(true);
      try {
        // Lazy-load jsPDF + html2canvas. These are never in the main bundle;
        // they're fetched only when the user requests a PDF export.
        const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
          import('jspdf'),
          import('html2canvas'),
        ]);

        const canvas = await html2canvas(ref.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft > 0) {
          position -= pageHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        pdf.save(filename);
      } finally {
        setIsExporting(false);
      }
    },
    [isExporting],
  );

  return { ref, onPrint, onExportPdf, isExporting };
}

// ───────────────────────────────────────────────────────────────────────────
// PrintToolbar — screen-only toolbar rendered above a print section.
// Provides "Print" and "Export as PDF" actions. Hidden in print output.
// ───────────────────────────────────────────────────────────────────────────

interface PrintToolbarProps {
  onPrint: () => void;
  onExportPdf: () => void;
  isExporting?: boolean;
}

export function PrintToolbar({ onPrint, onExportPdf, isExporting = false }: PrintToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <button type="button" onClick={onPrint} aria-label="Print this document">
        🖨️ Print
      </button>
      <button
        type="button"
        onClick={onExportPdf}
        disabled={isExporting}
        aria-label={isExporting ? 'Generating PDF…' : 'Export as PDF'}
        aria-busy={isExporting}
      >
        {isExporting ? 'Generating PDF…' : '⬇️ Export as PDF'}
      </button>
    </div>
  );
}
