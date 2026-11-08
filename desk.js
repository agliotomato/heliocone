"use strict";
const $ = (selector,root=document)=>root.querySelector(selector);
const html = value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const paths={
  document:"M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6",
  grid:"M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  archive:"M3 4h18v5H3z M5 9v11h14V9 M9 13h6",
  sliders:"M4 7h6m4 0h6M4 17h10m4 0h2 M10 4v6M15 14v6",
  preview:"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  expand:"M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  minus:"M5 12h14", plus:"M5 12h14M12 5v14", close:"M5 5l14 14M19 5 5 19",
  arrow:"M4 12h15m-6-6 6 6-6 6", check:"m4 12 5 5L20 6",
  print:"M7 8V3h10v5M6 17H3V9h18v8h-3M7 14h10v7H7z",
  down:"M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  copy:"M8 7h12v14H8z M4 16V3h12",
  fileplus:"M5 3h9l5 5v13H5z M14 3v6h5 M9 15h6 M12 12v6",
  clock:"M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M12 7v5l3 2",
  location:"M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 1 1 14 0z M14.3 9a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0z"
};
const icon = name=>`<svg class="ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
document.querySelectorAll("[data-icon]").forEach(el=>el.innerHTML=icon(el.dataset.icon));
const reader=$("#reader"), work=$("#workspace");
const STORAGE="heliocone-desk-v1/";
let volatileStore=new Map(), storageAvailable=true;
try{localStorage.setItem(STORAGE+"probe","1");localStorage.removeItem(STORAGE+"probe");}catch{storageAvailable=false;}
function storageWarning(){
  $("#storage-warning").hidden=storageAvailable;
  $("#storage-warning").textContent="브라우저 저장소를 사용할 수 없어 이 탭에서만 기록을 보관합니다. 창을 닫기 전에 PDF나 CSV로 저장하세요.";
}
function records(prefix) {
  const entries=new Map(volatileStore);
  if(storageAvailable) {
    try{
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(key?.startsWith(STORAGE+prefix)) entries.set(key,localStorage.getItem(key));
      }
    }catch{storageAvailable=false;storageWarning();}
  }
  const result=[];
  for(const [key,value] of entries) if(key.startsWith(STORAGE+prefix)) {
    try{const record=JSON.parse(value); if(record?.id && (prefix==="report/" ? record.report?.settings && Array.isArray(record.report.rows) : Array.isArray(record.checks)))result.push(record);}catch{/* Ignore unreadable entries so other documents remain accessible. */}
  }
  return result.sort((a,b)=>a.issued-b.issued||a.id.localeCompare(b.id));
}
function saveRecord(prefix,entry) {
  const key=STORAGE+prefix+entry.id, value=JSON.stringify(entry);
  volatileStore.set(key,value);
  if(storageAvailable)try{localStorage.setItem(key,value);}catch{storageAvailable=false;storageWarning();}
}
const reports=()=>records("report/");
const events=()=>records("event/");
const uid=()=>crypto.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`;
let settings={...DEFAULT_SETTINGS}, currentView="", currentReport=null;
let draftInspection=null, inspectorOpen=false, shownSites="all", detailSite=null, currentRead=null;
let zoom={preview:"auto",reader:100};
const zoomSteps=[25,50,75,100,125,150,175,200];
let toastTimer;
function notice(message){
  $("#toast").textContent=message;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("#toast").textContent="",3500);
}
function chart(series){
  if(!series.some(point=>point.observed!==null || point.predicted!==null)){
    return `<div class="no-series">입력 수신 지연으로 표시할 관측값과 예측값이 없습니다.</div>`;
  }
  const x=i=>44+i*590/(series.length-1), y=v=>164-v*140/700;
  const line=(key,color,dash)=>{
    let drawing=false;
    const d=series.map((p,i)=>{
      if(p[key]===null){drawing=false;return "";}
      const cmd=drawing?"L":"M";drawing=true;return `${cmd}${x(i)} ${y(p[key])}`;
    }).join(" ");
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="${dash}"/>`+
      series.map((p,i)=>p[key]===null?"":`<circle cx="${x(i)}" cy="${y(p[key])}" r="3.5" fill="${key==="observed"?color:"#fff"}" stroke="${color}" stroke-width="2"/>`).join("");
  };
  const grid=[0,200,400,600].map(v=>`<path d="M40 ${y(v)}H646" stroke="#dedbd3"/><text x="29" y="${y(v)+4}" text-anchor="end">${v}</text>`).join("");
  const labels=series.map((p,i)=>`<text x="${x(i)}" y="185" text-anchor="middle">${html(p.label)}</text>`).join("");
  return `<svg viewBox="0 0 665 197" class="plot" role="img" aria-label="GHI 추이. 실선은 관측, 점선은 예측이며 빈 관측 구간은 결측입니다."><title>${html(series.map(p=>`${p.label} 관측 ${numberText(p.observed)}, 예측 ${numberText(p.predicted)}`).join(" / "))}</title>${grid}${labels}${line("predicted","#a34329","7 5")}${line("observed","#333b39","none")}</svg>`;
}
const periodOf=r=>r.days.length===1?shortDate(r.days[0]):`${shortDate(r.days[0])} – ${shortDate(r.days.at(-1))}`;
const titleOf=r=>r.settings.type==="daily"?"태양광 운영 일보":"태양광 운영 주보";
const legend=()=>`<div class="legend"><span><i></i>관측</span><span><i class="dashed"></i>예측</span></div>`;
function handoffSummary(report,entry){
  if(!entry) return `<section class="handoff handoff-empty"><h3>인수인계 요약</h3><p>선택한 현장과 기간에 등록된 점검 기록이 없습니다.</p></section>`;
  const reading=report.rows.find(row=>row.site==="B" && row.day===entry.day);
  return `<section class="handoff">
    <div class="handoff-title"><h3>인수인계 요약</h3><span>${scopeName("B")} · ${html(entry.owner)}</span></div>
    <div class="record-box"><p class="next-check"><b>다음 확인 사항</b> ${html(entry.nextCheck||"미입력")}</p>
      <p><b>점검 상태</b> ${html(entry.status)}${reading?` · <b>수신 상태</b> ${html(reading.state)}`:""}</p>
      <p><b>조치 메모</b> ${html(entry.memo||"미입력")}</p>
      <small>${html(entry.at)} (UTC+8) · 확인 항목 ${entry.checks.filter(Boolean).length}/3 · 기간 내 이력 ${report.checks.length}건</small>
    </div></section>`;
}
function paper(report,issue){
  const {settings:s}=report, latest=report.checks.at(-1);
  const heading=(n,text,aside="")=>`<div class="section-title"><h3><em>${n}</em>${text}</h3>${aside}</div>`;
  const metrics=[[numberText(report.observed),"W/m²","평균 관측 GHI"],[numberText(report.predicted),"W/m²","평균 예측 GHI"],[report.rate,"%","관측 확보율"]];
  const trend=s.trend?`<section>${heading("02",s.type==="daily"?"시간대별 일사량":"일별 평균 일사량",legend())}<div class="chart-unit">GHI (W/m²)</div>${chart(report.series)}<p class="paper-note">수신된 값의 단순 평균 · 결측 구간 제외 · 일별 예측 기준 08:00 (UTC+8)</p></section>`:"";
  let inspection="";
  if(s.inspection && report.formatVersion!==2){
    inspection=`<section>${heading(s.trend?"04":"03","현장 점검 기록")}<div class="record-box">${latest?`<strong>B 현장 · ${html(latest.status)} · ${html(latest.owner)}</strong><p>${html(latest.memo||"조치 메모 미입력")}</p><small>${html(latest.at)} (UTC+8) · 확인 항목 ${latest.checks.filter(Boolean).length}/3 · 기간 내 이력 ${report.checks.length}건</small>`:"선택한 현장과 기간에 등록된 점검 기록이 없습니다."}</div></section>`;
  }
  const siteRows=report.bySite.map(v=>`<tr><td>${v.site} 현장 · ${SITES[v.site].name}</td><td>${v.received} / ${v.total}건</td><td>${v.held}건</td><td>${v.held?"수신 지연":v.received<v.total?"관측 결측":"수신 정상"}</td></tr>`).join("");
  const dense = s.site==="all" || s.note.trim() || (s.inspection && latest);
  return `<article class="paper${dense?" dense":""}" aria-label="${titleOf(report)}">
    <div class="letterhead"><div class="letter-brand"><img src="mark.svg" alt="">HelioCone</div><div>FIELD OPERATIONS<br><b>${s.type==="daily"?"DAILY REPORT":"WEEKLY REPORT"}</b></div></div>
    <div class="doc-heading"><div><p class="doc-kicker">태양광 발전소 운영 기록</p><h2>${titleOf(report)}</h2></div><div class="paper-stamp">운영<br>레포트</div></div>
    <div class="doc-meta"><span>대상 현장 <b>${scopeName(s.site)}</b></span><span>보고 기간 <b>${periodOf(report)}</b></span><span>작성 부서 <b>SunChip 운영팀</b></span><span>자료 구분 <b>가상 운영 데이터 · UTC+8</b></span></div>
    ${s.inspection && report.formatVersion===2?handoffSummary(report,latest):""}
    <section>${heading("01","운영 요약")}<div class="metrics">${metrics.map(([v,u,l])=>`<div><span>${l}</span><strong>${v}<small>${u}</small></strong></div>`).join("")}</div><p class="summary">${html(report.summary)}</p></section>
    ${trend}<section>${heading(s.trend?"03":"02","데이터 수신 현황")}<table class="doc-table"><thead><tr><th>발전소</th><th>관측 확보 / 예정</th><th>예측 보류</th><th>수신 상태</th></tr></thead><tbody>${siteRows}</tbody></table></section>
    ${inspection}${s.note.trim()?`<section class="paper-memo"><b>운영자 메모</b><p>${html(s.note.trim())}</p></section>`:""}
    <div class="paper-footer"><span>${issue?html(issue.code)+" · 발행 "+html(issue.at):"미리보기 · 미발행"}<br>HelioCone · Team SunChip</span><b>01 / 01</b></div>
  </article>`;
}
function toolbar(mode) {
  const read=mode==="reader";
  const button=(action,label,glyph)=>`<button class="icon-btn" data-action="${action}" data-mode="${mode}" aria-label="${label}" title="${label}">${icon(glyph)}</button>`;
  return `<div class="toolstrip"><span class="tool-label">${icon(read?"document":"preview")} ${read?"A4 세로":"레포트 미리보기"}</span><div class="zoom-tools">
    ${button("smaller","축소","minus")}<button class="scale" title="너비에 맞추기" aria-label="문서 너비에 맞추기" data-action="fit" data-mode="${mode}"></button>${button("larger","확대","plus")}
    ${read?"":`<i class="separator"></i><button class="text-btn" data-action="expand" title="미리보기 크게 보기">${icon("expand")}<span>크게 보기</span></button>`}</div></div>`;
}
function resizePaper(mode){
  const box=mode==="reader"?$("#reader-scroll"):$("#preview-scroll");
  if(!box || !box.clientWidth)return;
  const sheet=$(".paper",box);if(!sheet)return;
  const frame=$(".paper-frame",box);
  const fit=Math.min(1,Math.max(.1,(box.clientWidth-(box.clientWidth<420?24:52))/794));
  const scale=zoom[mode]==="auto"?Math.min(.82,fit):zoom[mode]==="fit"?fit:zoom[mode]/100;
  sheet.style.transform=`scale(${scale})`;frame.style.width=`${794*scale}px`;frame.style.height=`${sheet.offsetHeight*scale}px`;
  const scope=mode==="reader"?$("#reader-tools"):work;
  const percent=Math.round(scale*100);
  const scaleButton=$(".scale",scope);
  if(scaleButton){scaleButton.textContent=percent+"%";scaleButton.dataset.percent=percent;}
  const shrink=$('[data-action="smaller"]',scope),grow=$('[data-action="larger"]',scope);
  if(shrink)shrink.disabled=percent<=zoomSteps[0];
  if(grow)grow.disabled=percent>=zoomSteps.at(-1);
}
const observer=new ResizeObserver(()=>{resizePaper("preview");resizePaper("reader");});
function mountPaper(box,report,issue,mode){
  box.innerHTML=`<div class="paper-frame">${paper(report,issue)}</div>`;
  observer.observe(box);resizePaper(mode);
}
function studio(){
  const siteOptions=["A","B","C","all"].map(site=>`<option value="${site}" ${site===settings.site?"selected":""}>${scopeName(site)}</option>`).join("");
  work.innerHTML=`<div class="studio-grid"><form class="config" id="config">
    <div class="panel-head"><h2>${icon("sliders")}레포트 설정</h2><span class="paper-size">A4</span></div>
    <div class="fields"><fieldset><legend>레포트 종류</legend><div class="segments">${[["daily","일간 레포트"],["weekly","주간 레포트"]].map(([v,l])=>`<label><input type="radio" name="type" value="${v}" ${settings.type===v?"checked":""}><span>${l}</span></label>`).join("")}</div></fieldset>
    <label class="field">대상 발전소<select name="site">${siteOptions}</select></label>
    <label class="field">보고 기준일<input type="date" name="day" value="${html(settings.day)}" max="${LAST_DAY}" required></label><p class="hint" id="period-hint"></p>
    <div class="rule"></div><fieldset class="include"><legend>포함할 항목</legend>
    <label><input type="checkbox" checked disabled><span>운영 요약 · 수신 현황</span><small>필수</small></label>
    <label><input type="checkbox" name="trend" ${settings.trend?"checked":""}>일사량 추이 그래프</label>
    <label><input type="checkbox" name="inspection" ${settings.inspection?"checked":""}>현장 점검 기록 · 인수인계 요약</label></fieldset>
    <details class="memo-entry" ${settings.note?"open":""}><summary>운영자 메모 <small>선택</small></summary><label><span class="sr-only">운영자 메모</span><textarea name="note" maxlength="160" rows="3" placeholder="보고서에 남길 내용을 입력하세요.">${html(settings.note)}</textarea></label></details>
    <p id="form-error" role="alert"></p><button class="primary generate" type="submit">${icon("fileplus")}레포트 생성${icon("arrow")}</button><p class="save-hint">${icon("archive")}생성한 문서는 보관함에 저장됩니다.</p></div>
  </form><section class="preview" aria-label="문서 미리보기">${toolbar("preview")}<div class="paper-scroll" id="preview-scroll" tabindex="0" aria-label="레포트 미리보기 문서"></div></section></div>`;
  refreshPreview();
}
function refreshPreview(){
  const invalid=settingsError(settings),box=$("#preview-scroll");
  $("#form-error").textContent=invalid;
  $("#config [name=day]").min=settings.type==="daily"?FIRST_DAY:shiftDay(FIRST_DAY,6);
  $("#period-hint").textContent=settings.type==="daily"?"가상 자료 기간  2026.10.26 – 11.09":invalid?"기준일까지 최근 7일을 집계합니다.":`집계 기간  ${shortDate(shiftDay(settings.day,-6))} – ${shortDate(settings.day)}`;
  $(".generate").disabled=Boolean(invalid);
  $('[data-action="expand"]',work).disabled=Boolean(invalid);
  for(const control of work.querySelectorAll(".zoom-tools button"))control.disabled=Boolean(invalid);
  if(invalid){$(".scale",work).textContent="—";box.innerHTML=`<p class="empty-text">보고 기준일을 선택하면 문서를 미리 볼 수 있습니다.</p>`;currentReport=null;return;}
  currentReport=buildReport(settings,events());mountPaper(box,currentReport,null,"preview");
}
function openReader(report,issue){
  currentRead={report,issue};
  $("#reader-kind").textContent=issue?`${issue.code} · 발행 문서`:"미발행 · 미리보기";
  $("#reader-title").textContent=titleOf(report);
  $("#reader-tools").innerHTML=`${toolbar("reader")}<div class="reader-actions">${issue?`<span>${storageAvailable?"보관함에 저장됨":"현재 탭에 저장됨"} · ${html(issue.at)} (UTC+8)</span><div class="action-group"><button class="plain-btn" data-action="csv">${icon("down")}근거 CSV</button><button class="primary compact" data-action="print">${icon("print")}인쇄 / PDF</button></div>`:`<span>설정한 내용이 반영된 문서입니다.</span><button class="primary compact" data-action="issue">${icon("fileplus")}레포트 생성</button>`}</div>`;
  if(!reader.open)reader.showModal();
  $("#reader-scroll").scrollTo(0,0);
  mountPaper($("#reader-scroll"),report,issue,"reader");
}
function issueReport(){
  if(settingsError(settings))return;
  const report=buildReport(settings,events());
  const duplicate=reports().find(entry=>JSON.stringify(entry.report)===JSON.stringify(report));
  if(duplicate){openReader(duplicate.report,duplicate);notice("같은 내용으로 발행한 문서를 열었습니다.");return;}
  const id=uid(),at=timeStamp(),issue={id,issued:Date.now(),at,code:`HC-${settings.day.replaceAll("-","").slice(2)}-${id.slice(0,5).toUpperCase()}`,report};
  saveRecord("report/",issue);openReader(report,issue);
}
function exportCSV(report){
  const link=document.createElement("a"),url=URL.createObjectURL(new Blob([csvText(report)],{type:"text/csv;charset=utf-8"}));
  link.href=url;link.download=`HelioCone_${report.settings.site}_${report.settings.type}_${report.settings.day}.csv`;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function archive(){
  const kept=reports().reverse();
  work.innerHTML=`<section class="ledger"><div class="ledger-heading"><h2>발행 문서 <strong>${kept.length}</strong></h2><button class="primary compact" data-action="new">${icon("fileplus")}새 레포트</button></div>${kept.length?`<div class="archive-list">${kept.map(v=>`<div class="archive-row"><div class="file-mark">${icon("document")}</div><div><small>${html(v.code)}</small><h3>${titleOf(v.report)} <span>· ${scopeName(v.report.settings.site)}</span></h3><p>${periodOf(v.report)} <span> / </span> 발행 ${html(v.at)} (UTC+8)</p></div><button class="plain-btn" data-open="${html(v.id)}">문서 열기 ${icon("arrow")}</button></div>`).join("")}</div>`:`<div class="empty-state">${icon("archive")}<h3>아직 발행한 레포트가 없습니다.</h3><p>레포트 작업실에서 문서를 생성하면 이곳에 보관됩니다.</p></div>`}</section>`;
}
function latestInspection(){return events().at(-1)??null;}
function emptyInspection(){return {owner:"",memo:"",nextCheck:"",checks:[false,false,false]};}
function inspector(){
  const latest=latestInspection(),draft=draftInspection??latest??emptyInspection();
  return `<section class="ledger inspection" id="inspector"><div class="ledger-heading"><div><p class="eyebrow">B 현장 · 해솔 발전소</p><h2>수신 상태 점검</h2></div><button class="icon-btn" data-action="close-detail" aria-label="점검 닫기">${icon("close")}</button></div>
    <div class="inspection-body"><div><p class="condition">입력 수신 07:15 · 예측 기준 08:00 · 예측 보류</p><p class="muted">점검을 완료해도 데이터 수신 상태는 별도로 표시됩니다.</p>
    <h3>확인 목록</h3>${CHECKS.map((v,i)=>`<label class="checkline"><input type="checkbox" data-check="${i}" ${draft.checks[i]?"checked":""}>${v}</label>`).join("")}</div>
    <form id="inspection-form"><label class="field">담당자<select id="owner" required><option value="">담당자를 선택하세요</option>${["운영 담당 A","운영 담당 B","운영 담당 C"].map(v=>`<option ${draft.owner===v?"selected":""}>${v}</option>`).join("")}</select></label>
    <label class="field">조치 메모<textarea id="inspection-note" rows="3" maxlength="160" placeholder="이번 점검에서 확인하고 조치한 내용을 기록하세요.">${html(draft.memo)}</textarea></label>
    <label class="field">다음 확인 사항 <small>(선택)</small><input type="text" id="next-check" maxlength="100" aria-describedby="next-check-hint" placeholder="예: 07:15 이후 데이터 재수신 여부 확인" value="${html(draft.nextCheck)}"></label>
    <p id="next-check-hint" class="hint">저장하면 레포트 첫머리에 담당자와 함께 표시됩니다.</p><p id="inspection-error" role="alert"></p>
    <div class="action-group">${latest?.status==="점검 기록 완료"?"":`<button class="plain-btn" type="button" data-action="start-inspection">${latest?"진행 내용 저장":"점검 시작"}</button>`}<button class="primary compact" type="submit">점검 기록 완료</button></div></form></div>
    ${latest?`<div class="inspection-result"><div><b>${html(latest.owner)} · ${html(latest.status)}</b><p>${html(latest.memo||"조치 메모 미입력")} · ${html(latest.at)} (UTC+8)</p><p>다음 확인 사항 · ${html(latest.nextCheck||"미입력")}</p></div><button class="plain-btn" data-site-report="B">점검 레포트 작성 ${icon("arrow")}</button></div>`:""}</section>`;
}
function siteDetail(site){
  const report=buildReport({...DEFAULT_SETTINGS,site},[]);
  return `<section class="ledger" id="site-detail"><div class="ledger-heading"><div><p class="eyebrow">${scopeName(site)}</p><h2>일사량 상세</h2></div><button class="icon-btn" data-action="close-detail" aria-label="상세 닫기">${icon("close")}</button></div>
    <div class="detail-body"><div class="detail-meta"><span>2026.11.09 · 입력 수신 07:55 · 예측 기준 08:00 (UTC+8)</span>${legend()}</div>${chart(report.series)}<table class="doc-table"><thead><tr><th>대상 시각</th><th>관측 GHI (W/m²)</th><th>예측 GHI (W/m²)</th><th>상태</th></tr></thead><tbody>${report.rows.map(r=>`<tr><td>${r.hour}</td><td>${numberText(r.observed)}</td><td>${numberText(r.predicted)}</td><td>${r.state}</td></tr>`).join("")}</tbody></table><button class="primary compact" data-site-report="${site}">이 현장 레포트 작성 ${icon("arrow")}</button></div></section>`;
}
function sites(){
  const latest=latestInspection();
  const keys=shownSites==="need"?["B","A"]:["B","A","C"];
  work.innerHTML=`<section class="ledger"><div class="ledger-heading"><h2>발전소 현황</h2><span class="muted">2026.11.09 · UTC+8</span></div><div class="site-filters">${[["all","전체 3"],["need","확인 필요 2"]].map(([value,label])=>`<button class="plain-btn" data-filter="${value}" aria-pressed="${shownSites===value}">${label}</button>`).join("")}</div><div class="site-list">${keys.map(key=>`<div class="site-row"><div class="site-id">${key}</div><div><strong>${SITES[key].name}</strong><p>${SITES[key].detail}</p></div><div><span class="status ${key}">${SITES[key].label}</span><p>${key==="B"?`${html(latest?.owner||"담당자 미지정")} · ${html(latest?.status||"미처리")}`:SITES[key].owner}</p></div><button class="plain-btn" data-detail="${key}">${key==="B"?"수신 상태 점검":"예측 상세 보기"} ${icon("arrow")}</button></div>`).join("")}</div></section>${inspectorOpen?inspector():detailSite?siteDetail(detailSite):""}`;
}
function readDraft(){
  if(!$("#inspection-form"))return;
  draftInspection={owner:$("#owner").value,memo:$("#inspection-note").value,nextCheck:$("#next-check").value,checks:[...document.querySelectorAll("[data-check]")].map(c=>c.checked)};
}
function saveInspection(status){
  readDraft();const d=draftInspection;
  let message="",focus="";
  if(!d.owner){message="담당자를 먼저 선택하세요.";focus="#owner";}
  else if(status==="점검 기록 완료"&&!d.checks.every(Boolean)){message="확인하지 않은 점검 항목이 있습니다.";focus="[data-check]:not(:checked)";}
  else if(status==="점검 기록 완료"&&!d.memo.trim()){message="완료 전에 조치 내용을 기록하세요.";focus="#inspection-note";}
  if(message){$("#inspection-error").textContent=message;$(focus).focus();return;}
  const latest=latestInspection();
  const memo=d.memo.trim(),nextCheck=d.nextCheck.trim();
  if(latest && latest.status===status && latest.owner===d.owner && latest.memo===memo && (latest.nextCheck??"")===nextCheck && latest.checks.every((v,i)=>v===d.checks[i])){notice("같은 내용의 점검 기록이 이미 있습니다.");return;}
  saveRecord("event/",{...d,memo,nextCheck,status,id:uid(),at:timeStamp(),issued:Date.now(),day:LAST_DAY});
  draftInspection=null;sites();notice(storageAvailable?"점검 기록을 저장했습니다.":"현재 탭에 점검 기록을 저장했습니다.");
  $(".inspection-result").scrollIntoView({block:"nearest"});
}
function renderRoute(){
  const page=location.hash.slice(1),view=["studio","sites","archive"].includes(page)?page:"studio";
  readDraft();observer.disconnect();currentView=view;
  const meta={studio:["OPERATIONS / REPORT DESK","레포트 작업실","현장의 일사량과 점검 기록을 한 장의 운영 레포트로 정리하세요."],
    sites:["OPERATIONS / FIELD MONITOR","현장 현황","확인이 필요한 발전소를 살펴보고 담당자와 조치 내용을 기록하세요."],
    archive:["OPERATIONS / ARCHIVE","레포트 보관함","이 브라우저에서 발행한 레포트를 다시 열거나 인쇄할 수 있습니다."]}[view];
  $("#eyebrow").textContent=meta[0];$("#page-title").textContent=meta[1];$("#intro").textContent=meta[2];document.title=`HelioCone · ${meta[1]}`;
  document.querySelectorAll("[data-nav]").forEach(el=>{if(el.dataset.nav===view)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current");});
  ({studio,sites,archive})[view]();
}
function go(view){if(location.hash===`#${view}`)renderRoute();else location.hash=view;}
document.addEventListener("input",e=>{
  const field=e.target;
  if(field.closest("#config")){
    settings[field.name]=field.type==="checkbox"?field.checked:field.value;
    refreshPreview();
  }else if(field.closest("#inspector"))readDraft();
});
document.addEventListener("submit",e=>{
  e.preventDefault();
  if(e.target.id==="config")issueReport();
  if(e.target.id==="inspection-form")saveInspection("점검 기록 완료");
});
document.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b || b.disabled)return;
  const {action,mode,filter,detail,siteReport,open}=b.dataset;
  if(b.id==="close-reader"){reader.close();return;}
  if(["fit","larger","smaller"].includes(action)){
    const current=Number($(".scale",mode==="reader"?$("#reader-tools"):work).dataset.percent);
    zoom[mode]=action==="fit"?"fit":action==="larger"?zoomSteps.find(v=>v>current)??200:zoomSteps.filter(v=>v<current).at(-1)??25;
    resizePaper(mode);return;
  }
  if(action==="expand"&&currentReport){zoom.reader=100;openReader(currentReport,null);}
  if(action==="issue")issueReport();
  if(action==="csv"&&currentRead?.issue)exportCSV(currentRead.report);
  if(action==="print"&&currentRead?.issue){window.print();}
  if(action==="new"){settings={...DEFAULT_SETTINGS};zoom.preview="auto";go("studio");}
  if(open){const entry=reports().find(v=>v.id===open);if(entry){zoom.reader=100;openReader(entry.report,entry);}}
  if(filter){readDraft();shownSites=filter;sites();}
  if(detail){readDraft();inspectorOpen=detail==="B";detailSite=inspectorOpen?null:detail;sites();const panel=$("#inspector")||$("#site-detail");panel.scrollIntoView({block:"start"});$("button",panel).focus({preventScroll:true});}
  if(action==="close-detail"){readDraft();const key=inspectorOpen?"B":detailSite;inspectorOpen=false;detailSite=null;sites();$(`[data-detail="${key}"]`)?.focus();}
  if(action==="start-inspection")saveInspection("확인 중");
  if(siteReport){settings={...DEFAULT_SETTINGS,site:siteReport};zoom.preview="auto";go("studio");}
});
reader.addEventListener("close",()=>{
  currentRead=null;
  $("#reader-scroll").replaceChildren();
  $("#reader-tools").replaceChildren();
});
window.addEventListener("beforeprint",()=>{
  const report=currentRead?.report??(currentView==="studio"?currentReport:null);
  document.body.classList.toggle("printing-report",Boolean(report));
  $("#print-document").innerHTML=report?paper(report,currentRead?.issue):"";
});
window.addEventListener("afterprint",()=>{document.body.classList.remove("printing-report");$("#print-document").innerHTML="";});
window.addEventListener("hashchange",()=>{if(reader.open)reader.close();renderRoute();window.scrollTo(0,0);$("#content").focus({preventScroll:true});});
window.addEventListener("storage",e=>{
  if(e.key&&!e.key.startsWith(STORAGE))return;
  if(currentView==="archive")archive();
  else if(currentView==="studio")refreshPreview();
  else{readDraft();sites();}
});
storageWarning();renderRoute();
