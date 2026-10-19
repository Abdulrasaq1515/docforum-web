import { PrintLayout, PrintToolbar, usePrint } from '../../../components/PrintLayout';
import type { VerifiedOrderSummary, FulfillmentOrderType } from '../../../types/models';

// ───────────────────────────────────────────────────────────────────────────
// OrderDetailDocument — printable / PDF-exportable order detail sheet.
//
// Uses VerifiedOrderSummary from the order-verify flow (the minimal order
// shape available to facilities). When the full patient-facing order
// type is added to models.ts (docforum-core Phase 2–3) this document
// should be updated to use it instead.
//
// Page-break handling: if the order contains multiple items or long
// instructions they must not be split across pages — `page-break-inside:
// avoid` is set on the content table via the PrintLayout's table rules.
// ───────────────────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <th scope="row" style={{ textAlign: 'left', padding: '0.4rem 0.6rem', width: '12rem', verticalAlign: 'top' }}>
        {label}
      </th>
      <td style={{ padding: '0.4rem 0.6rem', wordBreak: 'break-word' }}>{children}</td>
    </tr>
  );
}

function orderTypeLabel(type: FulfillmentOrderType): string {
  return type === 'prescription' ? 'Prescription' : 'Lab Order';
}

export interface OrderDetailDocumentProps {
  order: VerifiedOrderSummary;
  orderType: FulfillmentOrderType;
  /** When true, render the document visibly on screen (print preview). */
  visible?: boolean;
}

export function OrderDetailDocument({ order, orderType, visible = false }: OrderDetailDocumentProps) {
  const { ref, onPrint, onExportPdf, isExporting } = usePrint();

  return (
    <div ref={ref} className="printRoot" style={{ breakInside: 'avoid' }}>
      <PrintToolbar onPrint={onPrint} onExportPdf={() => onExportPdf(`docforum-order-${order.orderId}.pdf`)} isExporting={isExporting} />
      <PrintLayout
        title={`${orderTypeLabel(orderType)} Detail`}
        subtitle={`Order ${order.orderId}`}
        visible={visible}
      >
        <table aria-label="Order detail">
          <tbody>
            <Row label="Order id">{order.orderId}</Row>
            <Row label="Type">{orderTypeLabel(orderType)}</Row>
            <Row label="Item / Test">{order.medicationOrTest}</Row>
            <Row label="Patient">{order.patientName}</Row>
            {order.instructions && (
              <Row label="Instructions">{order.instructions}</Row>
            )}
            <Row label="Issued">
              {new Date(order.issuedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </Row>
            <Row label="Expires">
              {new Date(order.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </Row>
            {order.fulfilledAt && (
              <Row label="Fulfilled">
                {new Date(order.fulfilledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                {order.fulfilledByFacility ? ` · ${order.fulfilledByFacility}` : ''}
              </Row>
            )}
            {order.supersededBy && (
              <Row label="Superseded by">
                <code>{order.supersededBy}</code>
              </Row>
            )}
          </tbody>
        </table>

        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#666' }}>
          This order was issued via DocForum. Present this document to the relevant facility for fulfilment. The
          QR token on your digital order is the authoritative verification method.
        </p>
      </PrintLayout>
    </div>
  );
}
