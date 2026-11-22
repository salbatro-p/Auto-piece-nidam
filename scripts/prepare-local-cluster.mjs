// Run once inside a newly initialized, private local PostgreSQL cluster.
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
const dir=resolve(process.argv[2]);
const adminURL=new URL(parseEnv(await readFile(join(dir,'admin.env'),'utf8')).DATABASE_URL);
if(adminURL.hostname!=='127.0.0.1'||adminURL.pathname!=='/postgres')throw Error('Expected local administrator connection');
const admin=new pg.Client({connectionString:adminURL.href});
const password=randomBytes(32).toString('hex');
const appURL=new URL(adminURL);appURL.username='autoparts_app';appURL.password=password;appURL.pathname='/autoparts_company';
const [apiPort,webPort]=process.argv.slice(3).map(Number);
if([apiPort,webPort].some(p=>!Number.isInteger(p)||p<1024||p>65535)||apiPort===webPort)throw Error('Invalid ports');
const values=['DATABASE_URL='+appURL.href,'NODE_ENV=production','DEMO_MODE=false','LOCAL_PREVIEW_PASSWORD_ONLY=false','MFA_ENCRYPTION_KEY='+randomBytes(32).toString('hex'),'API_HOST=127.0.0.1','API_PORT='+apiPort,'APP_ORIGINS=https://127.0.0.1:'+webPort,'MEDIA_STORAGE_DIR='+join(dir,'media').replaceAll('\\','/'),'TSX_DISABLE_CACHE=1'];
await admin.connect();
try{
 const existing=await admin.query("SELECT 1 FROM pg_database WHERE datname NOT IN ('postgres','template0','template1')");
 if(existing.rowCount)throw Error('Dedicated empty cluster required');
 await writeFile(join(dir,'application.env'),values.join('\n'),{flag:'wx',mode:0o600});
 await admin.query("CREATE ROLE autoparts_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '"+password+"'");
 await admin.query('CREATE DATABASE autoparts_company OWNER autoparts_app TEMPLATE template0');
}finally{await admin.end();}
