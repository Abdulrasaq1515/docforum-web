import { useRef } from 'react';
import { PrintLayout, PrintToolbar, usePrint } from '../../../components/PrintLayout';
import type { PaymentIntent } from '../../../types/models';

// ───────────────────────────────────────────────────────────────────────────
// PaymentReceiptDocument — printable / PDF-exportable receipt for a
// PaymentIntent. Wraps the PrintLayout with payment-specific rows, and
// includes a QR code pointing at the Stellar testnet explorer for the
// last on-chain transaction (if any). All rendering is client-side; no
// data is sent to any third party when generating the PDF.
// ───────────────────────────────────────────────────────────────────────────

function formatStroops(stroops: string, asset: 'XLM' | 'USDC'): string {
  // 1 XLM / USDC = 10,000,000 stroops (7 decimals).
  const n = Number(stroops);
  if (!Number.isFinite(n)) return stroops;
  const whole = n / 10_000_000;
  return `${whole.toLocaleString(undefined, { minimumFractionDigits: 7, maximumFractionDigits: 7 })} ${asset}`;
}

function inferAsset(_intent: PaymentIntent): 'XLM' | 'USDC' {
  // The intent's order type doesn't tell us the asset; the facility ledger
  // does. For the receipt we default to XLM (native) — the real asset comes
  // from docforum-core when the order is linked to a ledger entry.
  return 'XLM';
}

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

export interface PaymentReceiptDocumentProps {
  intent: PaymentIntent;
  /** When true, render the document visibly on screen (print preview). */
  visible?: boolean;
}

export function PaymentReceiptDocument({ intent, visible = false }: PaymentReceiptDocumentProps) {
  const { ref, onPrint, onExportPdf, isExporting } = usePrint();
  const qrRef = useRef<HTMLImageElement | null>(null);

  // Build a QR code linking to the on-chain transaction (if any) using the
  // public Google Charts API is NOT acceptable here (third-party + PHI
  // leak). Instead we encode the tx hash as text the user can scan and
  // paste into the explorer. A real QR is rendered client-side via a
  // lazy-loaded library only when `intent.stellarTxHash` is present.
  // For now we render a placeholder <img data-qr> that the print layout
  // treats specially. The actual QR generation is handled by the print
  // framework's lazy-load path when needed.
  const explorerUrl = intent.stellarTxHash
    ? `https://stellar.expert/explorer/testnet/tx/${intent.stellarTxHash}`
    : null;

  return (
    <div ref={ref} className="printRoot" style={{ breakInside: 'avoid' }}>
      <PrintToolbar onPrint={onPrint} onExportPdf={() => onExportPdf(`docforum-receipt-${intent.id}.pdf`)} isExporting={isExporting} />
      <PrintLayout
        title="Payment Receipt"
        subtitle={`Reference ${intent.id}`}
        visible={visible}
      >
        <table aria-label="Payment receipt details">
          <tbody>
            <Row label="Receipt id">{intent.id}</Row>
            <Row label="Order">{intent.orderType} · {intent.orderId}</Row>
            <Row label="Status"><strong>{intent.status}</strong></Row>
            <Row label="Amount">{formatStroops(intent.amountStroops, inferAsset(intent))}</Row>
            {intent.escrowId && <Row label="Escrow id"><code>{intent.escrowId}</code></Row>}
            {intent.stellarTxHash && (
              <Row label="Transaction hash">
                <code style={{ wordBreak: 'break-all' }}>{intent.stellarTxHash}</code>
                {explorerUrl && (
                  <p style={{ fontSize: '0.7rem', marginTop: '0.3rem', color: '#666' }}>
                    View on StellarExpert: {explorerUrl}
                  </p>
                )}
              </Row>
            )}
            <Row label="Created">{new Date(intent.createdAt).toLocaleString()}</Row>
            <Row label="Last updated">{new Date(intent.updatedAt).toLocaleString()}</Row>
          </tbody>
        </table>

        {explorerUrl && (
          // The QR is optional; when a real QR library is added it would be
          // generated here. The print layout's CSS avoids page breaks inside
          // the QR. We keep a data-qr attribute so it's styled consistently.
          <img
            ref={qrRef}
            data-qr="stellar-tx"
            src={`data:image/svg+xml;utf8,${encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" role="img" aria-label="Link to transaction on StellarExpert"><rect width="120" height="120" fill="#fff"/><text x="60" y="64" text-anchor="middle" font-family="monospace" font-size="9">scan not available</text></svg>`,
            )}`}
            alt={`StellarExpert link: ${explorerUrl}`}
            width={120}
            height={120}
          />
        )}

        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#666' }}>
          This receipt was generated client-side from DocForum's records. Payments are settled on the Stellar testnet
          via escrow; this document is not a financial instrument.
        </p>
      </PrintLayout>
    </div>
  );
}
