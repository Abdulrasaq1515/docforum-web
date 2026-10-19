import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PrintLayout, PrintToolbar, usePrint } from './PrintLayout';
import type { PaymentIntent } from '../types/models';
import { PaymentReceiptDocument } from '../features/payments/components/PaymentReceiptDocument';

// ───────────────────────────────────────────────────────────────────────────
// PrintLayout tests. We exercise the visible/hidden modes, the toolbar's
// print button, and the lazy-load path of onExportPdf (mocking the dynamic
// imports of jspdf + html2canvas so no real PDF library is fetched in the
// test environment).
// ───────────────────────────────────────────────────────────────────────────

const fakeIntent: PaymentIntent = {
  id: 'pi-123',
  orderType: 'prescription',
  orderId: 'ord-001',
  status: 'released',
  patientProfileId: 'p-1',
  facilityId: 'f-1',
  amountStroops: '10000000',
  escrowId: 'esc-1',
  stellarTxHash: 'abc123',
  sorobanContractId: null,
  createdAt: '2026-09-14T10:00:00Z',
  updatedAt: '2026-09-14T12:00:00Z',
};

describe('PrintLayout', () => {
  it('renders hidden by default and visible when visible=true', () => {
    const { rerender } = render(
      <PrintLayout title="Test Doc">
        <p>body</p>
      </PrintLayout>,
    );
    // Hidden by default — root has display:none via CSS, but the title is
    // still in the DOM as aria-label.
    expect(screen.getByLabelText('Test Doc')).toBeInTheDocument();

    rerender(
      <PrintLayout title="Test Doc" visible>
        <p>body</p>
      </PrintLayout>,
    );
    // The brand name is rendered when visible.
    expect(screen.getByText('DocForum')).toBeInTheDocument();
  });

  it('shows the title and subtitle in the meta block when visible', () => {
    render(
      <PrintLayout title="Payment Receipt" subtitle="Reference pi-123" visible>
        <p>body</p>
      </PrintLayout>,
    );
    expect(screen.getByText('Payment Receipt')).toBeInTheDocument();
    expect(screen.getByText(/Reference pi-123/)).toBeInTheDocument();
  });

  it('shows a "Generated" line in the header', () => {
    render(
      <PrintLayout title="Receipt" visible generatedAt="2026-09-14T10:00:00Z">
        <p>body</p>
      </PrintLayout>,
    );
    // "Generated" appears in both the header meta block and the footer.
    const generatedEls = screen.getAllByText(/Generated/i);
    expect(generatedEls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('PrintToolbar', () => {
  it('renders print and export buttons and calls handlers', () => {
    const onPrint = vi.fn();
    const onExport = vi.fn();
    render(<PrintToolbar onPrint={onPrint} onExportPdf={onExport} />);
    fireEvent.click(screen.getByText(/Print/));
    expect(onPrint).toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Export as PDF/));
    expect(onExport).toHaveBeenCalled();
  });

  it('disables the export button while exporting', () => {
    render(<PrintToolbar onPrint={() => {}} onExportPdf={() => {}} isExporting />);
    expect(screen.getByText('Generating PDF…')).toBeDisabled();
  });
});

describe('usePrint', () => {
  let jsPDFMock: { jsPDF: ReturnType<typeof vi.fn> };
  let html2canvasMock: { default: (el: HTMLElement) => Promise<{ toDataURL: () => string; height: number; width: number }> };

  beforeEach(() => {
    vi.resetModules();
    // Build a constructable mock for jsPDF. A regular function (not an
    // arrow) works with `new`; we cast `this` to an explicit shape.
    const saveSpy = vi.fn();
    const addImageSpy = vi.fn();
    const addPageSpy = vi.fn();
    interface JsPDFInstance {
      internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
      addImage: ReturnType<typeof vi.fn>;
      addPage: ReturnType<typeof vi.fn>;
      save: ReturnType<typeof vi.fn>;
    }
    function MockJsPDFImpl(this: JsPDFInstance) {
      this.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
      this.addImage = addImageSpy;
      this.addPage = addPageSpy;
      this.save = saveSpy;
    }
    // Wrap in vi.fn so .toHaveBeenCalled() works, while keeping it new-able.
    const MockJsPDF = vi.fn().mockImplementation(function (this: JsPDFInstance) {
      MockJsPDFImpl.call(this);
    });
    jsPDFMock = { jsPDF: MockJsPDF };
    html2canvasMock = {
      default: vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,xxx', height: 1000, width: 800 }),
    };
    vi.doMock('jspdf', () => jsPDFMock);
    vi.doMock('html2canvas', () => html2canvasMock);
  });

  afterEach(() => {
    vi.doUnmock('jspdf');
    vi.doUnmock('html2canvas');
    vi.restoreAllMocks();
  });

  it('onPrint calls window.print', async () => {
    // happy-dom doesn't define window.print; install a spy first.
    const printSpy = vi.fn();
    Object.defineProperty(window, 'print', { value: printSpy, configurable: true, writable: true });
    function Harness() {
      const { onPrint } = usePrint();
      return <button onClick={onPrint}>print</button>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByText('print'));
    expect(printSpy).toHaveBeenCalled();
    Object.defineProperty(window, 'print', { value: undefined, configurable: true });
  });

  it('onExportPdf lazy-loads jspdf + html2canvas and saves a file', async () => {
    function Harness() {
      const { ref, onExportPdf, isExporting } = usePrint();
      return (
        <div ref={ref}>
          <button onClick={() => onExportPdf('test.pdf')}>export</button>
          <span>{isExporting ? 'busy' : 'idle'}</span>
        </div>
      );
    }
    render(<Harness />);
    expect(screen.getByText('idle')).toBeInTheDocument();
    fireEvent.click(screen.getByText('export'));
    expect(screen.getByText('busy')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('idle')).toBeInTheDocument());
    expect(jsPDFMock.jsPDF).toHaveBeenCalled();
  });
});

describe('PaymentReceiptDocument (integration)', () => {
  it('renders the receipt details and a QR placeholder when there is a tx hash', () => {
    render(<PaymentReceiptDocument intent={fakeIntent} visible />);
    expect(screen.getByText('Payment Receipt')).toBeInTheDocument();
    expect(screen.getByText('pi-123')).toBeInTheDocument();
    expect(screen.getByAltText(/StellarExpert link/)).toBeInTheDocument();
  });

  it('omits the QR when there is no tx hash', () => {
    const noTx = { ...fakeIntent, stellarTxHash: null };
    render(<PaymentReceiptDocument intent={noTx} visible />);
    expect(screen.queryByAltText(/StellarExpert link/)).not.toBeInTheDocument();
  });
});
