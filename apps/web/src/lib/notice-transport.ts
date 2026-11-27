import { getSyncProtocol, syncNoticesProtocol } from '@notesapp/api-client';

export { loadSyncNoticesTransport } from '@notesapp/api-client';

export async function noticesOffered(): Promise<boolean> {
  const answer = await getSyncProtocol();
  return answer.data?.liveNotificationProtocol === syncNoticesProtocol;
}
