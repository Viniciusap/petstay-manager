import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

export interface SignatureCanvasHandle {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
}

interface Props {
  onSign?: () => void;
}

const SignatureCanvas = forwardRef<SignatureCanvasHandle | null, Props>(({ onSign }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const pendingPos = useRef<{ x: number; y: number } | null>(null);

  function getCtx() {
    const c = canvasRef.current;
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    return { c, ctx };
  }

  function resize() {
    const pair = getCtx();
    if (!pair) return;
    const { c, ctx } = pair;
    const container = c.parentElement;
    if (!container) return;

    // Capture existing drawing before resize
    const snapshot = c.toDataURL();

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = Math.max(150, container.clientHeight);
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);

    // Restore previous drawing
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, w, h);
    img.src = snapshot;

    ctx.strokeStyle = '#1C1917';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  useEffect(() => {
    resize();
    const ro = new ResizeObserver(resize);
    const container = canvasRef.current?.parentElement;
    if (container) ro.observe(container);
    return () => ro.disconnect();
  }, []);

  function getPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top };
  }

  function drawTo(x: number, y: number) {
    const pair = getCtx();
    if (!pair) return;
    const { ctx } = pair;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastPos.current = { x, y };
  }

  function scheduleDraw(x: number, y: number) {
    pendingPos.current = { x, y };
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (pendingPos.current && drawing.current) {
          drawTo(pendingPos.current.x, pendingPos.current.y);
          pendingPos.current = null;
        }
      });
    }
  }

  const onMouseDown = useCallback((e: MouseEvent) => {
    drawing.current = true;
    lastPos.current = getPos(e);
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!drawing.current) return;
    scheduleDraw(...Object.values(getPos(e)) as [number, number]);
  }, []);

  const onMouseUp = useCallback(() => {
    drawing.current = false;
    onSign?.();
  }, [onSign]);

  const onTouchStart = useCallback((e: TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    scheduleDraw(...Object.values(getPos(e)) as [number, number]);
  }, []);

  const onTouchEnd = useCallback((e: TouchEvent) => {
    e.preventDefault();
    drawing.current = false;
    onSign?.();
  }, [onSign]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    c.addEventListener('mousedown', onMouseDown);
    c.addEventListener('mousemove', onMouseMove);
    c.addEventListener('mouseup', onMouseUp);
    c.addEventListener('mouseleave', onMouseUp);
    c.addEventListener('touchstart', onTouchStart, { passive: false });
    c.addEventListener('touchmove', onTouchMove, { passive: false });
    c.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      c.removeEventListener('mousedown', onMouseDown);
      c.removeEventListener('mousemove', onMouseMove);
      c.removeEventListener('mouseup', onMouseUp);
      c.removeEventListener('mouseleave', onMouseUp);
      c.removeEventListener('touchstart', onTouchStart);
      c.removeEventListener('touchmove', onTouchMove);
      c.removeEventListener('touchend', onTouchEnd);
    };
  }, [onMouseDown, onMouseMove, onMouseUp, onTouchStart, onTouchMove, onTouchEnd]);

  useImperativeHandle(ref, () => ({
    isEmpty() {
      const c = canvasRef.current;
      if (!c) return true;
      const ctx = c.getContext('2d');
      if (!ctx) return true;
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
      // Check if any non-white pixel exists
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) return false;
      }
      return true;
    },
    toDataURL() {
      return canvasRef.current?.toDataURL('image/png') || '';
    },
    clear() {
      const pair = getCtx();
      if (!pair) return;
      const { c, ctx } = pair;
      const dpr = window.devicePixelRatio || 1;
      const w = c.width / dpr;
      const h = c.height / dpr;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
    },
  }));

  return (
    <div className="w-full rounded-xl border overflow-hidden" style={{ borderColor: '#D1D5DB', minHeight: 160, cursor: 'crosshair' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', touchAction: 'none', userSelect: 'none' }} />
    </div>
  );
});

SignatureCanvas.displayName = 'SignatureCanvas';
export default SignatureCanvas;
