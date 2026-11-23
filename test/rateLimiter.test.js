const test = require('node:test');
const assert = require('node:assert/strict');
const { db, user, serve } = require('./helpers/app');
const jwt = require('jsonwebtoken');
const policy = require('../lib/rateLimiter');
process.env.NODE_ENV='production';
test.after(()=>db.close());
const BURST=30, SUSTAINED=180, REGISTRATION=20;

async function fixture(t) {
  return serve(t,app=>{
    app.use('/api',policy.createApiRateLimiter());
    app.use('/api',(req,res)=>res.json({user:req.user || null}));
  });
}
const hit=(request,path='/api/read',options={})=>request(path,options);

test('an invalid token receives the public burst quota',async t=>{
  const request=await fixture(t);
  for(let i=0;i<BURST;i++) assert.equal((await hit(request,undefined,{token:'invalid'})).status,200);
  assert.equal((await hit(request,undefined,{token:'invalid'})).status,429);
});
test('dedicated login attempts do not spend the general write allowance',async t=>{
  const request=await fixture(t);
  const options={method:'POST',ip:'192.0.2.2'};
  for(let i=0;i<15;i++) assert.equal((await hit(request,'/api/auth/login',options)).status,200);
  for(let i=0;i<50;i++) assert.equal((await hit(request,'/api/write',options)).status,200);
  assert.equal((await hit(request,'/api/write',options)).status,429);
});

for(const [path,method,limit,authenticated] of [
  ['/auth/login','POST',15],['/auth/register','POST',REGISTRATION],['/songs/export','GET',5],['/write','PUT',50],['/read','GET',BURST],
]) test(`${method} ${path} permits exactly ${limit} requests`,async t=>{
  const request=await fixture(t);
  const token=authenticated?user('quota-user').token:undefined;
  for(let i=0;i<limit;i++) assert.equal((await hit(request,'/api'+path,{method,token})).status,200);
  const response=await hit(request,'/api'+path,{method,token});
  assert.equal(response.status,429);
  assert.deepEqual(await response.json(),{error:'Too many requests. Please try again later.'});
  assert.ok(Number(response.headers.get('retry-after'))>0);
  assert.equal((await hit(request,'/api'+path,{method,token,ip:'192.0.2.99'})).status,200);
});

test('register and invite redemption share one counter across path variants',async t=>{
  const request=await fixture(t);
  const paths=['register','redeem-invite','REGISTER/','REDEEM-INVITE/','register?source=test'];
  for(let i=0;i<REGISTRATION;i++) assert.equal((await hit(request,'/api/auth/'+paths[i%paths.length],{method:'POST'})).status,200);
  assert.equal((await hit(request,'/api/auth/redeem-invite',{method:'POST'})).status,429);
  assert.equal((await hit(request,'/api/auth/login',{method:'POST'})).status,200);
  assert.equal((await hit(request,'/api/write',{method:'POST'})).status,200);
});

test('HEAD export and case/query variants share the export quota',async t=>{
  const request=await fixture(t);
  for(let i=0;i<5;i++) assert.equal((await hit(request,'/api/SONGS/EXPORT/?q=1',{method:'HEAD'})).status,200);
  assert.equal((await hit(request,'/api/songs/export')).status,429);
  assert.equal((await hit(request,'/api/songs/export/extra')).status,200);
});

test('exhausted fallback quotas do not block dedicated endpoints',async t=>{
  const request=await fixture(t);
  for(let i=0;i<51;i++) await hit(request,'/api/write',{method:'POST'});
  for(const path of ['login','register','redeem-invite']) assert.equal((await hit(request,'/api/auth/'+path,{method:'POST'})).status,200);
  for(let i=0;i<BURST+1;i++) await hit(request);
  assert.equal((await hit(request,'/api/songs/export')).status,200);
});

test('public sustained quota survives burst resets and resets at its boundary',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-08T00:00:00Z')});
  const request=await fixture(t);
  for(let batch=0;batch<SUSTAINED/BURST;batch++) {
    for(let i=0;i<BURST;i++) assert.equal((await hit(request)).status,200);
    t.mock.timers.tick(5001);
  }
  assert.equal((await hit(request)).status,429);
  t.mock.timers.tick(60000-30006-1);
  assert.equal((await hit(request)).status,429);
  t.mock.timers.tick(1);
  assert.equal((await hit(request)).status,200);
});

test('IPv6 default subnet grouping shares nearby addresses but separates other subnets',async t=>{
  const request=await fixture(t);
  for(let i=0;i<BURST;i++) assert.equal((await hit(request,undefined,{ip:'2001:db8:1234:5600::1'})).status,200);
  assert.equal((await hit(request,undefined,{ip:'2001:db8:1234:5601::2'})).status,429);
  assert.equal((await hit(request,undefined,{ip:'2001:db8:1234:5700::1'})).status,200);
});

test('invalid, expired, missing-user and disabled tokens cannot bypass public quota',async t=>{
  const disabled=user('quota-disabled');
  db.prepare('UPDATE users SET disabled=1 WHERE id=?').run(disabled.id);
  const tokens=[undefined,'malformed',jwt.sign({id:999999},process.env.JWT_SECRET),jwt.sign({id:disabled.id},process.env.JWT_SECRET,{expiresIn:-1}),jwt.sign({id:disabled.id},'wrong-secret'),disabled.token];
  for(const token of tokens) {
    const request=await fixture(t);
    for(let i=0;i<BURST;i++) assert.equal((await hit(request,undefined,{token})).status,200);
    assert.equal((await hit(request,undefined,{token})).status,429);
  }
});

test('development and test bypass limits; unset environment still enforces them',async t=>{
  t.after(()=>{process.env.NODE_ENV='production';});
  for(const env of ['development','test',undefined]) {
    if(env===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=env;
    const request=await fixture(t);
    for(let i=0;i<BURST;i++) await hit(request);
    assert.equal((await hit(request)).status,env?200:429);
  }
});

test('signed-in members behind one church address each get their own reading quota',async t=>{
  const request=await fixture(t);
  const members=Array.from({length:5},(_,i)=>user(`church-member-${i}`));
  for(const m of members) for(let i=0;i<200;i++) assert.equal((await hit(request,undefined,{token:m.token,ip:'198.51.100.7'})).status,200);
  assert.equal((await hit(request,undefined,{token:members[0].token,ip:'198.51.100.7'})).status,429);
  // The quota follows the account, not the address.
  assert.equal((await hit(request,undefined,{token:members[0].token,ip:'198.51.100.8'})).status,429);
});

test('writes count per account, so one busy member does not block the others',async t=>{
  const request=await fixture(t);
  const [a,b]=[user('writer-a'),user('writer-b')];
  for(let i=0;i<50;i++) assert.equal((await hit(request,'/api/write',{method:'PUT',token:a.token,ip:'198.51.100.7'})).status,200);
  assert.equal((await hit(request,'/api/write',{method:'PUT',token:a.token,ip:'198.51.100.7'})).status,429);
  assert.equal((await hit(request,'/api/write',{method:'PUT',token:b.token,ip:'198.51.100.7'})).status,200);
});

test('many people can sign in from one address; one account still locks after 15 tries',async t=>{
  const request=await fixture(t);
  const login=(username)=>hit(request,'/api/auth/login',{method:'POST',ip:'198.51.100.7',body:{username,password:'x'}});
  for(let i=0;i<15;i++) assert.equal((await login('pastor')).status,200);
  assert.equal((await login('pastor')).status,429);
  assert.equal((await login(' PASTOR ')).status,429, 'case and spaces do not reset the count');
  for(let i=0;i<30;i++) assert.equal((await login(`member${i}`)).status,200);
});

test('one address cannot spray logins across many usernames forever',async t=>{
  const request=await fixture(t);
  for(let i=0;i<200;i++) assert.equal((await hit(request,'/api/auth/login',{method:'POST',ip:'198.51.100.9',body:{username:`u${i}`,password:'x'}})).status,200);
  assert.equal((await hit(request,'/api/auth/login',{method:'POST',ip:'198.51.100.9',body:{username:'fresh',password:'x'}})).status,429);
});
