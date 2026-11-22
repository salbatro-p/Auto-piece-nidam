import {readFile, writeFile, unlink, access} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import {get} from 'node:https';
import pg from 'pg';
import {preview} from 'vite';

const [action, directory] = process.argv.slice(2);
if (!directory || !['start','stop','status'].includes(action))
  throw new Error('Use node --import=tsx scripts/company-local.mjs start|stop|status PRIVATE_DIRECTORY');
const root = resolve(directory);
const settings = parseEnv(await readFile(join(root,'application.env'),'utf8'));
const origin = new URL(settings.APP_ORIGINS);
const database = new URL(settings.DATABASE_URL);
if (origin.protocol !== 'https:' || origin.hostname !== '127.0.0.1' || !origin.port ||
    database.hostname !== '127.0.0.1' || settings.API_HOST !== '127.0.0.1' ||
    settings.DEMO_MODE !== 'false' || settings.NODE_ENV !== 'production' ||
    settings.LOCAL_PREVIEW_PASSWORD_ONLY !== 'false' || !/^[a-f0-9]{64}$/i.test(settings.MFA_ENCRYPTION_KEY ?? '') ||
    !/^\d{2,5}$/.test(settings.API_PORT) || !settings.MEDIA_STORAGE_DIR)
  throw new Error('A private loopback company configuration is required.');
const state = join(root,'service.json');
const certificate = await readFile(join(root,'localhost.crt'));
async function health() {
  return new Promise((ok,fail)=>{
    const req = get(origin.origin+'/api/config',{ca:certificate,timeout:3500},res=>{
      let body=''; res.on('data',buf=>body+=buf);
      res.on('end',()=>{try {
        if(res.statusCode!==200 || JSON.parse(body).demo!==false || JSON.parse(body).passwordOnlyLogin!==false)
          throw new Error('Unexpected company configuration');
        ok();
      } catch(error){fail(error);}});
    });
    req.on('timeout',()=>req.destroy(new Error('Company status timed out'))); req.on('error',fail);
  });
}
if(action==='status') {
  await health(); console.log('Company online at '+origin.origin);
} else if(action==='stop') {
  await health();
  const {runId}=JSON.parse(await readFile(state,'utf8'));
  if(!/^[0-9a-f-]{36}$/.test(runId))throw new Error('Invalid local service record');
  await writeFile(join(root,'stop-'+runId),'stop',{flag:'wx'});
  for(let i=0;i<100;i++){
    await new Promise(r=>setTimeout(r,100));
    try{await access(state);}catch(error){if(error.code==='ENOENT')break;throw error;}
  }
  try{await access(state);throw new Error('Stop is still pending; check the service window');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  console.log('Company stopped.');
} else {
  const pool=new pg.Pool({connectionString:database.href});
  try{
    const result=await pool.query("SELECT (SELECT workspace_kind FROM organizations LIMIT 1) AS kind, rolsuper OR rolcreaterole OR rolcreatedb AS privileged FROM pg_roles WHERE rolname=current_user");
    if(result.rows[0]?.kind!=='company' || result.rows[0].privileged!==false)
      throw new Error('Use a prepared company database and its non-administrative application account.');
  }finally{await pool.end();}
  Object.assign(process.env,settings);
  const runId=randomUUID(), stopRequest=join(root,'stop-'+runId);
  const tls={cert:certificate,key:await readFile(join(root,'localhost.key'))};
  await import('../apps/api/src/server.ts');
  let web;
  try{
    web=await preview({configFile:'apps/business/vite.config.ts',preview:{
      host:'127.0.0.1',port:Number(origin.port),strictPort:true,https:tls,
      proxy:{'/api':'http://127.0.0.1:'+settings.API_PORT}
    }});
    await writeFile(state,JSON.stringify({runId}),{mode:0o600});
  }catch(error){console.error('Could not open the company preview.');process.emit('SIGTERM');}
  if(web){
    console.log('Company online at '+origin.origin);
    const watcher=setInterval(async()=>{
      try{await access(stopRequest);}catch{return;}
      clearInterval(watcher);
      await web.close();await unlink(stopRequest);await unlink(state);process.emit('SIGTERM');
    },250);
  }
}
