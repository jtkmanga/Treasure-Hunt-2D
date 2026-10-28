// This optional module is used only by the mobile staging preview.
// Never log, display, or persist raw App Check tokens.
export function validatePublicSiteKey(input) {
  if (typeof input !== "string" || input.trim().length < 16 || input.trim().length > 256 ||
      !/^[A-Za-z0-9_-]+$/.test(input.trim()) || input.includes(".")) {
    throw Error("Invalid reCAPTCHA Enterprise public site key");
  }
  return input.trim();
}
export function appCheckHeader(token) {
  if(typeof token!=="string"||token.length<100||token.length>8192||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
    throw Error("App Check token unavailable");
  return {"X-Firebase-AppCheck":token};
}
// getToken(instance, false) uses a still-valid cached App Check token if available.
// No force refresh, no background interval, no upload to a backend in this trial.
export async function getAppCheckOnce(instance,getToken) {
  if(!instance||typeof getToken!=="function")throw Error("App Check not initialized");
  const result=await getToken(instance,false);
  appCheckHeader(result?.token);
  return {ok:true,verifiedByServer:false};
}
