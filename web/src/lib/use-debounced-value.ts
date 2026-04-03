"use client";

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(deger: T, gecikmeMs = 350) {
  const [debounced, setDebounced] = useState(deger);

  useEffect(() => {
    const zamanlayici = setTimeout(() => {
      setDebounced(deger);
    }, gecikmeMs);

    return () => clearTimeout(zamanlayici);
  }, [deger, gecikmeMs]);

  return debounced;
}
