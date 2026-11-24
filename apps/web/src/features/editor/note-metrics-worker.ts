import { readNoteMetrics, type NoteMetricsRequest } from './note-metrics.ts';

export default function handleNoteMetrics(
  request: NoteMetricsRequest,
): ReturnType<typeof readNoteMetrics> {
  return readNoteMetrics(request);
}

self.onmessage = (event: MessageEvent<NoteMetricsRequest>): void => {
  self.postMessage(handleNoteMetrics(event.data));
};
