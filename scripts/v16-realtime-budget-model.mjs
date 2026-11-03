// Offline scenario model: not an invoice or live Cloudflare usage statement.
import {estimateRealtimeTransport} from '../src/v16-online/hibernating-event-probe.mjs';
const base={concurrent:10_000,days:30,movingEventIntervalSeconds:4,
 idleEventIntervalSeconds:60};
const scenarios=[
 {label:'0% moving; conservative 60s idle control frames',movingFraction:0},
 {label:'5% moving; rest 60s idle control frames',movingFraction:.05},
 {label:'10% moving; rest 60s idle control frames',movingFraction:.1},
 {label:'25% moving; rest 60s idle control frames',movingFraction:.25},
 {label:'100% moving continuously for 30 days',movingFraction:1}
].map(({label,movingFraction})=>({
 label,...estimateRealtimeTransport({...base,movingFraction})
}));
process.stdout.write(JSON.stringify({
 schema:'v16-10k-websocket-incoming-message-only-v1',
 estimateNotActualBill:true,
 maximumAllowedBillUSD:null,
 model:'Cloudflare DO incoming websocket messages: 20 frames per billed request',
 assumptions:base,scenarios,
 note:'All totals omit active DO duration, CPU, storage, network fan-out, Worker upgrades, outgoing messages and payment costs. Meeting $10 cannot be proven from these figures.'
},null,2)+'\n');
