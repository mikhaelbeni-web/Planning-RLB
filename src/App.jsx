import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "./firebase.js";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const DAYS   = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

const C_BASE = {
  MICKAEL:{ bg:"#EDE9FE", text:"#5B21B6", border:"#C4B5FD", dot:"#8B5CF6" },
  ZACK:   { bg:"#DBEAFE", text:"#1E40AF", border:"#93C5FD", dot:"#3B82F6" },
  KURTIS: { bg:"#D1FAE5", text:"#065F46", border:"#6EE7B7", dot:"#10B981" },
  ENZO:   { bg:"#FEF3C7", text:"#92400E", border:"#FCD34D", dot:"#F59E0B" },
};
const C_EXTRA = [
  { bg:"#FCE7F3", text:"#9D174D", border:"#F9A8D4", dot:"#EC4899" },
  { bg:"#FEE2E2", text:"#991B1B", border:"#FCA5A5", dot:"#EF4444" },
  { bg:"#CFFAFE", text:"#164E63", border:"#67E8F9", dot:"#06B6D4" },
  { bg:"#F3E8FF", text:"#6B21A8", border:"#D8B4FE", dot:"#A855F7" },
  { bg:"#DCFCE7", text:"#14532D", border:"#86EFAC", dot:"#22C55E" },
  { bg:"#FEF9C3", text:"#713F12", border:"#FDE047", dot:"#EAB308" },
];
let _dynEmps = [];
const C = new Proxy(C_BASE, {
  get(target, prop) {
    if (prop in target) return target[prop];
    const idx = _dynEmps.indexOf(prop);
    return C_EXTRA[Math.max(0,idx) % C_EXTRA.length];
  }
});

const EMOJI_LIST = ["👨‍💼","🧑","👦","🧔","👩","👨","🧒","👴","🧑‍💼","👷"];
const DEFAULT_EMPS = ["MICKAEL","ZACK","KURTIS","ENZO"];
const DEFAULT_CONTRACTS  = { MICKAEL:35, ZACK:35, KURTIS:35, ENZO:35 };
const DEFAULT_EMP_NAMES  = { MICKAEL:"Mickael", ZACK:"Zack", KURTIS:"Kurtis", ENZO:"Enzo" };
const DEFAULT_EMP_EMAILS = { MICKAEL:"", ZACK:"", KURTIS:"", ENZO:"" };
let NAMES = { ...DEFAULT_EMP_NAMES };
const N = emp => NAMES[emp] || (emp ? emp[0]+emp.slice(1).toLowerCase() : "");

const PRESETS_A = ["08:00-13:00","08:30-13:00","08:30-13:30","08:45-12:00","09:00-13:00","09:15-12:45","10:00-12:30","10:15-12:45","11:45-16:00","11:45-16:30"];
const PRESETS_B = ["13:00-18:30","14:00-17:00","14:00-18:00","14:00-18:30","14:00-19:00","14:15-18:00","14:15-18:30","14:45-18:00","14:45-18:30","15:30-18:30"];

// ─── FIREBASE STORAGE ────────────────────────────────────────────────────────
const S = {
  async get(k) {
    try { const snap = await getDoc(doc(db,"planning",k)); return snap.exists()?snap.data().value:null; }
    catch(e) { console.warn("Firebase get error:",e); return null; }
  },
  async set(k,v) {
    try { await setDoc(doc(db,"planning",k),{value:v,updatedAt:serverTimestamp()}); }
    catch(e) { console.warn("Firebase set error:",e); }
  },
  listen(k,callback) {
    return onSnapshot(doc(db,"planning",k),snap=>{ callback(snap.exists()?snap.data().value:null); });
  },
  getLocal(k)    { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  setLocal(k,v)  { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} },
};

// ─── AUTH ────────────────────────────────────────────────────────────────────
const DEFAULT_RH_HASH = "d31db950efb62b522f978c0d3e3b9a067e0f87da9c46865da77c25031fb703ce";
async function hashPwd(s) {
  const buf = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function useIsDesktop() {
  const [d,setD] = useState(typeof window!=="undefined"&&window.innerWidth>768);
  useEffect(()=>{ const h=()=>setD(window.innerWidth>768); window.addEventListener("resize",h); return()=>window.removeEventListener("resize",h); },[]);
  return d;
}

function getWeeksForMonth(year,month) {
  const firstDay=new Date(year,month-1,1), lastDay=new Date(year,month,0);
  const start=new Date(firstDay), dow=start.getDay();
  start.setDate(start.getDate()-(dow===0?6:dow-1));
  const weeks=[]; let cur=new Date(start);
  while(cur<=lastDay){
    const days=Array.from({length:7},(_,i)=>{
      const d=new Date(cur); d.setDate(d.getDate()+i);
      return{date:new Date(d),day:d.getDate(),month:d.getMonth()+1,year:d.getFullYear(),inMonth:d.getMonth()+1===month&&d.getFullYear()===year};
    });
    const fmt=d=>String(d.day).padStart(2,"0");
    const label=(()=>{ const s=days[0],e=days[6]; if(s.month===e.month) return`${fmt(s)} – ${fmt(e)} ${MONTHS[s.month-1]}`; return`${fmt(s)} ${MONTHS[s.month-1].slice(0,3)} – ${fmt(e)} ${MONTHS[e.month-1].slice(0,3)}`; })();
    const id=`w${cur.toISOString().slice(0,10).replace(/-/g,"")}`;
    weeks.push({id,label,days}); cur.setDate(cur.getDate()+7);
  }
  return weeks;
}

function parseMin(range) {
  if(!range) return 0;
  const toM=t=>{ const clean=t.trim().replace(/h/i,":"); const[h,m]=clean.split(":").map(s=>parseInt(s)||0); return h*60+(m||0); };
  const dash=range.lastIndexOf("-"); if(dash<=0) return 0;
  return Math.max(0,toM(range.slice(dash+1))-toM(range.slice(0,dash)));
}
function cellMin(cell) { return!cell?0:parseMin(cell.a)+(cell.b?parseMin(cell.b):0); }
function fmtH(m) { const h=Math.floor(m/60),mn=m%60; return mn?`${h}h${String(mn).padStart(2,"0")}`:`${h}h`; }
function fmtHDec(m) { const h=m/60; return h%1===0?`${h}h`:`${h.toFixed(2)}h`; }
function contractMonthMin(weeklyH) { return Math.round(weeklyH*52/12*60); }

function buildShiftsForEmail(emp,weeks,plan,curMonth) {
  const rows=[];
  weeks.forEach(week=>{ const wp=plan[week.id]; week.days.forEach((d,i)=>{ if(!d.inMonth)return; const cell=wp?.[emp]?.[i]; const label=`${DAYS[i]} ${String(d.day).padStart(2,"0")}`; rows.push({day:label,shift:cell?`${cell.a}${cell.b?" / "+cell.b:""}`:null,dayIdx:i,inMonth:d.inMonth,cell}); }); });
  return rows;
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const savedUser=(()=>{ try{return JSON.parse(localStorage.getItem("rlb-session"));}catch{return null;} })();
  const [user,setUser]             = useState(savedUser);
  const [showPortal,setShowPortal] = useState(!savedUser);
  const [emps,setEmps]             = useState(DEFAULT_EMPS);
  const [deletedEmps,setDeletedEmps] = useState({});  // { EMP_ID: { ts, names, emails, contracts } }
  const [plan,setPlan]             = useState({});
  const [contracts,setContracts]   = useState(DEFAULT_CONTRACTS);
  const [empNames,setEmpNames]     = useState(DEFAULT_EMP_NAMES);
  const [empEmails,setEmpEmails]   = useState(DEFAULT_EMP_EMAILS);
  const [notifs,setNotifs]         = useState([]);
  const [lastSeen,setLastSeen]     = useState(null);
  const [curMonth,setCurMonth]     = useState(()=>{ const n=new Date(); return{year:n.getFullYear(),month:n.getMonth()+1}; });
  const [weekIdx,setWeekIdx]       = useState(0);
  const [panel,setPanel]           = useState(null);
  const [myOnly,setMyOnly]         = useState(false);
  const [loading,setLoading]       = useState(false);
  const [viewMode,setViewMode]     = useState('week');
  const [emailsSentCount,setEmailsSentCount] = useState(0);
  const [preLoginEmps,setPreLoginEmps]   = useState(()=>{ try{return JSON.parse(localStorage.getItem("rlb-emp-cache"))||DEFAULT_EMPS;}catch{return DEFAULT_EMPS;} });
  const [preLoginNames,setPreLoginNames] = useState(()=>{ try{return JSON.parse(localStorage.getItem("rlb-names-cache"))||DEFAULT_EMP_NAMES;}catch{return DEFAULT_EMP_NAMES;} });
  const isDesktop = useIsDesktop();
  const weeks = useMemo(()=>getWeeksForMonth(curMonth.year,curMonth.month),[curMonth]);

  // Sync couleurs dynamiques
  useEffect(()=>{ _dynEmps=emps.filter(e=>!(e in C_BASE)); },[emps]);

  // Rafraîchir données login depuis Firebase au démarrage
  useEffect(()=>{
    const refresh=async()=>{ try{
      const el=await S.get("rlb-emp-list"); const en=await S.get("rlb-empnames");
      if(el&&el.length>0){ setPreLoginEmps(el); try{localStorage.setItem("rlb-emp-cache",JSON.stringify(el));}catch{} }
      if(en&&Object.keys(en).length>0){ setPreLoginNames(en); try{localStorage.setItem("rlb-names-cache",JSON.stringify(en));}catch{} }
    }catch{}};
    refresh();
  },[]);

  // Firebase listeners temps réel
  useEffect(()=>{
    if(!user) return;
    setLoading(true);
    const ls=S.getLocal(`rlb-seen-${user.id}`); setLastSeen(ls);
    S.setLocal(`rlb-seen-${user.id}`,Date.now());
    let loaded=0; const markLoaded=()=>{ loaded++; if(loaded>=5)setLoading(false); };
    const u1=S.listen("rlb-plan",v=>{ setPlan(v||{}); markLoaded(); });
    const u2=S.listen("rlb-contracts",v=>{ setContracts(v||DEFAULT_CONTRACTS); markLoaded(); });
    const u3=S.listen("rlb-notifs",v=>{ setNotifs(v||[]); markLoaded(); });
    const u4=S.listen("rlb-empnames",v=>{ const n=v||DEFAULT_EMP_NAMES; setEmpNames(n); NAMES=n; markLoaded(); });
    const u5=S.listen("rlb-empemails",v=>{ setEmpEmails(v||DEFAULT_EMP_EMAILS); markLoaded(); });
    const u6=S.listen("rlb-emp-list",v=>{ const list=v||DEFAULT_EMPS; setEmps(list); _dynEmps=list.filter(e=>!(e in C_BASE)); });
    const u7=S.listen("rlb-emp-deleted",v=>{ setDeletedEmps(v||{}); });
    return()=>{ u1();u2();u3();u4();u5();u6();u7(); };
  },[user]);

  const goMonth=(delta)=>{ setCurMonth(prev=>{ let m=prev.month+delta,y=prev.year; if(m>12){m=1;y++;}if(m<1){m=12;y--;} return{year:y,month:m}; }); setWeekIdx(0); };
  const unread=notifs.filter(n=>!lastSeen||n.ts>lastSeen).length;

  const getWeekPlan=(weekId)=>{ const w=plan[weekId]; if(w){ const result={...w}; emps.forEach(e=>{if(!result[e])result[e]=Array(7).fill(null);}); return result; } return Object.fromEntries(emps.map(e=>[e,Array(7).fill(null)])); };
  const week=weeks[weekIdx]||weeks[0];
  const weekPlan=week?(()=>{ const wp=week?getWeekPlan(week.id):{}; const result={...wp}; emps.forEach(e=>{if(!result[e])result[e]=Array(7).fill(null);}); return result; })():{};

  const monthHours=useMemo(()=>{ const res=Object.fromEntries(emps.map(e=>[e,0])); weeks.forEach(w=>{ const wp=plan[w.id]; if(!wp)return; w.days.forEach((d,i)=>{ if(!d.inMonth)return; emps.forEach(e=>{res[e]=(res[e]||0)+cellMin(wp[e]?.[i]);}); }); }); return res; },[plan,weeks,emps]);

  const saveCell=async(weekId,emp,dayIdx,data)=>{
    const next=JSON.parse(JSON.stringify(plan));
    if(!next[weekId])next[weekId]=getWeekPlan(weekId);
    if(!next[weekId][emp])next[weekId][emp]=Array(7).fill(null);
    next[weekId][emp][dayIdx]=data;
    setPlan(next); await S.set("rlb-plan",next);
    const notif={ts:Date.now(),type:"edit",msg:`✏️ ${N(emp)} · ${week.label} · ${DAYS[dayIdx]}`,detail:data?`${data.a}${data.b?" / "+data.b:""}`:data===null?"CP":"Repos",by:user.name};
    pushNotif(notif); setPanel(null);
  };

  const saveBulk=async(empsArg,dayIndices,data,scope)=>{
    const next=JSON.parse(JSON.stringify(plan));
    const weeksToApply=scope==="month"?weeks:[weeks[weekIdx]];
    weeksToApply.forEach(wk=>{ if(!next[wk.id])next[wk.id]=getWeekPlan(wk.id); empsArg.forEach(emp=>{ if(!next[wk.id][emp])next[wk.id][emp]=Array(7).fill(null); dayIndices.forEach(di=>{ if(wk.days[di]?.inMonth)next[wk.id][emp][di]=data; }); }); });
    setPlan(next); await S.set("rlb-plan",next);
    const scopeLabel=scope==="month"?`tout ${MONTHS[curMonth.month-1]}`:(weeks[weekIdx]?.label||"");
    pushNotif({ts:Date.now(),type:"bulk",msg:`⚡ Saisie groupée — ${empsArg.map(e=>N(e)).join(", ")}`,detail:`${dayIndices.map(d=>DAYS[d]).join(", ")} · ${scopeLabel}`,by:user.name});
    setPanel(null);
  };

  const publish=async(selectedEmps)=>{
    const monthLabel=`${MONTHS[curMonth.month-1]} ${curMonth.year}`;
    const targetEmps=selectedEmps||emps;
    const emailPromises=targetEmps.map(async emp=>{
      const email=empEmails[emp]; if(!email)return;
      const shifts=buildShiftsForEmail(emp,weeks,plan,curMonth);
      const calendarWeeks=weeks.map(week=>({ label:week.label, days:week.days.map((d,i)=>({day:d.day,inMonth:d.inMonth,dayIdx:i,cell:plan[week.id]?.[emp]?.[i]||null})) }));
      const totalMin=calendarWeeks.reduce((acc,w)=>acc+w.days.reduce((a2,d)=>d.inMonth&&d.cell?a2+parseMin(d.cell.a)+(d.cell.b?parseMin(d.cell.b):0):a2,0),0);
      const totalHours=fmtH(totalMin);
      try{ await fetch("/api/send-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:email,name:N(emp),month:monthLabel,calendarWeeks,totalHours})}); }catch(e){console.warn("Email error:",e);}
    });
    await Promise.allSettled(emailPromises);
    const emailsSent=targetEmps.filter(emp=>empEmails[emp]).length;
    setEmailsSentCount(emailsSent);
    pushNotif({ts:Date.now(),type:"publish",msg:`📢 Planning ${monthLabel} publié`,detail:`Publié par ${user.name}`,by:user.name});
    setPanel("confirm");
  };

  const saveEmpSettings=async(names,emails,empList)=>{
    const list=empList||emps;
    const removed=emps.filter(e=>!list.includes(e));

    // Archiver les employés supprimés (sans toucher aux données planning)
    const newDeleted={...deletedEmps};
    removed.forEach(emp=>{
      newDeleted[emp]={
        ts: Date.now(),
        name: names[emp]||empNames[emp]||emp,
        email: emails[emp]||empEmails[emp]||"",
        contract: contracts[emp]||35,
        deletedBy: user.name,
      };
    });

    const newContracts={...contracts}; list.forEach(e=>{if(newContracts[e]===undefined)newContracts[e]=35;});
    // NE PAS supprimer les contrats/noms/emails des archivés (on garde tout)
    const newNames={...names};
    const newEmails={...emails};

    setEmps(list); _dynEmps=list.filter(e=>!(e in C_BASE));
    setEmpNames(newNames); NAMES=newNames;
    setEmpEmails(newEmails); setContracts(newContracts);
    setDeletedEmps(newDeleted);

    await S.set("rlb-emp-list",list);
    await S.set("rlb-empnames",newNames);
    await S.set("rlb-empemails",newEmails);
    await S.set("rlb-contracts",newContracts);
    await S.set("rlb-emp-deleted",newDeleted);

    try{localStorage.setItem("rlb-emp-cache",JSON.stringify(list)); localStorage.setItem("rlb-names-cache",JSON.stringify(newNames));}catch{}
    setPreLoginEmps(list); setPreLoginNames(newNames);

    if(removed.length>0){
      pushNotif({ts:Date.now(),type:"edit",msg:`🗑️ ${removed.length} employé(s) archivé(s)`,detail:`Par ${user.name} — récupérable via 👥 › Corbeille`,by:user.name});
    }
    setPanel(null);
  };

  // Restaurer un employé archivé
  const restoreEmp=async(emp)=>{
    if(!deletedEmps[emp]) return;
    const restored=deletedEmps[emp];
    const newEmps=[...emps,emp];
    const newNames={...empNames,[emp]:restored.name};
    const newEmails={...empEmails,[emp]:restored.email||""};
    const newContracts={...contracts,[emp]:restored.contract||35};
    const newDeleted={...deletedEmps}; delete newDeleted[emp];

    setEmps(newEmps); _dynEmps=newEmps.filter(e=>!(e in C_BASE));
    setEmpNames(newNames); NAMES=newNames;
    setEmpEmails(newEmails); setContracts(newContracts);
    setDeletedEmps(newDeleted);

    await S.set("rlb-emp-list",newEmps);
    await S.set("rlb-empnames",newNames);
    await S.set("rlb-empemails",newEmails);
    await S.set("rlb-contracts",newContracts);
    await S.set("rlb-emp-deleted",newDeleted);

    try{localStorage.setItem("rlb-emp-cache",JSON.stringify(newEmps)); localStorage.setItem("rlb-names-cache",JSON.stringify(newNames));}catch{}
    setPreLoginEmps(newEmps); setPreLoginNames(newNames);

    pushNotif({ts:Date.now(),type:"edit",msg:`♻️ ${restored.name} restauré`,detail:`Par ${user.name} — heures passées récupérées`,by:user.name});
  };

  const saveContracts=async(c)=>{ setContracts(c); await S.set("rlb-contracts",c); };
  const pushNotif=async(n)=>{ const next=[n,...notifs].slice(0,100); setNotifs(next); await S.set("rlb-notifs",next); };

  const duplicateWeekFn=async(srcId,dstId,srcPlan,dstPlan)=>{
    const next={...plan,[dstId]:dstPlan}; setPlan(next); await S.set("rlb-plan",next);
    pushNotif({ts:Date.now(),type:"edit",msg:`📋 Semaine dupliquée`,detail:`Par ${user.name}`,by:user.name});
    setPanel(null);
  };

  if(showPortal) return <Portal onEnterPlanning={()=>setShowPortal(false)} />;
  if(!user) return <Login preEmps={preLoginEmps} preNames={preLoginNames} onLogin={u=>{ try{localStorage.setItem("rlb-session",JSON.stringify(u));}catch{} setUser(u); setMyOnly(u.role==="employee"); }} />;
  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#F7F8FA",flexDirection:"column",gap:12}}><div style={{fontSize:32}}>📅</div><div style={{color:"#6B7280",fontSize:14}}>Chargement…</div></div>;

  const empsToShow=myOnly&&user.emp?[user.emp]:emps;

  return (
    <div style={{fontFamily:"system-ui,-apple-system,sans-serif",background:"#F7F8FA",minHeight:"100vh",maxWidth:isDesktop?1200:820,margin:"0 auto"}}>
      {/* HEADER */}
      <div style={{background:"#111827",color:"white",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>📅</span>
          <div>
            <div style={{fontWeight:700,fontSize:isDesktop?18:15,letterSpacing:"-0.5px"}}>RÉSIDENCE LE BELLEVILLE</div>
            <div style={{fontSize:11,color:"#9CA3AF"}}>{user.emoji} {user.name}{user.role==="rh"&&<span style={{background:"#DC2626",color:"white",borderRadius:4,padding:"0 4px",fontSize:10,marginLeft:6}}>RH</span>}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setPanel("notifs")} style={{background:"none",border:"none",cursor:"pointer",position:"relative",padding:4}}>
            <span style={{fontSize:22}}>🔔</span>
            {unread>0&&<span style={{position:"absolute",top:0,right:0,background:"#EF4444",color:"white",borderRadius:99,fontSize:10,fontWeight:700,minWidth:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{unread}</span>}
          </button>
          {user.role==="rh"&&<>
            <button onClick={()=>setPanel("empnames")} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,padding:4}}>👥</button>
            <button onClick={()=>setPanel("changepwd")} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,padding:4}}>🔒</button>
          </>}
          <button onClick={()=>{ try{localStorage.removeItem("rlb-session");}catch{} setUser(null); setShowPortal(true); }} style={{background:"#374151",border:"none",borderRadius:6,color:"#D1D5DB",fontSize:11,padding:"4px 8px",cursor:"pointer"}}>Changer</button>
        </div>
      </div>

      {/* NAV MOIS */}
      <div style={{background:"white",borderBottom:"1px solid #E5E7EB",padding:"10px 16px",display:"flex",alignItems:"center",gap:8}}>
        <button onClick={()=>goMonth(-1)} style={NAV_BTN}>‹</button>
        <div style={{flex:1,textAlign:"center"}}><div style={{fontWeight:800,fontSize:17,color:"#111827"}}>{MONTHS[curMonth.month-1]} {curMonth.year}</div></div>
        <button onClick={()=>goMonth(1)} style={NAV_BTN}>›</button>
      </div>

      {/* NAV SEMAINE */}
      <div style={{background:"#F9FAFB",borderBottom:"1px solid #F3F4F6",padding:"8px 16px",display:"flex",alignItems:"center",gap:6,overflowX:"auto"}}>
        {weeks.map((w,i)=>(
          <button key={w.id} onClick={()=>setWeekIdx(i)} style={{flexShrink:0,padding:"6px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:i===weekIdx?"#111827":"#F3F4F6",color:i===weekIdx?"white":"#6B7280",transition:"all 0.15s"}}>Sem. {i+1}</button>
        ))}
        {week&&<span style={{fontSize:11,color:"#9CA3AF",marginLeft:8,flexShrink:0}}>{week.label}</span>}
      </div>

      {/* TOGGLE VUE (employé) */}
      {user.role==="employee"&&(
        <div style={{padding:"8px 16px",display:"flex",gap:8}}>
          <ToggleBtn label="Toute l'équipe" active={!myOnly} onClick={()=>setMyOnly(false)} />
          <ToggleBtn label="Mon planning"   active={myOnly}  onClick={()=>setMyOnly(true)} accent />
        </div>
      )}

      {/* TOGGLE VUE SEMAINE / MOIS — AU-DESSUS de la grille */}
      <div style={{padding:"8px 16px 4px",display:"flex",gap:8}}>
        <button onClick={()=>setViewMode('week')} style={{flex:1,padding:"9px 0",border:"none",borderRadius:10,background:viewMode==='week'?"#111827":"#E5E7EB",color:viewMode==='week'?"white":"#6B7280",fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.15s"}}>📆 Semaine</button>
        <button onClick={()=>setViewMode('month')} style={{flex:1,padding:"9px 0",border:"none",borderRadius:10,background:viewMode==='month'?"#111827":"#E5E7EB",color:viewMode==='month'?"white":"#6B7280",fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.15s"}}>📅 Mois en un coup d'œil</button>
      </div>

      {/* GRILLE SEMAINE */}
      {viewMode==='week' && week&&(
        <div style={{overflowX:"auto",padding:"0 0 4px 0"}}>
          <table style={{borderCollapse:"collapse",width:"100%",minWidth:540}}>
            <thead>
              <tr style={{background:"#F9FAFB"}}>
                <th style={{...TH,width:70,textAlign:"left",paddingLeft:16,position:"sticky",left:0,background:"#F9FAFB",zIndex:2}}>Équipe</th>
                {DAYS.map((d,i)=>{ const di=week.days[i]; return(
                  <th key={d} style={{...TH,textAlign:"center",opacity:di.inMonth?1:0.35}}>
                    <div style={{fontWeight:700,color:"#374151",fontSize:11}}>{d}</div>
                    <div style={{color:"#9CA3AF",fontSize:10,fontWeight:400}}>{String(di.day).padStart(2,"0")}{!di.inMonth&&<span style={{fontSize:9}}> ({MONTHS[di.month-1].slice(0,3)})</span>}</div>
                  </th>
                ); })}
                {user.role==="rh"&&<th style={{...TH,textAlign:"center",borderLeft:"2px solid #E5E7EB",background:"#F0FDF4",minWidth:55}}><div style={{fontWeight:700,color:"#065F46",fontSize:10}}>Total</div><div style={{color:"#6EE7B7",fontSize:9}}>semaine</div></th>}
              </tr>
            </thead>
            <tbody>
              {empsToShow.map(emp=>{ const cells=weekPlan[emp]||Array(7).fill(null); const isMe=user.emp===emp; const mHours=monthHours[emp]||0;
                return(
                  <tr key={emp} style={{background:isMe?C[emp].bg+"44":"white",borderBottom:"1px solid #F3F4F6"}}>
                    <td style={{padding:"8px 6px 8px 16px",verticalAlign:"middle",position:"sticky",left:0,width:isDesktop?110:70,background:isMe?C[emp].bg+"77":"white",zIndex:1,borderRight:"2px solid "+C[emp].border}}>
                      <div style={{fontWeight:700,fontSize:isDesktop?13:11,color:C[emp].text,whiteSpace:"nowrap"}}>
                        <span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:C[emp].dot,marginRight:5}}/>{N(emp)}
                      </div>
                      <div style={{fontSize:10,color:"#9CA3AF",marginTop:2}}>{fmtH(mHours)}<span style={{opacity:0.6}}>/mois</span></div>
                    </td>
                    {cells.map((cell,di)=>{ const inM=week.days[di].inMonth; const isRH=user.role==="rh"; const isCP=cell?.a==="CP";
                      return(
                        <td key={di} style={{padding:"4px 2px",textAlign:"center",verticalAlign:"middle",opacity:inM?1:0.4}} onClick={()=>isRH&&inM&&setPanel({weekId:week.id,emp,day:di})}>
                          {cell?(
                            <div style={{background:isCP?"#DCFCE7":C[emp].bg,border:"1px solid "+(isCP?"#86EFAC":C[emp].border),borderRadius:7,padding:isDesktop?"8px 6px":"5px 3px",cursor:isRH&&inM?"pointer":"default",transition:"transform 0.1s"}}
                                 onMouseEnter={e=>isRH&&inM&&(e.currentTarget.style.transform="scale(1.05)")}
                                 onMouseLeave={e=>(e.currentTarget.style.transform="scale(1)")}>
                              <div style={{fontSize:isDesktop?12:10,fontWeight:700,color:isCP?"#065F46":C[emp].text,lineHeight:1.3}}>{isCP?"🌴 CP":cell.a}</div>
                              {cell.b&&<div style={{fontSize:isDesktop?12:10,fontWeight:700,color:C[emp].text,lineHeight:1.3,marginTop:2}}>{cell.b}</div>}
                              {isRH&&inM&&<div style={{fontSize:9,color:isCP?"#065F46":C[emp].text,opacity:0.45,marginTop:1}}>✏️</div>}
                            </div>
                          ):(
                            <div style={{background:"#F9FAFB",border:"1px dashed #E5E7EB",borderRadius:7,padding:"7px 3px",cursor:isRH&&inM?"pointer":"default"}}
                                 onMouseEnter={e=>isRH&&inM&&(e.currentTarget.style.borderColor="#9CA3AF")}
                                 onMouseLeave={e=>inM&&(e.currentTarget.style.borderColor="#E5E7EB")}>
                              <div style={{fontSize:10,color:"#D1D5DB",fontWeight:500}}>Repos</div>
                              {isRH&&inM&&<div style={{fontSize:9,color:"#9CA3AF",marginTop:1}}>+ ajouter</div>}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    {user.role==="rh"&&<td style={{padding:"4px 3px",textAlign:"center",verticalAlign:"middle",borderLeft:"2px solid #E5E7EB",background:"#F0FDF4"}}>
                      {(()=>{ const weekMin=cells.reduce((acc,cell)=>acc+cellMin(cell),0); return weekMin>0?<span style={{fontSize:11,fontWeight:800,color:"#065F46",background:"#D1FAE5",borderRadius:5,padding:"3px 6px"}}>{fmtH(weekMin)}</span>:<span style={{fontSize:10,color:"#D1D5DB"}}>—</span>; })()}
                    </td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* GRILLE MOIS INLINE */}
      {viewMode==='month' && (
        <div style={{padding:"8px 16px",overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",width:"100%",minWidth:540}}>
            <thead>
              <tr style={{background:"#F9FAFB"}}>
                {DAYS.map((d,i)=>(
                  <th key={d} style={{padding:"8px 3px",fontSize:11,fontWeight:700,color:i>=5?"#EF4444":"#6B7280",textAlign:"center",border:"1px solid #E5E7EB",textTransform:"uppercase"}}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map(week=>(
                <tr key={week.id}>
                  {week.days.map((d,di)=>{
                    const inM=d.inMonth; const isWE=di>=5;
                    return(
                      <td key={di} style={{padding:"4px 3px",background:inM?(isWE?"#FFF5F5":"white"):"#F9FAFB",border:"1px solid #E5E7EB",verticalAlign:"top",minWidth:70,cursor:inM&&user.role==="rh"?"pointer":"default"}}>
                        {inM&&<>
                          <div style={{fontSize:11,fontWeight:700,color:isWE?"#EF4444":"#374151",textAlign:"right",paddingRight:3,marginBottom:3}}>{String(d.day).padStart(2,"0")}</div>
                          {empsToShow.map(emp=>{
                            const cell=plan[week.id]?.[emp]?.[di]; const isCP=cell?.a==="CP";
                            return cell?(
                              <div key={emp} onClick={()=>user.role==="rh"&&setPanel({weekId:week.id,emp,day:di})} style={{background:isCP?"#DCFCE7":C[emp].bg,border:"1px solid "+(isCP?"#86EFAC":C[emp].border),borderRadius:4,padding:"3px 4px",marginBottom:3,cursor:user.role==="rh"?"pointer":"default"}}>
                                <div style={{fontSize:9,fontWeight:700,color:isCP?"#065F46":C[emp].text,lineHeight:1.3}}>{isCP?"🌴 CP":cell.a}</div>
                                {cell.b&&<div style={{fontSize:9,fontWeight:700,color:C[emp].text,lineHeight:1.3}}>{cell.b}</div>}
                                <div style={{fontSize:8,color:C[emp].text,opacity:0.7,marginTop:1}}>{N(emp)}</div>
                              </div>
                            ):null;
                          })}
                        </>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* LÉGENDE */}
      <div style={{padding:"8px 16px 4px",display:"flex",flexWrap:"wrap",gap:6}}>
        {emps.map(e=>(
          <span key={e} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:C[e].text,background:C[e].bg,borderRadius:20,padding:"3px 8px"}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:C[e].dot,display:"inline-block"}}/>{N(e)}
          </span>
        ))}
      </div>

      {/* BANDEAU TOTAL MOIS (employé en vue équipe) */}
      {user.emp&&!myOnly&&(monthHours[user.emp]||0)>0&&(
        <div style={{margin:"6px 16px",background:C[user.emp].bg,border:"1px solid "+C[user.emp].border,borderRadius:10,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{width:9,height:9,borderRadius:"50%",background:C[user.emp].dot}}/>
            <span style={{fontSize:13,fontWeight:700,color:C[user.emp].text}}>Mon total — {MONTHS[curMonth.month-1]}</span>
          </div>
          <span style={{fontSize:16,fontWeight:800,color:"#111827"}}>{fmtH(monthHours[user.emp]||0)}</span>
        </div>
      )}

      {/* ACTIONS RH */}
      {user.role==="rh"&&(
        <div style={{padding:"12px 16px 8px",display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>setPanel("bulk")} style={{...BTN_BASE,background:"#1D4ED8",flex:1,minWidth:100}}>⚡ Saisie groupée</button>
          <button onClick={()=>setPanel("duplicate")} style={{...BTN_BASE,background:"#7C3AED",flex:1,minWidth:100}}>📋 Dupliquer</button>
          <button onClick={()=>setPanel("hours")} style={{...BTN_BASE,background:"#059669",flex:1,minWidth:100}}>📊 Compteur</button>
          <button onClick={()=>setPanel("publish_select")} style={{...BTN_BASE,background:"#DC2626",flex:"0 0 100%"}}>📢 Publier le planning — {MONTHS[curMonth.month-1]}</button>
        </div>
      )}

      <div style={{padding:"4px 16px 24px",color:"#9CA3AF",fontSize:11}}>
        {user.role==="rh"?"✏️ Tapez un créneau pour l'éditer · Naviguez librement entre les mois":"🔒 Lecture seule — seule la RH peut modifier"}
      </div>

      {/* OVERLAYS */}
      {panel==="changepwd"&&<ChangePwdPanel onClose={()=>setPanel(null)}/>}

      {panel==="empnames"&&<EmpSettingsPanel emps={emps} empNames={empNames} empEmails={empEmails} deletedEmps={deletedEmps} onRestore={restoreEmp} onSave={saveEmpSettings} onClose={()=>setPanel(null)}/>}

      {panel==="monthview"&&<MonthViewPanel weeks={weeks} plan={plan} emps={emps} empNames={empNames} contracts={contracts} curMonth={curMonth} user={user} myOnly={myOnly} onClose={()=>setPanel(null)}/>}

      {panel==="duplicate"&&<DuplicatePanel weeks={weeks} weekIdx={weekIdx} plan={plan} emps={emps} getWeekPlan={getWeekPlan} curMonth={curMonth} onDuplicate={duplicateWeekFn} onClose={()=>setPanel(null)}/>}

      {panel==="publish_select"&&<PublishSelectPanel emps={emps} empEmails={empEmails} curMonth={curMonth} onPublish={publish} onClose={()=>setPanel(null)}/>}

      {panel==="notifs"&&(
        <Overlay onClose={()=>setPanel(null)}>
          <div style={{fontWeight:700,fontSize:16,marginBottom:14,color:"#111827"}}>🔔 Activité</div>
          {notifs.length===0?<div style={{color:"#9CA3AF",textAlign:"center",padding:24,fontSize:13}}>Aucune activité</div>
            :notifs.map((n,i)=>(
              <div key={i} style={{padding:"10px 12px",borderRadius:8,marginBottom:8,background:(!lastSeen||n.ts>lastSeen)?"#FEF3C7":"#F9FAFB",border:"1px solid "+((!lastSeen||n.ts>lastSeen)?"#FCD34D":"#F3F4F6")}}>
                <div style={{fontWeight:600,fontSize:13,color:"#111827"}}>{n.msg}</div>
                {n.detail&&<div style={{fontSize:12,color:"#6B7280",marginTop:2}}>{n.detail}</div>}
                <div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>{n.by} · {new Date(n.ts).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
              </div>
            ))
          }
        </Overlay>
      )}

      {panel==="confirm"&&(
        <Overlay onClose={()=>setPanel(null)}>
          <div style={{textAlign:"center",padding:"8px 0 16px"}}>
            <div style={{fontSize:40,marginBottom:12}}>✅</div>
            <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>Planning publié !</div>
            <div style={{color:"#6B7280",fontSize:13,marginBottom:20,lineHeight:1.5}}>
              L'équipe verra une notification 🔔 à leur prochaine connexion.
              {emailsSentCount>0&&<div style={{marginTop:8,color:"#10B981",fontWeight:600}}>📧 {emailsSentCount} email(s) envoyé(s)</div>}
              {emailsSentCount===0&&<div style={{marginTop:8,color:"#F59E0B",fontSize:12}}>⚠️ Aucun email — vérifie les adresses dans 👥</div>}
            </div>
            <button onClick={()=>setPanel(null)} style={{...BTN_BASE,background:"#111827",padding:"12px 32px"}}>Fermer</button>
          </div>
        </Overlay>
      )}

      {panel==="hours"&&<HoursPanel emps={emps} monthHours={monthHours} contracts={contracts} curMonth={curMonth} onSave={saveContracts} onClose={()=>setPanel(null)}/>}

      {panel==="bulk"&&week&&<BulkEditPanel emps={emps} weeks={weeks} weekIdx={weekIdx} monthLabel={MONTHS[curMonth.month-1]} onSave={saveBulk} onClose={()=>setPanel(null)}/>}

      {panel&&panel.emp&&<EditPanel emp={panel.emp} day={panel.day} weekLabel={week?.label||""} current={weekPlan[panel.emp]?.[panel.day]} onSave={data=>saveCell(panel.weekId,panel.emp,panel.day,data)} onClose={()=>setPanel(null)}/>}
    </div>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const TH={padding:"7px 3px",fontWeight:600,fontSize:10,color:"#6B7280",borderBottom:"1px solid #E5E7EB",textTransform:"uppercase",letterSpacing:"0.3px"};
const NAV_BTN={background:"none",border:"1px solid #E5E7EB",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:18,color:"#374151",display:"flex",alignItems:"center",justifyContent:"center"};
const BTN_BASE={color:"white",border:"none",borderRadius:10,padding:"13px 0",fontSize:14,fontWeight:700,cursor:"pointer",textAlign:"center"};

// ─── COMPOSANTS ──────────────────────────────────────────────────────────────

function ToggleBtn({label,active,onClick,accent,accent2}) {
  return <button onClick={onClick} style={{flex:1,padding:"7px 0",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:active?(accent2?"#059669":accent?"#111827":"#E5E7EB"):"#F3F4F6",color:active?(accent2||accent?"white":"#111827"):"#9CA3AF",transition:"all 0.15s"}}>{label}</button>;
}

function Overlay({children,onClose}) {
  const isDesktop=useIsDesktop();
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:50,display:"flex",alignItems:isDesktop?"center":"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"white",borderRadius:isDesktop?"16px":"20px 20px 0 0",padding:isDesktop?"28px 28px":"20px 16px",width:isDesktop?"520px":"100%",maxWidth:isDesktop?"520px":"100%",maxHeight:"85vh",overflowY:"auto",overscrollBehavior:"contain",boxSizing:"border-box",boxShadow:isDesktop?"0 20px 60px rgba(0,0,0,0.3)":"none"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
          {!isDesktop&&<div style={{flex:1,display:"flex",justifyContent:"center"}}><div style={{width:36,height:4,background:"#E5E7EB",borderRadius:2}}/></div>}
          <button onClick={onClose} style={{marginLeft:"auto",background:"#F3F4F6",border:"none",borderRadius:"50%",width:30,height:30,cursor:"pointer",fontSize:14,color:"#6B7280",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ShiftPicker({label,emoji,value,onChange,presets}) {
  const isCustom=value&&!presets.includes(value)&&value!=="CP";
  const[custom,setCustom]=useState(isCustom?value:"");
  return(
    <div style={{marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:7}}>{emoji} {label}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:7}}>
        {presets.map(p=><button key={p} onClick={()=>{onChange(p);setCustom("");}} style={{padding:"6px 9px",borderRadius:7,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:value===p?"#111827":"#F3F4F6",color:value===p?"white":"#374151",transition:"all 0.1s"}}>{p}</button>)}
        {emoji==="🌆"&&<button onClick={()=>{onChange(null);setCustom("");}} style={{padding:"6px 9px",borderRadius:7,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:!value?"#111827":"#F3F4F6",color:!value?"white":"#374151"}}>Pas de soir</button>}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <input value={isCustom?value:custom} onChange={e=>{setCustom(e.target.value);onChange(e.target.value||null);}} placeholder={`Autre horaire… ex : 07:00-12:00`} style={{flex:1,padding:"8px 10px",borderRadius:8,border:isCustom?"1.5px solid #111827":"1px solid #E5E7EB",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
        {(isCustom||custom)&&<button onClick={()=>{setCustom("");onChange(null);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#9CA3AF"}}>✕</button>}
      </div>
    </div>
  );
}

function EditPanel({emp,day,weekLabel,current,onSave,onClose}) {
  const isCp=current?.a==="CP";
  const[repos,setRepos]=useState(!current&&!isCp);
  const[cp,setCp]=useState(isCp);
  const[shiftA,setShiftA]=useState(current&&!isCp?current.a:null);
  const[shiftB,setShiftB]=useState(current&&!isCp?current.b:null);
  const canSave=repos||cp||!!shiftA||!!shiftB;
  return(
    <Overlay onClose={onClose}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <span style={{width:10,height:10,borderRadius:"50%",background:C[emp].dot,flexShrink:0}}/>
        <div><div style={{fontWeight:700,fontSize:15,color:"#111827"}}>{N(emp)}</div><div style={{fontSize:11,color:"#9CA3AF"}}>{DAYS[day]} · {weekLabel}</div></div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <ToggleBtn label="🛌 Repos" active={repos&&!cp} onClick={()=>{setRepos(true);setCp(false);}}/>
        <ToggleBtn label="🌴 CP" active={cp} onClick={()=>{setRepos(false);setCp(true);setShiftA(null);setShiftB(null);}} accent2/>
        <ToggleBtn label="💼 Travail" active={!repos&&!cp} onClick={()=>{setRepos(false);setCp(false);}} accent/>
      </div>
      {cp&&<div style={{background:"#DCFCE7",border:"1px solid #86EFAC",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#065F46",fontWeight:600}}>🌴 Congés payés — journée complète</div>}
      {!repos&&!cp&&<><ShiftPicker label="Créneau matin" emoji="🌅" value={shiftA} onChange={setShiftA} presets={PRESETS_A}/><ShiftPicker label="Créneau soir (optionnel)" emoji="🌆" value={shiftB} onChange={setShiftB} presets={PRESETS_B}/></>}
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={onClose} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>Annuler</button>
        <button disabled={!canSave} onClick={()=>repos?onSave(null):cp?onSave({a:"CP",b:null}):onSave({a:shiftA||shiftB,b:shiftA?(shiftB&&shiftB.trim())||null:null})} style={{flex:2,padding:"12px 0",border:"none",borderRadius:8,background:canSave?"#111827":"#E5E7EB",color:canSave?"white":"#9CA3AF",fontSize:14,fontWeight:700,cursor:canSave?"pointer":"not-allowed"}}>Enregistrer</button>
      </div>
    </Overlay>
  );
}

function BulkEditPanel({emps:empsProp,weeks,weekIdx,monthLabel,onSave,onClose}) {
  const EMPS_LOCAL=empsProp||DEFAULT_EMPS;
  const week=weeks[weekIdx];
  const[selEmps,setSelEmps]=useState([]);
  const[selDays,setSelDays]=useState([]);
  const[scope,setScope]=useState("week");
  const[repos,setRepos]=useState(false);
  const[cp,setCp]=useState(false);
  const[shiftA,setShiftA]=useState(null);
  const[shiftB,setShiftB]=useState(null);
  const[step,setStep]=useState(1);
  const toggleEmp=e=>setSelEmps(s=>s.includes(e)?s.filter(x=>x!==e):[...s,e]);
  const toggleDay=d=>setSelDays(s=>s.includes(d)?s.filter(x=>x!==d):[...s,d]);
  const allEmps=selEmps.length===EMPS_LOCAL.length;
  return(
    <Overlay onClose={onClose}>
      <div style={{marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:16,color:"#111827"}}>⚡ Saisie groupée</div>
        <div style={{display:"flex",gap:4,marginTop:10}}>{[1,2,3].map(s=><div key={s} style={{flex:1,height:3,borderRadius:2,background:step>=s?"#1D4ED8":"#E5E7EB"}}/>)}</div>
        <div style={{fontWeight:600,fontSize:13,color:"#374151",marginTop:10}}>{["","Qui travaille ?","Périmètre & Jours","Quel horaire ?"][step]}</div>
      </div>
      {step===1&&<div>
        <button onClick={()=>setSelEmps(allEmps?[]:[...EMPS_LOCAL])} style={{display:"block",width:"100%",marginBottom:10,padding:"8px 0",border:"1px dashed #D1D5DB",borderRadius:8,background:"#F9FAFB",fontSize:12,fontWeight:600,color:"#374151",cursor:"pointer"}}>{allEmps?"✕ Tout désélectionner":"✓ Toute l'équipe"}</button>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {EMPS_LOCAL.map(emp=>{ const on=selEmps.includes(emp); return(<button key={emp} onClick={()=>toggleEmp(emp)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,border:"none",cursor:"pointer",background:on?C[emp].bg:"#F9FAFB",outline:on?`2px solid ${C[emp].dot}`:"2px solid transparent"}}><span style={{width:10,height:10,borderRadius:"50%",background:C[emp].dot}}/><span style={{fontWeight:700,fontSize:14,color:on?C[emp].text:"#374151"}}>{N(emp)}</span><span style={{marginLeft:"auto"}}>{on?"✓":""}</span></button>); })}
        </div>
        <button disabled={!selEmps.length} onClick={()=>setStep(2)} style={{width:"100%",marginTop:16,padding:"13px 0",border:"none",borderRadius:10,background:selEmps.length?"#1D4ED8":"#E5E7EB",color:selEmps.length?"white":"#9CA3AF",fontSize:14,fontWeight:700,cursor:selEmps.length?"pointer":"not-allowed"}}>Suivant →</button>
      </div>}
      {step===2&&<div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:8}}>Appliquer sur :</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button onClick={()=>setScope("week")} style={{padding:"12px 8px",borderRadius:8,border:"none",cursor:"pointer",background:scope==="week"?"#111827":"#F3F4F6",color:scope==="week"?"white":"#374151",fontSize:12,fontWeight:700}}>📅 Cette semaine<br/><span style={{fontSize:10,opacity:0.7}}>{week.label}</span></button>
            <button onClick={()=>setScope("month")} style={{padding:"12px 8px",borderRadius:8,border:"none",cursor:"pointer",background:scope==="month"?"#1D4ED8":"#F3F4F6",color:scope==="month"?"white":"#374151",fontSize:12,fontWeight:700}}>📆 Tout le mois<br/><span style={{fontSize:10,opacity:0.7}}>{monthLabel}</span></button>
          </div>
        </div>
        <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:8}}>Quels jours :</div>
        <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
          {[{label:"Lun – Ven",days:[0,1,2,3,4]},{label:"Week-end",days:[5,6]},{label:"Tous",days:[0,1,2,3,4,5,6]}].map(r=><button key={r.label} onClick={()=>setSelDays(r.days)} style={{padding:"6px 12px",borderRadius:20,border:"1px solid #E5E7EB",background:"white",fontSize:12,color:"#374151",cursor:"pointer"}}>{r.label}</button>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:12}}>
          {DAYS.map((d,i)=><button key={d} onClick={()=>toggleDay(i)} style={{padding:"10px 4px",borderRadius:8,border:"none",cursor:"pointer",background:selDays.includes(i)?"#111827":"#F3F4F6",color:selDays.includes(i)?"white":"#374151",fontSize:12,fontWeight:700}}>{d}</button>)}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setStep(1)} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>← Retour</button>
          <button disabled={!selDays.length} onClick={()=>setStep(3)} style={{flex:2,padding:"12px 0",border:"none",borderRadius:10,background:selDays.length?"#1D4ED8":"#E5E7EB",color:selDays.length?"white":"#9CA3AF",fontSize:14,fontWeight:700,cursor:selDays.length?"pointer":"not-allowed"}}>Suivant →</button>
        </div>
      </div>}
      {step===3&&<div>
        <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,padding:"9px 12px",marginBottom:14,fontSize:12}}>
          <span style={{fontWeight:700,color:"#1E40AF"}}>{selEmps.map(e=>N(e)).join(", ")}</span>
          <span style={{color:"#6B7280",marginLeft:6}}>· {selDays.map(d=>DAYS[d]).join(", ")} · {scope==="month"?`tout ${monthLabel}`:week.label}</span>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <ToggleBtn label="🛌 Repos" active={repos&&!cp} onClick={()=>{setRepos(true);setCp(false);}}/>
          <ToggleBtn label="🌴 CP" active={cp} onClick={()=>{setRepos(false);setCp(true);setShiftA(null);setShiftB(null);}} accent2/>
          <ToggleBtn label="💼 Travail" active={!repos&&!cp} onClick={()=>{setRepos(false);setCp(false);}} accent/>
        </div>
        {cp&&<div style={{background:"#DCFCE7",border:"1px solid #86EFAC",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#065F46",fontWeight:600}}>🌴 Congés payés</div>}
        {!repos&&!cp&&<><ShiftPicker label="Créneau matin" emoji="🌅" value={shiftA} onChange={setShiftA} presets={PRESETS_A}/><ShiftPicker label="Créneau soir (optionnel)" emoji="🌆" value={shiftB} onChange={setShiftB} presets={PRESETS_B}/></>}
        {(repos||cp||shiftA||shiftB)&&<div style={{background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12}}>✅ Application sur <strong>{scope==="month"?`tout ${monthLabel}`:"cette semaine"}</strong></div>}
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setStep(2)} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>← Retour</button>
          <button disabled={!(repos||cp||shiftA||shiftB)} onClick={()=>onSave(selEmps,selDays,repos?null:cp?{a:"CP",b:null}:{a:shiftA||shiftB,b:shiftA?(shiftB&&shiftB.trim())||null:null},scope)} style={{flex:2,padding:"12px 0",border:"none",borderRadius:10,background:(repos||cp||shiftA||shiftB)?"#111827":"#E5E7EB",color:(repos||cp||shiftA||shiftB)?"white":"#9CA3AF",fontSize:14,fontWeight:700,cursor:(repos||cp||shiftA||shiftB)?"pointer":"not-allowed"}}>Appliquer</button>
        </div>
      </div>}
    </Overlay>
  );
}

function MonthViewPanel({weeks,plan,emps:empsProp,empNames,contracts,curMonth,user,myOnly,onClose}) {
  const EMPS_MV=empsProp||DEFAULT_EMPS;
  const empsToShow=myOnly&&user.emp?[user.emp]:EMPS_MV;
  const isRH=user.role==="rh";
  const totals={};
  empsToShow.forEach(emp=>{ totals[emp]=weeks.reduce((acc,week)=>acc+week.days.reduce((a2,d,i)=>d.inMonth?a2+(cellMin(plan[week.id]?.[emp]?.[i])||0):a2,0),0); });
  const myTotal=user.emp?weeks.reduce((acc,week)=>acc+week.days.reduce((a2,d,i)=>d.inMonth?a2+(cellMin(plan[week.id]?.[user.emp]?.[i])||0):a2,0),0):0;
  return(
    <Overlay onClose={onClose}>
      <div style={{fontWeight:700,fontSize:16,color:"#111827",marginBottom:4}}>📅 {MONTHS[curMonth.month-1]} {curMonth.year}</div>
      {user.emp&&!myOnly&&myTotal>0&&<div style={{background:C[user.emp].bg,border:"1px solid "+C[user.emp].border,borderRadius:8,padding:"8px 12px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,fontWeight:700,color:C[user.emp].text}}>Mon total</span><span style={{fontSize:15,fontWeight:800,color:"#111827"}}>{fmtH(myTotal)}</span></div>}
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",minWidth:400}}>
          <thead><tr style={{background:"#F9FAFB"}}>{DAYS.map((d,i)=><th key={d} style={{padding:"6px 3px",fontSize:10,fontWeight:700,color:i>=5?"#EF4444":"#6B7280",textAlign:"center",border:"1px solid #F0F0F0"}}>{d}</th>)}</tr></thead>
          <tbody>
            {weeks.map(week=><tr key={week.id}>{week.days.map((d,di)=>{
              const inM=d.inMonth; const isWE=di>=5;
              return(
                <td key={di} style={{padding:"3px 2px",background:inM?(isWE?"#FFF5F5":"white"):"#F9FAFB",border:"1px solid #F0F0F0",verticalAlign:"top",minWidth:42}}>
                  {inM&&<><div style={{fontSize:10,fontWeight:700,color:isWE?"#EF4444":"#374151",textAlign:"right",paddingRight:2,marginBottom:2}}>{String(d.day).padStart(2,"0")}</div>
                  {empsToShow.map(emp=>{ const cell=plan[week.id]?.[emp]?.[di]; const isCP=cell?.a==="CP"; return cell?<div key={emp} style={{background:isCP?"#DCFCE7":C[emp].bg,borderRadius:3,padding:"2px 3px",marginBottom:2}}><div style={{fontSize:9,fontWeight:700,color:isCP?"#065F46":C[emp].text,lineHeight:1.3}}>{isCP?"🌴 CP":cell.a}</div>{cell.b&&<div style={{fontSize:9,fontWeight:700,color:C[emp].text,lineHeight:1.3}}>{cell.b}</div>}</div>:null; })}</>}
                </td>
              );
            })}</tr>)}
          </tbody>
        </table>
      </div>
      {isRH&&<div style={{marginTop:12,display:"flex",flexDirection:"column",gap:6}}>
        {empsToShow.map(emp=>{ const contractMin=contractMonthMin(contracts[emp]||35); const diff=totals[emp]-contractMin; const color=diff<-60?"#EF4444":diff>60?"#F59E0B":"#10B981"; return(
          <div key={emp} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:C[emp].bg+"55",borderRadius:8,padding:"6px 10px"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:7,height:7,borderRadius:"50%",background:C[emp].dot}}/><span style={{fontWeight:700,fontSize:12,color:C[emp].text}}>{N(emp)}</span></div>
            <div style={{textAlign:"right"}}><span style={{fontWeight:700,fontSize:13,color:"#111827"}}>{fmtH(totals[emp])}</span><span style={{fontSize:11,color:"#6B7280",marginLeft:4}}>/{fmtHDec(contractMin)}</span><span style={{fontSize:11,fontWeight:700,color,marginLeft:6}}>{diff>=0?"+":""}{fmtH(Math.abs(diff))}</span></div>
          </div>
        ); })}
      </div>}
    </Overlay>
  );
}

function HoursPanel({emps:empsProp,monthHours,contracts,curMonth,onSave,onClose}) {
  const EMPS_HP=empsProp||DEFAULT_EMPS;
  const[local,setLocal]=useState({...contracts});
  const[editing,setEditing]=useState(false);
  const setH=(emp,val)=>setLocal(p=>({...p,[emp]:Number(val)||0}));
  return(
    <Overlay onClose={onClose}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div><div style={{fontWeight:700,fontSize:16,color:"#111827"}}>📊 Compteur d'heures</div><div style={{fontSize:11,color:"#9CA3AF"}}>{MONTHS[curMonth.month-1]} {curMonth.year}</div></div>
        <button onClick={()=>setEditing(e=>!e)} style={{background:editing?"#111827":"#F3F4F6",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,color:editing?"white":"#374151",cursor:"pointer"}}>{editing?"✓ Terminer":"✏️ Modifier contrats"}</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 80px 100px 80px",gap:4,padding:"6px 10px",background:"#F9FAFB",borderRadius:8,marginBottom:8,fontSize:11,fontWeight:700,color:"#6B7280",textTransform:"uppercase"}}>
        <div>Employé</div><div style={{textAlign:"center"}}>Travaillé</div><div style={{textAlign:"center"}}>Contrat/mois</div><div style={{textAlign:"center"}}>Écart</div>
      </div>
      {EMPS_HP.map(emp=>{ const workedMin=monthHours[emp]||0; const contractMin=contractMonthMin(local[emp]||35); const diffMin=workedMin-contractMin; const pct=contractMin>0?Math.round(workedMin/contractMin*100):0; const barColor=diffMin<-60?"#EF4444":diffMin>60?"#F59E0B":"#10B981"; return(
        <div key={emp} style={{marginBottom:12,background:C[emp].bg+"55",borderRadius:10,padding:"10px 12px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 80px 100px 80px",gap:4,alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:8,height:8,borderRadius:"50%",background:C[emp].dot}}/><span style={{fontWeight:700,fontSize:13,color:C[emp].text}}>{N(emp)}</span></div>
            <div style={{textAlign:"center",fontWeight:700,fontSize:13,color:"#111827"}}>{fmtH(workedMin)}</div>
            <div style={{textAlign:"center"}}>
              {editing?<div style={{display:"flex",alignItems:"center",gap:3,justifyContent:"center"}}><input type="number" value={local[emp]||35} min={0} max={60} onChange={e=>setH(emp,e.target.value)} style={{width:40,padding:"2px 4px",borderRadius:5,border:"1px solid #D1D5DB",fontSize:12,textAlign:"center"}}/><span style={{fontSize:11,color:"#6B7280"}}>h/sem</span></div>
              :<span style={{fontSize:12,color:"#6B7280"}}>{local[emp]||35}h/sem<br/><span style={{fontWeight:600,color:"#374151"}}>{fmtHDec(contractMin)}</span></span>}
            </div>
            <div style={{textAlign:"center",fontWeight:700,fontSize:13,color:barColor}}>{diffMin===0?"±0h":(diffMin>0?"+":"")+fmtH(Math.abs(diffMin))}</div>
          </div>
          <div style={{marginTop:8,height:6,background:"#E5E7EB",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:Math.min(100,pct)+"%",background:barColor,borderRadius:3}}/></div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:10,color:"#9CA3AF"}}><span>{pct}% du contrat</span><span>{diffMin<-60?"⚠️ Sous le contrat":diffMin>60?"⚠️ Dépassement":"✅ OK"}</span></div>
        </div>
      ); })}
      {editing&&<button onClick={()=>{onSave(local);setEditing(false);}} style={{...BTN_BASE,background:"#111827",width:"100%",marginTop:4}}>Enregistrer les contrats</button>}
      {!editing&&<div style={{marginTop:8,padding:"10px 12px",background:"#F0F9FF",borderRadius:8,fontSize:12,color:"#0369A1",lineHeight:1.5}}>💡 Formule légale française : heures hebdo × 52 / 12. Modifiez via "Modifier contrats".</div>}
    </Overlay>
  );
}

function DuplicatePanel({weeks,weekIdx,plan,emps,getWeekPlan,curMonth,onDuplicate,onClose}) {
  const nowY=curMonth.year,nowM=curMonth.month;
  const[srcMonth,setSrcMonth]=useState({year:nowY,month:nowM});
  const[dstMonth,setDstMonth]=useState({year:nowY,month:nowM});
  const[srcWkIdx,setSrcWkIdx]=useState(weekIdx);
  const[dstWkIdx,setDstWkIdx]=useState(Math.min(weekIdx+1,weeks.length-1));
  const[done,setDone]=useState(false);
  const srcWeeks=useMemo(()=>getWeeksForMonth(srcMonth.year,srcMonth.month),[srcMonth]);
  const dstWeeks=useMemo(()=>getWeeksForMonth(dstMonth.year,dstMonth.month),[dstMonth]);
  const srcIdx=Math.min(srcWkIdx,srcWeeks.length-1),dstIdx=Math.min(dstWkIdx,dstWeeks.length-1);
  const srcWeek=srcWeeks[srcIdx],dstWeek=dstWeeks[dstIdx];
  const same=srcWeek?.id===dstWeek?.id;
  const goM=(cur,set,d)=>{ let m=cur.month+d,y=cur.year; if(m>12){m=1;y++;}if(m<1){m=12;y--;} set({year:y,month:m}); };
  const handleDo=async()=>{ if(same||!srcWeek||!dstWeek)return; const srcPlan=plan[srcWeek.id]||getWeekPlan(srcWeek.id); const dstPlan={}; emps.forEach(emp=>{ dstPlan[emp]=(srcPlan[emp]||Array(7).fill(null)).map((cell,di)=>dstWeek.days[di]?.inMonth?cell:null); }); await onDuplicate(srcWeek.id,dstWeek.id,srcPlan,dstPlan); setDone(true); };
  const WkBtn=(w,i,activeIdx,setIdx)=><button key={i} onClick={()=>setIdx(i)} style={{flex:1,padding:"8px 4px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:i===activeIdx?"#111827":"#F3F4F6",color:i===activeIdx?"white":"#374151"}}>Sem.{i+1}<br/><span style={{fontSize:9,opacity:0.7}}>{w.label.split("–")[0].trim()}</span></button>;
  if(done)return<Overlay onClose={onClose}><div style={{textAlign:"center",padding:"8px 0 16px"}}><div style={{fontSize:40,marginBottom:12}}>✅</div><div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Planning dupliqué !</div><div style={{color:"#6B7280",fontSize:13,marginBottom:20}}>{srcWeek?.label} → {dstWeek?.label}</div><button onClick={onClose} style={{padding:"12px 32px",border:"none",borderRadius:8,background:"#111827",color:"white",fontSize:14,fontWeight:600,cursor:"pointer"}}>Fermer</button></div></Overlay>;
  return(
    <Overlay onClose={onClose}>
      <div style={{fontWeight:700,fontSize:16,color:"#111827",marginBottom:16}}>📋 Dupliquer une semaine</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div style={{background:"#F0FDF4",borderRadius:10,padding:"10px"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#065F46",marginBottom:8}}>📤 Source</div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><button onClick={()=>goM(srcMonth,setSrcMonth,-1)} style={{background:"none",border:"1px solid #E5E7EB",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:14}}>‹</button><div style={{flex:1,textAlign:"center",fontWeight:700,fontSize:12}}>{MONTHS[srcMonth.month-1]} {srcMonth.year}</div><button onClick={()=>goM(srcMonth,setSrcMonth,1)} style={{background:"none",border:"1px solid #E5E7EB",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:14}}>›</button></div>
          <div style={{display:"flex",gap:4}}>{srcWeeks.map((w,i)=>WkBtn(w,i,srcIdx,setSrcWkIdx))}</div>
          {srcWeek&&<div style={{marginTop:6,fontSize:10,color:"#065F46",textAlign:"center"}}>{srcWeek.label}</div>}
        </div>
        <div style={{background:"#FEF3C7",borderRadius:10,padding:"10px"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#92400E",marginBottom:8}}>📥 Destination</div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><button onClick={()=>goM(dstMonth,setDstMonth,-1)} style={{background:"none",border:"1px solid #E5E7EB",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:14}}>‹</button><div style={{flex:1,textAlign:"center",fontWeight:700,fontSize:12}}>{MONTHS[dstMonth.month-1]} {dstMonth.year}</div><button onClick={()=>goM(dstMonth,setDstMonth,1)} style={{background:"none",border:"1px solid #E5E7EB",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:14}}>›</button></div>
          <div style={{display:"flex",gap:4}}>{dstWeeks.map((w,i)=>WkBtn(w,i,dstIdx,setDstWkIdx))}</div>
          {dstWeek&&<div style={{marginTop:6,fontSize:10,color:"#92400E",textAlign:"center"}}>{dstWeek.label}</div>}
        </div>
      </div>
      {!same&&srcWeek&&dstWeek&&<div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,textAlign:"center"}}><strong style={{color:"#1E40AF"}}>{srcWeek.label}</strong><span style={{color:"#6B7280",margin:"0 10px"}}>→</span><strong style={{color:"#1E40AF"}}>{dstWeek.label}</strong><div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>⚠️ La semaine destination sera remplacée</div></div>}
      {same&&<div style={{background:"#FEF3C7",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#92400E",textAlign:"center"}}>⚠️ Choisissez deux semaines différentes</div>}
      <div style={{display:"flex",gap:8}}>
        <button onClick={onClose} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>Annuler</button>
        <button disabled={same||!srcWeek||!dstWeek} onClick={handleDo} style={{flex:2,padding:"12px 0",border:"none",borderRadius:8,background:(!same&&srcWeek&&dstWeek)?"#7C3AED":"#E5E7EB",color:(!same&&srcWeek&&dstWeek)?"white":"#9CA3AF",fontSize:14,fontWeight:700,cursor:(!same&&srcWeek&&dstWeek)?"pointer":"not-allowed"}}>Dupliquer →</button>
      </div>
    </Overlay>
  );
}

function PublishSelectPanel({emps,empEmails,curMonth,onPublish,onClose}) {
  const[selected,setSelected]=useState(emps.filter(e=>empEmails[e]));
  const[sending,setSending]=useState(false);
  const toggleEmp=e=>setSelected(s=>s.includes(e)?s.filter(x=>x!==e):[...s,e]);
  const allSel=selected.length===emps.length;
  const monthLabel=`${MONTHS[curMonth.month-1]} ${curMonth.year}`;
  const handlePublish=async()=>{ setSending(true); await onPublish(selected); setSending(false); };
  return(
    <Overlay onClose={onClose}>
      <div style={{fontWeight:700,fontSize:16,color:"#111827",marginBottom:4}}>📢 Publier le planning</div>
      <div style={{fontSize:12,color:"#9CA3AF",marginBottom:16}}>{monthLabel} — Choisir les destinataires</div>
      <button onClick={()=>setSelected(allSel?[]:emps.filter(e=>empEmails[e]))} style={{display:"block",width:"100%",marginBottom:10,padding:"8px 0",border:"1px dashed #D1D5DB",borderRadius:8,background:"#F9FAFB",fontSize:12,fontWeight:600,color:"#374151",cursor:"pointer"}}>{allSel?"✕ Tout désélectionner":"✓ Tous avec email"}</button>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
        {emps.map(emp=>{ const hasEmail=!!empEmails[emp]; const isSel=selected.includes(emp); return(
          <button key={emp} onClick={()=>hasEmail&&toggleEmp(emp)} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,border:"none",cursor:hasEmail?"pointer":"not-allowed",background:isSel?C[emp].bg:"#F9FAFB",outline:isSel?`2px solid ${C[emp].dot}`:"2px solid transparent",opacity:hasEmail?1:0.45}}>
            <span style={{width:9,height:9,borderRadius:"50%",background:C[emp].dot}}/><span style={{fontWeight:700,fontSize:13,color:isSel?C[emp].text:"#374151",flex:1,textAlign:"left"}}>{N(emp)}</span>
            {hasEmail?<span style={{fontSize:11,color:"#6B7280"}}>{empEmails[emp]}</span>:<span style={{fontSize:11,color:"#EF4444"}}>⚠️ Pas d'email</span>}
            {isSel&&<span style={{fontSize:14}}>✓</span>}
          </button>
        ); })}
      </div>
      <div style={{background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#065F46"}}>📧 {selected.length} email(s) · 🔔 Toute l'équipe reçoit la notif in-app</div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={onClose} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>Annuler</button>
        <button onClick={handlePublish} disabled={sending} style={{flex:2,padding:"12px 0",border:"none",borderRadius:8,background:sending?"#E5E7EB":"#DC2626",color:"white",fontSize:14,fontWeight:700,cursor:sending?"not-allowed":"pointer"}}>{sending?"Envoi en cours…":"📢 Publier"}</button>
      </div>
    </Overlay>
  );
}

function EmpSettingsPanel({emps,empNames,empEmails,deletedEmps,onRestore,onSave,onClose}) {
  const[localEmps,setLocalEmps]=useState([...emps]);
  const[names,setNames]=useState({...empNames});
  const[emails,setEmails]=useState({...empEmails});
  const[newEmpName,setNewEmpName]=useState("");
  const[showAdd,setShowAdd]=useState(false);
  const[confirmDel,setConfirmDel]=useState(null);
  const setN=(emp,v)=>setNames(p=>({...p,[emp]:v}));
  const setE=(emp,v)=>setEmails(p=>({...p,[emp]:v}));
  const addEmp=()=>{ if(!newEmpName.trim())return; const id=newEmpName.trim().toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12)+"_"+Date.now().toString().slice(-4); setLocalEmps(p=>[...p,id]); setN(id,newEmpName.trim()); setE(id,""); setNewEmpName(""); setShowAdd(false); };
  const removeEmp=emp=>setConfirmDel(emp);
  const confirmRemove=()=>{ if(confirmDel)setLocalEmps(p=>p.filter(e=>e!==confirmDel)); setConfirmDel(null); };
  const inp=(accent)=>({width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid "+(accent||"#E5E7EB"),fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"});
  return(
    <Overlay onClose={onClose}>
      <div style={{marginBottom:16}}><div style={{fontWeight:700,fontSize:16,color:"#111827"}}>👥 Gestion de l'équipe</div><div style={{fontSize:12,color:"#9CA3AF",marginTop:3}}>Ajouter, modifier ou supprimer</div></div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
        {localEmps.map(emp=>{ const color=C[emp]; return(
          <div key={emp} style={{background:color.bg+"55",borderRadius:10,padding:"10px 14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{width:9,height:9,borderRadius:"50%",background:color.dot}}/><span style={{fontSize:10,fontWeight:700,color:color.text,flex:1}}>{emp}</span>
              {confirmDel===emp?<div style={{display:"flex",gap:4,alignItems:"center"}}><span style={{fontSize:11,color:"#EF4444",fontWeight:600}}>Supprimer ?</span><button onClick={confirmRemove} style={{background:"#EF4444",border:"none",borderRadius:5,padding:"2px 8px",fontSize:11,color:"white",cursor:"pointer",fontWeight:700}}>Oui</button><button onClick={()=>setConfirmDel(null)} style={{background:"#F3F4F6",border:"none",borderRadius:5,padding:"2px 8px",fontSize:11,color:"#374151",cursor:"pointer"}}>Non</button></div>
              :<button onClick={()=>removeEmp(emp)} style={{background:"#FEE2E2",border:"none",borderRadius:6,padding:"2px 8px",fontSize:11,color:"#EF4444",cursor:"pointer",fontWeight:600}}>🗑️</button>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <div><div style={{fontSize:11,color:"#6B7280",marginBottom:3}}>✏️ Nom</div><input value={names[emp]||""} onChange={e=>setN(emp,e.target.value)} placeholder={N(emp)} style={{...inp(color.border),fontWeight:600,color:color.text}}/></div>
              <div><div style={{fontSize:11,color:"#6B7280",marginBottom:3}}>📧 Email</div><input type="email" value={emails[emp]||""} onChange={e=>setE(emp,e.target.value)} placeholder="prenom@email.com" style={inp()}/></div>
            </div>
          </div>
        ); })}
      </div>
      {showAdd?<div style={{background:"#F0F9FF",border:"1px solid #BAE6FD",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:"#0369A1",marginBottom:8}}>➕ Nouvel employé</div>
        <input value={newEmpName} onChange={e=>setNewEmpName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addEmp()} placeholder="Prénom…" autoFocus style={{...inp("#BAE6FD"),marginBottom:8}}/>
        <div style={{display:"flex",gap:6}}><button onClick={()=>{setShowAdd(false);setNewEmpName("");}} style={{flex:1,padding:"8px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:12,fontWeight:600,cursor:"pointer"}}>Annuler</button><button onClick={addEmp} disabled={!newEmpName.trim()} style={{flex:2,padding:"8px 0",border:"none",borderRadius:8,background:newEmpName.trim()?"#1D4ED8":"#E5E7EB",color:newEmpName.trim()?"white":"#9CA3AF",fontSize:12,fontWeight:700,cursor:newEmpName.trim()?"pointer":"not-allowed"}}>Ajouter</button></div>
      </div>:<button onClick={()=>setShowAdd(true)} style={{width:"100%",marginBottom:14,padding:"10px 0",border:"2px dashed #D1D5DB",borderRadius:10,background:"#F9FAFB",color:"#374151",fontSize:13,fontWeight:600,cursor:"pointer"}}>➕ Ajouter un employé</button>}
      {/* CORBEILLE */}
      {deletedEmps && Object.keys(deletedEmps).length>0 && (
        <div style={{background:"#FEF3C7",border:"1px solid #FCD34D",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:"#92400E",marginBottom:8}}>🗑️ Corbeille ({Object.keys(deletedEmps).length})</div>
          <div style={{fontSize:11,color:"#78350F",marginBottom:10}}>Employés archivés — leurs heures passées sont conservées. Cliquez sur "♻️ Restaurer" pour les récupérer.</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {Object.entries(deletedEmps).map(([emp,info])=>(
              <div key={emp} style={{display:"flex",alignItems:"center",gap:8,background:"white",borderRadius:8,padding:"8px 10px"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#111827"}}>{info.name||emp}</div>
                  <div style={{fontSize:10,color:"#6B7280",marginTop:2}}>Archivé le {new Date(info.ts).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})} par {info.deletedBy}</div>
                </div>
                <button onClick={()=>onRestore(emp)} style={{background:"#10B981",border:"none",borderRadius:6,padding:"6px 12px",fontSize:12,color:"white",cursor:"pointer",fontWeight:700}}>♻️ Restaurer</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:8}}>
        <button onClick={onClose} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>Annuler</button>
        <button onClick={()=>onSave(names,emails,localEmps)} style={{flex:2,padding:"12px 0",border:"none",borderRadius:8,background:"#111827",color:"white",fontSize:14,fontWeight:700,cursor:"pointer"}}>Enregistrer</button>
      </div>
    </Overlay>
  );
}

function ChangePwdPanel({onClose}) {
  const[current,setCurrent]=useState(""); const[next1,setNext1]=useState(""); const[next2,setNext2]=useState("");
  const[error,setError]=useState(""); const[success,setSuccess]=useState(false); const[loading,setLoading]=useState(false);
  const handleSave=async()=>{ if(!current||!next1||!next2){setError("Tous les champs sont requis");return;} if(next1!==next2){setError("Les mots de passe ne correspondent pas");return;} if(next1.length<6){setError("Minimum 6 caractères");return;} setLoading(true);setError(""); const cH=await hashPwd(current); const sH=localStorage.getItem("rlb-rh-hash")||DEFAULT_RH_HASH; if(cH!==sH){setError("Mot de passe actuel incorrect");setLoading(false);return;} localStorage.setItem("rlb-rh-hash",await hashPwd(next1)); setSuccess(true);setLoading(false); };
  const inp=(val,set,ph)=><input type="password" value={val} onChange={e=>{set(e.target.value);setError("");}} placeholder={ph} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:error?"1.5px solid #EF4444":"1px solid #E5E7EB",fontSize:13,outline:"none",fontFamily:"inherit",marginBottom:10,boxSizing:"border-box"}}/>;
  if(success)return<Overlay onClose={onClose}><div style={{textAlign:"center",padding:"8px 0 16px"}}><div style={{fontSize:40,marginBottom:12}}>✅</div><div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Mot de passe modifié</div><button onClick={onClose} style={{padding:"12px 32px",border:"none",borderRadius:8,background:"#111827",color:"white",fontSize:14,fontWeight:600,cursor:"pointer"}}>Fermer</button></div></Overlay>;
  return<Overlay onClose={onClose}><div style={{fontWeight:700,fontSize:16,color:"#111827",marginBottom:4}}>🔒 Changer le mot de passe RH</div><div style={{fontSize:12,color:"#9CA3AF",marginBottom:16}}>Accès Laetitia uniquement</div>{inp(current,setCurrent,"Mot de passe actuel")}{inp(next1,setNext1,"Nouveau mot de passe")}{inp(next2,setNext2,"Confirmer")}{error&&<div style={{color:"#EF4444",fontSize:12,marginBottom:10}}>⚠️ {error}</div>}<div style={{display:"flex",gap:8,marginTop:4}}><button onClick={onClose} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>Annuler</button><button onClick={handleSave} disabled={loading} style={{flex:2,padding:"12px 0",border:"none",borderRadius:8,background:"#111827",color:"white",fontSize:14,fontWeight:700,cursor:"pointer"}}>{loading?"...":"Enregistrer"}</button></div></Overlay>;
}

function Portal({onEnterPlanning}) {
  const isDesktop=useIsDesktop();
  const[hL,setHL]=useState(false); const[hR,setHR]=useState(false);
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:isDesktop?"row":"column",fontFamily:"system-ui,-apple-system,sans-serif",overflow:"hidden"}}>
      <a href="https://beylev-vercel.vercel.app/" target="_blank" rel="noopener noreferrer" onMouseEnter={()=>setHL(true)} onMouseLeave={()=>setHL(false)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:isDesktop?"48px 40px":"40px 24px",background:hL?"linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)":"linear-gradient(135deg,#0f0f1a 0%,#1a1a2e 100%)",textDecoration:"none",cursor:"pointer",transition:"all 0.4s",minHeight:isDesktop?"auto":"50vh"}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:isDesktop?80:56,marginBottom:20,filter:"drop-shadow(0 0 20px rgba(99,102,241,0.5))",transform:hL?"scale(1.1)":"scale(1)",transition:"transform 0.3s"}}>🔧</div><div style={{fontSize:isDesktop?13:11,fontWeight:700,letterSpacing:3,color:"#6366F1",textTransform:"uppercase",marginBottom:12}}>Beylev</div><div style={{fontSize:isDesktop?32:24,fontWeight:800,color:"white",lineHeight:1.2,marginBottom:16}}>Maintenance</div><div style={{fontSize:isDesktop?15:13,color:"#94A3B8",lineHeight:1.6,maxWidth:280,marginBottom:32}}>Suivi des interventions,<br/>tickets et équipements</div><div style={{display:"inline-flex",alignItems:"center",gap:10,background:hL?"#6366F1":"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:50,padding:"12px 28px",color:"white",fontSize:14,fontWeight:700,transition:"all 0.3s"}}>Accéder <span style={{fontSize:18,transition:"transform 0.3s",transform:hL?"translateX(4px)":"translateX(0)"}}>→</span></div></div>
      </a>
      {isDesktop&&<div style={{width:1,background:"linear-gradient(to bottom,transparent,rgba(255,255,255,0.15),transparent)"}}/>}
      <div onClick={onEnterPlanning} onMouseEnter={()=>setHR(true)} onMouseLeave={()=>setHR(false)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:isDesktop?"48px 40px":"40px 24px",background:hR?"linear-gradient(135deg,#111827 0%,#1F2937 50%,#374151 100%)":"linear-gradient(135deg,#0a0f1a 0%,#111827 100%)",cursor:"pointer",transition:"all 0.4s",minHeight:isDesktop?"auto":"50vh"}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:isDesktop?80:56,marginBottom:20,filter:"drop-shadow(0 0 20px rgba(220,38,38,0.4))",transform:hR?"scale(1.1)":"scale(1)",transition:"transform 0.3s"}}>📅</div><div style={{fontSize:isDesktop?13:11,fontWeight:700,letterSpacing:3,color:"#DC2626",textTransform:"uppercase",marginBottom:12}}>Résidence Le Belleville</div><div style={{fontSize:isDesktop?32:24,fontWeight:800,color:"white",lineHeight:1.2,marginBottom:16}}>Planning<br/>Équipe</div><div style={{fontSize:isDesktop?15:13,color:"#94A3B8",lineHeight:1.6,maxWidth:280,marginBottom:32}}>Gestion des horaires,<br/>congés et planning mensuel</div><div style={{display:"inline-flex",alignItems:"center",gap:10,background:hR?"#DC2626":"rgba(220,38,38,0.15)",border:"1px solid rgba(220,38,38,0.4)",borderRadius:50,padding:"12px 28px",color:"white",fontSize:14,fontWeight:700,transition:"all 0.3s"}}>Accéder <span style={{fontSize:18,transition:"transform 0.3s",transform:hR?"translateX(4px)":"translateX(0)"}}>→</span></div></div>
      </div>
      <div style={{position:"absolute",bottom:20,left:0,right:0,textAlign:"center",pointerEvents:"none"}}><span style={{fontSize:11,color:"rgba(255,255,255,0.2)",letterSpacing:2,textTransform:"uppercase"}}>Beylev Group</span></div>
    </div>
  );
}

function Login({preEmps,preNames,onLogin}) {
  const[pending,setPending]=useState(null); const[pwd,setPwd]=useState(""); const[error,setError]=useState(""); const[loading,setLoading]=useState(false);
  const inputRef=useRef(null);
  const empEmojis=["👨‍💼","🧑","👦","🧔","👩","👨","🧒","👴","🧑‍💼","👷"];
  const dynamicUsers=[
    {id:"laetitia",name:"Laetitia",role:"rh",emoji:"👩‍💼"},
    ...(preEmps||DEFAULT_EMPS).map((emp,i)=>({ id:emp.toLowerCase().replace(/[^a-z0-9]/g,""), name:(preNames||DEFAULT_EMP_NAMES)[emp]||N(emp), role:"employee", emoji:empEmojis[i%empEmojis.length], emp })),
  ];
  const handleSelect=u=>{ if(u.role==="rh"){setPending(u);setPwd("");setError("");setTimeout(()=>inputRef.current?.focus(),100);}else onLogin(u); };
  const handleLogin=async()=>{ if(!pwd)return; setLoading(true);setError(""); const hash=await hashPwd(pwd); const stored=localStorage.getItem("rlb-rh-hash")||DEFAULT_RH_HASH; if(hash===stored){onLogin(pending);}else{setError("Mot de passe incorrect");setPwd("");setTimeout(()=>inputRef.current?.focus(),50);} setLoading(false); };
  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#111827 0%,#1F2937 60%,#374151 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"system-ui,-apple-system,sans-serif"}}>
      <div style={{marginBottom:32,textAlign:"center"}}><div style={{fontSize:48,marginBottom:12}}>📅</div><div style={{fontWeight:800,fontSize:22,color:"white"}}>RÉSIDENCE LE BELLEVILLE</div><div style={{color:"#9CA3AF",fontSize:13,marginTop:4}}>Accès interne équipe</div></div>
      <div style={{display:"flex",flexDirection:"column",gap:10,width:"100%",maxWidth:380}}>
        {dynamicUsers.map(u=>(
          <div key={u.id}>
            <button onClick={()=>handleSelect(u)} style={{width:"100%",background:pending?.id===u.id?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.08)",border:pending?.id===u.id?"1px solid rgba(255,255,255,0.4)":"1px solid rgba(255,255,255,0.15)",borderRadius:pending?.id===u.id?"12px 12px 0 0":12,padding:"14px 20px",display:"flex",alignItems:"center",gap:14,cursor:"pointer",color:"white",textAlign:"left"}}>
              <span style={{fontSize:24}}>{u.emoji}</span>
              <div><div style={{fontWeight:700,fontSize:14}}>{u.name}</div><div style={{fontSize:11,color:"#9CA3AF"}}>{u.role==="rh"?"🔑 Accès RH — mot de passe requis":"👁️ Consultation seule"}</div></div>
              {u.role==="rh"&&<span style={{marginLeft:"auto",background:"#DC2626",borderRadius:4,fontSize:10,padding:"2px 6px",fontWeight:700}}>RH</span>}
            </button>
            {pending?.id===u.id&&(
              <div style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.3)",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"14px 16px"}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{position:"relative",flex:1}}>
                    <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14}}>🔒</span>
                    <input ref={inputRef} type="password" value={pwd} onChange={e=>{setPwd(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="Mot de passe RH…" style={{width:"100%",padding:"10px 12px 10px 34px",borderRadius:8,border:error?"1.5px solid #EF4444":"1px solid rgba(255,255,255,0.25)",background:"rgba(255,255,255,0.1)",color:"white",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                  </div>
                  <button onClick={handleLogin} disabled={!pwd||loading} style={{padding:"10px 18px",borderRadius:8,border:"none",cursor:"pointer",background:pwd&&!loading?"#DC2626":"rgba(255,255,255,0.15)",color:"white",fontSize:13,fontWeight:700}}>{loading?"…":"Entrer"}</button>
                </div>
                {error&&<div style={{color:"#FCA5A5",fontSize:12,marginTop:8}}>⚠️ {error}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{marginTop:24,color:"#6B7280",fontSize:11}}>Résidence Le Belleville — Accès interne</div>
    </div>
  );
}
