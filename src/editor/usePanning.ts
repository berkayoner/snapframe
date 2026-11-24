import { useEffect, useState, type RefObject } from 'react';

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  );
}

export type PanState = 'idle' | 'ready' | 'panning';

/**
 * Hand tool for the work area: hold Space and drag (or drag with the middle
 * mouse button) to scroll around a zoomed-in capture. While Space is held,
 * clicks go to panning instead of the active tool - the pointer events are
 * stopped before they reach the canvas.
 */
export function usePanning(scrollerRef: RefObject<HTMLDivElement | null>): PanState {
  const [state, setState] = useState<PanState>('idle');

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let spaceHeld = false;
    let drag: { x: number; y: number; left: number; top: number; pointerId: number } | null = null;

    const update = () => setState(drag ? 'panning' : spaceHeld ? 'ready' : 'idle');

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isTyping(event.target) || document.querySelector('dialog[open]')) return;
      // Keep the browser from scrolling the page (or "clicking" a focused button) with Space.
      event.preventDefault();
      if (spaceHeld) return;
      spaceHeld = true;
      update();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      spaceHeld = false;
      update();
    };
    const onBlur = () => {
      spaceHeld = false;
      update();
    };

    const onPointerDown = (event: PointerEvent) => {
      const wantsPan = event.button === 1 || (event.button === 0 && spaceHeld);
      if (!wantsPan) return;
      event.preventDefault();
      event.stopPropagation();
      drag = {
        x: event.clientX,
        y: event.clientY,
        left: scroller.scrollLeft,
        top: scroller.scrollTop,
        pointerId: event.pointerId,
      };
      scroller.setPointerCapture(event.pointerId);
      update();
    };
    // The canvas also listens to mousedown; stop it too, and the middle button's autoscroll.
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 1 || (event.button === 0 && spaceHeld)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      scroller.scrollLeft = drag.left - (event.clientX - drag.x);
      scroller.scrollTop = drag.top - (event.clientY - drag.y);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (scroller.hasPointerCapture(event.pointerId)) scroller.releasePointerCapture(event.pointerId);
      drag = null;
      update();
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    scroller.addEventListener('pointerdown', onPointerDown, true);
    scroller.addEventListener('mousedown', onMouseDown, true);
    scroller.addEventListener('pointermove', onPointerMove);
    scroller.addEventListener('pointerup', onPointerUp);
    scroller.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      scroller.removeEventListener('pointerdown', onPointerDown, true);
      scroller.removeEventListener('mousedown', onMouseDown, true);
      scroller.removeEventListener('pointermove', onPointerMove);
      scroller.removeEventListener('pointerup', onPointerUp);
      scroller.removeEventListener('pointercancel', onPointerUp);
    };
  }, [scrollerRef]);

  return state;
}
