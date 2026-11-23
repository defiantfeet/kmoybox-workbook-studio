import { account, demoSnapshot } from '../../lib/data';
import { demo } from '../../lib/session';
import { readDemoWorkbooks } from '../../lib/workbooks/demo-store';

export async function GET() {
  let data: object;
  if (demo) {
    const [snapshot, workbook] = await Promise.all([demoSnapshot(), readDemoWorkbooks()]);
    data = { journalEntries: snapshot.journal, goals: snapshot.goals, milestones: snapshot.milestones,
      goalHistory: snapshot.activity, workbookResponses: snapshot.answers, moduleResponses: workbook.progress };
  } else {
    const { client } = await account();
    const result = await client.rpc('export_personal_activity');
    if (result.error || !result.data) return new Response('Your export could not be created.', { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
    data = result.data;
  }
  return new Response(JSON.stringify({ formatVersion: 1, exportedAt: new Date().toISOString(), ...data }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="kmoybox-personal-activity.json"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
