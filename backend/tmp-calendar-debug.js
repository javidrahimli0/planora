const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'localhost',
    port: 5432,
    database: 'planora',
    user: 'postgres',
    password: 'javid1234',
  });

  await c.connect();
  const userRes = await c.query('SELECT id, email FROM users WHERE email = $1', ['javid.rahimli2005@gmail.com']);
  if (!userRes.rows.length) {
    console.log('NO_USER');
    await c.end();
    return;
  }

  const uid = userRes.rows[0].id;
  console.log('USER_ID', uid);

  const eventsRes = await c.query(
    `SELECT id, title, start_time, end_time, is_all_day, recurrence_rule, source,
            EXTRACT(EPOCH FROM (end_time - start_time))/3600 AS hours
     FROM events
     WHERE user_id = $1
     ORDER BY start_time DESC
     LIMIT 500`,
    [uid]
  );

  const bad = eventsRes.rows.filter((r) => !r.is_all_day && (Number(r.hours) <= 0 || Number(r.hours) > 24));
  console.log('TOTAL_EVENTS', eventsRes.rows.length);
  console.log('BAD_DURATION_EVENTS', bad.length);
  console.log(JSON.stringify(bad.slice(0, 40), null, 2));

  const extremeRes = await c.query(
    `SELECT id, title, start_time, end_time, is_all_day,
            EXTRACT(EPOCH FROM (end_time - start_time))/3600 AS hours
     FROM events
     WHERE user_id = $1
       AND (
         end_time < start_time OR
         end_time - start_time > interval '24 hours' OR
         end_time - start_time < interval '1 minute'
       )
     ORDER BY start_time DESC
     LIMIT 100`,
    [uid]
  );

  console.log('EXTREME_EVENTS', extremeRes.rows.length);
  console.log(JSON.stringify(extremeRes.rows, null, 2));

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
