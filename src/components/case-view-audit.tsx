'use client';
import { useEffect, useRef } from 'react';
export function CaseViewAudit({ alertId }: { alertId: string }) {
  const sent = useRef(false);
  useEffect(() => { if (sent.current) return; sent.current = true; void fetch(`/api/alerts/${alertId}/view`, { method: 'POST' }); }, [alertId]);
  return null;
}
