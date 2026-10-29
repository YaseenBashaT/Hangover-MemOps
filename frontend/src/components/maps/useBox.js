import { useEffect, useRef, useState } from "react";

// The size of an element, updated when it resizes.
export function useBox() {
  const ref = useRef(null);
  const [box, setBox] = useState(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, box];
}

// Hover and pin state shared by the map views: what the card shows and which
// dots stay lit.
export function useFocus() {
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);
  const focus = pinned || hover;
  return {
    hover,
    pinned,
    focus,
    enter: (id) => setHover(id),
    leave: () => setHover(null),
    toggle: (id) => setPinned((p) => (p === id ? null : id)),
    clear: () => setPinned(null),
  };
}
