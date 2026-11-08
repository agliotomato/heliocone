"use strict";
const FIRST_DAY = "2026-10-26";
const LAST_DAY = "2026-11-09";
const SITES = {
  A: {name:"서해 발전소", label:"변동 주의", detail:"11시부터 12시까지 예측 GHI 감소", owner:"운영 담당 A"},
  B: {name:"해솔 발전소", label:"수신 지연", detail:"입력 수신 지연으로 예측 제공 보류", owner:"미지정"},
  C: {name:"들녘 발전소", label:"정상", detail:"입력 수신 정상", owner:"운영 담당 C"}
};
const CHECKS = ["수집기 연결 상태 확인", "최근 수신 시각 확인", "재수신 요청 여부 기록"];
const DEFAULT_SETTINGS = {site:"A", type:"daily", day:LAST_DAY, trend:true, inspection:true, note:""};
const scopeName = site => site === "all" ? "전체 발전소" : `${site} 현장 · ${SITES[site].name}`;
const shiftDay = (day, offset) => new Date(Date.parse(`${day}T00:00:00Z`) + offset*86400000).toISOString().slice(0,10);
const shortDate = day => day.replaceAll("-",".");
const mean = values => values.length ? Math.round(values.reduce((sum,x)=>sum+x,0)/values.length) : null;
const valuesOf = (rows,key) => rows.map(row=>row[key]).filter(Number.isFinite);
const numberText = value => value == null ? "—" : String(value);
const timeStamp = () => new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Shanghai",dateStyle:"short",timeStyle:"medium"}).format(new Date());
function settingsError(settings) {
  const min = settings.type === "weekly" ? shiftDay(FIRST_DAY,6) : FIRST_DAY;
  return !/^\d{4}-\d{2}-\d{2}$/.test(settings.day) || settings.day < min || settings.day > LAST_DAY
    ? `기준일은 ${shortDate(min)}부터 ${shortDate(LAST_DAY)}까지 선택할 수 있습니다.` : "";
}
function demoRows(site, day) {
  const index = Math.round((Date.parse(day)-Date.parse(FIRST_DAY))/86400000);
  const variation = day === LAST_DAY ? 0 : Math.round(Math.sin(index*1.8)*54);
  const withheld = site === "B" && day === LAST_DAY;
  const forecast = site === "A" ? [240,405,520,350,420,468,354,216] : [208,352,489,580,564,497,346,192];
  const observed = site === "A" ? [228,385,500,340,430,450,359,210] : [200,360,505,566,580,488,352,184];
  return forecast.map((value,i)=>{
    const offset = (site==="B" ? -28 : site==="C" ? 36 : 0) + variation;
    const missing = site==="A" && i===3 && (day===LAST_DAY || index%4===0);
    return {site,day,hour:`${String(9+i).padStart(2,"0")}:00`,base:`${day} 08:00`,
      received:`${day} ${withheld?"07:15":"07:55"}`,
      predicted:withheld?null:value+offset, observed:withheld||missing?null:observed[i]+offset,
      state:withheld?"수신 지연 · 예측 보류":missing?"관측 결측":"정상"};
  });
}
function buildReport(settings, events) {
  const error=settingsError(settings);
  if(error) throw new Error(error);
  const sites = settings.site === "all" ? Object.keys(SITES) : [settings.site];
  const weekly = settings.type === "weekly";
  const days = Array.from({length:weekly?7:1},(_,i)=>shiftDay(settings.day,weekly?i-6:0));
  const rows = days.flatMap(day=>sites.flatMap(site=>demoRows(site,day)));
  const slots = weekly ? days : demoRows(sites[0],settings.day).map(row=>row.hour);
  const series = slots.map(key=>{
    const group=rows.filter(row=>(weekly?row.day:row.hour)===key);
    return {label:weekly?key.slice(5).replace("-","."):key,
      predicted:mean(valuesOf(group,"predicted")),observed:mean(valuesOf(group,"observed"))};
  });
  const received = valuesOf(rows,"observed").length;
  const scopeEvents = sites.includes("B") ? events.filter(e=>days.includes(e.day)) : [];
  const bySite = sites.map(site=>{
    const set=rows.filter(row=>row.site===site);
    return {site,received:valuesOf(set,"observed").length,total:set.length,held:set.filter(row=>row.predicted==null).length};
  });
  const paragraphs=[];
  if(sites.includes("A")){
    const dayRows=rows.filter(row=>row.site==="A" && row.day===settings.day);
    const delta=dayRows[2].predicted-dayRows[3].predicted;
    paragraphs.push(`A 현장의 ${shortDate(settings.day).slice(5)} 11~12시 예측 GHI는 ${dayRows[2].predicted}에서 ${dayRows[3].predicted} W/m²로 ${delta} W/m² 감소했습니다.`);
  }
  const holdCount=rows.filter(row=>row.predicted===null).length;
  if(holdCount) paragraphs.push(`B 현장은 ${shortDate(LAST_DAY).slice(5)} 입력 수신이 늦어 ${holdCount}개 시간대의 예측을 보류했습니다.`);
  if(!paragraphs.length) paragraphs.push(`선택 기간에 관측값 ${received}건을 수신했습니다. 예측 보류 건은 없습니다.`);
  return {settings:{...settings},days,rows,series,bySite,summary:paragraphs.join(" "),checks:scopeEvents,
    observed:mean(valuesOf(rows,"observed")),predicted:mean(valuesOf(rows,"predicted")),
    received,total:rows.length,rate:Math.round(received/rows.length*100)};
}
function csvText(report) {
  const header=["기록 유형","발전소","대상일","대상 시각","시간대","예측 기준","입력 수신","예측 GHI (W/m²)","관측 GHI (W/m²)","데이터 상태","담당자","처리 상태","확인 항목","조치 메모","기록 시각"];
  const lines=report.rows.map(r=>["GHI",r.site,r.day,r.hour,"UTC+8",r.base,r.received,r.predicted,r.observed,r.state,"","","","",""]);
  if(report.settings.inspection) for(const e of report.checks) lines.push(["점검","B",e.day,"","UTC+8","","","","","수신 지연",e.owner,e.status,CHECKS.filter((_,i)=>e.checks[i]).join(" / "),e.memo,e.at]);
  const cell=value=>{
    const s=String(value??"");
    return `"${(/^[\s]*[=@+-]/.test(s)?"'":"")+s.replaceAll('"','""')}"`;
  };
  return "\ufeff"+[header,...lines].map(row=>row.map(cell).join(",")).join("\r\n");
}
if(typeof module!=="undefined") module.exports={buildReport,csvText,settingsError,DEFAULT_SETTINGS};
