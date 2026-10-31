// Browser-side adapter for future V16 integration. Deliberately not injected
// into the approved offline V16 page until staging auth/world tests pass.
// Token callbacks must return current Firebase ID and enforced App Check tokens.
export class V16OnlineClient {
 constructor({baseUrl,scope='free',idToken,appCheckToken,fetchImpl=fetch}){
  if(typeof baseUrl!=='string'||!/^https:\/\//.test(baseUrl))throw Error('HTTPS staging URL required');
  if(!['free','vip'].includes(scope))throw Error('Invalid server scope');
  if(typeof idToken!=='function'||typeof appCheckToken!=='function'||typeof fetchImpl!=='function')
   throw Error('Token providers and fetch required');
  this.baseUrl=baseUrl.replace(/\/$/,'');this.scope=scope;
  this.idToken=idToken;this.appCheckToken=appCheckToken;this.fetchImpl=fetchImpl;
  this.worldVersion=null;this.lastWorld=null;this.nextClaimSeq=null;this.pendingClaim=null;
 }
 url(path,extra={}){
  const u=new URL('/api/v16/'+path,this.baseUrl);
  u.searchParams.set('scope',this.scope);
  for(const [key,value] of Object.entries(extra))if(value!==null&&value!==undefined)u.searchParams.set(key,String(value));
  return u.href;
 }
 async fetchJSON(url,options={}){
  const result=await this.fetchImpl(url,options);
  if(!result||typeof result.json!=='function')throw Error('Unexpected staging response');
  const data=await result.json();
  if(!result.ok||!data||data.ok!==true)throw Error(String(data?.error||'Staging API error'));
  return data;
 }
 async authorizedHeaders(){
  const [idToken,appCheckToken]=await Promise.all([this.idToken(),this.appCheckToken()]);
  if(typeof idToken!=='string'||!idToken||typeof appCheckToken!=='string'||!appCheckToken)
   throw Error('Google login and App Check required');
  return {authorization:'Bearer '+idToken,'x-firebase-appcheck':appCheckToken};
 }
 async signedPost(path,body){
  return this.fetchJSON(this.url(path),{method:'POST',headers:{
   ...await this.authorizedHeaders(),
   'content-type':'application/json',
  },body:JSON.stringify(body)});
 }
 async join(name='Hunter'){
  const response=await this.signedPost('join',{name});
  const state=response.result;
  if(!Number.isSafeInteger(state?.nextClaimSeq)||state.nextClaimSeq<1)
   throw Error('Server did not return next claim sequence');
  this.nextClaimSeq=state.nextClaimSeq;
  this.pendingClaim=null;
  this.lastWorld=state.world;this.worldVersion=state.world.version;
  return state;
 }
 async move(x,y){
  if(![x,y].every(v=>Number.isInteger(v)&&v>=-100&&v<=100))
   throw Error('Invalid analog axes');
  return (await this.signedPost('move',{dx:x,dy:y})).result;
 }
 async collect(){
  if(!Number.isSafeInteger(this.nextClaimSeq)||this.nextClaimSeq<1)
   throw Error('Join the staging world first');
  if(!this.pendingClaim){
   this.pendingClaim={claimSeq:this.nextClaimSeq,requestId:'claim-'+crypto.randomUUID().replaceAll('-','')};
  }
  // Reuse the same sequence + request ID on timeout. A different claim is
  // issued only after the server confirms this one.
  const response=await this.signedPost('collect',this.pendingClaim);
  this.nextClaimSeq++;
  this.pendingClaim=null;
  return response.result;
 }
 async world(){
  const data=await this.fetchJSON(this.url('world',{since:this.worldVersion}),{
   headers:await this.authorizedHeaders(),
  });
  if(data.unchanged)return this.lastWorld;
  if(!data.world||!Number.isSafeInteger(data.world.version))throw Error('Malformed world snapshot');
  this.lastWorld=data.world;this.worldVersion=data.world.version;
  return this.lastWorld;
 }
}
