// Offline scenario model: not an invoice or live Cloudflare usage statement.
import {estimateRealtimeTransport} from '../src/v16-online/hibernating-event-probe.mjs';
const base={concurrent:10_000,days:30,movingEventIntervalSeconds:3,
 idleEventIntervalSeconds:null};
const scenarios=[
 {label:'0% moving; no idle app messages',movingFraction:0},
 {label:'5% moving; no idle app messages',movingFraction:.05},
 {label:'10% moving; no idle app messages',movingFraction:.1},
 {label:'5% moving; keepalive every 60 sec for idle connections',movingFraction:.05,idleEventIntervalSeconds:60},
 {label:'100% moving continuously for 30 days',movingFraction:1}
].map(({label,movingFraction})=>({
 label,...estimateRealtimeTransport({...base,movingFraction,...(label.includes('keepalive')?{idleEventIntervalSeconds:60}:{})})
}));
process.stdout.write(JSON.stringify({
 schema:'v16-10k-websocket-incoming-message-only-v1',
 estimateNotActualBill:true,
 maximumAllowedBillUSD:null,
 model:'Cloudflare DO incoming websocket messages: 20 frames per billed request',
 assumptions:base,scenarios,
 note:'All totals omit active DO duration, CPU, storage, network fan-out, Worker upgrades, outgoing messages and payment costs. Meeting $10 cannot be proven from these figures.'
},null,2)+'\n');
