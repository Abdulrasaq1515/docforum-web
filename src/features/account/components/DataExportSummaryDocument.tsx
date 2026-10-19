import { PrintLayout, PrintToolbar, usePrint } from '../../../components/PrintLayout';
import type { DataExport } from '../../../types/models';

// ───────────────────────────────────────────────────────────────────────────
// DataExportSummaryDocument — printable / PDF-exportable summary of a
// patient's data export request. Patients bring this summary to other
// providers as a paper record of what was requested. It deliberately
// does NOT include the export file contents (those are delivered as a
// downloadable bundle, not a printout) — only the request metadata.
// ───────────────────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <th scope="row" style={{ textAlign: 'left', padding: '0.4rem 0.6rem', width: '12rem', verticalAlign: 'top' }}>
        {label}
      </th>
      <td style={{ padding: '0.4rem 0.6rem' }}>{children}</td>
    </tr>
  );
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatBytes(bytes?: number | null): string {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export interface DataExportSummaryDocumentProps {
  exportRecord: DataExport;
  /** When true, render the document visibly on screen (print preview). */
  visible?: boolean;
}

export function DataExportSummaryDocument({ exportRecord, visible = false }: DataExportSummaryDocumentProps) {
  const { ref, onPrint, onExportPdf, isExporting } = usePrint();

  return (
    <div ref={ref} className="printRoot" style={{ breakInside: 'avoid' }}>
      <PrintToolbar onPrint={onPrint} onExportPdf={() => onExportPdf(`docforum-export-summary-${exportRecord.id}.pdf`)} isExporting={isExporting} />
      <PrintLayout
        title="Data Export Summary"
        subtitle={`Export ${exportRecord.id}`}
        visible={visible}
      >
        <table aria-label="Data export summary">
          <tbody>
            <Row label="Export id">{exportRecord.id}</Row>
            <Row label="Status"><strong>{exportRecord.status}</strong></Row>
            <Row label="Requested">{formatDate(exportRecord.requestedAt)}</Row>
            {exportRecord.readyAt && <Row label="Ready">{formatDate(exportRecord.readyAt)}</Row>}
            <Row label="Expires">{formatDate(exportRecord.expiresAt)}</Row>
            {exportRecord.fileSizeBytes !== null && exportRecord.fileSizeBytes !== undefined && (
              <Row label="File size">{formatBytes(exportRecord.fileSizeBytes)}</Row>
            )}
            {exportRecord.errorMessage && (
              <Row label="Error">{exportRecord.errorMessage}</Row>
            )}
          </tbody>
        </table>

        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#666' }}>
          This is a summary of the export request. The full export is a downloadable JSON bundle available through
          DocForum. The export file itself contains sensitive health information — keep it secure.
        </p>
      </PrintLayout>
    </div>
  );
}
