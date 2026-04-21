const { Client } = require('pg');

function sameDay(a,b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

async function main(){
  const c = new Client({host:'localhost',port:5432,database:'planora',user:'postgres',password:'javid1234'});
  await c.connect();
  const u = await c.query('SELECT id FROM users WHERE email=$1',[ 'javid.rahimli2005@gmail.com' ]);
  if(!u.rows.length){console.log('NO_USER'); await c.end(); return;}
  const uid=u.rows[0].id;

  const res = await c.query(
    `SELECT e.id,e.title,e.start_time,e.end_time,e.is_all_day,e.workspace_id,e.user_id,e.source
     FROM events e
     LEFT JOIN workspace_members wm ON wm.workspace_id=e.workspace_id AND wm.user_id=$1
     WHERE (e.user_id=$1 OR wm.user_id=$1)
     ORDER BY e.start_time ASC`,
    [uid]
  );

  const rows = res.rows.map((r)=>{
    const s=new Date(r.start_time);
    const e=new Date(r.end_time);
    const durMin=Math.round((e.getTime()-s.getTime())/60000);
    const cross=!sameDay(s,e);
    return {
      id:r.id,
      title:r.title,
      is_all_day:r.is_all_day,
      source:r.source,
      start:r.start_time,
      end:r.end_time,
      localStart:s.toString(),
      localEnd:e.toString(),
      durMin,
      cross,
      startHour:s.getHours(),
      endHour:e.getHours(),
    };
  });

  const suspicious = rows.filter(r=>!r.is_all_day && (r.cross || r.durMin<=0 || r.durMin>1440 || r.endHour===0 || r.startHour===23));
  console.log('TOTAL',rows.length);
  console.log('SUSPICIOUS',suspicious.length);
  console.log(JSON.stringify(suspicious,null,2));

  await c.end();
}

main().catch((e)=>{console.error(e);process.exit(1);});
