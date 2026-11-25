begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000001701','timeline-first@example.test'),
  ('00000000-0000-4000-8000-000000001702','timeline-second@example.test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001701';
select set_config('test.timeline_id', public.save_timeline_event(null,null,
  '{"format":"timeline-v1","title":"Early chapter","timing":{"mode":"approximate","year":"2004","month":""},"category":"",
  "tone":"Uncertain","notes":{},"emotions":[],"future":false,"hidden":false}',
  'iVBORw0KGgoAAAAB','image/png',false)::text,true);
select is((select answers #>> '{timing,year}' from public.life_timeline_events),'2004','year-only chronology is saved');
select is((select count(*) from public.timeline_images),1::bigint,'image is stored with its event');
select is(public.export_personal_activity() #>> '{timelineImages,0,base64}','iVBORw0KGgoAAAAB','private export contains the image');
select throws_ok($$update public.life_timeline_events set answers=jsonb_set(answers,'{timing}', '{"mode":"age","start":21,"end":12}')$$,
  '23514', null, 'invalid age range is rejected');
select throws_ok($$select public.save_timeline_event(null,null,
  '{"format":"timeline-v1","title":"Invalid attachment","timing":{"mode":"chapter","label":""},"category":"","tone":"",
  "notes":{},"emotions":[],"future":false,"hidden":false}','iVBORw0KGgoAAAAB','image/jpeg',false)$$,
  '23514', null, 'a mismatched file type rolls back the event and image');
select is((select count(*) from public.life_timeline_events),1::bigint,'invalid image did not create an event');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001702';
select is((select count(*) from public.life_timeline_events),0::bigint,'another member cannot read the event');
select is((select count(*) from public.timeline_images),0::bigint,'another member cannot read the image');
select throws_ok($$insert into public.timeline_images (event_id,mime_type,content)
  values (current_setting('test.timeline_id')::uuid,'image/png',decode('iVBORw0KGgoAAAAB','base64'))$$,
  '42501', null, 'another member cannot attach an image to the event');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000001701';
delete from public.life_timeline_events where id=current_setting('test.timeline_id')::uuid;
select is((select count(*) from public.timeline_images),0::bigint,'deleting the event also deletes its image');
select * from finish();
rollback;
