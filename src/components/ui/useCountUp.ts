import { useEffect, useRef, useState } from 'react';

/**
 * Fait glisser un nombre vers sa nouvelle valeur (450 ms, ease-out) : les
 * montants « comptent » au lieu de sauter quand une dépense est notée.
 */
export function useCountUp(target: number, duration = 450): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    const t0 = Date.now();
    let frame = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = Math.round(start + (target - start) * eased);
      from.current = next;
      setValue(next);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}
