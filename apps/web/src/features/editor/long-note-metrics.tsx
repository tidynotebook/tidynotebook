import { markdownGrammarOn } from '@notesapp/editor';
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useActiveNote } from './active-note.tsx';
import { readNoteMetrics, type NoteMetrics } from './note-metrics.ts';
import NoteMetricsWorker from './note-metrics-worker.ts?worker';

const longNoteThreshold = 64 * 1024;

type Source = string | { readonly length: number; toString(): string };
type Job = { readonly source: Source; readonly outline: boolean };
type Result = Job & { readonly metrics: NoteMetrics };
type LongNoteMetrics = {
  readonly metrics?: NoteMetrics | undefined;
  readonly current: boolean;
};

const Context = createContext<LongNoteMetrics | null>(null);

export function useLongNoteMetrics(): LongNoteMetrics | null {
  return useContext(Context);
}

/** Keeps the full parses for a long note off the editor thread. */
export function LongNoteMetricsScope({
  initialText,
  children,
}: {
  readonly initialText: string;
  readonly children: ReactNode;
}): ReactNode {
  const { view } = useActiveNote();
  const source = view?.state.doc ?? initialText;
  const outline = view === null || markdownGrammarOn(view.state);
  const large = source.length >= longNoteThreshold;
  const post = useRef<(job: Job) => void>(() => {});
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!large) return;
    let worker: Worker | null = null;
    let running: Job | null = null;
    let pending: Job | null = null;
    const next = (): void => {
      if (running !== null || pending === null) return;
      const job = pending;
      pending = null;
      running = job;
      const request = { text: job.source.toString(), outline: job.outline };
      if (worker === null) {
        finish(readNoteMetrics(request));
        return;
      }
      worker.postMessage(request);
    };
    const finish = (metrics: NoteMetrics): void => {
      const job = running;
      running = null;
      if (job !== null && pending === null)
        startTransition(() => setResult({ ...job, metrics }));
      next();
    };
    try {
      worker = new NoteMetricsWorker();
      worker.onmessage = (event: MessageEvent<NoteMetrics>) =>
        finish(event.data);
      worker.onerror = () => {
        worker?.terminate();
        worker = null;
        pending ??= running;
        running = null;
        next();
      };
    } catch {
      worker = null;
    }
    // Retain only the latest text while the worker is busy.
    post.current = (job) => {
      pending = job;
      next();
    };
    return () => {
      post.current = () => {};
      worker?.terminate();
    };
  }, [large]);

  useEffect(() => {
    if (!large) return;
    const timer = window.setTimeout(
      () => post.current({ source, outline }),
      100,
    );
    return () => window.clearTimeout(timer);
  }, [source, outline, large]);

  return (
    <Context.Provider
      value={
        large
          ? {
              metrics: result?.metrics,
              current: result?.source === source && result.outline === outline,
            }
          : null
      }
    >
      {children}
    </Context.Provider>
  );
}
