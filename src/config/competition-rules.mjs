// Approved public game configuration; no payments or score grants happen here.
// Server must verify all purchases, entitlement expiry, and Lucky Box claims.
export const GAME_CONFIG = Object.freeze({
  servers: Object.freeze(["free","vip"]),
  map: Object.freeze({type:"forest",width:100,height:100}),
  unlimitedPlay: true,
  sharedCoinCap: 200,
  coinRespawnMs: 60_000,
  luckyBoxRespawnMs: 4*60*60*1000,
  luckyBoxRewards: Object.freeze([
    Object.freeze({coins:100,weight:500}),
    Object.freeze({coins:500,weight:300}),
    Object.freeze({coins:1000,weight:190}),
    Object.freeze({coins:5000,weight:9}),
    Object.freeze({coins:10000,weight:1}),
  ]),
  boosters: Object.freeze({
    doubleCoins: Object.freeze({priceTHB:20,durationMs:86_400_000,mapCoinMultiplier:2,chestMultiplier:1}),
    doubleSpeed: Object.freeze({priceTHB:10,durationMs:86_400_000,speedMultiplier:2}),
  }),
});
export function chooseLuckyReward(secureRandomInteger) {
  // Receive a crypto-backed uniform integer from the authoritative server, 0..999.
  if(!Number.isInteger(secureRandomInteger)||secureRandomInteger<0||secureRandomInteger>=1000)
    throw new RangeError("Expected secure integer in [0,1000)");
  let n=secureRandomInteger;
  for(const reward of GAME_CONFIG.luckyBoxRewards){
    if(n<reward.weight)return reward.coins;
    n-=reward.weight;
  }
  throw new Error("Invalid reward weights");
}
export function boosterExpiresAt(verifiedActivationMs,previousExpiryMs=0){
  if(!Number.isFinite(verifiedActivationMs)||verifiedActivationMs<0||!Number.isFinite(previousExpiryMs)||previousExpiryMs<0)
    throw new TypeError("Invalid timestamps");
  return Math.max(verifiedActivationMs,previousExpiryMs)+86_400_000;
}
