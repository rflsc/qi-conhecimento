'use client';

import { useEffect, useRef, useState } from 'react';
import type { IngestionProgress } from '@qi-conhecimento/shared-types';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';

function parseSseChunk(buffer: string): { events: IngestionProgress[]; rest: string } {
  const events: IngestionProgress[] = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';

  for (const part of parts) {
    const line = part
      .split('\n')
      .find((l) => l.startsWith('data:'));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(5).trim()) as IngestionProgress);
    } catch {
      // ignore malformed chunks
    }
  }

  return { events, rest };
}

export function useIngestionStream(documentId: string | null, enabled: boolean) {
  const [progress, setProgress] = useState<IngestionProgress | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bufferRef = useRef('');

  useEffect(() => {
    if (!documentId || !enabled) {
      setProgress(null);
      setConnected(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function connect() {
      try {
        const token = getAccessToken();
        const headers: HeadersInit = { Accept: 'text/event-stream' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetch(
          `${API_URL}/knowledge/documents/${documentId}/ingestion-stream`,
          { headers, signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error('Stream indisponível');
        }

        setConnected(true);
        setError(null);
        bufferRef.current = '';

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;

          bufferRef.current += decoder.decode(value, { stream: true });
          const { events, rest } = parseSseChunk(bufferRef.current);
          bufferRef.current = rest;

          if (events.length > 0) {
            setProgress(events[events.length - 1]);
          }
        }
      } catch (err) {
        if (controller.signal.aborted || cancelled) return;
        setConnected(false);
        setError(err instanceof Error ? err.message : 'Falha na conexão');
      } finally {
        if (!cancelled) setConnected(false);
      }
    }

    void connect();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [documentId, enabled]);

  return { progress, connected, error };
}
