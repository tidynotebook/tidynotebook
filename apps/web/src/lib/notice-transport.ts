import { getSyncProtocol, syncNoticesProtocol } from '@notesapp/api-client';

export { connectSyncNotices } from '@notesapp/api-client/notice-transport';

export async function noticesOffered(): Promise<boolean> {
  const answer = await getSyncProtocol();
  return answer.data?.liveNotificationProtocol === syncNoticesProtocol;
}
