import {mkdtemp,mkdir,readFile,writeFile,readdir,copyFile,link,unlink,rm,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join,relative,dirname,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import pg from 'pg';

const [action,...args]=process.argv.slice(2);
const win=process.platform==='win32';
if(!win)throw Error('This command targets Windows. See SHOP_NETWORK_HANDOFF.md for Linux.');
const ssl=process.env.OPENSSL_BIN || 'openssl.exe';
function run(bin,argv,env=process.env,interactive=false){
  try{return execFileSync(bin,argv,{env,windowsHide:true,encoding:'utf8',maxBuffer:64*1024*1024,stdio:interactive ? ['inherit','pipe','inherit'] : ['ignore','pipe','pipe']});}
  catch{throw Error(bin+' failed. Check the selected paths, rights and private configuration.');}
}
async function digest(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function manifest(dir,root=dir){
  const entries={};
  for(const e of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,e.name);
    if(e.isDirectory())Object.assign(entries,await manifest(path,root));
    else if(e.isFile() && e.name!=='checksums.json')entries[relative(root,path).replaceAll('\\','/')]=await digest(path);
    else if(!e.isFile())throw Error('Unexpected filesystem object');
  }return entries;
}
function databaseURL(env){const u=new URL(parseEnv(env).DATABASE_URL);if(u.hostname!=='127.0.0.1')throw Error('Local PostgreSQL connection required');return u;}
function postgres(bin,u,argv){run(bin,['-h',u.hostname,'-p',u.port||'5432','-U',decodeURIComponent(u.username),...argv],{...process.env,PGPASSWORD:decodeURIComponent(u.password)});}
function restrict(dir){
  const user=run('whoami.exe',[]).trim();
  run('icacls.exe',[dir,'/inheritance:r','/grant:r',user+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F']);
}
async function requireMissing(file){try{await stat(file);}catch(e){if(e.code==='ENOENT')return;throw e;}throw Error('Output already exists');}
async function scratch(parent,task){
  const tmp=await mkdtemp(join(resolve(parent),'recovery-work-'));
  try{restrict(tmp);return await task(tmp);}
  finally{if(dirname(tmp)!==resolve(parent))throw Error('Unexpected staging directory');await rm(tmp,{recursive:true,force:false});}
}
if(action==='backup' && args.length===3){
 const [privateDir,pem,output]=args.map(p=>resolve(p));await requireMissing(output);
 await scratch(privateDir,async tmp=>{
  const payload=join(tmp,'data');await mkdir(payload);
  const settings=await readFile(join(privateDir,'application.env'),'utf8');
  const db=databaseURL(settings);const media=resolve(parseEnv(settings).MEDIA_STORAGE_DIR);
  postgres('pg_dump.exe',db,['-Fc','--no-owner','--no-acl','-d',decodeURIComponent(db.pathname.slice(1)),'-f',join(payload,'database.dump')]);
  for(const name of ['application.env','localhost.crt','localhost.key','company.json'])await copyFile(join(privateDir,name),join(payload,name));
  await mkdir(join(payload,'media'));
  for(const e of await readdir(media,{withFileTypes:true})){
   if(!e.isDirectory()||!/^[a-f0-9]{64}$/.test(e.name))throw Error('Unexpected media directory');
   const folder=join(payload,'media',e.name);await mkdir(folder);
   for(const f of await readdir(join(media,e.name),{withFileTypes:true})){
    if(f.name.endsWith('.tmp'))continue;
    if(!f.isFile()||!/^(source|display|thumbnail)\.webp$/.test(f.name))throw Error('Unexpected media object');
    await copyFile(join(media,e.name,f.name),join(folder,f.name));
   }
  }
  await writeFile(join(payload,'checksums.json'),JSON.stringify(await manifest(payload)));
  const tar=join(tmp,'payload.tar'),partial=join(dirname(output),'.autoparts-'+randomUUID()+'.cms');
  run('tar.exe',['-cf',tar,'-C',payload,'.']);
  try{run(ssl,['cms','-encrypt','-binary','-aes-256-gcm','-in',tar,'-outform','DER','-out',partial,pem]);
    await link(partial,output);
  }finally{await unlink(partial).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  console.log('Encrypted backup SHA-256 '+await digest(output));
 });
}else if(action==='restore' && args.length===6){
 const [archive,cert,key,adminFile,newDir]=args.slice(0,5).map(p=>resolve(p)),name=args[5];
 if(!/^[a-z][a-z0-9_]{0,35}_restore_[0-9]{1,16}$/.test(name))throw Error('Choose a new name ending in _restore_<digits>');
 await requireMissing(newDir);await mkdir(newDir);restrict(newDir);
 const admin=databaseURL(await readFile(adminFile,'utf8'));admin.pathname='/postgres';
 const c=new pg.Client({connectionString:admin.href});await c.connect();
 try{
  if((await c.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount)throw Error('Recovery requires a new database');
  await scratch(newDir,async tmp=>{
   const tar=join(tmp,'decrypted.tar');
   const passin=process.env.AUTOPARTS_RECOVERY_PASSPHRASE ? ['-passin','env:AUTOPARTS_RECOVERY_PASSPHRASE'] : [];
   run(ssl,['cms','-decrypt','-binary','-inform','DER','-in',archive,'-recip',cert,'-inkey',key,...passin,'-out',tar],process.env,passin.length===0);
   const allowed=/^(?:\.|(?:checksums\.json|application\.env|database\.dump|localhost\.(?:crt|key)|company\.json)|media(?:\/[0-9a-f]{64}(?:\/(?:source|display|thumbnail)\.webp)?)?)$/;
   for(const line of run('tar.exe',['-tf',tar]).trim().split(/\r?\n/)){if(!allowed.test(line.replace(/^\.\//,'').replace(/\/$/,'')||'.'))throw Error('Unexpected backup member');}
   if(run('tar.exe',['-tvf',tar]).trim().split(/\r?\n/).some(line=>!['d','-'].includes(line[0])))throw Error('Unsupported archive object');
   const payload=join(tmp,'data');await mkdir(payload);run('tar.exe',['-xf',tar,'-C',payload]);
   const expected=JSON.parse(await readFile(join(payload,'checksums.json'),'utf8')),actual=await manifest(payload);
   if(Object.keys(expected).length!==Object.keys(actual).length||Object.entries(actual).some(([k,v])=>expected[k]!==v))throw Error('Payload integrity mismatch');
   const raw=await readFile(join(payload,'application.env'),'utf8'),src=databaseURL(raw),role=decodeURIComponent(src.username);
   if(!/^[a-z][a-z0-9_]{0,62}$/.test(role))throw Error('Invalid application role');
   const q=await c.query('SELECT rolsuper OR rolcreatedb OR rolcreaterole AS privileged FROM pg_roles WHERE rolname=$1',[role]);
   if(q.rows[0]?.privileged!==false)throw Error('Provision the non-administrative application role on the recovery cluster first');
   await c.query('CREATE DATABASE "'+name+'" OWNER "'+role+'" TEMPLATE template0');
   postgres('pg_restore.exe',admin,['--single-transaction','--exit-on-error','--no-owner','--no-acl','--role',role,'-d',name,join(payload,'database.dump')]);
   const {cp}=await import('node:fs/promises');await cp(join(payload,'media'),join(newDir,'media'),{recursive:true,force:false});
   for(const f of ['localhost.crt','localhost.key','company.json'])await copyFile(join(payload,f),join(newDir,f));
   src.hostname=admin.hostname;src.port=admin.port;src.pathname='/'+name;
   const env=raw.replace(/^DATABASE_URL=.*$/m,'DATABASE_URL='+src.href).replace(/^MEDIA_STORAGE_DIR=.*$/m,'MEDIA_STORAGE_DIR='+join(newDir,'media').replaceAll('\\','/'));
   await writeFile(join(newDir,'application.env'),env,{flag:'wx'});
  });
 }finally{await c.end();}
 console.log('Recovered to the separate database '+name+'. Review ports and the local certificate before starting it.');
}else throw Error('Use backup PRIVATE_DIR RECIPIENT_CERT NEW_ARCHIVE or restore ARCHIVE CERT KEY ADMIN_ENV NEW_DIR NEW_DATABASE');
