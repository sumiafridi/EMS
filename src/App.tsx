import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./lib/supabase";
import { buildStations, calculateDemand, type DataRow } from "./domain/election";

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
 const calculated=useMemo(()=>calculateDemand(buildStations(rows)),[rows]);
 const demand=calculated.reduce((n,s)=>n+s.totalDemand,0);

 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>subscription.unsubscribe();},[]);
 useEffect(()=>{if(session)loadDistricts();},[session]);
 useEffect(()=>{if(session&&districtId)loadDistrictData();},[session,districtId]);
 async function loadDistricts(){const {data,error}=await supabase.from("districts").select("id,name,code").eq("is_active",true).order("name");if(error){setNotice("District access error: "+error.message);return;}setDistricts(data||[]);if(!districtId&&data?.length)setDistrictId(data.find(d=>d.name==="Kohat")?.id||data[0].id);}
 async function loadDistrictData(){
  setNotice("Loading district records from Supabase…");
  const [t,c,s,b,a]=await Promise.all([
   supabase.from("election_tehsils").select("id",{count:"exact",head:true}).eq("district_id",districtId),
   supabase.from("election_councils").select("id",{count:"exact",head:true}).eq("district_id",districtId),
   supabase.from("polling_stations").select("id,tehsil_id,ps_number,nc_vc_ps_number,tehsil_ps_number,name,station_type,male_booths,female_booths,male_voters,female_voters,source_data",{count:"exact"}).eq("district_id",districtId).order("name").limit(2000),
   supabase.from("census_blocks").select("id,source_data",{count:"exact"}).eq("district_id",districtId).limit(5000),
   supabase.from("block_station_allocations").select("id",{count:"exact",head:true}).eq("district_id",districtId)
  ]);
  const err=[t.error,c.error,s.error,b.error,a.error].find(Boolean);if(err){setNotice("Could not load district data: "+err.message);return;}
  setStations((s.data||[]) as StationRow[]);
  setRows((b.data||[]).map(x=>x.source_data as DataRow).filter(Boolean));
  setCounts({tehsils:t.count||0,stations:s.count||0,blocks:b.count||0,allocations:a.count||0});
  setNotice("Connected to Supabase · "+(activeDistrict?.name||"District")+" data loaded from PostgreSQL.");
 }
 function downloadTemplate(){const headers=["District","Tehsil","Council Type (NC / VC)","Council No","Council Name","PS No","NC/VC PS No","Tehsil PS No","No & Name of Polling Station","PS Type (Male / Female / Combined)","Booths Male","Booths Female","Male Voters (block)","Female Voters (block)","Census Block Code","Electoral Area name"];const ws=XLSX.utils.aoa_to_sheet([headers]);ws["!cols"]=headers.map(h=>({wch:Math.max(16,h.length+2)}));const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,ws,"DATA Template");XLSX.writeFile(book,"KPK_Election_DATA_Template.xlsx");}\n async function sendLogin(){if(!email.trim()){setNotice("Enter your account email first.");return;}setBusy(true);const {error}=await supabase.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:new URL(import.meta.env.BASE_URL,window.location.origin).toString()}});setNotice(error?"Sign-in error: "+error.message:"A secure sign-in link has been sent to "+email+". Open it on this device.");setBusy(false);}
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
 const showDemand=rows.length?demand:0;
 if(!session)return <div className="auth-screen"><div className="auth-card"><div className="brand-mark">E</div><h1>KPK Election EMS</h1><p>Secure district access · Supabase cloud database</p><label>Email address<input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Your authorized account email"/></label><button className="btn primary" disabled={busy} onClick={sendLogin}>{busy?"Sending…":"Send secure sign-in link"}</button><small>Only authorized EMS accounts can access district records.</small><div className="notice">{notice}</div></div></div>;
 return <div className="app"><aside className="sidebar"><div className="brand"><div className="brand-mark">E</div><div><b>KPK Election</b><small>Management System</small></div></div><div className="district-label">ACTIVE WORKSPACE</div><select className="district-select" value={districtId} onChange={e=>setDistrictId(e.target.value)}>{districts.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><nav>{["Overview","DATA Import","Polling Stations","Staff Demand","Relations Check"].map(s=><button key={s} className={section===s?"nav active":"nav"} onClick={()=>setSection(s)}>{s}</button>)}</nav><div className="side-foot"><span className="dot"></span> Supabase connected<small>{session.user.email}</small><button className="signout" onClick={()=>supabase.auth.signOut()}>Sign out</button></div></aside>
 <main className="main"><header><div><div className="eyebrow">ELECTION OPERATIONS / CLOUD DATABASE</div><h1>{section}</h1></div><div className="header-actions"><span className="local-pill">POSTGRESQL LIVE</span><button className="btn light" onClick={loadDistrictData}>Refresh data</button></div></header><div className="notice">{notice}</div>
 {section==="Overview"&&<><div className="welcome"><div><div className="eyebrow pale">DISTRICT WORKSPACE</div><h2>{activeDistrict?.name||"Select district"}</h2><p>Polling station DATA is the primary source. Staff, trainers and venues will be separate secondary uploads.</p></div><button className="btn white" onClick={()=>setSection("DATA Import")}>Upload polling DATA →</button></div><div className="cards"><Metric label="TEHSILS" value={counts.tehsils}/><Metric label="POLLING STATIONS" value={counts.stations}/><Metric label="CENSUS BLOCKS" value={counts.blocks}/><Metric label="BLOCK–STATION LINKS" value={counts.allocations}/></div><div className="cards"><Metric label="DATA ROWS IN CURRENT IMPORT" value={rows.length}/><Metric label="REQUIRED STAFF DEMAND" value={showDemand}/></div><div className="panel"><h3>Primary DATA status</h3><p>{counts.stations?"Polling station records are stored in PostgreSQL and linked to Tehsils, Councils and Census Blocks.":"No normalized polling station DATA found yet. Upload the district DATA workbook to begin."}</p><p className="hint">Staff roster, master trainers and training venues are intentionally not required for the first DATA import.</p></div></>}
 {section==="DATA Import"&&<div className="panel import-panel"><div className="upload-icon">⇧</div><h2>Upload primary polling station DATA</h2><p>Upload the district DATA Excel/CSV file. It is sent to Supabase in batches of up to 20 rows; slow batches are automatically split and linked to Tehsils, Councils, Polling Stations, Census Blocks and allocations.</p><input ref={input} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>importData(e.target.files?.[0])}/><div className="header-actions"><button className="btn light" onClick={downloadTemplate}>Download Excel Template</button><button className="btn primary" disabled={busy||!districtId} onClick={()=>input.current?.click()}>{busy?"Uploading…":"Choose DATA Excel / CSV"}</button></div><div className="hint">Required: Tehsil, Council Type, Council No, Council Name, PS No, station name/type, booths, Census Block Code and voter columns. Original row fields are retained.</div>{issues.length>0&&<div className="issue-box"><b>Rows requiring review ({issues.length}{issues.length===300?"+":""})</b>{issues.slice(0,30).map((x,i)=><div key={i}>{x}</div>)}</div>}</div>}
 {section==="Polling Stations"&&<div className="panel"><div className="panel-head"><div><h3>Polling station register</h3><p>Live records loaded from Supabase.</p></div><span className="tag">{stations.length} shown</span></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Tehsil ID</th><th>NC/VC PS No</th><th>Tehsil PS No</th><th>Polling Station</th><th>Type</th><th>Male booths</th><th>Female booths</th><th>Male voters</th><th>Female voters</th></tr></thead><tbody>{stations.map((s,i)=><tr key={s.id}><td>{i+1}</td><td>{s.tehsil_id?.slice(0,8)||"—"}</td><td>{s.nc_vc_ps_number||s.ps_number}</td><td>{s.tehsil_ps_number??"—"}</td><td>{s.name}</td><td>{s.station_type}</td><td>{s.male_booths??0}</td><td>{s.female_booths??0}</td><td>{Number(s.male_voters||0).toLocaleString()}</td><td>{Number(s.female_voters||0).toLocaleString()}</td></tr>)}</tbody></table>{!stations.length&&<Empty/>}</div></div>}
 {section==="Staff Demand"&&<div className="panel"><h3>Demand calculation</h3><p>Demand is calculated from the DATA import independently of staff availability. Upload or reload DATA to calculate the station-level demand preview.</p><Metric label="REQUIRED STAFF FROM CURRENT UPLOAD" value={showDemand}/></div>}
 {section==="Relations Check"&&<div className="panel"><h3>Database relationship checks</h3><div className="cards"><Metric label="TEHSILS" value={counts.tehsils}/><Metric label="STATIONS" value={counts.stations}/><Metric label="CENSUS BLOCKS" value={counts.blocks}/><Metric label="ALLOCATIONS" value={counts.allocations}/></div><p>{counts.stations&&counts.allocations&&counts.blocks===counts.allocations?"Relationship counts match: each imported census block has a station allocation.":"Relationship counts need review. Expected one allocation per census block; check missing or duplicate block-to-station links before relying on reports."}</p><button className="btn light" onClick={loadDistrictData}>Recheck PostgreSQL counts</button></div>}
 <footer>KPK Election Management System · Supabase PostgreSQL is the operational data store · Staff/trainer/venue imports are separate modules</footer></main></div>;
}
function Metric({label,value}:{label:string,value:number}){return <div className="metric"><div>{label}</div><strong>{value.toLocaleString()}</strong></div>}
function Empty(){return <div className="empty">No polling stations found for this district. Upload the primary DATA workbook.</div>}
