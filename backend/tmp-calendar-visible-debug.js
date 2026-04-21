const { Client } = require('pg');

async function main() {
  const c = new Client({ host:'localhost', port:5432, database:'planora', user:'postgres', password:'javid1234' });
  await c.connect();

  const userRes = await c.query('SELECT id FROM users WHERE email = $1', ['javid.rahimli2005@gmail.com']);
  if (!userRes.rows.length) { console.log('NO_USER'); await c.end(); return; }
  const uid = userRes.rows[0].id;

  const allVisible = await c.query(
    `SELECT e.id, e.user_id, e.workspace_id, e.title, e.start_time, e.end_time, e.is_all_day, e.source,
            EXTRACT(EPOCH FROM (e.end_time - e.start_time))/3600 AS hours
     FROM events e
     LEFT JOIN workspace_members wm
       ON wm.workspace_id = e.workspace_id
      AND wm.user_id = $1
     WHERE (e.user_id = $1 OR wm.user_id = $1)
     ORDER BY e.start_time DESC
     LIMIT 1000`,
    [uid]
  );

  const bad = allVisible.rows.filter((r) => !r.is_all_day && (Number(r.hours) <= 0 || Number(r.hours) > 24));
  console.log('VISIBLE_EVENTS', allVisible.rows.length);
  console.log('VISIBLE_BAD', bad.length);
  console.log(JSON.stringify(bad.slice(0, 80), null, 2));

  const extreme = await c.query(
    `SELECT e.id, e.user_id, e.workspace_id, e.title, e.start_time, e.end_time, e.is_all_day,
            EXTRACT(EPOCH FROM (e.end_time - e.start_time))/3600 AS hours
     FROM events e
     LEFT JOIN workspace_members wm
       ON wm.workspace_id = e.workspace_id
      AND wm.user_id = $1
     WHERE (e.user_id = $1 OR wm.user_id = $1)
       AND (
         e.end_time < e.start_time OR
         e.end_time - e.start_time > interval '24 hours' OR
         e.end_time - e.start_time < interval '1 minute'
       )
     ORDER BY e.start_time DESC
     LIMIT 200`,
    [uid]
  );

  console.log('VISIBLE_EXTREME', extreme.rows.length);
  console.log(JSON.stringify(extreme.rows, null, 2));

  await c.end();
}

main().catch((e)=>{ console.error(e); process.exit(1); });
