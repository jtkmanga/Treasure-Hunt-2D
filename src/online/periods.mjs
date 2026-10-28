const OFFSET=7*3600000, DAY=86400000;
export function periodFor(scope,at=Date.now()){
  if(!["free1","vip1"].includes(scope)||!Number.isSafeInteger(at)||at<0)throw TypeError("Invalid ranking scope or timestamp");
  const bkk=new Date(at+OFFSET);
  const midnight=Date.UTC(bkk.getUTCFullYear(),bkk.getUTCMonth(),bkk.getUTCDate())-OFFSET;
  const start=scope==="vip1"?midnight:midnight-bkk.getUTCDay()*DAY;
  const end=start+(scope==="vip1"?DAY:7*DAY);
  return {scope,periodId:new Date(start+OFFSET).toISOString().slice(0,10),
    startsAt:new Date(start).toISOString(),resetsAt:new Date(end).toISOString(),timezone:"Asia/Bangkok"};
}
