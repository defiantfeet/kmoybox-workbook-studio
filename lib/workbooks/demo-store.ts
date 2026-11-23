import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { cookies } from 'next/headers';
import example from '../../content/the-dancer-mindset.json';
import { moduleSchema, type ModuleProgress, type ModuleRecord, type WorkbookRecord } from './schema';

type DemoState = { books: WorkbookRecord[]; modules: ModuleRecord[]; progress: ModuleProgress[] };

function initialState(): DemoState {
  return {
    books: [{ ...example.workbook, sample: true }],
    modules: example.modules.map(({ id, content }) => {
      const draft = moduleSchema.parse(content);
      return { id, workbook_slug: example.workbook.slug, draft, published: draft, revision: 1, edit_version: 1 };
    }),
    progress: [],
  };
}

let database: DatabaseSync | undefined;
function db() {
  if (!database) {
    mkdirSync('.studio-demo', { recursive: true, mode: 0o700 });
    database = new DatabaseSync('.studio-demo/workbooks.sqlite');
    database.exec('pragma busy_timeout = 5000; create table if not exists sessions (id text primary key, state text not null)');
  }
  return database;
}

function snapshot(id: string | undefined): DemoState {
  if (!id) return initialState();
  const row = db().prepare('select state from sessions where id = ?').get(id);
  return row ? JSON.parse(String(row.state)) as DemoState : initialState();
}

const cookie = 'studio-workbook-session';
export async function readDemoWorkbooks() {
  return snapshot((await cookies()).get(cookie)?.value);
}

export async function changeDemoWorkbooks<T>(change: (state: DemoState) => T): Promise<T> {
  const jar = await cookies();
  const id = jar.get(cookie)?.value ?? crypto.randomUUID();
  const database = db();
  database.exec('begin immediate');
  try {
    const state = snapshot(id);
    const result = change(state);
    database.prepare('insert into sessions values (?, ?) on conflict(id) do update set state = excluded.state')
      .run(id, JSON.stringify(state));
    database.exec('commit');
    jar.set(cookie, id, { httpOnly: true, sameSite: 'lax', path: '/' });
    return result;
  } catch (error) {
    if (database.isTransaction) database.exec('rollback');
    throw error;
  }
}
