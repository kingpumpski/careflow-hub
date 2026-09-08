/**
 * Pure metric calculators shared by the executive dashboard, schedules, reports and AI services.
 * They accept raw database rows so any page can feed them straight from Supabase queries.
 */
import {
  calculateOutstanding as calculateCanonicalOutstanding,
  resolveAggregateStatus,
  resolveOutstandingStatus,
} from "@/lib/claims/outstanding";

export interface ExecutiveKpis { claimsCount:number; grossSubmitted:number; netSubmitted:number; rejectedAmount:number; paymentsReceived:number; withholdingTax:number; outstanding:number; rejectionRate:number; collectionRate:number; recoveryRate:number; avgSettlementDays:number; settledCount:number; complianceScore:number; }
export interface YearlyMetric { year:number; submitted:number; payments:number; withholdingTax:number; outstanding:number; }
const sum=(rows:any[],key:string)=>rows.reduce((s,r)=>s+Number(r[key]||0),0);
export const calculateOutstanding=calculateCanonicalOutstanding;
export { resolveAggregateStatus, resolveOutstandingStatus };
export function computeExecutiveKpis(claims:any[]=[],payments:any[]=[],withholdingTax:any[]=[]):ExecutiveKpis{
 const rejected=claims.filter(c=>c.status==="rejected"), active=claims.filter(c=>c.status!=="rejected"), netSubmitted=sum(active,"claim_amount"), rejectedAmount=sum(rejected,"claim_amount"), grossSubmitted=netSubmitted+rejectedAmount, paymentsReceived=sum(payments,"amount_paid"), tax=sum(withholdingTax,"tax_amount");
 const durations=claims.filter(c=>c.submitted_at&&c.paid_at).map(c=>(new Date(c.paid_at).getTime()-new Date(c.submitted_at).getTime())/86_400_000).filter(d=>d>=0), rejectionRate=grossSubmitted>0?rejectedAmount/grossSubmitted*100:0;
 return {claimsCount:claims.length,grossSubmitted,netSubmitted,rejectedAmount,paymentsReceived,withholdingTax:tax,outstanding:calculateCanonicalOutstanding(grossSubmitted,rejectedAmount,paymentsReceived,tax),rejectionRate,collectionRate:grossSubmitted>0?paymentsReceived/grossSubmitted*100:0,recoveryRate:netSubmitted>0?paymentsReceived/netSubmitted*100:0,avgSettlementDays:durations.length?durations.reduce((s,d)=>s+d,0)/durations.length:0,settledCount:durations.length,complianceScore:Math.max(0,Math.min(100,100-rejectionRate*2))};
}
function dateYear(row:any):number|null{const raw=row?.submitted_at||row?.submission_date||row?.payment_date||row?.withholding_tax_date||row?.tax_date||row?.created_at||row?.paid_at;if(!raw)return null;const d=new Date(raw);return Number.isNaN(d.getTime())?null:d.getFullYear();}
export function rowYear(row:any):number|null{const explicit=Number(row?.claim_year??row?.year);return Number.isFinite(explicit)&&explicit>0?explicit:dateYear(row);}
function rowMonth(row:any):number|null{const explicit=Number(row?.claim_month??row?.month);if(Number.isFinite(explicit)&&explicit>=1&&explicit<=12)return explicit;const raw=row?.payment_date||row?.withholding_tax_date||row?.tax_date||row?.submitted_at||row?.submission_date||row?.created_at||row?.paid_at;if(!raw)return null;const d=new Date(raw);return Number.isNaN(d.getTime())?null:d.getMonth()+1;}
function rowPeriodKey(row:any):string|null{const year=rowYear(row),month=rowMonth(row);return year&&month?`${year}-${String(month).padStart(2,"0")}`:null;}
export interface YearlyKpis{year:number;kpis:ExecutiveKpis;preauthCount:number;rejectedCount:number;}
export function computeYearlyKpis(claims:any[]=[],payments:any[]=[],withholdingTax:any[] =[],preauths:any[]=[]):YearlyKpis[]{const years=new Set<number>();[claims,payments,withholdingTax,preauths].forEach(rows=>rows.forEach(r=>{const y=rowYear(r);if(y)years.add(y);}));return [...years].sort((a,b)=>b-a).map(year=>({year,kpis:computeExecutiveKpis(claims.filter(c=>rowYear(c)===year),payments.filter(p=>rowYear(p)===year),withholdingTax.filter(t=>rowYear(t)===year)),preauthCount:preauths.filter(p=>rowYear(p)===year).length,rejectedCount:claims.filter(c=>rowYear(c)===year&&c.status==="rejected").length}));}
export function buildYearlyMetrics(claims:any[]=[],payments:any[]=[],withholdingTax:any[]=[]):YearlyMetric[]{const years=new Set<number>();[...claims,...payments,...withholdingTax].forEach(r=>{const y=rowYear(r);if(y)years.add(y);});return [...years].sort((a,b)=>b-a).map(year=>{const yearClaims=claims.filter(c=>rowYear(c)===year),submitted=sum(yearClaims,"claim_amount"),rejected=sum(yearClaims.filter(c=>c.status==="rejected"),"claim_amount"),paid=sum(payments.filter(p=>rowYear(p)===year),"amount_paid"),tax=sum(withholdingTax.filter(t=>rowYear(t)===year),"tax_amount");return {year,submitted,payments:paid,withholdingTax:tax,outstanding:calculateCanonicalOutstanding(submitted,rejected,paid,tax)};});}
export const MONTH_LABELS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export interface TrendPoint{month:string;submitted:number;paid:number;rejected:number;withholdingTax:number;outstanding:number;}
/** Returns the latest 12 real year-month periods; unlike a month-of-year aggregation it never mixes Jan 2025 with Jan 2026. */
export function buildTrendSeries(claims:any[]=[],payments:any[]=[],withholdingTax:any[]=[]):TrendPoint[]{
 const keys=[...new Set([...claims,...payments,...withholdingTax].map(rowPeriodKey).filter((key):key is string=>Boolean(key)))].sort().slice(-12);
 let cumulative=0;
 return keys.map(key=>{
  const [year,month]=key.split("-").map(Number),monthClaims=claims.filter(c=>rowPeriodKey(c)===key),submitted=sum(monthClaims.filter(c=>c.status!=="rejected"),"claim_amount"),rejected=sum(monthClaims.filter(c=>c.status==="rejected"),"claim_amount"),paid=sum(payments.filter(p=>rowPeriodKey(p)===key),"amount_paid"),tax=sum(withholdingTax.filter(t=>rowPeriodKey(t)===key),"tax_amount");
  cumulative=calculateCanonicalOutstanding(cumulative+submitted+rejected,rejected,paid,tax);
  return {month:`${MONTH_LABELS[month-1]} ${String(year).slice(-2)}`,submitted:submitted/1000,paid:paid/1000,rejected:rejected/1000,withholdingTax:tax/1000,outstanding:cumulative/1000};
 });
}
export interface InsurerPerformance{id:string;name:string;shortName:string;color:string|null;claimsCount:number;submitted:number;rejected:number;paid:number;outstanding:number;rejectionRate:number;collectionRate:number;}
export function rankInsurers(insurers:any[]=[],claims:any[]=[],payments:any[]=[],withholdingTax:any[]=[]):InsurerPerformance[]{return insurers.map(ins=>{const scoped=claims.filter(c=>c.insurance_company_id===ins.id),submitted=sum(scoped.filter(c=>c.status!=="rejected"),"claim_amount"),rejected=sum(scoped.filter(c=>c.status==="rejected"),"claim_amount"),paid=sum(payments.filter(p=>p.insurance_company_id===ins.id),"amount_paid"),tax=sum(withholdingTax.filter(t=>t.insurance_company_id===ins.id),"tax_amount"),gross=submitted+rejected,name=ins.company_name||"Unnamed";return {id:ins.id,name,shortName:name.length>14?`${name.slice(0,14)}…`:name,color:ins.color??null,claimsCount:scoped.length,submitted,rejected,paid,outstanding:calculateCanonicalOutstanding(gross,rejected,paid,tax),rejectionRate:gross>0?rejected/gross*100:0,collectionRate:submitted>0?paid/submitted*100:0};}).sort((a,b)=>b.outstanding-a.outstanding||b.submitted-a.submitted);}
export function projectLinear(series:number[],periods=3):number[]{if(series.length<2)return Array(periods).fill(series[0]??0);const n=series.length,xMean=(n-1)/2,yMean=series.reduce((s,v)=>s+v,0)/n;let num=0,den=0;series.forEach((y,x)=>{num+=(x-xMean)*(y-yMean);den+=(x-xMean)**2;});const slope=den===0?0:num/den,intercept=yMean-slope*xMean;return Array.from({length:periods},(_,k)=>Math.max(0,intercept+slope*(n+k)));}
