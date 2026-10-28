// Optional future browser helper: intentionally unused by deployed /login page.
// Only call after App Check registration and approved Firebase SDK key.
export function appCheckHeader(token){
 if(typeof token!=="string"||token.length<100||token.length>8192||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
   throw Error("App Check token unavailable");
 return {"X-Firebase-AppCheck":token};
}
