import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {handleRequest} from "../src/online/handler.mjs";
const config=JSON.parse(readFileSync(new URL("../docs/staging-readonly.json",import.meta.url),"utf8"));
test("staging configuration is intentionally private and independent",()=>{
 assert.equal(config.workers_dev,false);
 assert.equal(config.name,"treasure-hunt-2d-staging-api");
 assert.equal(config.main,"src/online/handler.mjs");
 assert.equal(config.vars.FIREBASE_PROJECT_ID,"treasure-hunt-2d");
 assert.equal(config.vars.ALLOWED_ORIGIN,"https://treasure-hunt-2d-jtk.pages.dev");
 assert.equal(config.d1_databases.length,1);
 assert.equal(config.d1_databases[0].binding,"DB");
 assert.equal(config.d1_databases[0].database_name,"treasure-hunt-2d-staging");
 assert.match(config.d1_databases[0].database_id,/^[a-f0-9-]{36}$/);
});
test("D1 leaderboard query supports an empty active period",async()=>{
 let params,query;
 const DB={prepare(sql){query=sql;return {bind(...p){params=p;return {all:async()=>({results:[]})};}};}};
 const r=await handleRequest(new Request("https://api.invalid/api/v1/leaderboard?scope=free1"),{DB});
 assert.equal(r.status,200);
 const body=await r.json();
 assert.deepEqual(body.leaders,[]);
 assert.equal(params[0],"free1");
 assert.match(query,/FROM leaderboard_entries/);
});
test("ranked score writes forbidden for every HTTP method",async()=>{
 for(const path of ["/api/v1/score","/api/v1/runs/start","/api/v1/runs/finish"]){
  for(const method of ["GET","POST","PUT"]){
   const response=await handleRequest(new Request("https://api.invalid"+path,{method}),{});
   assert.equal(response.status,403);
  }
 }
});
test("profile fails closed with missing isolated Firebase project",async()=>{
 const r=await handleRequest(new Request("https://api.invalid/api/v1/me"),{});
 assert.equal(r.status,503);
});
