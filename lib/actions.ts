'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { account, demoSnapshot } from './data';
import { demo, supabase } from './session';

const value = (form: FormData, key: string) => String(form.get(key) ?? '');
export type ActionState = { message: string; error?: boolean };
const failure = (message: string): ActionState => ({ message, error: true });

export async function authenticate(_: ActionState, form: FormData): Promise<ActionState> {
  const client = await supabase(true);
  if (!client) return failure('Configure the local Supabase environment first.');
  const email = value(form, 'email').trim();
  const password = value(form, 'password');
  if (value(form, 'mode') === 'signup') {
    const result = await client.auth.signUp({ email, password, options: { data: { display_name: value(form, 'name').trim().slice(0, 80) } } });
    if (result.error) return failure(result.error.message);
    if (result.data.session) redirect('/');
    return { message: 'Check your email for a confirmation link, then sign in.' };
  }
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error) return failure('Sign-in failed. Check your credentials and email confirmation.');
  redirect('/');
}

export async function signOut() {
  const client = await supabase(true);
  if (client) await client.auth.signOut({ scope: 'local' });
  redirect('/login');
}

export async function save(kind: string, _: ActionState, form: FormData): Promise<ActionState> {
  const id = value(form, 'id');
  const intent = value(form, 'intent');
  const title = value(form, 'title').trim();
  const body = value(form, 'body').trim();
  const target_date = value(form, 'date') || null;
  const prompt_id = Number(id);
  const completed = value(form, 'completed') === 'true';
  const removing = intent === 'delete';
  const finishing = intent === 'toggle';
  if (!['workbook', 'journal', 'goal'].includes(kind)) return failure('Unknown form.');
  if (target_date && !/^\d{4}-\d{2}-\d{2}$/.test(target_date)) return failure('Enter a valid date.');
  if (!removing && !finishing) {
    if (kind !== 'workbook' && (!title || title.length > 140)) return failure('Enter a title up to 140 characters.');
    if (kind !== 'goal' && (!body || body.length > 10000)) return failure('Enter a response up to 10,000 characters.');
  }
  if (kind === 'workbook' && (!Number.isSafeInteger(prompt_id) || prompt_id < 1 || removing || finishing)) {
    return failure('Choose a valid exercise.');
  }
  if (kind !== 'workbook' && (removing || finishing) && !id) return failure('Choose an item.');

  if (demo) {
    const snapshot = await demoSnapshot();
    const jar = await cookies();
    const answer = { prompt_id, body, completed: intent === 'complete' };
    let key: string;
    let rows: unknown[];
    if (kind === 'workbook') {
      if (!snapshot.prompts.some(prompt => prompt.id === prompt_id)) return failure('Exercise unavailable.');
      key = 'answers';
      rows = [...snapshot.answers.filter(item => item.prompt_id !== prompt_id), answer];
    } else if (kind === 'journal') {
      key = 'journal';
      const existing = snapshot.journal.find(item => item.id === id);
      const entry = { id: id || crypto.randomUUID(), title, body, created_at: existing?.created_at ?? new Date().toISOString() };
      rows = removing ? snapshot.journal.filter(item => item.id !== id)
        : id ? snapshot.journal.map(item => item.id === id ? entry : item) : [entry, ...snapshot.journal];
    } else {
      key = 'goals';
      const goal = { id: id || crypto.randomUUID(), title, target_date, completed: false };
      rows = removing ? snapshot.goals.filter(item => item.id !== id)
        : id ? snapshot.goals.map(item => item.id === id ? finishing ? { ...item, completed } : { ...item, title, target_date } : item)
        : [...snapshot.goals, goal];
    }
    const payload = JSON.stringify(rows);
    if (encodeURIComponent(payload).length > 3700) return failure('This sample preview has limited storage. Shorten the text or use local Supabase.');
    jar.set('studio-' + key, payload, { httpOnly: true, sameSite: 'lax', path: '/' });
  } else {
    const { client, user } = await account(true);
    const user_id = user.id;
    const table = kind === 'journal' ? 'journal_entries' : 'goals';
    const fields = kind === 'journal' ? { title, body } : finishing ? { completed } : { title, target_date };
    const result = kind === 'workbook'
      ? await client.from('responses').upsert({ user_id, prompt_id, body, completed: intent === 'complete' })
      : removing ? await client.from(table).delete().eq('id', id).eq('user_id', user_id).select('id').single()
      : id ? await client.from(table).update(fields).eq('id', id).eq('user_id', user_id).select('id').single()
      : await client.from(table).insert({ user_id, ...fields });
    if (result.error) return failure('Your change could not be saved. Check the fields and try again.');
  }
  revalidatePath('/', 'layout');
  return { message: removing ? 'Removed.' : 'Saved.' };
}

export async function updateWeeklyGoal(state: ActionState, form: FormData) {
  const [id, completed] = value(form, 'goal').split(':');
  if (!id || (completed !== 'true' && completed !== 'false')) return failure('Choose a goal.');
  const update = new FormData();
  update.set('id', id);
  update.set('completed', completed);
  update.set('intent', 'toggle');
  return save('goal', state, update);
}
