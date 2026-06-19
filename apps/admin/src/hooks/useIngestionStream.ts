'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { IngestionProgress } from '@qi-conhecimento/shared-types';
import { API_URL } from '@/lib/constants';
import { getAccessToken } from '@/lib/auth';
import { useGetIngestionProgressQuery } from '@/store/api';

function parseSseChunk(buffer: string): { events: IngestionProgress[]; rest: string } {
  const events: IngestionProgress[] = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';

  for (const part of parts) {
    const line = part.split('\n').find((l) => l.startsWith('data:'));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(5).trim()) as IngestionProgress);
    } catch {
      // ignore malformed chunks
    }
  }

  return { events, rest };
}

function mergeProgress(a: IngestionProgress | null, b: IngestionProgress | null): IngestionProgress | null {
  if (!a) return b;
  if (!b) return a;

  const primary = a.logs.length >= b.logs.length ? a : b;
  const secondary = primary === a ? b : a;

  return {
    ...primary,
    embeddingsDone: Math.max(a.embeddingsDone, b.embeddingsDone),
    chunksCreated: Math.max(a.chunksCreated, b.chunksCreated),
    totalChunks: Math.max(a.totalChunks, b.totalChunks),
    embeddingsQueued: Math.max(a.embeddingsQueued, b.embeddingsQueued),
    percent: Math.max(a.percent, b.percent),
    parsePagesDone: Math.max(a.parsePagesDone ?? 0, b.parsePagesDone ?? 0) || undefined,
    parsePagesTotal: Math.max(a.parsePagesTotal ?? 0, b.parsePagesTotal ?? 0) || undefined,
    updatedAt:
      new Date(a.updatedAt).getTime() >= new Date(b.updatedAt).getTime() ? a.updatedAt : b.updatedAt,
    estimatedSecondsRemaining:
      primary.estimatedSecondsRemaining ?? secondary.estimatedSecondsRemaining ?? null,
  };
}

function useIngestionSse(documentId: string | null, enabled: boolean) {
  const [streamed, setStreamed] = useState<IngestionProgress | null>(null);
  const [connected, setConnected] = useState(false);
  const bufferRef = useRef('');

  useEffect(() => {
    if (!documentId || !enabled) {
      setStreamed(null);
      setConnected(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    bufferRef.current = '';

    async function connect() {
      try {
        const token = getAccessToken();
        const headers: HeadersInit = { Accept: 'text/event-stream' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetch(
          `${API_URL}/knowledge/documents/${documentId}/ingestion-stream`,
          { headers, signal: controller.signal },
        );

        if (!response.ok || !response.body) {
          setConnected(false);
          return;
        }

        setConnected(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;

          bufferRef.current += decoder.decode(value, { stream: true });
          const { events, rest } = parseSseChunk(bufferRef.current);
          bufferRef.current = rest;

          if (events.length > 0) {
            const latest = events[events.length - 1];
            if (latest) setStreamed(latest);
          }
        }
      } catch {
        // aborted or network error — polling covers updates
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

  return { streamed, connected };
}

export function useIngestionProgress(documentId: string | null, enabled: boolean) {
  const { data: polled, isFetching, isError } = useGetIngestionProgressQuery(documentId ?? '', {
    skip: !documentId || !enabled,
    pollingInterval: 2_000,
  });
  const { streamed, connected } = useIngestionSse(documentId, enabled);

  const progress = useMemo(
    () => mergeProgress(streamed, polled ?? null),
    [streamed, polled],
  );

  return {
    progress,
    connected: connected || isFetching,
    error: isError ? 'polling_failed' : null,
  };
}
