import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Hook for pinch-to-zoom and ctrl+scroll zoom on a container.
 * Returns a ref to attach to the zoomable container and the current scale.
 *
 * @param {object} options
 * @param {number} options.minScale - Minimum zoom level (default 0.5)
 * @param {number} options.maxScale - Maximum zoom level (default 2.0)
 * @param {number} options.step - Scroll zoom step (default 0.1)
 * @returns {{ containerRef, scale, resetZoom }}
 */
export function usePinchZoom({ minScale = 0.5, maxScale = 2.0, step = 0.1 } = {}) {
  const [scale, setScale] = useState(1);
  const containerRef = useRef(null);
  const pinchStartDistance = useRef(null);
  const pinchStartScale = useRef(1);

  const clamp = (val) => Math.min(maxScale, Math.max(minScale, val));

  // Ctrl+Scroll / trackpad pinch (wheel event with ctrlKey)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setScale(prev => clamp(prev - e.deltaY * 0.01));
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [minScale, maxScale]);

  // Touch pinch gestures
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const getDistance = (touches) => {
      const [a, b] = [touches[0], touches[1]];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        pinchStartDistance.current = getDistance(e.touches);
        pinchStartScale.current = scale;
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 2 && pinchStartDistance.current) {
        e.preventDefault();
        const dist = getDistance(e.touches);
        const ratio = dist / pinchStartDistance.current;
        setScale(clamp(pinchStartScale.current * ratio));
      }
    };

    const handleTouchEnd = () => {
      pinchStartDistance.current = null;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [scale, minScale, maxScale]);

  const resetZoom = useCallback(() => setScale(1), []);

  return { containerRef, scale, resetZoom, setScale };
}

export default usePinchZoom;
