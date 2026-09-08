/**
 * Pure metric calculators shared by the executive dashboard, schedules, reports and AI services.
 * They accept raw database rows so any page can feed them straight from Supabase queries.
 */

export interface ExecutiveKpis {
  claimsCount: number; grossSubmitted: number; netSubmitted: number; rejectedAmount: number;
  paymentsReceived: number; withholdingTax: number; outstanding: number; rejectionRate: number;
  collectionRate: number; recoveryRate: number; avgSettlementDays: number; settledCount: number; complianceScore: number;
}
export interface YearlyMetric { year:number; submitted:number; payments:number; withholdingTax:number; outstanding:number; }
const sum=(rows:any[],key:string)=>rows.reduce((s,r)=>s+Number(r[key]||0),0);

/** Canonical settlement equation used throughout the analytics layer. */
export function calculateOutstanding(grossSubmitted:number,rejected:number,payments:number,withholdingTax:number){
  return Math.max(0,grossSubmitted-rejected-payments-withholdingTax);
}

export function resolveOutstandingStatus(paymentEntryCount:number,withholdingTaxEntryCount:number):"actual"|"provisional"{
  return paymentEntryCount>0&&withholdingTaxEntryCount>0?"actual":"provisional";
}

export function resolveAggregateStatus(statuses:Array<"actual"|"provisional">):"actual"|"provisional"{
  return statuses.length>0&&statuses.every((status)=>status==="actual")?"actual":"provisional";
}

export function computeExecutiveKpis(claims:any[]=[],payments:any[]=[],withholdingTax:any[]=[]):ExecutiveKpis{
  const rejected=claims.filter(c=>c.status==="rejected");
  const active=claims.filter(c=>c.status!=="rejected");
  const netSubmitted=sum(active,"claim_amount");
  const rejectedAmount=sum(rejected,"claim_amount");
  const grossSubmitted=netSubmitted+rejectedAmount;
  const paymentsReceived=sum(payments,"amount_paid");
  const tax=sum(withholdingTax,"tax_amount");
  const durations=claims.filter(c=>c.submitted_at&&c.paid_at).map(c=>(new Date(c.paid_at).getTime()-new Date(c.submitted_at).getTime())/86_400_000).filter(d=>d>=0);
  const rejectionRate=grossSubmitted>0?(rejectedAmount/grossSubmitted)*100:0;
  return {claimsCount:claims.length,grossSubmitted,netSubmitted,rejectedAmount,paymentsReceived,withholdingTax:tax,
    outstanding:calculateOutstanding(grossSubmitted,rejectedAmount,paymentsReceived,tax),
    rejectionRate,collectionRate:grossSubmitted>0?(paymentsReceived/grossSubmitted)*100:0,
    recoveryRate:netSubmitted>0?(paymentsReceived/netSubmitted)*100:0,
    avgSettlementDays:durations.length?durations.reduce((s,d)=>s+d,0)/durations.length:0,settledCount:durations.length,
    complianceScore:Math.max(0,Math.min(100,100-rejectionRate*2))};
}

export function rowYear(row:any):number|null{
  const explicit=Number(row?.claim_year??row?.year); if(explicit)return explicit;
  const raw=row?.submitted_at||row?.submission_date||row?.payment_date||row?.created_at||row?.paid_at; if(!raw)return null;
  const y=new Date(raw).getFullYear(); return Number.isFinite(y)?y:null;
}
export interface YearlyKpis{year:number;kpis:ExecutiveKpis;preauthCount:number;rejectedCount:number;}
export function computeYearlyKpis(claims:any[]=[],payments:any[]=[],withholdingTax:any[]=[],preauths:any[]=[]):YearlyKpis[]{
  const years=new Set<number>(); [claims,payments,withholdingTax].forEach(rows=>rows.forEach(r=>{const y=rowYear(r);if(y)years.add(y);}));
  return [...years].sort((a,b)=>b-a).map(year=>({year,kpis:computeExecutiveKpis(claims.filter(c=>rowYear(c)===year),payments.filter(p=>rowYear(p)===year),withholdingTax.filter(t=>rowYear(t)===year)),preauthCount:preauths.filter(p=>rowYear(p)===year).length,rejectedCount:claims.filter(c=>rowYear(c)===year&&c.status==="rejected").length}));
}
export function buildYearlyMetrics(claims:any[]=[],payments:any[]=[],withholdingTax:any[]=[]):YearlyMetric[]{
  const years=new Set<number>(); [...claims,...payments,...withholdingTax].forEach(r=>{const y=rowYear(r);if(y)years.add(y);});
  return [...years].sort((a,b)=>b-a).map(year=>{
    const yearClaims=claims.filter(c=>rowYear(c)===year); const submitted=sum(yearClaims,"claim_amount");
    const rejected=sum(yearClaims.filter(c=>c.status==="rejected"),"claim_amount"); const paid=sum(payments.filter(p=>rowYear(p)===year),"amount_paid");
    const tax=sum(withholdingTax.filter(t=>rowYear(t)===year),"tax_amount");
    return {year,submitted,payments:paid,withholdingTax:tax,outstanding:calculateOutstanding(submitted,rejected,paid,tax)};
  });
}
export const MONTH_LABELS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export interface TrendPoint{month:string;submitted:number;paid:number;rejected:number;withholdingTax:number;outstanding:number;}

/** Monthly trend series in GH¢ '000. WHT is included so the outstanding line follows the canonical equation. */
export function buildTrendSeries(claims:any[]=[],payments:any[]=[],withholdingTax:any[]=[]):TrendPoint[]{
  let cumulative=0;
  return MONTH_LABELS.map((label,i)=>{
    const month=i+1;
    const monthClaims=claims.filter(c=>Number(c.claim_month)===month);
    const submitted=sum(monthClaims.filter(c=>c.status!=="rejected"),"claim_amount");
    const rejected=sum(monthClaims.filter(c=>c.status==="rejected"),"claim_amount");
    const paid=sum(payments.filter(p=>Number(p.claim_month)===month),"amount_paid");
    const tax=sum(withholdingTax.filter(t=>Number(t.claim_month??t.month)===month),"tax_amount");
    cumulative=calculateOutstanding(cumulative+submitted+rejected,rejected,paid,tax);
    return {month:label,submitted:submitted/1000,paid:paid/1000,rejected:rejected/1000,withholdingTax:tax/1000,outstanding:cumulative/1000};
  });
}
export interface InsurerPerformance{id:string;name:string;shortName:string;color:string|null;claimsCount:number;submitted:number;rejected:number;paid:number;outstanding:number;rejectionRate:number;collectionRate:number;}
export function rankInsurers(insurers:any[]=[],claims:any[]=[],payments:any[]=[]):InsurerPerformance[]{
  return insurers.map(ins=>{const scoped=claims.filter(c=>c.insurance_company_id===ins.id);const submitted=sum(scoped.filter(c=>c.status!=="rejected"),"claim_amount");const rejected=sum(scoped.filter(c=>c.status==="rejected"),"claim_amount");const paid=sum(payments.filter(p=>p.insurance_company_id===ins.id),"amount_paid");const gross=submitted+rejected;const name=ins.company_name||"Unnamed";return {id:ins.id,name,shortName:name.length>14?`${name.slice(0,14)}…`:name,color:ins.color??null,claimsCount:scoped.length,submitted,rejected,paid,outstanding:calculateOutstanding(submitted,rejected,paid,0),rejectionRate:gross>0?(rejected/gross)*100:0,collectionRate:submitted>0?(paid/submitted)*100:0};}).sort((a,b)=>b.submitted-a.submitted);
}
export function projectLinear(series:number[],periods=3):number[]{if(series.length<2)return Array(periods).fill(series[0]??0);const n=series.length,xMean=(n-1)/2,yMean=series.reduce((s,v)=>s+v,0)/n;let num=0,den=0;series.forEach((y,x)=>{num+=(x-xMean)*(y-yMean);den+=(x-xMean)**2;});const slope=den===0?0:num/den,intercept=yMean-slope*xMean;return Array.from({length:periods},(_,k)=>Math.max(0,intercept+slope*(n+k)));}
