import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./lib/supabase";
import { calculateDemand, type DataRow, type Station } from "./domain/election";

type District={id:string;name:string;code:string};
type StationRow={id:string;tehsil_id:string|null;ps_number:string|null;nc_vc_ps_number:string|null;tehsil_ps_number:number|null;name:string;station_type:string|null;male_booths:number|null;female_booths:number|null;male_voters:number|null;female_voters:number|null;source_data:DataRow};
const required=["Tehsil","Council Type (NC / VC)","Council No","PS No","PS Type (Male / Female / Combined)","Census Block Code"];
const chunkSize=20;

export default function App(){
 const [session,setSession]=useState<any>(null),[email,setEmail]=useState(""),[districts,setDistricts]=useState<District[]>([]),[districtId,setDistrictId]=useState(""),[section,setSection]=useState("Overview");
 const [rows,setRows]=useState<DataRow[]>([]),[stations,setStations]=useState<StationRow[]>([]),[counts,setCounts]=useState({tehsils:0,stations:0,blocks:0,allocations:0});
 const [notice,setNotice]=useState("Connecting to Supabase…"),[busy,setBusy]=useState(false),[issues,setIssues]=useState<string[]>([]);
 const input=useRef<HTMLInputElement>(null);
 const activeDistrict=districts.find(d=>d.id===districtId);
 const calculated=useMemo(()=>calculateDemand(stations.map((s,i):Station=>{const d=s.source_data||{};const tn=Number(s.tehsil_ps_number)||i+1;const cn=Number(s.nc_vc_ps_number||s.ps_number)||i+1;return {sNo:i+1,district:String(d.District??""),tehsil:String(d.Tehsil??""),councilType:String(d["Council Type (NC / VC)"]??""),councilNo:String(d["Council No"]??""),councilName:String(d["Council Name"]??""),psNo:String(s.nc_vc_ps_number||s.ps_number||""),sourceTehsilPsNo:String(d["Tehsil PS No"]??""),sourceNcVcPsNo:String(d["NC/VC PS No"]??""),stationName:s.name,psType:s.station_type||String(d["PS Type (Male / Female / Combined)"]??""),boothsMale:Number(s.male_booths??0),boothsFemale:Number(s.female_booths??0),maleVoters:Number(s.male_voters??0),femaleVoters:Number(s.female_voters??0),blockCount:0,blocks:[],tehsilStationNo:tn,ncVcStationNo:cn,tehsilPollingStationNo:tn,ncVcPollingStationNo:cn};})),[stations]);
 const demand=calculated.reduce((n,s)=>n+s.totalDemand,0);
 const maleVoterTotal=stations.reduce((n,s)=>n+Number(s.male_voters||0),0);
 const femaleVoterTotal=stations.reduce((n,s)=>n+Number(s.female_voters||0),0);
 const totalVoterTotal=maleVoterTotal+femaleVoterTotal;
 const tehsilOrder=useMemo(()=>[...new Set(stations.map(s=>String(s.source_data?.Tehsil??"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"})),[stations]);
 const sortedStations=useMemo(()=>[...stations].sort((a,b)=>{
  const ad=a.source_data||{},bd=b.source_data||{};
  const at=String(ad.Tehsil??""),bt=String(bd.Tehsil??"");
  const tehsilCompare=at.localeCompare(bt,undefined,{numeric:true,sensitivity:"base"});
  if(tehsilCompare)return tehsilCompare;
  const n=(v:unknown)=>{const x=Number(String(v??"").replace(/,/g,""));return Number.isFinite(x)?x:Number.MAX_SAFE_INTEGER;};
  const tehsilNoCompare=n(a.tehsil_ps_number)-n(b.tehsil_ps_number);
  if(tehsilNoCompare)return tehsilNoCompare;
  const councilTypeCompare=String(ad["Council Type (NC / VC)"]??"").localeCompare(String(bd["Council Type (NC / VC)"]??""),undefined,{numeric:true,sensitivity:"base"});
  if(councilTypeCompare)return councilTypeCompare;
  const councilCompare=String(ad["Council No"]??"").localeCompare(String(bd["Council No"]??""),undefined,{numeric:true,sensitivity:"base"});
  if(councilCompare)return councilCompare;
  return String(a.nc_vc_ps_number??a.ps_number??"").localeCompare(String(b.nc_vc_ps_number??b.ps_number??""),undefined,{numeric:true,sensitivity:"base"});
 }),[stations]);

 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>subscription.unsubscribe();},[]);
 useEffect(()=>{if(session)loadDistricts();},[session]);
 useEffect(()=>{if(session&&districtId)loadDistrictData();},[session,districtId]);
 async function loadDistricts(){const {data,error}=await supabase.from("districts").select("id,name,code").eq("is_active",true).order("name");if(error){setNotice("District access error: "+error.message);return;}setDistricts(data||[]);if(!districtId&&data?.length)setDistrictId(data.find(d=>d.name==="Kohat")?.id||data[0].id);}
 async function loadDistrictData(){
  setNotice("Loading district records from Supabase…");
  const [t,c,s,b,a]=await Promise.all([
   supabase.from("election_tehsils").select("id",{count:"exact",head:true}).eq("district_id",districtId),
   supabase.from("election_councils").select("id",{count:"exact",head:true}).eq("district_id",districtId),
   supabase.from("polling_stations").select("id,tehsil_id,ps_number,nc_vc_ps_number,tehsil_ps_number,name,station_type,male_booths,female_booths,male_voters,female_voters,source_data",{count:"exact"}).eq("district_id",districtId).limit(2000),
   supabase.from("census_blocks").select("id,source_data",{count:"exact"}).eq("district_id",districtId).limit(5000),
   supabase.from("block_station_allocations").select("id",{count:"exact",head:true}).eq("district_id",districtId)
  ]);
  const err=[t.error,c.error,s.error,b.error,a.error].find(Boolean);if(err){setNotice("Could not load district data: "+err.message);return;}
  setStations((s.data||[]) as StationRow[]);
  setRows((b.data||[]).map(x=>x.source_data as DataRow).filter(Boolean));
  setCounts({tehsils:t.count||0,stations:s.count||0,blocks:b.count||0,allocations:a.count||0});
  setNotice("Connected to Supabase · "+(activeDistrict?.name||"District")+" data loaded from PostgreSQL.");
 }
 function downloadTemplate(){const headers=["District","Tehsil No","Tehsil","Tehsil PS No","NC/VC No","Council Type (NC / VC)","Council Name","NC/VC PS No","PS No","No & Name of Polling Station","PS Type (Male / Female / Combined)","Booths Male","Booths Female","Male Voters (block)","Female Voters (block)","Census Block Code","Electoral Area name"];const ws=XLSX.utils.aoa_to_sheet([headers]);ws["!cols"]=headers.map(h=>({wch:Math.max(16,h.length+2)}));const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,ws,"DATA Template");XLSX.writeFile(book,"KPK_Election_DATA_Template.xlsx");}
 async function sendLogin(){if(!email.trim()){setNotice("Enter your account email first.");return;}setBusy(true);const {error}=await supabase.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:new URL(import.meta.env.BASE_URL,window.location.origin).toString()}});setNotice(error?"Sign-in error: "+error.message:"A secure sign-in link has been sent to "+email+". Open it on this device.");setBusy(false);}
 async function uploadBatchWithSplit(part:DataRow[],startRow:number):Promise<number>{
  const {data,error}=await supabase.rpc("import_district_data_rows",{p_district_id:districtId,p_rows:part});
  if(!error)return part.length;
  const message=error.message||"Database import failed";
  const timedOut=/statement timeout|timeout|canceling statement/i.test(message);
  if(timedOut&&part.length>1){
   const middle=Math.ceil(part.length/2);
   setNotice("A database batch was slow. Automatically splitting rows "+(startRow+1)+"–"+(startRow+part.length)+" into smaller safe batches…");
   const first=await uploadBatchWithSplit(part.slice(0,middle),startRow);
   const second=await uploadBatchWithSplit(part.slice(middle),startRow+middle);
   return first+second;
  }
  throw new Error("Rows "+(startRow+1)+"–"+(startRow+part.length)+" failed: "+message);
 }
 async function importData(file?:File){
  if(!file||!districtId)return;setBusy(true);setIssues([]);setNotice("Reading "+file.name+"…");
  try{
   const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});const sheet=wb.Sheets[wb.SheetNames[0]];const parsed=XLSX.utils.sheet_to_json<DataRow>(sheet,{defval:""}).map((r,i)=>({...r,__import_order:i+2}));
   if(!parsed.length)throw new Error("The first worksheet has no data rows.");
   const headers=Object.keys(parsed[0]);const missing=required.filter(x=>!headers.includes(x));if(missing.length)throw new Error("Required columns missing: "+missing.join(", "));
   const problems:string[]=[];parsed.forEach((r,i)=>{if(!String(r.Tehsil||"").trim())problems.push("Row "+(i+2)+": Tehsil is blank");if(!String(r["No & Name of Polling Station"]||"").trim())problems.push("Row "+(i+2)+": polling station name is blank");if(!String(r["Census Block Code"]||"").trim())problems.push("Row "+(i+2)+": Census Block Code is blank");});
   setIssues(problems.slice(0,300));let sent=0;
   for(let i=0;i<parsed.length;i+=chunkSize){
    const part=parsed.slice(i,i+chunkSize);setNotice("Uploading DATA rows "+(i+1).toLocaleString()+"–"+Math.min(i+part.length,parsed.length).toLocaleString()+" of "+parsed.length.toLocaleString()+"…");
    sent+=await uploadBatchWithSplit(part,i);
   }
   const numbering=await supabase.rpc("refresh_polling_station_numbers",{p_district_id:districtId});if(numbering.error)throw new Error("DATA imported, but polling-station numbering could not be refreshed: "+numbering.error.message);setRows(parsed);await loadDistrictData();setNotice("DATA import completed: "+sent.toLocaleString()+" source rows sent to Supabase in "+Math.ceil(sent/chunkSize)+" batches. "+problems.length+" row issues flagged for review.");
   setSection("Overview");
  }catch(e){setNotice("Import stopped: "+(e instanceof Error?e.message:String(e))+" Data already committed in earlier batches, if any. Re-upload is safe because the database import uses district/source keys.");}
  finally{setBusy(false);if(input.current)input.current.value="";}
 }

 const dashboard=useMemo(()=>{
  const sum=(items:any[],key:string):number=>items.reduce((n:number,x:any)=>n+Number(x[key]||0),0);
  const councils=new Set(stations.map(s=>[String(s.source_data?.Tehsil??"").trim(),String(s.source_data?.["Council Type (NC / VC)"]??"").trim(),String(s.source_data?.["Council No"]??"").trim(),String(s.source_data?.["Council Name"]??"").trim()].join("|")));
  const tehsilMap=new Map<string,{name:string;stations:number;blocks:number;maleVoters:number;femaleVoters:number;maleBooths:number;femaleBooths:number;councils:Set<string>;demand:number;presMale:number;presFemale:number;srapoMale:number;srapoFemale:number;apoMale:number;apoFemale:number;poMale:number;poFemale:number}>();
  for(const s of stations){
   const name=String(s.source_data?.Tehsil??"").trim()||"Unspecified";
   if(!tehsilMap.has(name))tehsilMap.set(name,{name,stations:0,blocks:0,maleVoters:0,femaleVoters:0,maleBooths:0,femaleBooths:0,councils:new Set(),demand:0,presMale:0,presFemale:0,srapoMale:0,srapoFemale:0,apoMale:0,apoFemale:0,poMale:0,poFemale:0});
   const t=tehsilMap.get(name)!;t.stations++;t.maleVoters+=Number(s.male_voters||0);t.femaleVoters+=Number(s.female_voters||0);t.maleBooths+=Number(s.male_booths||0);t.femaleBooths+=Number(s.female_booths||0);
   t.councils.add([String(s.source_data?.["Council Type (NC / VC)"]??""),String(s.source_data?.["Council No"]??""),String(s.source_data?.["Council Name"]??"")].join("|"));
  }
  for(const r of rows){const name=String(r.Tehsil??"").trim()||"Unspecified";const t=tehsilMap.get(name);if(t)t.blocks++;}
  for(const d of calculated){const t=tehsilMap.get(d.tehsil||"Unspecified");if(!t)continue;for(const k of ["presMale","presFemale","srapoMale","srapoFemale","apoMale","apoFemale","poMale","poFemale"] as const)t[k]+=Number(d[k]||0);t.demand+=Number(d.totalDemand||0);}
  const tehsils=[...tehsilMap.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:"base"}));
  const maleVoters=sum(stations,"male_voters"),femaleVoters=sum(stations,"female_voters"),maleBooths=sum(stations,"male_booths"),femaleBooths=sum(stations,"female_booths");
  const dataIssues=rows.filter(r=>!String(r.Tehsil??"").trim()||!String(r["Council Name"]??"").trim()||!String(r["Census Block Code"]??"").trim()).length;
  const maleStations=stations.filter(s=>s.station_type==="Male").length,femaleStations=stations.filter(s=>s.station_type==="Female").length,combinedStations=stations.filter(s=>s.station_type==="Combined").length;
  const demandKeys=["presMale","presFemale","srapoMale","srapoFemale","apoMale","apoFemale","poMale","poFemale"] as const;
  const demandTotal=calculated.reduce((n,s)=>n+Number(s.totalDemand||0),0);
  const roleTotals=[{label:"Presiding Officer",male:sum(calculated,"presMale"),female:sum(calculated,"presFemale")},{label:"Senior APO",male:sum(calculated,"srapoMale"),female:sum(calculated,"srapoFemale")},{label:"APO",male:sum(calculated,"apoMale"),female:sum(calculated,"apoFemale")},{label:"Polling Officer",male:sum(calculated,"poMale"),female:sum(calculated,"poFemale")}];
  return {tehsils,councils:councils.size,maleVoters,femaleVoters,totalVoters:maleVoters+femaleVoters,maleBooths,femaleBooths,totalBooths:maleBooths+femaleBooths,demandTotal,roleTotals,dataIssues,maleStations,femaleStations,combinedStations};
 },[stations,rows,calculated]);

 const councilSummary=useMemo(()=>{
  const map=new Map<string,{type:string;number:string;name:string;tehsil:string;stations:number;blocks:number;maleVoters:number;femaleVoters:number;maleBooths:number;femaleBooths:number}>();
  const keyOf=(d:DataRow)=>[String(d.Tehsil??"").trim(),String(d["Council Type (NC / VC)"]??"").trim().toUpperCase(),String(d["Council No"]??"").trim()].join("|");
  for(const s of stations){
   const d=s.source_data||{},key=keyOf(d);
   if(!map.has(key))map.set(key,{type:String(d["Council Type (NC / VC)"]??"Unspecified"),number:String(d["NC/VC No"]??d["Council No"]??"—"),name:String(d["Council Name"]??"Name not supplied"),tehsil:String(d.Tehsil??"Unspecified"),stations:0,blocks:0,maleVoters:0,femaleVoters:0,maleBooths:0,femaleBooths:0});
   const c=map.get(key)!;c.stations++;c.maleVoters+=Number(s.male_voters||0);c.femaleVoters+=Number(s.female_voters||0);c.maleBooths+=Number(s.male_booths||0);c.femaleBooths+=Number(s.female_booths||0);
  }
  for(const r of rows){const key=keyOf(r),c=map.get(key);if(c)c.blocks++;}
  return [...map.values()].sort((a,b)=>a.tehsil.localeCompare(b.tehsil,undefined,{numeric:true})||a.type.localeCompare(b.type)||a.number.localeCompare(b.number,undefined,{numeric:true}));
 },[stations,rows]);
 const reserveSummary=useMemo(()=>{
  const sum=(key:string)=>calculated.reduce((n,s)=>n+Number((s as any)[key]||0),0);
  const categories=[
   {label:"Presiding + Senior APO",duty:sum("presMale")+sum("presFemale")+sum("srapoMale")+sum("srapoFemale")},
   {label:"APOs",duty:sum("apoMale")+sum("apoFemale")},
   {label:"Polling Officers",duty:sum("poMale")+sum("poFemale")},
   {label:"Naib Qasid",duty:sum("nqMale")+sum("nqFemale")}
  ].map(x=>({...x,reserve:Math.ceil(x.duty*0.05),training:x.duty+Math.ceil(x.duty*0.05)}));
  return {categories,totalDuty:categories.reduce((n,x)=>n+x.duty,0),totalReserve:categories.reduce((n,x)=>n+x.reserve,0),totalTraining:categories.reduce((n,x)=>n+x.training,0)};
 },[calculated]);
 const dataQuality=useMemo(()=>{
  const missing=(key:string)=>rows.filter(r=>!String(r[key]??"").trim()).length;
  const stationMissingName=stations.filter(s=>!String(s.name??"").trim()).length;
  return {missingTehsil:missing("Tehsil"),missingCouncilType:missing("Council Type (NC / VC)"),missingCouncilNo:missing("Council No"),missingCouncilName:missing("Council Name"),missingBlockCode:missing("Census Block Code"),missingStationName:stationMissingName,missingStationType:stations.filter(s=>!String(s.station_type??"").trim()).length,missingVoterValues:rows.filter(r=>String(r["Male Voters (block)"]??"").trim()===""||String(r["Female Voters (block)"]??"").trim()==="").length};
 },[rows,stations]);
 const stationTypeCounts={male:stations.filter(s=>String(s.station_type||s.source_data?.["PS Type (Male / Female / Combined)"]||"").toLowerCase()==="male").length,female:stations.filter(s=>String(s.station_type||s.source_data?.["PS Type (Male / Female / Combined)"]||"").toLowerCase()==="female").length,combined:stations.filter(s=>String(s.station_type||s.source_data?.["PS Type (Male / Female / Combined)"]||"").toLowerCase()==="combined").length};
 const showDemand=rows.length?demand:0;
 if(!session)return <div className="auth-screen"><div className="auth-card"><div className="brand-mark">E</div><h1>KPK Election EMS</h1><p>Secure district access · Supabase cloud database</p><label>Email address<input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Your authorized account email"/></label><button className="btn primary" disabled={busy} onClick={sendLogin}>{busy?"Sending…":"Send secure sign-in link"}</button><small>Only authorized EMS accounts can access district records.</small><div className="notice">{notice}</div></div></div>;
 return <div className="app"><aside className="sidebar"><div className="brand"><div className="brand-mark">E</div><div><b>KPK Election</b><small>Management System</small></div></div><div className="district-label">ACTIVE WORKSPACE</div><select className="district-select" value={districtId} onChange={e=>setDistrictId(e.target.value)}>{districts.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><nav>{["Overview","DATA Import","Polling Stations","Staff Demand","Relations Check"].map(s=><button key={s} className={section===s?"nav active":"nav"} onClick={()=>setSection(s)}>{s}</button>)}</nav><div className="side-foot"><span className="dot"></span> Supabase connected<small>{session.user.email}</small><button className="signout" onClick={()=>supabase.auth.signOut()}>Sign out</button></div></aside>
 <main className="main"><header><div><div className="eyebrow">ELECTION OPERATIONS / CLOUD DATABASE</div><h1>{section}</h1></div><div className="header-actions"><span className="local-pill">POSTGRESQL LIVE</span><button className="btn light" onClick={loadDistrictData}>Refresh data</button></div></header><div className="notice">{notice}</div>
 {section==="Overview"&&<><div className="welcome"><div><div className="eyebrow pale">DISTRICT ELECTION DASHBOARD</div><h2>{activeDistrict?.name||"Select district"}</h2><p>Live summaries calculated from the district's polling-station and census-block records.</p><p className="hint">Staffing assignments, reserves and training attendance will be activated after verified staff/trainer/venue imports.</p></div><button className="btn white" onClick={()=>setSection("DATA Import")}>Manage primary DATA →</button></div>
 <div className="dash-section-title"><h2>Election overview</h2><span>Live PostgreSQL figures</span></div>
 <div className="cards dash-kpis"><Metric label="POLLING STATIONS" value={stations.length}/><Metric label="NC / VC COUNCILS" value={dashboard.councils}/><Metric label="CENSUS BLOCKS" value={rows.length}/><Metric label="TEHSILS" value={dashboard.tehsils.length}/><Metric label="REGISTERED VOTERS" value={dashboard.totalVoters}/><Metric label="MALE VOTERS" value={dashboard.maleVoters}/><Metric label="FEMALE VOTERS" value={dashboard.femaleVoters}/><Metric label="TOTAL BOOTHS" value={dashboard.totalBooths}/><Metric label="MALE BOOTHS" value={dashboard.maleBooths}/><Metric label="FEMALE BOOTHS" value={dashboard.femaleBooths}/><Metric label="REQUIRED STAFF POSTS" value={dashboard.demandTotal}/><Metric label="DATA ROWS NEEDING REVIEW" value={dashboard.dataIssues}/></div>
 <div className="dash-grid"><div className="panel dash-wide"><div className="panel-head"><div><h3>Tehsil-wise election summary</h3><p>Stations, councils, blocks, voters, booths and calculated staffing demand</p></div></div><div className="table-wrap"><table><thead><tr><th>Tehsil</th><th>Stations</th><th>Councils</th><th>Blocks</th><th>Male voters</th><th>Female voters</th><th>Total voters</th><th>Male booths</th><th>Female booths</th><th>Required staff</th></tr></thead><tbody>{dashboard.tehsils.map(t=><tr key={t.name}><td><b>{t.name}</b></td><td>{t.stations}</td><td>{t.councils.size}</td><td>{t.blocks}</td><td>{t.maleVoters.toLocaleString()}</td><td>{t.femaleVoters.toLocaleString()}</td><td><b>{(t.maleVoters+t.femaleVoters).toLocaleString()}</b></td><td>{t.maleBooths}</td><td>{t.femaleBooths}</td><td>{t.demand.toLocaleString()}</td></tr>)}</tbody></table></div></div>
 <div className="panel"><h3>Polling station types</h3><p>Distribution by station classification</p><div className="dash-stat"><span>Male only</span><b>{dashboard.maleStations}</b></div><div className="dash-stat"><span>Female only</span><b>{dashboard.femaleStations}</b></div><div className="dash-stat"><span>Combined</span><b>{dashboard.combinedStations}</b></div><div className="dash-stat total"><span>Total stations</span><b>{stations.length}</b></div></div>
 <div className="panel"><h3>Staffing demand by role and gender</h3><p>Demand calculated using the current audited election rules</p><div className="table-wrap"><table><thead><tr><th>Role</th><th>Male</th><th>Female</th><th>Total</th></tr></thead><tbody>{dashboard.roleTotals.map(r=><tr key={r.label}><td>{r.label}</td><td>{r.male.toLocaleString()}</td><td>{r.female.toLocaleString()}</td><td><b>{(r.male+r.female).toLocaleString()}</b></td></tr>)}</tbody></table></div><div className="dash-note">Staff roster not yet imported: assigned posts and vacancies are not calculated from an empty staff table.</div></div>
 <div className="panel"><h3>Data completeness</h3><p>Informational checks only; imported source records are not discarded.</p><div className="dash-stat"><span>Census block records</span><b>{rows.length.toLocaleString()}</b></div><div className="dash-stat"><span>Polling station records</span><b>{stations.length.toLocaleString()}</b></div><div className="dash-stat"><span>Rows missing tehsil / council / block code</span><b>{dashboard.dataIssues.toLocaleString()}</b></div><div className="dash-note">Staff, master trainers, training venues and attendance are not available in the current normalized district database.</div></div></div>

 <div className="dash-grid">
 <div className="panel dash-wide"><div className="panel-head"><div><h3>NC / VC-wise polling station register summary</h3><p>Council type, council number and full council name are kept as separate fields</p></div></div><div className="table-wrap"><table><thead><tr><th>Tehsil</th><th>NC/VC Type</th><th>NC/VC No</th><th>NC/VC Name</th><th>Stations</th><th>Blocks</th><th>Male voters</th><th>Female voters</th><th>Total voters</th><th>Male booths</th><th>Female booths</th></tr></thead><tbody>{councilSummary.map((c,i)=><tr key={c.tehsil+"|"+c.type+"|"+c.number+"|"+i}><td>{c.tehsil}</td><td><b>{c.type}</b></td><td>{c.number}</td><td>{c.name}</td><td>{c.stations}</td><td>{c.blocks}</td><td>{c.maleVoters.toLocaleString()}</td><td>{c.femaleVoters.toLocaleString()}</td><td><b>{(c.maleVoters+c.femaleVoters).toLocaleString()}</b></td><td>{c.maleBooths}</td><td>{c.femaleBooths}</td></tr>)}</tbody></table>{!councilSummary.length&&<Empty/>}</div></div>
 <div className="panel"><h3>5% reserve and total training requirement</h3><p>Reserve is rounded up separately for each staffing category</p><div className="table-wrap"><table><thead><tr><th>Category</th><th>Duty</th><th>5% reserve</th><th>Training required</th></tr></thead><tbody>{reserveSummary.categories.map(x=><tr key={x.label}><td>{x.label}</td><td>{x.duty.toLocaleString()}</td><td>{x.reserve.toLocaleString()}</td><td><b>{x.training.toLocaleString()}</b></td></tr>)}</tbody><tfoot><tr><th>Total</th><th>{reserveSummary.totalDuty.toLocaleString()}</th><th>{reserveSummary.totalReserve.toLocaleString()}</th><th>{reserveSummary.totalTraining.toLocaleString()}</th></tr></tfoot></table></div><div className="dash-note">This is a demand-side target. It does not imply that staff have been imported, assigned or trained.</div></div>
 <div className="panel"><h3>Staffing and training data status</h3><p>Operational counts are shown only when verified source records exist</p><div className="dash-stat"><span>Staff roster</span><b>Not imported</b></div><div className="dash-stat"><span>Duty assignments / vacancies</span><b>Not yet calculated</b></div><div className="dash-stat"><span>Master trainers / venues</span><b>Not imported</b></div><div className="dash-stat"><span>Training batches / attendance</span><b>Not imported</b></div><div className="dash-note">The normalized staff, trainer, venue and attendance tables are currently empty. No artificial zero-vacancy or attendance figures are displayed.</div></div>
 <div className="panel"><h3>Data quality checks</h3><p>Missing values are counted from the imported source records</p><div className="dash-stat"><span>Missing Tehsil</span><b>{dataQuality.missingTehsil.toLocaleString()}</b></div><div className="dash-stat"><span>Missing NC/VC type</span><b>{dataQuality.missingCouncilType.toLocaleString()}</b></div><div className="dash-stat"><span>Missing NC/VC number</span><b>{dataQuality.missingCouncilNo.toLocaleString()}</b></div><div className="dash-stat"><span>Missing NC/VC name</span><b>{dataQuality.missingCouncilName.toLocaleString()}</b></div><div className="dash-stat"><span>Missing census block code</span><b>{dataQuality.missingBlockCode.toLocaleString()}</b></div><div className="dash-stat"><span>Missing station name / type</span><b>{(dataQuality.missingStationName+dataQuality.missingStationType).toLocaleString()}</b></div><div className="dash-stat"><span>Missing voter values (source rows)</span><b>{dataQuality.missingVoterValues.toLocaleString()}</b></div></div>
 <div className="panel"><h3>Polling station classification</h3><p>Male, female and combined station counts</p><div className="dash-stat"><span>Male only</span><b>{stationTypeCounts.male}</b></div><div className="dash-stat"><span>Female only</span><b>{stationTypeCounts.female}</b></div><div className="dash-stat"><span>Combined</span><b>{stationTypeCounts.combined}</b></div><div className="dash-stat total"><span>Total classified</span><b>{stationTypeCounts.male+stationTypeCounts.female+stationTypeCounts.combined}</b></div></div>
 </div>
 <div className="panel"><h3>Database relationship check</h3><p>{counts.stations===counts.allocations&&counts.blocks===counts.allocations?"The current record counts match. Verify station/block relationships for duplicate or missing links.":"Record counts differ: census blocks, allocations and polling stations require reconciliation."}</p><div className="cards"><Metric label="TEHSILS" value={counts.tehsils}/><Metric label="POLLING STATIONS" value={counts.stations}/><Metric label="CENSUS BLOCKS" value={counts.blocks}/><Metric label="BLOCK–STATION LINKS" value={counts.allocations}/></div></div></>}
 {section==="DATA Import"&&<div className="panel import-panel"><div className="upload-icon">⇧</div><h2>Upload primary polling station DATA</h2><p>Upload the district DATA Excel/CSV file. It is sent to Supabase in batches of up to 20 rows; slow batches are automatically split and linked to Tehsils, Councils, Polling Stations, Census Blocks and allocations.</p><input ref={input} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>importData(e.target.files?.[0])}/><div className="header-actions"><button className="btn light" onClick={downloadTemplate}>Download Excel Template</button><button className="btn primary" disabled={busy||!districtId} onClick={()=>input.current?.click()}>{busy?"Uploading…":"Choose DATA Excel / CSV"}</button></div><div className="hint">Required: Tehsil, Council Type, Council No, Council Name, PS No, station name/type, booths, Census Block Code and voter columns. Original row fields are retained.</div>{issues.length>0&&<div className="issue-box"><b>Rows requiring review ({issues.length}{issues.length===300?"+":""})</b>{issues.slice(0,30).map((x,i)=><div key={i}>{x}</div>)}</div>}</div>}
 {section==="Polling Stations"&&<div className="panel"><div className="panel-head"><div><h3>Polling station register</h3><p>Live records loaded from Supabase.</p></div><span className="tag">{stations.length} shown</span></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Tehsil No</th><th>Tehsil</th><th>Tehsil PS No</th><th>NC/VC Type</th><th>NC/VC No</th><th>NC/VC Name</th><th>NC/VC PS No</th><th>Polling Station</th><th>Type</th><th>Male booths</th><th>Female booths</th><th>Male voters</th><th>Female voters</th></tr></thead><tbody>{sortedStations.map((s,i)=><tr key={s.id}><td>{i+1}</td><td>{tehsilOrder.indexOf(String(s.source_data?.Tehsil??"").trim())+1}</td><td>{String(s.source_data?.Tehsil??"—")}</td><td>{String(s.tehsil_ps_number??s.source_data?.["Tehsil PS No"]??"—")}</td><td><b>{String(s.source_data?.["Council Type (NC / VC)"]??"—")}</b></td><td>{String(s.source_data?.["NC/VC No"]??s.source_data?.["Council No"]??"—")}</td><td>{String(s.source_data?.["Council Name"]??"—")}</td><td>{String(s.nc_vc_ps_number||s.source_data?.["NC/VC PS No"]||s.ps_number||"—")}</td><td>{s.name}</td><td>{s.station_type}</td><td>{s.male_booths??0}</td><td>{s.female_booths??0}</td><td>{Number(s.male_voters||0).toLocaleString()}</td><td>{Number(s.female_voters||0).toLocaleString()}</td></tr>)}</tbody></table>{!stations.length&&<Empty/>}</div></div>}
 {section==="Staff Demand"&&<div className="panel"><h3>Demand calculation</h3><p>Demand is calculated from the DATA import independently of staff availability. Upload or reload DATA to calculate the station-level demand preview.</p><Metric label="REQUIRED STAFF FROM CURRENT UPLOAD" value={showDemand}/></div>}
 {section==="Relations Check"&&<div className="panel"><h3>Database relationship checks</h3><div className="cards"><Metric label="TEHSILS" value={counts.tehsils}/><Metric label="STATIONS" value={counts.stations}/><Metric label="CENSUS BLOCKS" value={counts.blocks}/><Metric label="ALLOCATIONS" value={counts.allocations}/></div><p>{counts.stations&&counts.allocations&&counts.blocks===counts.allocations?"Relationship counts match: each imported census block has a station allocation.":"Relationship counts need review. Expected one allocation per census block; check missing or duplicate block-to-station links before relying on reports."}</p><button className="btn light" onClick={loadDistrictData}>Recheck PostgreSQL counts</button></div>}
 <footer>KPK Election Management System · Supabase PostgreSQL is the operational data store · Staff/trainer/venue imports are separate modules</footer></main></div>;
}
function Metric({label,value}:{label:string,value:number}){return <div className="metric"><div>{label}</div><strong>{value.toLocaleString()}</strong></div>}
function Empty(){return <div className="empty">No polling stations found for this district. Upload the primary DATA workbook.</div>}
