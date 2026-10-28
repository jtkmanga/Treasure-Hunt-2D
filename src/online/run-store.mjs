// D1 access layer. This module is deliberately NOT wired into public HTTP routes.
// Identity must already be verified; never call with client-supplied uid or score.
import {periodFor} from "./periods.mjs";
import {replayRun,MAX_TICKS} from "./run-engine.mjs";

export const RUN_LIMIT_MS=3*60*1000+15000;
const SECURE_RUN_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validateIdentity(identity){
  if(!identity||typeof identity.uid!=="string"||identity.uid.length<1||identity.uid.length>128
    ||/[\x00-\x1f\x7f]/.test(identity.uid))throw Error("Verified user required");
}
function validNow(now){if(!Number.isSafeInteger(now)||now<0)throw Error("Invalid server clock");}
export async function startVerifiedRun(db,identity,options={}){
  validateIdentity(identity);
  if(!db?.prepare||!db?.batch)throw Error("Isolated D1 binding required");
  const scope=options.scope??"free1";
  // VIP rights have not yet been securely ported. No VIP runs are issued.
  if(scope!=="free1")throw Error("VIP entitlement verification not implemented");
  const level=options.level??0;
  if(!Number.isInteger(level)||level<0||level>2)throw Error("Invalid level");
  const now=options.now??Date.now();validNow(now);
  const period=periodFor(scope,now);
  const periodEnd=Date.parse(period.resetsAt);
  if(periodEnd-now<RUN_LIMIT_MS)throw Error("Period closing; try after reset");
  const runId=options.idFactory?.()??crypto.randomUUID();
  const seed=options.seedFactory?.()??crypto.getRandomValues(new Uint32Array(1))[0];
  if(!SECURE_RUN_ID.test(runId)||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)
    throw Error("Invalid server run random values");
  const expiresAt=now+RUN_LIMIT_MS;
  const label="Hunter-"+runId.slice(0,8);
  // D1 batch is transactional: at most one active run per verified UID.
  const expire=db.prepare("UPDATE game_runs SET status = 'abandoned' WHERE uid = ? AND status = 'active'").bind(identity.uid);
  const insert=db.prepare("INSERT INTO game_runs (run_id, uid, scope, period_id, level, seed, started_at, expires_at, status, player_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)")
    .bind(runId,identity.uid,scope,period.periodId,level,seed,now,expiresAt,label);
  await db.batch([expire,insert]);
  return {runId,scope,level,seed,periodId:period.periodId,startedAt:now,expiresAt,
    tickMs:200,maxTicks:MAX_TICKS};
}
export async function finishVerifiedRun(db,identity,submission,options={}){
  validateIdentity(identity);
  if(!db?.prepare)throw Error("Isolated D1 binding required");
  if(!submission||typeof submission!=="object"||Array.isArray(submission)
    ||Object.keys(submission).some(k=>!["runId","frames"].includes(k))
    ||!SECURE_RUN_ID.test(submission.runId)||!Array.isArray(submission.frames))
    throw Error("Invalid run submission");
  const now=options.now??Date.now();validNow(now);
  const row=await db.prepare("SELECT run_id, uid, scope, period_id, level, seed, started_at, expires_at, status, score FROM game_runs WHERE run_id = ? AND uid = ?")
    .bind(submission.runId,identity.uid).first();
  if(!row)throw Error("Run not found");
  if(row.status==="finished")return {ok:true,credited:false,alreadyFinished:true,score:Number(row.score)};
  if(row.status!=="active")throw Error("Run no longer active");
  if(!Number.isSafeInteger(row.started_at)||!Number.isSafeInteger(row.expires_at)
     ||now<row.started_at||now>row.expires_at
     ||periodFor(row.scope,now).periodId!==row.period_id)
    throw Error("Run expired or outside competition period");
  // Validate strict frame format and every collision, coin and chest on the server.
  const result=replayRun({level:row.level,seed:row.seed,frames:submission.frames});
  // Never allow an input transcript to claim more simulated time than has passed.
  if(result.elapsedMs>now-row.started_at+400)throw Error("Movement faster than real time");
  const updated=await db.prepare("UPDATE game_runs SET status = 'finished', finished_at = ?, score = ? WHERE run_id = ? AND uid = ? AND status = 'active' AND started_at = ? AND expires_at >= ?")
    .bind(now,result.score,row.run_id,identity.uid,row.started_at,now).run();
  // A DB trigger inserts earned score into the leaderboard only on the first
  // active -> finished transition. Racing/replayed completions do not double-credit.
  if(updated?.meta?.changes!==1){
    const current=await db.prepare("SELECT status, score FROM game_runs WHERE run_id = ? AND uid = ?")
      .bind(submission.runId,identity.uid).first();
    if(current?.status==="finished")return {ok:true,credited:false,alreadyFinished:true,score:Number(current.score)};
    throw Error("Score update rejected");
  }
  return {ok:true,credited:result.score>0,alreadyFinished:false,score:result.score,
    coinsCollected:result.coinsCollected,chestCollected:result.chestCollected};
}
