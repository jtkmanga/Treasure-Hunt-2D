import {verifyFirebaseIdToken} from "./firebase-auth.mjs";
import {periodFor} from "./periods.mjs";
const RANKINGS=new Set(["free1","vip1"]);
const json=(value,status=200,more={})=>new Response(JSON.stringify(value),{status,headers:{
 "content-type":"application/json; charset=utf-8","cache-control":"no-store",
 "x-content-type-options":"nosniff","referrer-policy":"no-referrer",...more}});
const fail=(error,status,headers)=>json({ok:false,error},status,headers);
function cors(request,env){
 const origin=request.headers.get("origin");
 if(!origin)return {};
 if(!env.ALLOWED_ORIGIN||origin!==env.ALLOWED_ORIGIN)return null;
 return {"access-control-allow-origin":origin,"access-control-allow-methods":"GET, OPTIONS",
 "access-control-allow-headers":"authorization, content-type","access-control-max-age":"600","vary":"Origin"};
}
function validProject(s){return typeof s==="string"&&/^[a-z][a-z0-9-]{3,62}$/.test(s);}
export async function handleRequest(request,env={},testOptions={}){
 const headers=cors(request,env);
 if(headers===null)return fail("Origin not allowed",403);
 const url=new URL(request.url);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(["/api/v1/score","/api/v1/runs/start","/api/v1/runs/finish"].includes(url.pathname))
   return fail("Competitive score writes are not enabled",403,headers);
 if(request.method!=="GET")return fail("Method not allowed",405,{"allow":"GET",...headers});
 if(url.pathname==="/api/v1/health")
   return json({ok:true,service:"treasure-hunt-online-api",phase:"read-only",scoreWrites:false},200,headers);
 if(url.pathname==="/api/v1/rules"){
   const t=testOptions.now?.()??Date.now();
   return json({ok:true,free:periodFor("free1",t),vip:periodFor("vip1",t),
     leaderboardRefreshSeconds:60,scoreWrites:false},200,headers);
 }
 if(url.pathname==="/api/v1/leaderboard"){
   const scope=url.searchParams.get("scope")??"free1";
   if(!RANKINGS.has(scope))return fail("Invalid scope",400,headers);
   if(!env.DB?.prepare)return fail("Database not configured",503,headers);
   const period=periodFor(scope,testOptions.now?.()??Date.now());
   try{
     const data=await env.DB.prepare("SELECT player_label, score FROM leaderboard_entries WHERE scope = ? AND period_id = ? ORDER BY score DESC, player_label ASC LIMIT 20")
       .bind(scope,period.periodId).all();
     if(!Array.isArray(data?.results))throw Error("Invalid DB result");
     const leaders=data.results.slice(0,20).map((r,i)=>({rank:i+1,name:String(r.player_label).slice(0,40),score:Number(r.score)}));
     if(leaders.some(x=>!Number.isSafeInteger(x.score)||x.score<0))throw Error("Invalid score row");
     return json({ok:true,...period,leaders},200,{"cache-control":"public, max-age=30",...headers});
   }catch{return fail("Leaderboard temporarily unavailable",503,headers);}
 }
 if(url.pathname==="/api/v1/me"){
   if(!validProject(env.FIREBASE_PROJECT_ID))return fail("Authentication not configured",503,headers);
   const match=/^Bearer ([A-Za-z0-9_.-]{100,8192})$/.exec(request.headers.get("authorization")||"");
   if(!match)return fail("Authentication required",401,headers);
   try{
     const identity=await (testOptions.verifyToken??verifyFirebaseIdToken)(match[1],env.FIREBASE_PROJECT_ID);
     return json({ok:true,signedIn:true,uid:identity.uid,scoreWrites:false},200,headers);
   }catch{return fail("Invalid or expired Firebase ID token",401,headers);}
 }
 return fail("Not found",404,headers);
}
export default {fetch(request,env){return handleRequest(request,env);}};
