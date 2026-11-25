'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { ContentKind, PublishedContent } from '../lib/becoming/content-catalog';
import { studioPath } from '../lib/studio-path';

const Resources = createContext<PublishedContent[]>([]);

export function GrowthContentContext({ items, children, module }: {
  items: PublishedContent[]; children: ReactNode; module?: string;
}) {
  useEffect(() => {
    if (!module) return;
    const record = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', record);
      void fetch(studioPath('/becoming/engagement'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module }),
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', record);
    record();
    return () => document.removeEventListener('visibilitychange', record);
  }, [module]);
  return <Resources.Provider value={items}>{children}</Resources.Provider>;
}

export function useGrowthContent(kind: ContentKind) {
  return useContext(Resources).filter(item => item.kind === kind);
}
