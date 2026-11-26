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
 const [rows,setRows]=useState<DataRow[]>([]),[stations,setStations]=useState<StationRow[]>([]),[counts,setCounts]=useState({tehsils:0,stations:0,blocks:0,allocations:0}),[opsCounts,setOpsCounts]=useState({staff:0,trainers:0,venues:0,rules:0,plans:0,settings:0,assignments:0,reserves:0,batches:0,participants:0,attendance:0});
 const [staffRecords,setStaffRecords]=useState<any[]>([]),[trainerRecords,setTrainerRecords]=useState<any[]>([]),[venueRecords,setVenueRecords]=useState<any[]>([]),[assignmentRecords,setAssignmentRecords]=useState<any[]>([]),[reserveRecords,setReserveRecords]=useState<any[]>([]),[batchRecords,setBatchRecords]=useState<any[]>([]),[participantRecords,setParticipantRecords]=useState<any[]>([]),[attendanceRecords,setAttendanceRecords]=useState<any[]>([]),[ruleRecords,setRuleRecords]=useState<any[]>([]);
 const [notice,setNotice]=useState("Connecting to Supabase…"),[busy,setBusy]=useState(false),[issues,setIssues]=useState<string[]>([]);
 const input=useRef<HTMLInputElement>(null),legacyInput=useRef<HTMLInputElement>(null),uploadInput=useRef<HTMLInputElement>(null);
 const [uploadRows,setUploadRows]=useState<Record<string,any[]>>({});
 const [uploadFileName,setUploadFileName]=useState("");
 const [uploadWarnings,setUploadWarnings]=useState<string[]>([]);
 const [uploadRecords,setUploadRecords]=useState<any[]>([]);
 const uploadConfig:Record<string,{table:string;title:string;description:string;headers:string[];required:string[]}> = {
  "Staff Data":{table:"election_staff",title:"Staff Data / Employee Roster",description:"Import the complete employee roster. CNIC is used as the main identity; source S.No is retained as a fallback. Original BPS and all source columns are preserved.",headers:["S.No","Tehsil","Name of Officer/Official","Gender","CNIC #","Department","Designation","BPS","Place of Posting","Qualification","Date of Retirement","Mobile #","Availability (Y/N)"],required:["Tehsil","Name of Officer/Official","Gender"]},
  "Master Trainers":{table:"master_trainers",title:"Master Trainers",description:"Upload male and female master trainers. CNIC is used to update an existing trainer instead of creating duplicates.",headers:["Master Trainer Name","Gender","Designation","Department","BPS","CNIC","Mobile Number"],required:["Master Trainer Name","Gender"]},
  "Training Venues":{table:"training_venues",title:"Training Venues / Classrooms",description:"Each row represents one room/classroom. Venue, classroom, gender, capacity, availability and session dates are retained in source_data.",headers:["Gender","Venue Name","Classroom Name/No.","Maximum Capacity","Availability (Yes/No)","Available Sessions","Available From","Available To"],required:["Gender","Venue Name","Classroom Name/No."]},
  "Demand Rules":{table:"demand_rules",title:"Staffing Demand Rules",description:"Import the role, station type, required gender, calculation basis and posts-per-unit rules. The source rule row is retained.",headers:["Duty Role","Station Type","Required Gender","Basis","Posts per Unit","Adjustment per Station","Rule Key","Rule Note"],required:["Duty Role","Station Type","Required Gender"]},
  "Training Plans":{table:"training_plans",title:"Training Plans",description:"Upload the Presiding/Sr APO and APO/PO plan dates, duration and batch capacities. Plans are kept separate by plan type.",headers:["Plan Type","Plan Name","Start Date","End Date","Duration Days","Batch Capacity"],required:["Plan Type","Plan Name"]},
  "District Settings":{table:"district_settings",title:"District Settings",description:"Upload a two-column settings sheet. Accepted headings are Setting Key / Setting Value or Key / Value. Existing keys are updated.",headers:["Setting Key","Setting Value"],required:["Setting Key"]},
  "Training Settings":{table:"district_settings",title:"Training Schedule Settings",description:"Upload training schedule settings separately from general district settings. Keys are saved with the training: prefix, including dates, duration, batch size and session times.",headers:["Training Setting Key","Training Setting Value"],required:["Training Setting Key"]}
 };
 const activeDistrict=districts.find(d=>d.id===districtId);
 const calculated=useMemo(()=>calculateDemand(stations.map((s,i):Station=>{const d=s.source_data||{};const tn=Number(s.tehsil_ps_number)||i+1;const cn=Number(s.nc_vc_ps_number||s.ps_number)||i+1;return {sNo:i+1,district:String(d.District??""),tehsil:String(d.Tehsil??""),councilType:String(d["Council Type (NC / VC)"]??""),councilNo:String(d["Council No"]??""),councilName:String(d["Council Name"]??""),psNo:String(s.nc_vc_ps_number||s.ps_number||""),sourceTehsilPsNo:String(d["Tehsil PS No"]??""),sourceNcVcPsNo:String(d["NC/VC PS No"]??""),stationName:s.name,psType:s.station_type||String(d["PS Type (Male / Female / Combined)"]??""),boothsMale:Number(s.male_booths??0),boothsFemale:Number(s.female_booths??0),maleVoters:Number(s.male_voters??0),femaleVoters:Number(s.female_voters??0),blockCount:0,blocks:[],tehsilStationNo:tn,ncVcStationNo:cn,tehsilPollingStationNo:tn,ncVcPollingStationNo:cn};})),ruleRecords.map(r=>r.rule_data||r)),[stations,ruleRecords]);
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
 useEffect(()=>{if(session&&districtId&&uploadConfig[section]){(async()=>{const q=await (supabase as any).from(uploadConfig[section].table).select("*",{count:"exact"}).eq("district_id",districtId).limit(500);if(!q.error)setUploadRecords(q.data||[]);})();}},[session,districtId,section]);
 async function loadDistricts(){const {data,error}=await supabase.from("districts").select("id,name,code").eq("is_active",true).order("name");if(error){setNotice("District access error: "+error.message);return;}setDistricts(data||[]);if(!districtId&&data?.length)setDistrictId(data.find(d=>d.name==="Kohat")?.id||data[0].id);}
 async function loadDistrictData(){
  setNotice("Loading district records from Supabase…");
  const [t,c,s,b,a,staffCount,trainerCount,venueCount,ruleCount,planCount,settingsCount,assignmentCount,reserveCount,batchCount,participantCount,attendanceCount]=await Promise.all([
   supabase.from("election_tehsils").select("id",{count:"exact",head:true}).eq("district_id",districtId),
   supabase.from("election_councils").select("id",{count:"exact",head:true}).eq("district_id",districtId),
   supabase.from("polling_stations").select("id,tehsil_id,ps_number,nc_vc_ps_number,tehsil_ps_number,name,station_type,male_booths,female_booths,male_voters,female_voters,source_data",{count:"exact"}).eq("district_id",districtId).limit(2000),
   supabase.from("census_blocks").select("id,source_data",{count:"exact"}).eq("district_id",districtId).limit(5000),
   supabase.from("block_station_allocations").select("id",{count:"exact",head:true}).eq("district_id",districtId),
   supabase.from("election_staff").select("*",{count:"exact"}).eq("district_id",districtId).limit(10000),
   supabase.from("master_trainers").select("*",{count:"exact"}).eq("district_id",districtId).limit(1000),
   supabase.from("training_venues").select("*",{count:"exact"}).eq("district_id",districtId).limit(1000),
   supabase.from("demand_rules").select("*",{count:"exact"}).eq("district_id",districtId).limit(1000),
   supabase.from("training_plans").select("*",{count:"exact"}).eq("district_id",districtId).limit(100),
   supabase.from("district_settings").select("*",{count:"exact"}).eq("district_id",districtId).limit(1000),
   supabase.from("staff_assignments").select("*",{count:"exact"}).eq("district_id",districtId).limit(10000),
   supabase.from("reserve_staff").select("*",{count:"exact"}).eq("district_id",districtId).limit(10000),
   supabase.from("training_batches").select("*",{count:"exact"}).eq("district_id",districtId).limit(5000),
   supabase.from("training_participants").select("*",{count:"exact"}).eq("district_id",districtId).limit(10000),
   supabase.from("training_attendance").select("*",{count:"exact"}).eq("district_id",districtId).limit(10000)
  ]);
  const err=[t.error,c.error,s.error,b.error,a.error,staffCount.error,trainerCount.error,venueCount.error,ruleCount.error,planCount.error,settingsCount.error,assignmentCount.error,reserveCount.error,batchCount.error,participantCount.error,attendanceCount.error].find(Boolean);if(err){setNotice("Could not load district data: "+err.message);return;}
  setStations((s.data||[]) as StationRow[]);
  setRows((b.data||[]).map(x=>x.source_data as DataRow).filter(Boolean));
  setCounts({tehsils:t.count||0,stations:s.count||0,blocks:b.count||0,allocations:a.count||0});
  setStaffRecords(staffCount.data||[]);setRuleRecords(ruleCount.data||[]);setTrainerRecords(trainerCount.data||[]);setVenueRecords(venueCount.data||[]);setAssignmentRecords(assignmentCount.data||[]);setReserveRecords(reserveCount.data||[]);setBatchRecords(batchCount.data||[]);setParticipantRecords(participantCount.data||[]);setAttendanceRecords(attendanceCount.data||[]);
  setOpsCounts({staff:staffCount.count||0,trainers:trainerCount.count||0,venues:venueCount.count||0,rules:ruleCount.count||0,plans:planCount.count||0,settings:settingsCount.count||0,assignments:assignmentCount.count||0,reserves:reserveCount.count||0,batches:batchCount.count||0,participants:participantCount.count||0,attendance:attendanceCount.count||0});
  setNotice("Connected to Supabase · "+(activeDistrict?.name||"District")+" data loaded from PostgreSQL.");
 }
 function downloadTemplate(){const headers=["District","Tehsil No","Tehsil","Tehsil PS No","NC/VC No","Council Type (NC / VC)","Council Name","NC/VC PS No","PS No","No & Name of Polling Station","PS Type (Male / Female / Combined)","Booths Male","Booths Female","Male Voters (block)","Female Voters (block)","Census Block Code","Electoral Area name"];const ws=XLSX.utils.aoa_to_sheet([headers]);ws["!cols"]=headers.map(h=>({wch:Math.max(16,h.length+2)}));const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,ws,"DATA Template");XLSX.writeFile(book,"KPK_Election_DATA_Template.xlsx");}
 async function sendLogin(){if(!email.trim()){setNotice("Enter your account email first.");return;}setBusy(true);const {error}=await supabase.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:new URL(import.meta.env.BASE_URL,window.location.origin).toString()}});setNotice(error?"Sign-in error: "+error.message:"A secure sign-in link has been sent to "+email+". Open it on this device.");setBusy(false);}
 function pick(row:any,...keys:string[]){for(const k of keys){if(row[k]!==undefined&&row[k]!==null&&String(row[k]).trim()!=="")return row[k];}return "";}
 function norm(v:any){return String(v??"").trim().toLowerCase();}
 function identity(kind:string,row:any){
  if(kind==="Staff Data")return norm(pick(row,"CNIC #","CNIC"))||("source:"+norm(pick(row,"S.No","S No","Serial No")));
  if(kind==="Master Trainers")return norm(pick(row,"CNIC","CNIC #"))||[norm(pick(row,"Master Trainer Name","name","Name")),norm(pick(row,"Gender","gender"))].join("|");
  if(kind==="Training Venues")return [norm(pick(row,"Gender","gender")),norm(pick(row,"Venue Name","venue_name")),norm(pick(row,"Classroom Name/No.","Classroom","classroom"))].join("|");
  if(kind==="Demand Rules"){const source=row.rule_data||row;return norm(pick(source,"Rule Key"))||[norm(pick(source,"Duty Role","role")),norm(pick(source,"Station Type","station_type")),norm(pick(source,"Required Gender","gender"))].join("|");}
  if(kind==="Training Plans")return norm(pick(row,"Plan Type","plan_type"));
  return norm(pick(row,"Setting Key","Key","setting_key"));
 }
 async function prepareUpload(file?:File,kind=section){
  if(!file||!uploadConfig[kind])return;
  setBusy(true);setUploadWarnings([]);setUploadRecords([]);setUploadFileName(file.name);setNotice("Reading "+file.name+"…");
  try{
   const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});
   const ws=wb.Sheets[wb.SheetNames[0]];
   const matrix=XLSX.utils.sheet_to_json<any[]>(ws,{header:1,defval:""});
   const cfg=uploadConfig[kind];
   const aliases:Record<string,string[]>={"Master Trainer Name":["Master Trainer Name","Name","name"],"Venue Name":["Venue Name","venue_name","Name"],"Classroom Name/No.":["Classroom Name/No.","Classroom","classroom"],"Setting Key":["Setting Key","Key","setting_key"]};
   let headerIndex=0,best=0;
   for(let i=0;i<Math.min(matrix.length,20);i++){
    const vals=(matrix[i]||[]).map((v:any)=>String(v??"").trim().toLowerCase());
    const score=cfg.required.filter(h=>(aliases[h]||[h]).some(a=>vals.includes(a.toLowerCase()))).length;
    if(score>best){best=score;headerIndex=i;}
   }
   const headers=(matrix[headerIndex]||[]).map((v:any)=>String(v??"").trim());
   if(!headers.some(Boolean))throw new Error("No column headings found in the first 20 rows.");
   const parsed=matrix.slice(headerIndex+1).filter((r:any[])=>r.some(v=>String(v??"").trim()!=="")).map((r:any[],i:number)=>Object.fromEntries(headers.map((h:string,j:number)=>[h,r[j]??""])));
   if(!parsed.length)throw new Error("No data rows found under the detected headings.");
   const missing=cfg.required.filter(h=>!(aliases[h]||[h]).some(a=>headers.includes(a)));
   const warnings:string[]=[];
   if(missing.length)warnings.push("Expected headings not found: "+missing.join(", ")+". The importer will still preserve the rows and map available columns.");
   parsed.forEach((r:any,i:number)=>{cfg.required.forEach(h=>{if(!String(pick(r,...(aliases[h]||[h]))??"").trim())warnings.push("Row "+(headerIndex+i+2)+": "+h+" is blank.");});});
   if(kind==="Staff Data"){
    const db=await supabase.from("election_tehsils").select("name").eq("district_id",districtId);
    const known=new Set((db.data||[]).map(x=>norm(x.name)));
    parsed.forEach((r:any,i:number)=>{if(r.Tehsil&&!known.has(norm(r.Tehsil)))warnings.push("Row "+(headerIndex+i+2)+": Tehsil '"+r.Tehsil+"' does not match a district Tehsil; it will be imported with an unresolved Tehsil link.");});
   }
   setUploadRows(prev=>({...prev,[kind]:parsed}));setUploadWarnings(warnings.slice(0,500));setNotice("Preview ready: "+parsed.length.toLocaleString()+" "+kind+" rows detected. Review warnings, then import.");
  }catch(e){setNotice("Could not prepare upload: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);if(uploadInput.current)uploadInput.current.value="";}
 }
 function downloadUploadTemplate(kind=section){
  const cfg=uploadConfig[kind];if(!cfg)return;
  const ws=XLSX.utils.aoa_to_sheet([cfg.headers]);ws["!cols"]=cfg.headers.map(h=>({wch:Math.max(18,h.length+2)}));
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,ws,kind.slice(0,31));XLSX.writeFile(book,"KPK_"+kind.replace(/[^A-Za-z0-9]+/g,"_")+"_Template.xlsx");
 }
 async function commitUpload(kind=section){
  const cfg=uploadConfig[kind],raw=uploadRows[kind]||[];if(!cfg||!raw.length||!districtId)return;
  setBusy(true);setNotice("Importing "+raw.length.toLocaleString()+" "+kind+" rows into "+activeDistrict?.name+"…");
  try{
   const existingResult=await (supabase as any).from(cfg.table).select("*").eq("district_id",districtId).limit(10000);
   if(existingResult.error)throw existingResult.error;
   const existing=existingResult.data||[];
   const existingMap=new Map<string,any>(existing.map((r:any):[string,any]=>[identity(kind,kind==="District Settings"?{"Setting Key":r.setting_key}:kind==="Training Settings"?{"Training Setting Key":r.setting_key}:kind==="Demand Rules"?(r.rule_data||r):r.source_data||r),r]));
   const tehsilResult=kind==="Staff Data"?await supabase.from("election_tehsils").select("id,name").eq("district_id",districtId):{data:[],error:null};
   if(tehsilResult.error)throw tehsilResult.error;
   const tehsilMap=new Map<string,string>((tehsilResult.data||[]).map((t:any):[string,string]=>[norm(t.name),t.id]));
   const prepared=raw.map((r:any,index:number)=>{
    const key=identity(kind,r),old=existingMap.get(key);
    if(kind==="Staff Data")return { ...(old?.id?{id:old.id}:{}),district_id:districtId,tehsil_id:tehsilMap.get(norm(r.Tehsil))||null,source_staff_id:String(pick(r,"S.No","S No")||"").trim()||null,name:String(pick(r,"Name of Officer/Official","Name")||"").trim()||null,gender:String(pick(r,"Gender")||"").trim()||null,cnic:String(pick(r,"CNIC #","CNIC")||"").trim()||null,mobile:String(pick(r,"Mobile #","Mobile")||"").trim()||null,department:String(pick(r,"Department")||"").trim()||null,designation:String(pick(r,"Designation")||"").trim()||null,bps_text:String(pick(r,"BPS")??"").trim()||null,availability:String(pick(r,"Availability (Y/N)","Availability")||"").trim()||null,source_data:r};
    if(kind==="Master Trainers")return { ...(old?.id?{id:old.id}:{}),district_id:districtId,name:String(pick(r,"Master Trainer Name","name","Name")||"").trim()||null,gender:String(pick(r,"Gender","gender")||"").trim()||null,cnic:String(pick(r,"CNIC","CNIC #","cnic")||"").trim()||null,mobile:String(pick(r,"Mobile Number","Mobile #","mobile")||"").trim()||null,source_data:r};
    if(kind==="Training Venues")return { ...(old?.id?{id:old.id}:{}),district_id:districtId,name:String(pick(r,"Venue Name","venue_name","Name")||("Unspecified venue row "+(index+1))).trim(),address:[pick(r,"Classroom Name/No.","Classroom","classroom"),pick(r,"Gender","gender"),pick(r,"Available Sessions","sessions")].filter(Boolean).join(" · "),capacity:String(pick(r,"Maximum Capacity","Capacity","capacity")).trim()!==""&&Number.isFinite(Number(pick(r,"Maximum Capacity","Capacity","capacity")))?Number(pick(r,"Maximum Capacity","Capacity","capacity")):null,source_data:r};
    if(kind==="Demand Rules"){const ruleKey=String(pick(r,"Rule Key")||[pick(r,"Duty Role"),pick(r,"Station Type"),pick(r,"Required Gender")].join("|"));return { ...(old?.id?{id:old.id}:{}),district_id:districtId,role:String(pick(r,"Duty Role","Role")||"").trim(),station_type:String(pick(r,"Station Type")||"").trim()||null,gender:String(pick(r,"Required Gender","Gender")||"").trim()||null,basis:String(pick(r,"Basis")||"").trim()||null,per_unit:Number(pick(r,"Posts per Unit"))||0,adjustment:pick(r,"Adjustment per Station")===""?null:Number(pick(r,"Adjustment per Station")),is_active:true,rule_data:{...r,"Rule Key":ruleKey}};}
    if(kind==="Training Plans"){const type=String(pick(r,"Plan Type","plan_type")||"").trim();return { ...(old?.id?{id:old.id}:{}),district_id:districtId,plan_type:type,name:String(pick(r,"Plan Name","Name")||type).trim(),start_date:String(pick(r,"Start Date","start_date")||"").slice(0,10)||null,end_date:String(pick(r,"End Date","end_date")||"").slice(0,10)||null,duration_days:Number(pick(r,"Duration Days"))||null,batch_capacity:Number(pick(r,"Batch Capacity"))||null,plan_data:r};}
    const settingKey=String(kind==="Training Settings"?pick(r,"Training Setting Key","setting_key"):pick(r,"Setting Key","Key","setting_key")||"").trim();return { ...(old?.id?{id:old.id}:{}),district_id:districtId,setting_key:(kind==="Training Settings"?"training:":"")+settingKey,setting_value:kind==="Training Settings"?pick(r,"Training Setting Value","Value","setting_value"):pick(r,"Setting Value","Value","setting_value")};
   }).filter((r:any)=>kind!=="Demand Rules"||!!r.role).filter((r:any)=>kind!=="Training Plans"||!!r.plan_type).filter((r:any)=>!["District Settings","Training Settings"].includes(kind)||!!r.setting_key);
   let sent=0;
   for(let i=0;i<prepared.length;i+=100){
    const part=prepared.slice(i,i+100);const {error}=await (supabase as any).from(cfg.table).upsert(part,{onConflict:"id"});
    if(error)throw new Error("Rows "+(i+1)+"–"+(i+part.length)+": "+error.message);
    sent+=part.length;setNotice("Imported "+sent.toLocaleString()+" / "+prepared.length.toLocaleString()+" "+kind+" records…");
   }
   const invalid=raw.length-prepared.length;
   await loadDistrictData();
   const refreshed=await (supabase as any).from(cfg.table).select("*").eq("district_id",districtId).limit(500);
   setUploadRecords(refreshed.data||[]);
   setNotice(kind+" import completed: "+sent.toLocaleString()+" rows saved; "+invalid+" rows could not be mapped to mandatory database fields and remain visible in the preview. Source rows are retained in source_data.");
   setUploadRows(prev=>({...prev,[kind]:[]}));setUploadWarnings(invalid?[invalid+" rows were not imported because mandatory mapping fields were missing."]:[]);
  }catch(e){setNotice(kind+" import failed: "+(e instanceof Error?e.message:String(e))+". Rows committed in earlier batches remain saved; re-upload is safe because matching source identities are updated.");}
  finally{setBusy(false);}
 }

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


 async function importLegacyBackup(file?:File){
  if(!file||!districtId)return;
  setBusy(true);setIssues([]);setNotice("Reading original Kohat HTML backup…");
  try{
   const html=await file.text();
   const marker="const DEFAULT_DATA = ";const markerAt=html.indexOf(marker);const scriptEnd=markerAt>=0?html.indexOf(";</script>",markerAt):-1;
   if(markerAt<0||scriptEnd<0)throw new Error("This file does not contain the original DEFAULT_DATA backup. Select the saved Kohat HTML version, not the deployed website.");
   const payload=JSON.parse(html.slice(markerAt+marker.length,scriptEnd));
   const dataRows=payload?.data?.rows||[],staffRows=payload?.staff?.rows||[],trainerRows=payload?.master_trainers||[],venueRows=payload?.training_venues||[];
   const districtName=String(dataRows[0]?.District||payload?.settings?.["District (auto from DATA)"]||"").trim();
   if(districtName.toLowerCase()!==(activeDistrict?.name||"").toLowerCase())throw new Error("Backup district is "+(districtName||"unspecified")+", but the selected workspace is "+(activeDistrict?.name||"unspecified")+". Select Kohat before importing.");
   if(!dataRows.length||!staffRows.length)throw new Error("Backup is incomplete: DATA and Staff sheets must both contain records.");
   if(!confirm("Import operational records from "+file.name+" into "+activeDistrict?.name+"?\n\nDATA source rows detected: "+dataRows.length.toLocaleString()+" (existing DATA will not be overwritten)\nStaff: "+staffRows.length.toLocaleString()+"\nMaster trainers: "+trainerRows.length+"\nVenue/classroom records: "+venueRows.length+"\n\nExisting records are preserved; matching CNICs and existing settings are skipped."))return;
   const {data:tehsilRows,error:tehsilError}=await supabase.from("election_tehsils").select("id,name").eq("district_id",districtId);
   if(tehsilError)throw tehsilError;
   const tehsilIds=new Map((tehsilRows||[]).map(x=>[String(x.name).trim().toLowerCase(),x.id]));
   const chunkInsert=async(table:string,records:any[],label:string)=>{
    let added=0;
    for(let i=0;i<records.length;i+=100){
     const part=records.slice(i,i+100);
     const {error}=await (supabase as any).from(table).insert(part);
     if(error)throw new Error(label+" rows "+(i+1)+"–"+(i+part.length)+" failed: "+error.message);
     added+=part.length;setNotice("Imported "+label+": "+added.toLocaleString()+" / "+records.length.toLocaleString()+"…");
    }
    return added;
   };
   const {data:existingStaff,error:existingStaffError}=await supabase.from("election_staff").select("cnic,source_staff_id").eq("district_id",districtId).limit(10000);
   if(existingStaffError)throw existingStaffError;
   const staffKeys=new Set((existingStaff||[]).map(x=>String(x.cnic||"").trim()).filter(Boolean));
   const incomingKeys=new Set<string>();
   const staffToInsert=staffRows.filter((r:any)=>{
    const cnic=String(r["CNIC #"]??r.CNIC??"").trim();
    const key=cnic||("source:"+String(r["S.No"]??""));
    if(incomingKeys.has(key)|| (cnic&&staffKeys.has(cnic)))return false;
    incomingKeys.add(key);return true;
   }).map((r:any)=>({
    district_id:districtId,tehsil_id:tehsilIds.get(String(r.Tehsil??"").trim().toLowerCase())||null,
    source_staff_id:String(r["S.No"]??"").trim()||null,name:String(r["Name of Officer/Official"]??"").trim()||null,
    gender:String(r.Gender??"").trim()||null,cnic:String(r["CNIC #"]??"").trim()||null,mobile:String(r["Mobile #"]??"").trim()||null,
    department:String(r.Department??"").trim()||null,designation:String(r.Designation??"").trim()||null,
    bps_text:String(r.BPS??"").trim()||null,availability:String(r["Availability (Y/N)"]??"").trim()||null,source_data:r
   }));
   const staffAdded=await chunkInsert("election_staff",staffToInsert,"staff");
   const {data:existingTrainers,error:trainerErr}=await supabase.from("master_trainers").select("cnic").eq("district_id",districtId).limit(1000);
   if(trainerErr)throw trainerErr;
   const trainerKeys=new Set((existingTrainers||[]).map(x=>String(x.cnic||"").trim()).filter(Boolean));
   const trainerToInsert=trainerRows.filter((r:any)=>!r.cnic||!trainerKeys.has(String(r.cnic).trim())).map((r:any)=>({district_id:districtId,name:String(r.name??"").trim()||null,gender:String(r.gender??"").trim()||null,cnic:String(r.cnic??"").trim()||null,mobile:String(r.mobile??"").trim()||null,source_data:r}));
   const trainersAdded=await chunkInsert("master_trainers",trainerToInsert,"master trainers");
   const {data:existingVenues,error:venueErr}=await supabase.from("training_venues").select("name,address,source_data").eq("district_id",districtId).limit(1000);
   if(venueErr)throw venueErr;
   const venueKey=(r:any)=>[String(r.gender??"").trim().toLowerCase(),String(r.venue_name??r.name??"").trim().toLowerCase(),String(r.classroom??"").trim().toLowerCase()].join("|");
   const venueKeys=new Set((existingVenues||[]).map((r:any)=>venueKey(r.source_data||{})));
   const venueToInsert=venueRows.filter((r:any)=>!venueKeys.has(venueKey(r))).map((r:any)=>({district_id:districtId,name:String(r.venue_name??r.name??"Unspecified").trim(),address:[r.venue_name,r.classroom,r.gender].filter(Boolean).join(" · "),capacity:Number.isFinite(Number(r.capacity))?Number(r.capacity):null,source_data:r}));
   const venuesAdded=await chunkInsert("training_venues",venueToInsert,"training venues");
   const {data:existingSettings,error:settingsErr}=await supabase.from("district_settings").select("setting_key").eq("district_id",districtId).limit(1000);
   if(settingsErr)throw settingsErr;
   const settingKeys=new Set((existingSettings||[]).map(x=>x.setting_key));
   const settingRows=Object.entries(payload.settings||{}).filter(([k])=>!settingKeys.has(k)).map(([setting_key,setting_value])=>({district_id:districtId,setting_key,setting_value}));
   const trainingSettingRows=Object.entries(payload.training_settings||{}).filter(([k])=>!settingKeys.has("training:"+k)).map(([k,v])=>({district_id:districtId,setting_key:"training:"+k,setting_value:v}));
   const settingsAdded=await chunkInsert("district_settings",[...settingRows,...trainingSettingRows],"district settings");
   const ruleRows=(payload.rules||[]).slice(1).map((r:any[])=>Object.fromEntries((payload.rules[0]||[]).map((h:string,i:number)=>[h,r[i]])));
   const {data:existingRules,error:rulesErr}=await supabase.from("demand_rules").select("rule_data").eq("district_id",districtId).limit(1000);
   if(rulesErr)throw rulesErr;
   const ruleKeys=new Set((existingRules||[]).map((r:any)=>String(r.rule_data?.["Rule Key"]??"")));
   const rulesToInsert=ruleRows.filter((r:any)=>!ruleKeys.has(String(r["Rule Key"]??""))).map((r:any)=>({district_id:districtId,role:String(r["Duty Role"]??""),station_type:String(r["Station Type"]??"")||null,gender:String(r["Required Gender"]??"")||null,basis:String(r.Basis??"")||null,per_unit:Number(r["Posts per Unit"])||0,adjustment:r["Adjustment per Station"]===""||r["Adjustment per Station"]==null?null:Number(r["Adjustment per Station"]),is_active:true,rule_data:r}));
   const rulesAdded=await chunkInsert("demand_rules",rulesToInsert,"demand rules");
   const {data:existingPlans,error:plansErr}=await supabase.from("training_plans").select("plan_type").eq("district_id",districtId).limit(100);
   if(plansErr)throw plansErr;
   const planTypes=new Set((existingPlans||[]).map(x=>x.plan_type));
   const ts=payload.training_settings||{};
   const planSpecs=[
    {plan_type:"presiding_srapo",name:"Presiding Officers / Senior APOs",start_date:ts.pres_start_date||null,end_date:ts.pres_end_date||null,duration_days:Number(ts.pres_duration_days)||null,batch_capacity:Number(ts.pres_batch_size)||null,plan_data:{...ts,category:"Presiding Officers / Senior APOs"}},
    {plan_type:"apo_po",name:"APO / PO Combined Training",start_date:ts.apo_start_date||null,end_date:ts.apo_end_date||null,duration_days:Number(ts.apo_duration_days)||null,batch_capacity:Number(ts.apo_batch_size)||null,plan_data:{...ts,category:"APO + PO combined"}}
   ].filter(p=>!planTypes.has(p.plan_type)).map(p=>({...p,district_id:districtId}));
   const plansAdded=await chunkInsert("training_plans",planSpecs,"training plans");
   await loadDistrictData();
   setSection("Overview");
   setNotice("Kohat operational backup imported safely. Added "+staffAdded.toLocaleString()+" staff, "+trainersAdded+" trainers, "+venuesAdded+" venue/classroom records, "+rulesAdded+" demand rules, "+settingsAdded+" settings and "+plansAdded+" training plans. Existing DATA and existing records were preserved; re-upload skips matching CNICs and settings.");
  }catch(e){setNotice("Operational import stopped: "+(e instanceof Error?e.message:String(e))+". Successfully committed earlier batches are retained; run the same import again to resume safely.");}
  finally{setBusy(false);if(legacyInput.current)legacyInput.current.value="";}
 }

 const dashboard=useMemo(()=>{
  const sum=(items:any[],key:string):number=>items.reduce((n:number,x:any)=>n+Number(x[key]||0),0);
  const councils=new Set(stations.map(s=>[String(s.source_data?.Tehsil??"").trim(),String(s.source_data?.["Council Type (NC / VC)"]??"").trim(),String(s.source_data?.["Council No"]??"").trim(),String(s.source_data?.["Council Name"]??"").trim()].join("|")));
  const ncCouncils=new Set(stations.filter(s=>String(s.source_data?.["Council Type (NC / VC)"]??"").trim().toUpperCase()==="NC").map(s=>[String(s.source_data?.Tehsil??"").trim(),String(s.source_data?.["Council No"]??"").trim()].join("|"))).size;
  const vcCouncils=new Set(stations.filter(s=>String(s.source_data?.["Council Type (NC / VC)"]??"").trim().toUpperCase()==="VC").map(s=>[String(s.source_data?.Tehsil??"").trim(),String(s.source_data?.["Council No"]??"").trim()].join("|"))).size;
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
  return {tehsils,councils:councils.size,ncCouncils,vcCouncils,maleVoters,femaleVoters,totalVoters:maleVoters+femaleVoters,maleBooths,femaleBooths,totalBooths:maleBooths+femaleBooths,demandTotal,roleTotals,dataIssues,maleStations,femaleStations,combinedStations};
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
 const operationalSummary=useMemo(()=>{
  const val=(r:any,...keys:string[])=>{for(const k of keys){const v=r?.[k]??r?.source_data?.[k];if(v!==undefined&&v!==null&&String(v).trim()!=="")return String(v).trim();}return "";};
  const staffById=new Map<string,any>(staffRecords.map((x:any):[string,any]=>[x.id,x]));
  const stationById=new Map<string,any>(stations.map((x:any):[string,any]=>[x.id,x]));
  const activeAssignments=assignmentRecords.filter(a=>String(a.assignment_status||"Active").toLowerCase()==="active");
  const roleName=(v:string)=>{const x=v.toLowerCase().replace(/\s+/g," ").trim();if(x==="po"||x==="polling officer")return "Polling Officer";if(x==="presiding"||x==="presiding officer"||x==="pro")return "Presiding Officer";if(x==="sr apo"||x==="senior apo")return "Senior APO";if(x==="nq"||x==="naib qasid")return "Naib Qasid";return v;};
  const assignedFor=(tehsil:string,role:string,gender:string)=>activeAssignments.filter(a=>{
   const st=staffById.get(a.staff_id),ps=stationById.get(a.station_id);
   const home=val(ps,"Tehsil")||"Unspecified",g=val(st,"Gender","gender");
   return roleName(String(a.role||""))===role&&g.toLowerCase()===gender.toLowerCase()&&(!tehsil||home.toLowerCase()===tehsil.toLowerCase());
  }).length;
  const roles=[{label:"Presiding Officer",m:"presMale",f:"presFemale"},{label:"Senior APO",m:"srapoMale",f:"srapoFemale"},{label:"APO",m:"apoMale",f:"apoFemale"},{label:"Polling Officer",m:"poMale",f:"poFemale"},{label:"Naib Qasid",m:"nqMale",f:"nqFemale"}];
  const assignedRows=dashboard.tehsils.flatMap(t=>roles.map(r=>{const male=assignedFor(t.name,r.label,"Male"),female=assignedFor(t.name,r.label,"Female");return {tehsil:t.name,role:r.label,male,female,total:male+female};}));
  const vacancyRows=dashboard.tehsils.flatMap(t=>roles.map(r=>{const male=Math.max(0,Number((t as any)[r.m]||0)-assignedFor(t.name,r.label,"Male")),female=Math.max(0,Number((t as any)[r.f]||0)-assignedFor(t.name,r.label,"Female"));return {tehsil:t.name,role:r.label,male,female,total:male+female};}));
  const staffIssues=[
   {label:"Missing name",count:staffRecords.filter(r=>!val(r,"name","Name of Officer/Official")).length},
   {label:"Missing CNIC",count:staffRecords.filter(r=>!val(r,"cnic","CNIC #")).length},
   {label:"Missing mobile",count:staffRecords.filter(r=>!val(r,"mobile","Mobile #")).length},
   {label:"Missing gender",count:staffRecords.filter(r=>!val(r,"gender","Gender")).length},
   {label:"Missing BPS",count:staffRecords.filter(r=>!val(r,"bps_text","BPS")).length},
   {label:"Missing Tehsil",count:staffRecords.filter(r=>!val(r,"Tehsil")&&!r.tehsil_id).length},
   {label:"Missing designation",count:staffRecords.filter(r=>!val(r,"designation","Designation")).length}
  ];
  const invalidCnic=staffRecords.filter(r=>{const d=val(r,"cnic","CNIC #").replace(/\D/g,"");return d.length>0&&d.length!==13;}).length;
  const invalidMobile=staffRecords.filter(r=>{const d=val(r,"mobile","Mobile #").replace(/\D/g,"");return d.length>0&&!(d.length===11&&d.startsWith("03"));}).length;
  const trainerMale=trainerRecords.filter(r=>val(r,"gender","Gender").toLowerCase()==="male").length;
  const trainerFemale=trainerRecords.filter(r=>val(r,"gender","Gender").toLowerCase()==="female").length;
  const availableVenues=venueRecords.filter(r=>String(r.source_data?.availability??"Yes").toLowerCase()==="yes");
  const venueCapacity=availableVenues.reduce((n,r)=>n+Number(r.capacity||0),0);
  const present=attendanceRecords.filter(r=>["present","attended"].includes(String(r.status||"").toLowerCase())).length;
  const absent=attendanceRecords.filter(r=>String(r.status||"").toLowerCase()==="absent").length;
  const pending=attendanceRecords.filter(r=>["pending",""].includes(String(r.status||"").toLowerCase())).length;
  const sundayBatches=batchRecords.filter(b=>b.training_date&&new Date(b.training_date+"T00:00:00").getDay()===0).length;
  let venueConflicts=0;
  for(let i=0;i<batchRecords.length;i++)for(let j=i+1;j<batchRecords.length;j++){const a=batchRecords[i],b=batchRecords[j];if(!a.venue_id||a.venue_id!==b.venue_id||a.training_date!==b.training_date)continue;const as=String(a.start_time||"00:00"),ae=String(a.end_time||"23:59"),bs=String(b.start_time||"00:00"),be=String(b.end_time||"23:59");if(as<be&&bs<ae)venueConflicts++;}
  const crossAssignments=activeAssignments.filter(a=>{const st=staffById.get(a.staff_id),ps=stationById.get(a.station_id);const home=val(st,"Tehsil"),work=val(ps,"Tehsil");return !!home&&!!work&&home.toLowerCase()!==work.toLowerCase();}).length;
  const reserveByRole=new Map<string,number>();reserveRecords.forEach(r=>{const k=String(r.reserve_role||"Unspecified");reserveByRole.set(k,(reserveByRole.get(k)||0)+1);});
  const batchGroups=[{label:"Presiding / Senior APO",male:batchRecords.filter(b=>String(b.role_group||b.batch_data?.role_group||"").toLowerCase().includes("pres")&&String(b.gender_group||"").toLowerCase()==="male").length,female:batchRecords.filter(b=>String(b.role_group||b.batch_data?.role_group||"").toLowerCase().includes("pres")&&String(b.gender_group||"").toLowerCase()==="female").length},{label:"APO + PO",male:batchRecords.filter(b=>/apo|po/i.test(String(b.role_group||b.batch_data?.role_group||""))&&String(b.gender_group||"").toLowerCase()==="male").length,female:batchRecords.filter(b=>/apo|po/i.test(String(b.role_group||b.batch_data?.role_group||""))&&String(b.gender_group||"").toLowerCase()==="female").length}];
  const reserveActual=(category:string)=>reserveRecords.filter(r=>{const role=String(r.reserve_role||"").toLowerCase().replace(/[^a-z]/g,"");if(category==="Presiding + Senior APO")return role.includes("presiding")||role==="srapo"||role==="seniorapo";if(category==="APOs")return role==="apo";if(category==="Polling Officers")return role==="po"||role==="pollingofficer";return role==="naibqasid"||role==="nq";}).length;
  const reserveRows=reserveSummary.categories.map(c=>{const actual=reserveActual(c.label);return {...c,actual,shortage:Math.max(0,c.reserve-actual)};});
  return {activeAssignments,assignedRows,vacancyRows,staffIssues,invalidCnic,invalidMobile,trainerMale,trainerFemale,availableVenues:availableVenues.length,venueCapacity,present,absent,pending,sundayBatches,venueConflicts,crossAssignments,reserveByRole,reserveRows,batchGroups};
 },[staffRecords,trainerRecords,venueRecords,assignmentRecords,reserveRecords,batchRecords,attendanceRecords,stations,dashboard]);
 const showDemand=rows.length?demand:0;
 if(!session)return <div className="auth-screen"><div className="auth-card"><div className="brand-mark">E</div><h1>KPK Election EMS</h1><p>Secure district access · Supabase cloud database</p><label>Email address<input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Your authorized account email"/></label><button className="btn primary" disabled={busy} onClick={sendLogin}>{busy?"Sending…":"Send secure sign-in link"}</button><small>Only authorized EMS accounts can access district records.</small><div className="notice">{notice}</div></div></div>;
 return <div className="app"><aside className="sidebar"><div className="brand"><div className="brand-mark">E</div><div><b>KPK Election</b><small>Management System</small></div></div><div className="district-label">ACTIVE WORKSPACE</div><select className="district-select" value={districtId} onChange={e=>setDistrictId(e.target.value)}>{districts.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><nav>{["Overview","DATA Import","Staff Data","Master Trainers","Training Venues","Demand Rules","Training Plans","District Settings","Polling Stations","Staff Demand","Relations Check"].map(s=><button key={s} className={section===s?"nav active":"nav"} onClick={()=>setSection(s)}>{s}</button>)}</nav><div className="side-foot"><span className="dot"></span> Supabase connected<small>{session.user.email}</small><button className="signout" onClick={()=>supabase.auth.signOut()}>Sign out</button></div></aside>
 <main className="main"><header><div><div className="eyebrow">ELECTION OPERATIONS / CLOUD DATABASE</div><h1>{section}</h1></div><div className="header-actions"><span className="local-pill">POSTGRESQL LIVE</span><button className="btn light" onClick={loadDistrictData}>Refresh data</button></div></header><div className="notice">{notice}</div>
 {section==="Overview"&&<><div className="welcome"><div><div className="eyebrow pale">DISTRICT ELECTION DASHBOARD</div><h2>{activeDistrict?.name||"Select district"}</h2><p>Live summaries calculated from the district's polling-station and census-block records.</p><p className="hint">Staffing assignments, reserves and training attendance will be activated after verified staff/trainer/venue imports.</p></div><button className="btn white" onClick={()=>setSection("DATA Import")}>Manage primary DATA →</button></div>
 <div className="dash-section-title"><h2>Election overview</h2><span>Live PostgreSQL figures</span></div>
 <div className="cards dash-kpis"><Metric label="POLLING STATIONS" value={stations.length}/><Metric label="NC / VC COUNCILS" value={dashboard.councils}/><Metric label="NC COUNCILS" value={dashboard.ncCouncils}/><Metric label="VC COUNCILS" value={dashboard.vcCouncils}/><Metric label="CENSUS BLOCKS" value={rows.length}/><Metric label="TEHSILS" value={dashboard.tehsils.length}/><Metric label="REGISTERED VOTERS" value={dashboard.totalVoters}/><Metric label="MALE VOTERS" value={dashboard.maleVoters}/><Metric label="FEMALE VOTERS" value={dashboard.femaleVoters}/><Metric label="TOTAL BOOTHS" value={dashboard.totalBooths}/><Metric label="MALE BOOTHS" value={dashboard.maleBooths}/><Metric label="FEMALE BOOTHS" value={dashboard.femaleBooths}/><Metric label="REQUIRED STAFF POSTS" value={dashboard.demandTotal}/><Metric label="ACTIVE ASSIGNMENTS" value={operationalSummary.activeAssignments.length}/><Metric label="CURRENT VACANCIES" value={operationalSummary.vacancyRows.reduce((n,r)=>n+r.total,0)}/><Metric label="5% RESERVE TARGET" value={reserveSummary.totalReserve}/><Metric label="TRAINING PRESENT" value={operationalSummary.present}/><Metric label="DATA ROWS NEEDING REVIEW" value={dashboard.dataIssues}/></div>
 <div className="dash-grid"><div className="panel dash-wide"><div className="panel-head"><div><h3>Tehsil-wise election summary</h3><p>Stations, councils, blocks, voters, booths and calculated staffing demand</p></div></div><div className="table-wrap"><table><thead><tr><th>Tehsil</th><th>Stations</th><th>Councils</th><th>Blocks</th><th>Male voters</th><th>Female voters</th><th>Total voters</th><th>Male booths</th><th>Female booths</th><th>Required staff</th></tr></thead><tbody>{dashboard.tehsils.map(t=><tr key={t.name}><td><b>{t.name}</b></td><td>{t.stations}</td><td>{t.councils.size}</td><td>{t.blocks}</td><td>{t.maleVoters.toLocaleString()}</td><td>{t.femaleVoters.toLocaleString()}</td><td><b>{(t.maleVoters+t.femaleVoters).toLocaleString()}</b></td><td>{t.maleBooths}</td><td>{t.femaleBooths}</td><td>{t.demand.toLocaleString()}</td></tr>)}</tbody></table></div></div>
 <div className="panel"><h3>Polling station types</h3><p>Distribution by station classification</p><div className="dash-stat"><span>Male only</span><b>{dashboard.maleStations}</b></div><div className="dash-stat"><span>Female only</span><b>{dashboard.femaleStations}</b></div><div className="dash-stat"><span>Combined</span><b>{dashboard.combinedStations}</b></div><div className="dash-stat total"><span>Total stations</span><b>{stations.length}</b></div></div>
 <div className="panel"><h3>Staffing demand by role and gender</h3><p>Demand calculated using the current audited election rules</p><div className="table-wrap"><table><thead><tr><th>Role</th><th>Male</th><th>Female</th><th>Total</th></tr></thead><tbody>{dashboard.roleTotals.map(r=><tr key={r.label}><td>{r.label}</td><td>{r.male.toLocaleString()}</td><td>{r.female.toLocaleString()}</td><td><b>{(r.male+r.female).toLocaleString()}</b></td></tr>)}</tbody></table></div><div className="dash-note">Staff roster not yet imported: assigned posts and vacancies are not calculated from an empty staff table.</div></div>
 <div className="panel"><h3>Data completeness</h3><p>Informational checks only; imported source records are not discarded.</p><div className="dash-stat"><span>Census block records</span><b>{rows.length.toLocaleString()}</b></div><div className="dash-stat"><span>Polling station records</span><b>{stations.length.toLocaleString()}</b></div><div className="dash-stat"><span>Rows missing tehsil / council / block code</span><b>{dashboard.dataIssues.toLocaleString()}</b></div><div className="dash-note">Staff records: {opsCounts.staff.toLocaleString()} · Master trainers: {opsCounts.trainers} · Venue/classroom rows: {opsCounts.venues} · Attendance rows: {opsCounts.attendance.toLocaleString()}. Values refresh from this district database.</div></div></div>

 <div className="dash-grid">
 <div className="panel dash-wide"><div className="panel-head"><div><h3>NC / VC-wise polling station register summary</h3><p>Council type, council number and full council name are kept as separate fields</p></div></div><div className="table-wrap"><table><thead><tr><th>Tehsil</th><th>NC/VC Type</th><th>NC/VC No</th><th>NC/VC Name</th><th>Stations</th><th>Blocks</th><th>Male voters</th><th>Female voters</th><th>Total voters</th><th>Male booths</th><th>Female booths</th></tr></thead><tbody>{councilSummary.map((c,i)=><tr key={c.tehsil+"|"+c.type+"|"+c.number+"|"+i}><td>{c.tehsil}</td><td><b>{c.type}</b></td><td>{c.number}</td><td>{c.name}</td><td>{c.stations}</td><td>{c.blocks}</td><td>{c.maleVoters.toLocaleString()}</td><td>{c.femaleVoters.toLocaleString()}</td><td><b>{(c.maleVoters+c.femaleVoters).toLocaleString()}</b></td><td>{c.maleBooths}</td><td>{c.femaleBooths}</td></tr>)}</tbody></table>{!councilSummary.length&&<Empty/>}</div></div>
 <div className="panel"><h3>5% reserve and total training requirement</h3><p>Reserve is rounded up separately for each staffing category</p><div className="table-wrap"><table><thead><tr><th>Category</th><th>Duty</th><th>5% target</th><th>Actual reserve</th><th>Shortage</th><th>Training required</th></tr></thead><tbody>{operationalSummary.reserveRows.map(x=><tr key={x.label}><td>{x.label}</td><td>{x.duty.toLocaleString()}</td><td>{x.reserve.toLocaleString()}</td><td>{x.actual.toLocaleString()}</td><td>{x.shortage.toLocaleString()}</td><td><b>{x.training.toLocaleString()}</b></td></tr>)}</tbody><tfoot><tr><th>Total</th><th>{reserveSummary.totalDuty.toLocaleString()}</th><th>{reserveSummary.totalReserve.toLocaleString()}</th><th>{operationalSummary.reserveRows.reduce((n,x)=>n+x.actual,0).toLocaleString()}</th><th>{operationalSummary.reserveRows.reduce((n,x)=>n+x.shortage,0).toLocaleString()}</th><th>{reserveSummary.totalTraining.toLocaleString()}</th></tr></tfoot></table></div><div className="dash-note">This is a demand-side target. It does not imply that staff have been imported, assigned or trained.</div></div>
 <div className="panel"><h3>Staffing and training data status</h3><p>Live counts from normalized district tables</p><div className="dash-stat"><span>Staff roster</span><b>{opsCounts.staff.toLocaleString()}</b></div><div className="dash-stat"><span>Active duty assignments</span><b>{operationalSummary.activeAssignments.length.toLocaleString()}</b></div><div className="dash-stat"><span>Current vacancies</span><b>{operationalSummary.vacancyRows.reduce((n,r)=>n+r.total,0).toLocaleString()}</b></div><div className="dash-stat"><span>Master trainers / venues</span><b>{opsCounts.trainers} / {opsCounts.venues}</b></div><div className="dash-stat"><span>Training batches / attendance rows</span><b>{opsCounts.batches} / {opsCounts.attendance}</b></div><div className="dash-note">Vacancies equal current staffing demand minus active valid assignments. They will reduce when appointments are entered.</div></div>
 <div className="panel"><h3>Data quality checks</h3><p>Missing values are counted from the imported source records</p><div className="dash-stat"><span>Missing Tehsil</span><b>{dataQuality.missingTehsil.toLocaleString()}</b></div><div className="dash-stat"><span>Missing NC/VC type</span><b>{dataQuality.missingCouncilType.toLocaleString()}</b></div><div className="dash-stat"><span>Missing NC/VC number</span><b>{dataQuality.missingCouncilNo.toLocaleString()}</b></div><div className="dash-stat"><span>Missing NC/VC name</span><b>{dataQuality.missingCouncilName.toLocaleString()}</b></div><div className="dash-stat"><span>Missing census block code</span><b>{dataQuality.missingBlockCode.toLocaleString()}</b></div><div className="dash-stat"><span>Missing station name / type</span><b>{(dataQuality.missingStationName+dataQuality.missingStationType).toLocaleString()}</b></div><div className="dash-stat"><span>Missing voter values (source rows)</span><b>{dataQuality.missingVoterValues.toLocaleString()}</b></div></div>
 <div className="panel"><h3>Polling station classification</h3><p>Male, female and combined station counts</p><div className="dash-stat"><span>Male only</span><b>{stationTypeCounts.male}</b></div><div className="dash-stat"><span>Female only</span><b>{stationTypeCounts.female}</b></div><div className="dash-stat"><span>Combined</span><b>{stationTypeCounts.combined}</b></div><div className="dash-stat total"><span>Total classified</span><b>{stationTypeCounts.male+stationTypeCounts.female+stationTypeCounts.combined}</b></div></div>
 </div>

 <div className="dash-grid">
 <div className="panel dash-wide"><h3>Staffing demand — Tehsil × Role × Gender</h3><p>Calculated from the polling-station and booth demand rules</p><div className="table-wrap"><table><thead><tr><th>Tehsil</th><th>Role</th><th>Male</th><th>Female</th><th>Total</th></tr></thead><tbody>{dashboard.tehsils.flatMap(t=>[{label:"Presiding Officer",male:t.presMale,female:t.presFemale},{label:"Senior APO",male:t.srapoMale,female:t.srapoFemale},{label:"APO",male:t.apoMale,female:t.apoFemale},{label:"Polling Officer",male:t.poMale,female:t.poFemale}].map(r=><tr key={t.name+"|"+r.label}><td>{t.name}</td><td>{r.label}</td><td>{r.male.toLocaleString()}</td><td>{r.female.toLocaleString()}</td><td><b>{(r.male+r.female).toLocaleString()}</b></td></tr>))}</tbody></table></div></div>
 <div className="panel"><h3>Staffing assigned — Tehsil × Role × Gender</h3><p>Counted from active staff assignments and the linked staff and station records</p><div className="table-wrap"><table><thead><tr><th>Tehsil</th><th>Role</th><th>Male</th><th>Female</th><th>Total</th></tr></thead><tbody>{operationalSummary.assignedRows.map((r,i)=><tr key={r.tehsil+"|"+r.role+"|"+i}><td>{r.tehsil}</td><td>{r.role}</td><td>{r.male}</td><td>{r.female}</td><td><b>{r.total}</b></td></tr>)}</tbody></table></div><div className="dash-stat total"><span>Active assignments</span><b>{operationalSummary.activeAssignments.length.toLocaleString()}</b></div></div>
 <div className="panel"><h3>Staffing vacancy — Tehsil × Role × Gender</h3><p>Demand minus active assigned staff; vacancies never become negative</p><div className="table-wrap"><table><thead><tr><th>Tehsil</th><th>Role</th><th>Male</th><th>Female</th><th>Total</th></tr></thead><tbody>{operationalSummary.vacancyRows.map((r,i)=><tr key={r.tehsil+"|"+r.role+"|"+i}><td>{r.tehsil}</td><td>{r.role}</td><td>{r.male}</td><td>{r.female}</td><td><b>{r.total}</b></td></tr>)}</tbody></table></div><div className="dash-stat total"><span>Total vacancies</span><b>{operationalSummary.vacancyRows.reduce((n,r)=>n+r.total,0).toLocaleString()}</b></div></div>
 <div className="panel"><h3>Training summary</h3><p>Verified trainers, available classrooms and configured plans</p><div className="dash-stat"><span>Male / Female master trainers</span><b>{operationalSummary.trainerMale} / {operationalSummary.trainerFemale}</b></div><div className="dash-stat"><span>Available venue / classroom records</span><b>{operationalSummary.availableVenues}</b></div><div className="dash-stat"><span>Available classroom capacity</span><b>{operationalSummary.venueCapacity.toLocaleString()}</b></div><div className="dash-stat"><span>Training plans</span><b>{opsCounts.plans}</b></div></div>
 <div className="panel"><h3>Training batches by category</h3><p>Generated batches split by gender; batch schedule is not reduced by staff shortages</p><div className="table-wrap"><table><thead><tr><th>Category</th><th>Male batches</th><th>Female batches</th><th>Total</th></tr></thead><tbody>{operationalSummary.batchGroups.map(r=><tr key={r.label}><td>{r.label}</td><td>{r.male}</td><td>{r.female}</td><td><b>{r.male+r.female}</b></td></tr>)}</tbody></table></div><div className="dash-stat total"><span>All batches</span><b>{opsCounts.batches.toLocaleString()}</b></div></div>
 <div className="panel"><h3>Training attendance summary</h3><p>Actual attendance records; no attendance is assumed for unscheduled staff</p><div className="dash-stat"><span>Participants</span><b>{opsCounts.participants.toLocaleString()}</b></div><div className="dash-stat"><span>Present</span><b>{operationalSummary.present.toLocaleString()}</b></div><div className="dash-stat"><span>Absent</span><b>{operationalSummary.absent.toLocaleString()}</b></div><div className="dash-stat"><span>Pending</span><b>{operationalSummary.pending.toLocaleString()}</b></div><div className="dash-stat total"><span>Attendance rows</span><b>{opsCounts.attendance.toLocaleString()}</b></div></div>
 <div className="panel"><h3>Schedule conflict summary</h3><p>Classroom double-booking and Sunday batch checks</p><div className="dash-stat"><span>Venue/time overlaps</span><b>{operationalSummary.venueConflicts}</b></div><div className="dash-stat"><span>Sunday batches</span><b>{operationalSummary.sundayBatches}</b></div><div className="dash-stat total"><span>Total schedule issues</span><b>{operationalSummary.venueConflicts+operationalSummary.sundayBatches}</b></div></div>
 <div className="panel"><h3>Cross-tehsil assignment summary</h3><p>Staff deployed outside their home Tehsil, counted from linked roster and station</p><div className="dash-stat"><span>Cross-tehsil assignments</span><b>{operationalSummary.crossAssignments.toLocaleString()}</b></div><div className="dash-stat"><span>Home-tehsil assignments</span><b>{Math.max(0,operationalSummary.activeAssignments.length-operationalSummary.crossAssignments).toLocaleString()}</b></div></div>
 <div className="panel"><h3>Staff data completeness</h3><p>Missing and invalid values in the imported roster</p>{operationalSummary.staffIssues.map(r=><div className="dash-stat" key={r.label}><span>{r.label}</span><b>{r.count.toLocaleString()}</b></div>)}<div className="dash-stat"><span>Invalid CNIC format</span><b>{operationalSummary.invalidCnic.toLocaleString()}</b></div><div className="dash-stat"><span>Invalid mobile format</span><b>{operationalSummary.invalidMobile.toLocaleString()}</b></div><div className="dash-stat total"><span>Total staff records</span><b>{opsCounts.staff.toLocaleString()}</b></div></div>
 <div className="panel"><h3>Registered voters by Tehsil</h3><p>Tehsil comparison using male and female voter totals</p>{dashboard.tehsils.map(t=>{const total=t.maleVoters+t.femaleVoters;const max=Math.max(1,...dashboard.tehsils.map(x=>x.maleVoters+x.femaleVoters));return <div className="voter-bar-row" key={t.name}><div><span>{t.name}</span><b>{total.toLocaleString()}</b></div><div className="voter-bar"><i style={{width:(total/max*100)+"%"}}/></div><small>Male {t.maleVoters.toLocaleString()} · Female {t.femaleVoters.toLocaleString()}</small></div>;})}</div>
 <div className="panel"><h3>Data quality at a glance</h3><p>Informational checks only; source rows are retained</p><div className="dash-stat"><span>Missing council type</span><b>{dataQuality.missingCouncilType.toLocaleString()}</b></div><div className="dash-stat"><span>Missing council name</span><b>{dataQuality.missingCouncilName.toLocaleString()}</b></div><div className="dash-stat"><span>Missing block code</span><b>{dataQuality.missingBlockCode.toLocaleString()}</b></div><div className="dash-stat"><span>Missing station type</span><b>{dataQuality.missingStationType.toLocaleString()}</b></div></div>
 </div>
 <div className="panel"><h3>Database relationship check</h3><p>{counts.stations===counts.allocations&&counts.blocks===counts.allocations?"The current record counts match. Verify station/block relationships for duplicate or missing links.":"Record counts differ: census blocks, allocations and polling stations require reconciliation."}</p><div className="cards"><Metric label="TEHSILS" value={counts.tehsils}/><Metric label="POLLING STATIONS" value={counts.stations}/><Metric label="CENSUS BLOCKS" value={counts.blocks}/><Metric label="BLOCK–STATION LINKS" value={counts.allocations}/></div></div></>}
 {section==="DATA Import"&&<div className="panel import-panel"><div className="upload-icon">⇧</div><h2>Upload primary polling station DATA</h2><p>Upload the district DATA Excel/CSV file. It is sent to Supabase in batches of up to 20 rows; slow batches are automatically split and linked to Tehsils, Councils, Polling Stations, Census Blocks and allocations.</p><input ref={input} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>importData(e.target.files?.[0])}/><div className="header-actions"><button className="btn light" onClick={downloadTemplate}>Download Excel Template</button><button className="btn primary" disabled={busy||!districtId} onClick={()=>input.current?.click()}>{busy?"Uploading…":"Choose DATA Excel / CSV"}</button></div><div className="hint">Required: Tehsil, Council Type, Council No, Council Name, PS No, station name/type, booths, Census Block Code and voter columns. Original row fields are retained.</div>{issues.length>0&&<div className="issue-box"><b>Rows requiring review ({issues.length}{issues.length===300?"+":""})</b>{issues.slice(0,30).map((x,i)=><div key={i}>{x}</div>)}</div>}</div>}
 {uploadConfig[section]&&<div className="panel upload-workspace">
  <div className="panel-head"><div><div className="eyebrow">DISTRICT DATA MANAGEMENT</div><h2>{uploadConfig[section].title}</h2><p>{uploadConfig[section].description}</p></div><span className="tag">{opsCounts[section==="Staff Data"?"staff":section==="Master Trainers"?"trainers":section==="Training Venues"?"venues":section==="Demand Rules"?"rules":["District Settings","Training Settings"].includes(section)?"settings":"plans"]?.toLocaleString?.()||"—"} records in overview</span></div>
  <div className="upload-actions"><input ref={uploadInput} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>prepareUpload(e.target.files?.[0],section)}/><button className="btn light" onClick={()=>downloadUploadTemplate(section)}>Download {section} Template</button><button className="btn primary" disabled={busy||!districtId} onClick={()=>uploadInput.current?.click()}>{busy?"Reading…":"Choose Excel / CSV"}</button><button className="btn primary" disabled={busy||!(uploadRows[section]||[]).length} onClick={()=>commitUpload(section)}>Import {uploadRows[section]?.length||0} rows</button><button className="btn light" disabled={busy} onClick={async()=>{const q=await (supabase as any).from(uploadConfig[section].table).select("*").eq("district_id",districtId).limit(500);if(q.error)setNotice(q.error.message);else setUploadRecords(q.data||[]);}}>Refresh records</button></div>
  <div className="upload-hint">Incremental import: matching staff CNIC/source number, trainer CNIC, venue/classroom identity, rule key, plan type or setting key is updated; new rows are inserted. Rows with warnings are not automatically discarded. Original source columns remain stored.</div>
  {(uploadRows[section]||[]).length>0&&<><h3>Import preview — {uploadRows[section].length.toLocaleString()} rows</h3><div className="table-wrap preview-table"><table><thead><tr>{Object.keys(uploadRows[section][0]||{}).slice(0,10).map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{uploadRows[section].slice(0,8).map((r:any,i:number)=><tr key={i}>{Object.keys(uploadRows[section][0]||{}).slice(0,10).map(h=><td key={h}>{String(r[h]??"")}</td>)}</tr>)}</tbody></table></div><p className="hint">Showing first 8 rows and first 10 columns. All detected rows will be imported.</p></>}
  {uploadWarnings.length>0&&<div className="issue-box"><b>Validation warnings ({uploadWarnings.length}{uploadWarnings.length>=500?"+":""})</b>{uploadWarnings.slice(0,35).map((w,i)=><div key={i}>{w}</div>)}</div>}
  <div className="panel-head records-heading"><div><h3>Saved {section} records</h3><p>{uploadRecords.length?("Showing "+uploadRecords.length+" records loaded from the selected district."): "No records loaded yet. Refresh records after import."}</p></div></div>
  {uploadRecords.length>0?<div className="table-wrap preview-table"><table><thead><tr>{Object.keys(displayUploadRecord(uploadRecords[0])).map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{uploadRecords.slice(0,100).map((r:any,i:number)=><tr key={r.id||i}>{Object.keys(displayUploadRecord(uploadRecords[0])).map(k=><td key={k}>{String(displayUploadRecord(r)[k]??"")}</td>)}</tr>)}</tbody></table></div>:<Empty/>}
 </div>}
 {section==="Polling Stations"&&<div className="panel"><div className="panel-head"><div><h3>Polling station register</h3><p>Live records loaded from Supabase.</p></div><span className="tag">{stations.length} shown</span></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Tehsil No</th><th>Tehsil</th><th>Tehsil PS No</th><th>NC/VC Type</th><th>NC/VC No</th><th>NC/VC Name</th><th>NC/VC PS No</th><th>Polling Station</th><th>Type</th><th>Male booths</th><th>Female booths</th><th>Male voters</th><th>Female voters</th></tr></thead><tbody>{sortedStations.map((s,i)=><tr key={s.id}><td>{i+1}</td><td>{tehsilOrder.indexOf(String(s.source_data?.Tehsil??"").trim())+1}</td><td>{String(s.source_data?.Tehsil??"—")}</td><td>{String(s.tehsil_ps_number??s.source_data?.["Tehsil PS No"]??"—")}</td><td><b>{String(s.source_data?.["Council Type (NC / VC)"]??"—")}</b></td><td>{String(s.source_data?.["NC/VC No"]??s.source_data?.["Council No"]??"—")}</td><td>{String(s.source_data?.["Council Name"]??"—")}</td><td>{String(s.nc_vc_ps_number||s.source_data?.["NC/VC PS No"]||s.ps_number||"—")}</td><td>{s.name}</td><td>{s.station_type}</td><td>{s.male_booths??0}</td><td>{s.female_booths??0}</td><td>{Number(s.male_voters||0).toLocaleString()}</td><td>{Number(s.female_voters||0).toLocaleString()}</td></tr>)}</tbody></table>{!stations.length&&<Empty/>}</div></div>}
 {section==="Staff Demand"&&<div className="panel"><h3>Demand calculation</h3><p>Demand is calculated from the DATA import independently of staff availability. Upload or reload DATA to calculate the station-level demand preview.</p><Metric label="REQUIRED STAFF FROM CURRENT UPLOAD" value={showDemand}/></div>}
 {section==="Relations Check"&&<div className="panel"><h3>Database relationship checks</h3><div className="cards"><Metric label="TEHSILS" value={counts.tehsils}/><Metric label="STATIONS" value={counts.stations}/><Metric label="CENSUS BLOCKS" value={counts.blocks}/><Metric label="ALLOCATIONS" value={counts.allocations}/></div><p>{counts.stations&&counts.allocations&&counts.blocks===counts.allocations?"Relationship counts match: each imported census block has a station allocation.":"Relationship counts need review. Expected one allocation per census block; check missing or duplicate block-to-station links before relying on reports."}</p><button className="btn light" onClick={loadDistrictData}>Recheck PostgreSQL counts</button></div>}
 <footer>KPK Election Management System · Supabase PostgreSQL is the operational data store · Staff/trainer/venue imports are separate modules</footer></main></div>;
}
function displayUploadRecord(r:any){return r?.source_data||r?.rule_data||r?.plan_data||r||{};}
function Metric({label,value}:{label:string,value:number}){return <div className="metric"><div>{label}</div><strong>{value.toLocaleString()}</strong></div>}
function Empty(){return <div className="empty">No polling stations found for this district. Upload the primary DATA workbook.</div>}
