import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function BarcodeScanner({ products, onScan, onClose }) {
  const [manualCode, setManualCode] = useState('');
  const [status, setStatus] = useState('starting');
  const [cameraError, setCameraError] = useState('');
  const [lastScan, setLastScan] = useState(null);
  const scannerRef = useRef(null);
  const mountedRef = useRef(false);
  const lockRef = useRef(false);
  const id = useId();
  const readerId = useMemo(() => `qr-reader-${id.replace(/[:]/g, '')}`, [id]);

  const matchProduct = (raw) => {
    const clean = raw.trim().toUpperCase();
    return (
      products.find((p) => p?.barcode && p.barcode.trim().toUpperCase() === clean) ||
      products.find((p) => p?.code && p.code.trim().toUpperCase() === clean) ||
      null
    );
  };

  useEffect(() => {
    mountedRef.current = true;
    let scanner;

    const safeCall = (fn) => {
      try {
        return Promise.resolve(fn());
      } catch {
        return Promise.resolve();
      }
    };

    const start = async () => {
      try {
        scanner = new Html5Qrcode(readerId);
        scannerRef.current = scanner;

        const cameras = await Html5Qrcode.getCameras();
        if (!mountedRef.current) return;
        if (!cameras?.length) {
          setStatus('error');
          setCameraError('No camera found on this device.');
          return;
        }

        const envCam = cameras.find((c) =>
          /(back|rear|environment)/i.test(c.label || '')
        );
        const cameraId = envCam?.id || cameras[0].id;

        await scanner.start(
          cameraId,
          { fps: 10, qrbox: { width: 280, height: 140 }, aspectRatio: 1.8 },
          (decodedText) => {
            if (lockRef.current) return;
            lockRef.current = true;
            setTimeout(() => {
              lockRef.current = false;
            }, 1200);

            const product = matchProduct(decodedText);
            setLastScan({ code: decodedText, product });
            onScan({ product, rawCode: decodedText });
          },
          () => {}
        );

        if (mountedRef.current) setStatus('active');
      } catch (_err) {
        if (!mountedRef.current) return;
        setStatus('error');
        setCameraError('Camera blocked/unavailable. Use manual match below.');
      }
    };

    start();

    return () => {
      mountedRef.current = false;
      const activeScanner = scannerRef.current;
      if (!activeScanner) return;
      safeCall(() => activeScanner.stop())
        .catch(() => {})
        .finally(() => safeCall(() => activeScanner.clear()).catch(() => {}));
      scannerRef.current = null;
    };
  }, [readerId]);

  const handleManualMatch = () => {
    if (!manualCode.trim()) return;
    const product = matchProduct(manualCode);
    setLastScan({ code: manualCode, product });
    onScan({ product, rawCode: manualCode });
    setManualCode('');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-md rounded-xl overflow-hidden" style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#f59e0b' }}>
          <div className="font-semibold text-sm text-amber-900">Scan Barcode</div>
          <button onClick={onClose} className="text-amber-900 font-bold">X</button>
        </div>

        <div className="bg-black relative" style={{ minHeight: '220px' }}>
          <div id={readerId} className="w-full" />
          {status === 'starting' && <div className="absolute inset-0 flex items-center justify-center text-white/70 text-xs">Starting camera...</div>}
          {status === 'error' && <div className="absolute inset-0 flex items-center justify-center text-white/70 text-xs p-3 text-center">{cameraError}</div>}
        </div>

        {lastScan && (
          <div className="px-4 py-2 text-xs" style={{ borderTop: '1px solid var(--line)' }}>
            <span style={{ color: lastScan.product ? '#059669' : '#dc2626' }}>
              {lastScan.product ? 'Matched' : 'Not found'}:
            </span>{' '}
            <span className="font-mono">{lastScan.code}</span>
          </div>
        )}

        <div className="p-3 flex gap-2">
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualMatch()}
            placeholder="Type barcode or product code"
            className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
            style={{ background: 'var(--soft)', border: '1px solid var(--line)' }}
          />
          <button onClick={handleManualMatch} className="px-3 py-2 rounded-lg text-xs font-bold text-white" style={{ background: '#f59e0b' }}>
            Match
          </button>
        </div>
      </div>
    </div>
  );
}
