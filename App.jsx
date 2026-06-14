import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "./firebase.js";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const DAYS   = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const EMPS   = ["MICKAEL","ZACK","KURTIS","ENZO"];

const C = {
  MICKAEL:{ bg:"#EDE9FE", text:"#5B21B6", border:"#C4B5FD", dot:"#8B5CF6" },
  ZACK:   { bg:"#DBEAFE", text:"#1E40AF", border:"#93C5FD", dot:"#3B82F6" },
  KURTIS: { bg:"#D1FAE5", text:"#065F46", border:"#6EE7B7", dot:"#10B981" },
  ENZO:   { bg:"#FEF3C7", text:"#92400E", border:"#FCD34D", dot:"#F59E0B" },
};

const USERS = [
  { id:"laetitia", name:"Laetitia", role:"rh",      emoji:"👩‍💼", label:"RH" },
  { id:"mickael",  name:"Mickael",  role:"employee", emoji:"👨‍💼", emp:"MICKAEL" },
  { id:"zack",     name:"Zack",     role:"employee", emoji:"🧑",   emp:"ZACK" },
  { id:"enzo",     name:"Enzo",     role:"employee", emoji:"👦",   emp:"ENZO" },
  { id:"kurtis",   name:"Kurtis",   role:"employee", emoji:"🧔",   emp:"KURTIS" },
];

// Heures hebdo contractuelles par défaut (35h)
const DEFAULT_CONTRACTS = { MICKAEL:35, ZACK:35, KURTIS:35, ENZO:35 };
const DEFAULT_EMP_NAMES = { MICKAEL:"Mickael", ZACK:"Zack", KURTIS:"Kurtis", ENZO:"Enzo" };
const DEFAULT_EMP_EMAILS = { MICKAEL:"", ZACK:"", KURTIS:"", ENZO:"" };


// Noms affichés (mis à jour dynamiquement par l'app)
let NAMES = { ...DEFAULT_EMP_NAMES };
const N = emp => NAMES[emp] || N(emp);

const PRESETS_A = ["08:00-13:00","08:30-13:00","08:30-13:30","09:00-13:00","09:15-12:45","10:00-13:00","10:15-12:45","11:45-16:30"];
const PRESETS_B = ["14:00-17:00","14:00-18:00","14:00-18:30","14:15-18:00","14:15-18:30","14:45-18:00","14:45-18:30","15:30-18:30"];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// ─── FIREBASE STORAGE ────────────────────────────────────────────────────────
// Données partagées → Firestore collection "planning"
// Données personnelles (last-seen) → localStorage
const S = {
  // Lecture Firestore
  async get(k) {
    try {
      const snap = await getDoc(doc(db, "planning", k));
      return snap.exists() ? snap.data().value : null;
    } catch (e) { console.warn("Firebase get error:", e); return null; }
  },
  // Écriture Firestore
  async set(k, v) {
    try {
      await setDoc(doc(db, "planning", k), { value: v, updatedAt: serverTimestamp() });
    } catch (e) { console.warn("Firebase set error:", e); }
  },
  // Écouteur temps réel → retourne la fonction de désabonnement
  listen(k, callback) {
    return onSnapshot(doc(db, "planning", k), snap => {
      callback(snap.exists() ? snap.data().value : null);
    });
  },
  // Données personnelles (non partagées) → localStorage
  getLocal(k)    { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  setLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── AUTHENTIFICATION RH ─────────────────────────────────────────────────────

const DEFAULT_RH_HASH = "d31db950efb62b522f978c0d3e3b9a067e0f87da9c46865da77c25031fb703ce"; // sha256("RLB2026")

async function hashPwd(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}


// ─── EMAILJS ─────────────────────────────────────────────────────────────────
const EJS_SERVICE  = "service_f8wposw";
const EJS_TEMPLATE = "template_qhm7l64";
const EJS_KEY      = "zUbP2O2gaX5Y_aqBF";

// SDK EmailJS importé via npm
import emailjsLib from "@emailjs/browser";
async function loadEJS() {
  emailjsLib.init({ publicKey: EJS_KEY });
  return emailjsLib;
}

// Formate le planning en texte lisible pour l'email
function formatPlanningText(shifts) {
  return shifts.map(s => s.shift ? `${s.day} : ${s.shift}` : `${s.day} : Repos`).join("\n");
}

// Envoie l'email à un employé via EmailJS
async function sendPlanningEmail(empName, empEmail, month, shifts) {
  try {
    const ejs        = await loadEJS();
    const totalMin   = shifts.reduce((acc, s) => {
      if (!s.shift) return acc;
      return acc + s.shift.split(" / ").reduce((a2, r) => {
        const [st, en] = r.split("-");
        const toM = t => { const [h,m]=t.split(":").map(Number); return h*60+m; };
        return a2 + Math.max(0, toM(en)-toM(st));
      }, 0);
    }, 0);
    const totalH = `${Math.floor(totalMin/60)}h${totalMin%60>0?String(totalMin%60).padStart(2,"0"):"00"}`;

    await ejs.send(EJS_SERVICE, EJS_TEMPLATE, {
      to_email:     empEmail,
      to_name:      empName,
      month:        month,
      planning_text: formatPlanningText(shifts),
      total_hours:  totalH,
    });
    console.log("✅ Email envoyé à", empEmail);
    return true;
  } catch(e) {
    console.warn("❌ Erreur EmailJS pour", empEmail, e);
    return false;
  }
}


function useIsDesktop() {
  const [d, setD] = useState(typeof window !== "undefined" && window.innerWidth > 768);
  useEffect(() => {
    const h = () => setD(window.innerWidth > 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return d;
}

// Génère les semaines (Lun-Dim) qui couvrent un mois donné
function getWeeksForMonth(year, month) {
  const firstDay = new Date(year, month-1, 1);
  const lastDay  = new Date(year, month,   0);
  // Reculer jusqu'au lundi précédant le 1er
  const start = new Date(firstDay);
  const dow   = start.getDay();
  start.setDate(start.getDate() - (dow===0 ? 6 : dow-1));

  const weeks = [];
  let cur = new Date(start);
  while (cur <= lastDay) {
    const days = Array.from({length:7}, (_,i) => {
      const d = new Date(cur); d.setDate(d.getDate()+i);
      return { date: new Date(d), day: d.getDate(), month: d.getMonth()+1, year: d.getFullYear(),
               inMonth: d.getMonth()+1===month && d.getFullYear()===year };
    });
    const fmt = d => String(d.day).padStart(2,"0");
    const label = `${fmt(days[0])} – ${fmt(days[6])} ${MONTHS[month-1]}`;
    const id    = `w${cur.toISOString().slice(0,10).replace(/-/g,"")}`;
    weeks.push({ id, label, days });
    cur.setDate(cur.getDate()+7);
  }
  return weeks;
}

function parseMin(range) {
  if (!range) return 0;
  const [s,e] = range.split("-");
  const toM   = t => { const [h,m]=t.split(":").map(Number); return h*60+m; };
  return Math.max(0, toM(e) - toM(s));
}
function cellMin(cell)  { return !cell ? 0 : parseMin(cell.a)+(cell.b?parseMin(cell.b):0); }
function fmtH(m)        { const h=Math.floor(m/60),mn=m%60; return mn?`${h}h${String(mn).padStart(2,"0")}`:`${h}h`; }
// Heures contractuelles pour un mois = hebdo × (nb jours ouvrés du mois / 5)
function contractMonthMin(weeklyH, year, month) {
  const last = new Date(year,month,0).getDate();
  let wd = 0;
  for (let d=1;d<=last;d++) { const day=new Date(year,month-1,d).getDay(); if(day>0&&day<6) wd++; }
  return Math.round(weeklyH * 60 * wd / 5);
}

// ─── APP PRINCIPALE ───────────────────────────────────────────────────────────

export default function App() {
  const [user,     setUser]     = useState(null);
  const [plan,     setPlan]     = useState({});           // { [weekId]: { [emp]: [...7 cells] } }
  const [contracts,setContracts]= useState(DEFAULT_CONTRACTS);
  const [empNames, setEmpNames]  = useState(DEFAULT_EMP_NAMES);
  const [empEmails, setEmpEmails] = useState(DEFAULT_EMP_EMAILS);
  const [notifs,   setNotifs]   = useState([]);
  const [lastSeen, setLastSeen] = useState(null);
  const [curMonth, setCurMonth] = useState({ year:2026, month:6 });
  const [weekIdx,  setWeekIdx]  = useState(0);
  const [panel,    setPanel]    = useState(null);
  const [myOnly,   setMyOnly]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const isDesktop = useIsDesktop();

  const weeks = useMemo(() => getWeeksForMonth(curMonth.year, curMonth.month), [curMonth]);

  // Listeners temps réel Firebase — se déclenchent dès qu'une donnée change
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    // Last-seen personnel (localStorage)
    const ls = S.getLocal(`rlb-seen-${user.id}`);
    setLastSeen(ls);
    S.setLocal(`rlb-seen-${user.id}`, Date.now());

    let loaded = 0;
    const markLoaded = () => { loaded++; if (loaded >= 4) setLoading(false); };

    // Abonnements temps réel (mise à jour instantanée pour tous)
    const u1 = S.listen("rlb-plan", v => {
      setPlan(v || {}); markLoaded();
    });
    const u2 = S.listen("rlb-contracts", v => {
      setContracts(v || DEFAULT_CONTRACTS); markLoaded();
    });
    const u3 = S.listen("rlb-notifs", v => {
      setNotifs(v || []); markLoaded();
    });
    const u5 = S.listen("rlb-empemails", v => {
      setEmpEmails(v || DEFAULT_EMP_EMAILS);
    });
    const u4 = S.listen("rlb-empnames", v => {
      const n = v || DEFAULT_EMP_NAMES;
      setEmpNames(n); NAMES = n; markLoaded();
    });

    // Nettoyage : désabonnement quand l'utilisateur se déconnecte
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [user]);

  // Quand on change de mois, revenir à la semaine 1
  const goMonth = (delta) => {
    setCurMonth(prev => {
      let m = prev.month + delta, y = prev.year;
      if (m > 12) { m=1; y++; } if (m < 1) { m=12; y--; }
      return { year:y, month:m };
    });
    setWeekIdx(0);
  };

  const unread = notifs.filter(n => !lastSeen || n.ts > lastSeen).length;

  // Récupère ou initialise les données d'une semaine
  const getWeekPlan = (weekId) => {
    const w = plan[weekId];
    if (w) return w;
    return Object.fromEntries(EMPS.map(e => [e, Array(7).fill(null)]));
  };

  const week     = weeks[weekIdx] || weeks[0];
  const weekPlan = week ? getWeekPlan(week.id) : {};

  // Calcul total heures du mois par employé
  const monthHours = useMemo(() => {
    const res = Object.fromEntries(EMPS.map(e => [e, 0]));
    weeks.forEach(w => {
      const wp = plan[w.id];
      if (!wp) return;
      w.days.forEach((d,i) => {
        if (!d.inMonth) return;
        EMPS.forEach(e => { res[e] += cellMin(wp[e]?.[i]); });
      });
    });
    return res;
  }, [plan, weeks]);

  // ── Sauvegarde cellule unique
  const saveCell = async (weekId, emp, dayIdx, data) => {
    const next = { ...plan, [weekId]: { ...getWeekPlan(weekId), [emp]: [...getWeekPlan(weekId)[emp]] } };
    next[weekId][emp][dayIdx] = data;
    setPlan(next);
    await S.set("rlb-plan", next);
    const notif = { ts:Date.now(), type:"edit",
      msg:`✏️ ${emp} · ${week.label} · ${DAYS[dayIdx]}`,
      detail: data ? `${data.a}${data.b?" / "+data.b:""}` : "Repos", by:user.name };
    pushNotif(notif);
    setPanel(null);
  };

  // ── Sauvegarde groupée
  const saveBulk = async (weekId, emps, days, data) => {
    const next = JSON.parse(JSON.stringify(plan));
    if (!next[weekId]) next[weekId] = getWeekPlan(weekId);
    emps.forEach(e => days.forEach(d => { next[weekId][e][d] = data; }));
    setPlan(next);
    await S.set("rlb-plan", next);
    const lines = emps.map(e=>N(e)).join(", ");
    const notif = { ts:Date.now(), type:"bulk",
      msg:`⚡ Saisie groupée — ${lines}`,
      detail:`${days.map(d=>DAYS[d]).join(", ")} · ${data?`${data.a}${data.b?" / "+data.b:""}`:"Repos"}`,
      by:user.name };
    pushNotif(notif);
    setPanel(null);
  };

  // ── Publier
  const publish = async () => {
    const notif = { ts:Date.now(), type:"publish",
      msg:`📢 Planning ${MONTHS[curMonth.month-1]} ${curMonth.year} publié`,
      detail:`Publié par ${user.name}`, by:user.name };
    pushNotif(notif);

    // Envoyer les emails via EmailJS
    const monthLabel = `${MONTHS[curMonth.month-1]} ${curMonth.year}`;
    const emailPromises = EMPS.map(async emp => {
      const email = empEmails[emp];
      if (!email) return;
      const shifts = buildShiftsForEmail(emp, weeks, plan, curMonth);
      await sendPlanningEmail(N(emp), email, monthLabel, shifts);
    });
    await Promise.allSettled(emailPromises);

    setPanel("confirm");
  };

  // ── Sauvegarder contrats
  const saveEmpNames = async (names) => {
    setEmpNames(names);
    NAMES = names;
    await S.set("rlb-empnames", names);
    setPanel(null);
  };

  const saveContracts = async (c) => {
    setContracts(c);
    await S.set("rlb-contracts", c);
  };

  const pushNotif = async (n) => {
    const next = [n, ...notifs].slice(0,100);
    setNotifs(next);
    await S.set("rlb-notifs", next);
  };

  // ─────────────────────────────────────────────────────────────────────────

  if (!user) return <Login onLogin={u => { setUser(u); setMyOnly(u.role==="employee"); }} />;
  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#F7F8FA",flexDirection:"column",gap:12}}>
      <div style={{fontSize:32}}>📅</div><div style={{color:"#6B7280",fontSize:14}}>Chargement…</div>
    </div>
  );

  const empsToShow = myOnly && user.emp ? [user.emp] : EMPS;

  return (
    <div style={{fontFamily:"system-ui,-apple-system,sans-serif",background:"#F7F8FA",minHeight:"100vh",maxWidth:isDesktop?1100:820,margin:"0 auto"}}>

      {/* ── HEADER ── */}
      <div style={{background:"#111827",color:"white",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>📅</span>
          <div>
            <div style={{fontWeight:700,fontSize:isDesktop?18:15,letterSpacing:"-0.5px"}}>RÉSIDENCE LE BELLEVILLE</div>
            <div style={{fontSize:11,color:"#9CA3AF"}}>{user.emoji} {user.name}{user.role==="rh"&&<span style={{background:"#DC2626",color:"white",borderRadius:4,padding:"0 4px",fontSize:10,marginLeft:6}}>RH</span>}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={() => setPanel("notifs")} style={{background:"none",border:"none",cursor:"pointer",position:"relative",padding:4}}>
            <span style={{fontSize:22}}>🔔</span>
            {unread>0&&<span style={{position:"absolute",top:0,right:0,background:"#EF4444",color:"white",borderRadius:99,fontSize:10,fontWeight:700,minWidth:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{unread}</span>}
          </button>
          {user.role==="rh"&&<>
          <button onClick={()=>setPanel("empnames")}  style={{background:"none",border:"none",cursor:"pointer",fontSize:20,padding:4}} title="Gérer l'équipe">👥</button>
          <button onClick={()=>setPanel("changepwd")} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,padding:4}} title="Changer mot de passe">🔒</button>
        </>}
          <button onClick={() => setUser(null)} style={{background:"#374151",border:"none",borderRadius:6,color:"#D1D5DB",fontSize:11,padding:"4px 8px",cursor:"pointer"}}>Changer</button>
        </div>
      </div>

      {/* ── NAVIGATION MOIS ── */}
      <div style={{background:"white",borderBottom:"1px solid #E5E7EB",padding:"10px 16px",display:"flex",alignItems:"center",gap:8}}>
        <button onClick={()=>goMonth(-1)} style={NAV_BTN}>‹</button>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{fontWeight:800,fontSize:17,color:"#111827",letterSpacing:"-0.5px"}}>
            {MONTHS[curMonth.month-1]} {curMonth.year}
          </div>
        </div>
        <button onClick={()=>goMonth(1)}  style={NAV_BTN}>›</button>
      </div>

      {/* ── NAVIGATION SEMAINE ── */}
      <div style={{background:"#F9FAFB",borderBottom:"1px solid #F3F4F6",padding:"8px 16px",display:"flex",alignItems:"center",gap:6,overflowX:"auto"}}>
        {weeks.map((w,i) => (
          <button key={w.id} onClick={() => setWeekIdx(i)} style={{
            flexShrink:0, padding:"6px 12px", borderRadius:20, border:"none", cursor:"pointer",
            fontSize:12, fontWeight:600,
            background: i===weekIdx ? "#111827" : "#F3F4F6",
            color:       i===weekIdx ? "white"   : "#6B7280",
            transition:"all 0.15s",
          }}>
            Sem. {i+1}
          </button>
        ))}
        {week && <span style={{fontSize:11,color:"#9CA3AF",marginLeft:8,flexShrink:0,fontWeight:500}}>{week.label}</span>}
      </div>

      {/* ── TOGGLE VUE (employés) ── */}
      {user.role==="employee" && (
        <div style={{padding:"8px 16px",display:"flex",gap:8}}>
          <ToggleBtn label="Toute l'équipe" active={!myOnly} onClick={()=>setMyOnly(false)} />
          <ToggleBtn label="Mon planning"   active={myOnly}  onClick={()=>setMyOnly(true)} accent />
        </div>
      )}

      {/* ── GRILLE PLANNING ── */}
      {week && (
        <div style={{overflowX:"auto",padding:"0 0 4px 0"}}>
          <table style={{borderCollapse:"collapse",width:"100%",minWidth:540}}>
            <thead>
              <tr style={{background:"#F9FAFB"}}>
                <th style={{...TH,width:70,textAlign:"left",paddingLeft:16,position:"sticky",left:0,background:"#F9FAFB",zIndex:2}}>Équipe</th>
                {DAYS.map((d,i) => {
                  const dayInfo = week.days[i];
                  return (
                    <th key={d} style={{...TH,textAlign:"center",opacity:dayInfo.inMonth?1:0.35}}>
                      <div style={{fontWeight:700,color:"#374151",fontSize:11}}>{d}</div>
                      <div style={{color:"#9CA3AF",fontSize:10,fontWeight:400}}>
                        {String(dayInfo.day).padStart(2,"0")}
                        {!dayInfo.inMonth&&<span style={{fontSize:9}}> ({MONTHS[dayInfo.month-1].slice(0,3)})</span>}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {empsToShow.map(emp => {
                const cells   = weekPlan[emp] || Array(7).fill(null);
                const isMe    = user.emp===emp;
                const mHours  = monthHours[emp];
                return (
                  <tr key={emp} style={{background:isMe?C[emp].bg+"44":"white",borderBottom:"1px solid #F3F4F6"}}>
                    <td style={{padding:"8px 6px 8px 16px",verticalAlign:"middle",position:"sticky",left:0,width:isDesktop?110:70,background:isMe?C[emp].bg+"77":"white",zIndex:1,borderRight:"2px solid "+C[emp].border}}>
                      <div style={{fontWeight:700,fontSize:isDesktop?13:11,color:C[emp].text,whiteSpace:"nowrap"}}>
                        <span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:C[emp].dot,marginRight:5}}/>
                        {N(emp)}
                      </div>
                      <div style={{fontSize:10,color:"#9CA3AF",marginTop:2}}>{fmtH(mHours)}/mois</div>
                    </td>
                    {cells.map((cell,di) => {
                      const inM  = week.days[di].inMonth;
                      const isRH = user.role==="rh";
                      return (
                        <td key={di} style={{padding:"4px 2px",textAlign:"center",verticalAlign:"middle",opacity:inM?1:0.4}}
                            onClick={()=> isRH && inM && setPanel({weekId:week.id, emp, day:di})}>
                          {cell ? (
                            <div style={{background:C[emp].bg,border:"1px solid "+C[emp].border,borderRadius:7,padding:isDesktop?"8px 6px":"5px 3px",cursor:isRH&&inM?"pointer":"default",transition:"transform 0.1s"}}
                                 onMouseEnter={e=>isRH&&inM&&(e.currentTarget.style.transform="scale(1.05)")}
                                 onMouseLeave={e=>(e.currentTarget.style.transform="scale(1)")}>
                              <div style={{fontSize:isDesktop?12:10,fontWeight:700,color:C[emp].text,lineHeight:1.3}}>{cell.a}</div>
                              {cell.b&&<div style={{fontSize:10,color:C[emp].text,opacity:0.75,lineHeight:1.3,marginTop:2}}>{cell.b}</div>}
                              {isRH&&inM&&<div style={{fontSize:9,color:C[emp].text,opacity:0.45,marginTop:1}}>✏️</div>}
                            </div>
                          ) : (
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── LÉGENDE COULEURS ── */}
      <div style={{padding:"8px 16px 4px",display:"flex",flexWrap:"wrap",gap:6}}>
        {EMPS.map(e=>(
          <span key={e} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:C[e].text,background:C[e].bg,borderRadius:20,padding:"3px 8px"}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:C[e].dot,display:"inline-block"}}/>
            {N(e)}
          </span>
        ))}
      </div>

      {/* ── ACTIONS RH ── */}
      {user.role==="rh" && (
        <div style={{padding:"12px 16px 8px",display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>setPanel("bulk")} style={{...BTN_BASE,background:"#1D4ED8",flex:1,minWidth:120}}>⚡ Saisie groupée</button>
          <button onClick={()=>setPanel("hours")} style={{...BTN_BASE,background:"#059669",flex:1,minWidth:120}}>📊 Compteur d'heures</button>
          <button onClick={publish} style={{...BTN_BASE,background:"#DC2626",flex:"0 0 100%"}}>📢 Publier le planning — {MONTHS[curMonth.month-1]}</button>
        </div>
      )}

      <div style={{padding:"4px 16px 24px",color:"#9CA3AF",fontSize:11}}>
        {user.role==="rh"?"✏️ Tapez un créneau pour l'éditer · Naviguez librement entre les mois":"🔒 Lecture seule — seule la RH peut modifier"}
      </div>

      {/* ── OVERLAYS ── */}

      {panel==="changepwd" && <ChangePwdPanel onClose={()=>setPanel(null)} />}

      {panel==="empnames" && (
        <EmpSettingsPanel
          empNames={empNames}
          empEmails={empEmails}
          onSave={saveEmpSettings}
          onClose={()=>setPanel(null)}
        />
      )}

      {panel==="notifs" && (
        <Overlay onClose={()=>setPanel(null)}>
          <div style={{fontWeight:700,fontSize:16,marginBottom:14,color:"#111827"}}>🔔 Activité</div>
          {notifs.length===0
            ? <div style={{color:"#9CA3AF",textAlign:"center",padding:24,fontSize:13}}>Aucune activité</div>
            : notifs.map((n,i)=>(
              <div key={i} style={{padding:"10px 12px",borderRadius:8,marginBottom:8,background:(!lastSeen||n.ts>lastSeen)?"#FEF3C7":"#F9FAFB",border:"1px solid "+((!lastSeen||n.ts>lastSeen)?"#FCD34D":"#F3F4F6")}}>
                <div style={{fontWeight:600,fontSize:13,color:"#111827"}}>{n.msg}</div>
                {n.detail&&<div style={{fontSize:12,color:"#6B7280",marginTop:2}}>{n.detail}</div>}
                <div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>{n.by} · {new Date(n.ts).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
              </div>
            ))
          }
        </Overlay>
      )}

      {panel==="confirm" && (
        <Overlay onClose={()=>setPanel(null)}>
          <div style={{textAlign:"center",padding:"8px 0 16px"}}>
            <div style={{fontSize:40,marginBottom:12}}>✅</div>
            <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>Planning publié !</div>
            <div style={{color:"#6B7280",fontSize:13,marginBottom:20,lineHeight:1.5}}>
              L'équipe verra une notification 🔔 à leur prochaine connexion.
            </div>
            <button onClick={()=>setPanel(null)} style={{...BTN_BASE,background:"#111827"}}>Fermer</button>
          </div>
        </Overlay>
      )}

      {panel==="hours" && (
        <HoursPanel
          monthHours={monthHours}
          contracts={contracts}
          curMonth={curMonth}
          onSave={saveContracts}
          onClose={()=>setPanel(null)}
        />
      )}

      {panel==="bulk" && week && (
        <BulkEditPanel
          weekId={week.id}
          weekLabel={week.label}
          weekDays={week.days}
          onSave={saveBulk}
          onClose={()=>setPanel(null)}
        />
      )}

      {panel && panel.emp && (
        <EditPanel
          emp={panel.emp}
          day={panel.day}
          weekLabel={week?.label||""}
          current={weekPlan[panel.emp]?.[panel.day]}
          onSave={data=>saveCell(panel.weekId, panel.emp, panel.day, data)}
          onClose={()=>setPanel(null)}
        />
      )}
    </div>
  );
}

// ─── STYLES PARTAGÉS ─────────────────────────────────────────────────────────

const TH = { padding:"7px 3px", fontWeight:600, fontSize:10, color:"#6B7280", borderBottom:"1px solid #E5E7EB", textTransform:"uppercase", letterSpacing:"0.3px" };
const NAV_BTN = { background:"none", border:"1px solid #E5E7EB", borderRadius:8, width:34, height:34, cursor:"pointer", fontSize:18, color:"#374151", display:"flex", alignItems:"center", justifyContent:"center" };
const BTN_BASE = { color:"white", border:"none", borderRadius:10, padding:"13px 0", fontSize:14, fontWeight:700, cursor:"pointer", textAlign:"center" };

// ─── COMPOSANTS UI ───────────────────────────────────────────────────────────

function ToggleBtn({label,active,onClick,accent}) {
  return (
    <button onClick={onClick} style={{flex:1,padding:"7px 0",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
      background:active?(accent?"#111827":"#E5E7EB"):"#F3F4F6",color:active?(accent?"white":"#111827"):"#9CA3AF",transition:"all 0.15s"}}>
      {label}
    </button>
  );
}

function Overlay({children,onClose}) {
  const isDesktop = useIsDesktop();
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:50,display:"flex",
      alignItems:isDesktop?"center":"flex-end", justifyContent:"center"}}
         onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{
        background:"white",
        borderRadius:isDesktop?"16px":"20px 20px 0 0",
        padding:isDesktop?"28px 28px":"20px 16px",
        width:isDesktop?"520px":"100%",
        maxWidth:isDesktop?"520px":"100%",
        maxHeight:"85vh",
        overflowY:"auto",
        boxSizing:"border-box",
        boxShadow:isDesktop?"0 20px 60px rgba(0,0,0,0.3)":"none",
      }}>
        {!isDesktop && <div style={{width:36,height:4,background:"#E5E7EB",borderRadius:2,margin:"0 auto 16px"}}/>}
        {children}
      </div>
    </div>
  );
}

// ─── COMPTEUR D'HEURES ───────────────────────────────────────────────────────

function HoursPanel({monthHours, contracts, curMonth, onSave, onClose}) {
  const [local, setLocal] = useState({ ...contracts });
  const [editing, setEditing] = useState(false);
  const monthLabel = `${MONTHS[curMonth.month-1]} ${curMonth.year}`;

  const setH = (emp, val) => setLocal(p => ({ ...p, [emp]: Number(val)||0 }));

  return (
    <Overlay onClose={onClose}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div>
          <div style={{fontWeight:700,fontSize:16,color:"#111827"}}>📊 Compteur d'heures</div>
          <div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{monthLabel}</div>
        </div>
        <button onClick={()=>setEditing(e=>!e)} style={{background:editing?"#111827":"#F3F4F6",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,color:editing?"white":"#374151",cursor:"pointer"}}>
          {editing?"✓ Terminer":"✏️ Modifier contrats"}
        </button>
      </div>

      {/* En-tête colonnes */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 80px 100px 80px",gap:4,padding:"6px 10px",background:"#F9FAFB",borderRadius:8,marginBottom:8,fontSize:11,fontWeight:700,color:"#6B7280",textTransform:"uppercase"}}>
        <div>Employé</div>
        <div style={{textAlign:"center"}}>Travaillé</div>
        <div style={{textAlign:"center"}}>Contrat/mois</div>
        <div style={{textAlign:"center"}}>Écart</div>
      </div>

      {EMPS.map(emp => {
        const workedMin   = monthHours[emp]||0;
        const contractMin = contractMonthMin(local[emp]||35, curMonth.year, curMonth.month);
        const diffMin     = workedMin - contractMin;
        const pct         = contractMin>0 ? Math.round(workedMin/contractMin*100) : 0;
        const barW        = Math.min(100, pct);
        const barColor    = diffMin<-60?"#EF4444":diffMin>60?"#F59E0B":"#10B981";
        const diffLabel   = diffMin===0?"±0h":(diffMin>0?"+":"")+fmtH(Math.abs(diffMin));
        const diffColor   = diffMin<-60?"#EF4444":diffMin>60?"#F59E0B":"#10B981";

        return (
          <div key={emp} style={{marginBottom:12,background:C[emp].bg+"55",borderRadius:10,padding:"10px 12px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 80px 100px 80px",gap:4,alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:C[emp].dot,flexShrink:0}}/>
                <span style={{fontWeight:700,fontSize:13,color:C[emp].text}}>{N(emp)}</span>
              </div>
              <div style={{textAlign:"center",fontWeight:700,fontSize:13,color:"#111827"}}>{fmtH(workedMin)}</div>
              <div style={{textAlign:"center"}}>
                {editing ? (
                  <div style={{display:"flex",alignItems:"center",gap:3,justifyContent:"center"}}>
                    <input type="number" value={local[emp]||35} min={0} max={60}
                      onChange={e=>setH(emp,e.target.value)}
                      style={{width:40,padding:"2px 4px",borderRadius:5,border:"1px solid #D1D5DB",fontSize:12,textAlign:"center"}}/>
                    <span style={{fontSize:11,color:"#6B7280"}}>h/sem</span>
                  </div>
                ) : (
                  <span style={{fontSize:12,color:"#6B7280"}}>{local[emp]||35}h/sem<br/><span style={{fontWeight:600,color:"#374151"}}>{fmtH(contractMin)}</span></span>
                )}
              </div>
              <div style={{textAlign:"center",fontWeight:700,fontSize:13,color:diffColor}}>{diffLabel}</div>
            </div>
            {/* Barre de progression */}
            <div style={{marginTop:8,height:6,background:"#E5E7EB",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:barW+"%",background:barColor,borderRadius:3,transition:"width 0.4s"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:10,color:"#9CA3AF"}}>
              <span>{pct}% du contrat</span>
              <span>{diffMin<-60?"⚠️ Sous le contrat":diffMin>60?"⚠️ Dépassement":"✅ OK"}</span>
            </div>
          </div>
        );
      })}

      {editing && (
        <button onClick={()=>{ onSave(local); setEditing(false); }} style={{...BTN_BASE,background:"#111827",width:"100%",marginTop:4}}>
          Enregistrer les contrats
        </button>
      )}
      {!editing && (
        <div style={{marginTop:8,padding:"10px 12px",background:"#F0F9FF",borderRadius:8,fontSize:12,color:"#0369A1",lineHeight:1.5}}>
          💡 Les heures contractuelles sont calculées sur les jours ouvrés du mois (lun–ven).
          Modifiez les heures hebdo pour chaque contrat via "Modifier contrats".
        </div>
      )}
    </Overlay>
  );
}

// ─── SÉLECTEUR DE CRÉNEAU ────────────────────────────────────────────────────

function ShiftPicker({label, emoji, value, onChange, presets}) {
  const isCustom = value && !presets.includes(value);
  const [custom, setCustom] = useState(isCustom ? value : "");

  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:7}}>{emoji} {label}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:7}}>
        {presets.map(p => (
          <button key={p} onClick={()=>{onChange(p);setCustom("");}} style={{
            padding:"6px 9px",borderRadius:7,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
            background:value===p?"#111827":"#F3F4F6",color:value===p?"white":"#374151",transition:"all 0.1s",
          }}>{p}</button>
        ))}
        {emoji==="🌆" && (
          <button onClick={()=>{onChange(null);setCustom("");}} style={{padding:"6px 9px",borderRadius:7,border:"1px dashed #D1D5DB",cursor:"pointer",fontSize:12,fontWeight:600,background:!value?"#F9FAFB":"white",color:"#6B7280"}}>
            Pas de soir
          </button>
        )}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <input value={isCustom?value:custom} onChange={e=>{setCustom(e.target.value);onChange(e.target.value||null);}}
          placeholder="Autre horaire… ex : 07:00-12:00"
          style={{flex:1,padding:"8px 10px",borderRadius:8,border:isCustom?"1.5px solid #111827":"1px solid #E5E7EB",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
        {(isCustom||custom) && <button onClick={()=>{setCustom("");onChange(null);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#9CA3AF"}}>✕</button>}
      </div>
    </div>
  );
}

// ─── PANEL ÉDITION CELLULE ────────────────────────────────────────────────────

function EditPanel({emp, day, weekLabel, current, onSave, onClose}) {
  const [repos,  setRepos]  = useState(!current);
  const [shiftA, setShiftA] = useState(current?.a||null);
  const [shiftB, setShiftB] = useState(current?.b||null);
  const canSave = repos||!!shiftA;

  return (
    <Overlay onClose={onClose}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <span style={{width:10,height:10,borderRadius:"50%",background:C[emp].dot,flexShrink:0}}/>
        <div>
          <div style={{fontWeight:700,fontSize:15,color:"#111827"}}>{N(emp)}</div>
          <div style={{fontSize:11,color:"#9CA3AF"}}>{DAYS[day]} · {weekLabel}</div>
        </div>
        {!repos&&shiftA&&(
          <div style={{marginLeft:"auto",background:C[emp].bg,border:"1px solid "+C[emp].border,borderRadius:7,padding:"4px 8px",textAlign:"right"}}>
            <div style={{fontSize:11,fontWeight:700,color:C[emp].text,lineHeight:1.4}}>{shiftA}{shiftB&&<><br/>{shiftB}</>}</div>
          </div>
        )}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <ToggleBtn label="🛌 Repos"   active={repos}  onClick={()=>setRepos(true)}  />
        <ToggleBtn label="💼 Travail" active={!repos} onClick={()=>setRepos(false)} accent />
      </div>
      {!repos&&<><ShiftPicker label="Créneau matin" emoji="🌅" value={shiftA} onChange={setShiftA} presets={PRESETS_A}/><ShiftPicker label="Créneau soir (optionnel)" emoji="🌆" value={shiftB} onChange={setShiftB} presets={PRESETS_B}/></>}
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={onClose} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>Annuler</button>
        <button disabled={!canSave} onClick={()=>repos?onSave(null):onSave({a:shiftA,b:shiftB||null})} style={{flex:2,padding:"12px 0",border:"none",borderRadius:8,background:canSave?"#111827":"#E5E7EB",color:canSave?"white":"#9CA3AF",fontSize:14,fontWeight:700,cursor:canSave?"pointer":"not-allowed"}}>Enregistrer</button>
      </div>
    </Overlay>
  );
}

// ─── PANEL SAISIE GROUPÉE ────────────────────────────────────────────────────

function BulkEditPanel({weekId, weekLabel, weekDays, onSave, onClose}) {
  const [selEmps, setSelEmps] = useState([]);
  const [selDays, setSelDays] = useState([]);
  const [repos,   setRepos]   = useState(false);
  const [shiftA,  setShiftA]  = useState(null);
  const [shiftB,  setShiftB]  = useState(null);
  const [step,    setStep]    = useState(1);

  const toggleEmp = e => setSelEmps(s=>s.includes(e)?s.filter(x=>x!==e):[...s,e]);
  const toggleDay = d => setSelDays(s=>s.includes(d)?s.filter(x=>x!==d):[...s,d]);
  const allEmps   = selEmps.length===EMPS.length;
  const inMonthIdxs = weekDays.map((d,i)=>d.inMonth?i:-1).filter(i=>i>=0);

  const STEP_LABELS = ["","Qui travaille ?","Quels jours ?","Quel horaire ?"];

  return (
    <Overlay onClose={onClose}>
      <div style={{marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:16,color:"#111827"}}>⚡ Saisie groupée</div>
        <div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{weekLabel}</div>
        <div style={{display:"flex",gap:4,marginTop:10}}>
          {[1,2,3].map(s=><div key={s} style={{flex:1,height:3,borderRadius:2,background:step>=s?"#1D4ED8":"#E5E7EB",transition:"background 0.2s"}}/>)}
        </div>
        <div style={{fontWeight:600,fontSize:13,color:"#374151",marginTop:10}}>{STEP_LABELS[step]}</div>
      </div>

      {step===1&&(
        <div>
          <button onClick={()=>setSelEmps(allEmps?[]:[...EMPS])} style={{display:"block",width:"100%",marginBottom:10,padding:"8px 0",border:"1px dashed #D1D5DB",borderRadius:8,background:"#F9FAFB",fontSize:12,fontWeight:600,color:"#374151",cursor:"pointer"}}>
            {allEmps?"✕ Tout désélectionner":"✓ Toute l'équipe"}
          </button>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {EMPS.map(emp=>{
              const on=selEmps.includes(emp);
              return (
                <button key={emp} onClick={()=>toggleEmp(emp)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,border:"none",cursor:"pointer",background:on?C[emp].bg:"#F9FAFB",outline:on?`2px solid ${C[emp].dot}`:"2px solid transparent",transition:"all 0.15s"}}>
                  <span style={{width:10,height:10,borderRadius:"50%",background:C[emp].dot,flexShrink:0}}/>
                  <span style={{fontWeight:700,fontSize:14,color:on?C[emp].text:"#374151"}}>{N(emp)}</span>
                  <span style={{marginLeft:"auto",fontSize:16}}>{on?"✓":""}</span>
                </button>
              );
            })}
          </div>
          <button disabled={!selEmps.length} onClick={()=>setStep(2)} style={{width:"100%",marginTop:16,padding:"13px 0",border:"none",borderRadius:10,background:selEmps.length?"#1D4ED8":"#E5E7EB",color:selEmps.length?"white":"#9CA3AF",fontSize:14,fontWeight:700,cursor:selEmps.length?"pointer":"not-allowed"}}>
            Suivant →
          </button>
        </div>
      )}

      {step===2&&(
        <div>
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            {[
              {label:"Tout le mois",days:inMonthIdxs},
              {label:"Lun – Ven",   days:inMonthIdxs.filter(i=>i<5)},
              {label:"Week-end",    days:inMonthIdxs.filter(i=>i>=5)},
            ].map(r=>(
              <button key={r.label} onClick={()=>setSelDays(r.days)} style={{padding:"6px 12px",borderRadius:20,border:"1px solid #E5E7EB",background:"white",fontSize:12,color:"#374151",cursor:"pointer",fontWeight:500}}>
                {r.label}
              </button>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:12}}>
            {DAYS.map((d,i)=>{
              const avail=inMonthIdxs.includes(i);
              const on=selDays.includes(i);
              return (
                <button key={d} disabled={!avail} onClick={()=>avail&&toggleDay(i)} style={{padding:"10px 4px",borderRadius:8,border:"none",cursor:avail?"pointer":"not-allowed",background:on?"#111827":avail?"#F3F4F6":"#F9FAFB",color:on?"white":avail?"#374151":"#D1D5DB",fontSize:12,fontWeight:700,transition:"all 0.12s"}}>
                  {d}
                  {!avail&&<div style={{fontSize:9,fontWeight:400}}>hors mois</div>}
                </button>
              );
            })}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setStep(1)} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>← Retour</button>
            <button disabled={!selDays.length} onClick={()=>setStep(3)} style={{flex:2,padding:"12px 0",border:"none",borderRadius:10,background:selDays.length?"#1D4ED8":"#E5E7EB",color:selDays.length?"white":"#9CA3AF",fontSize:14,fontWeight:700,cursor:selDays.length?"pointer":"not-allowed"}}>Suivant →</button>
          </div>
        </div>
      )}

      {step===3&&(
        <div>
          <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,padding:"9px 12px",marginBottom:14,fontSize:12}}>
            <span style={{fontWeight:700,color:"#1E40AF"}}>{selEmps.map(e=>N(e)).join(", ")}</span>
            <span style={{color:"#6B7280",marginLeft:6}}>· {selDays.map(d=>DAYS[d]).join(", ")}</span>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <ToggleBtn label="🛌 Repos"   active={repos}  onClick={()=>setRepos(true)} />
            <ToggleBtn label="💼 Travail" active={!repos} onClick={()=>setRepos(false)} accent />
          </div>
          {!repos&&<><ShiftPicker label="Créneau matin" emoji="🌅" value={shiftA} onChange={setShiftA} presets={PRESETS_A}/><ShiftPicker label="Créneau soir (optionnel)" emoji="🌆" value={shiftB} onChange={setShiftB} presets={PRESETS_B}/></>}
          {(repos||shiftA)&&(
            <div style={{background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12}}>
              ✅ <strong>{selEmps.length*selDays.length} créneau(x)</strong> à mettre à jour
            </div>
          )}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setStep(2)} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>← Retour</button>
            <button disabled={!(repos||shiftA)} onClick={()=>onSave(weekId,selEmps,selDays,repos?null:{a:shiftA,b:shiftB||null})} style={{flex:2,padding:"12px 0",border:"none",borderRadius:10,background:(repos||shiftA)?"#111827":"#E5E7EB",color:(repos||shiftA)?"white":"#9CA3AF",fontSize:14,fontWeight:700,cursor:(repos||shiftA)?"pointer":"not-allowed"}}>
              Appliquer à tous
            </button>
          </div>
        </div>
      )}
    </Overlay>
  );
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────

// ─── PANEL GESTION DES NOMS ──────────────────────────────────────────────────

function buildShiftsForEmail(emp, weeks, plan, curMonth) {
  const rows = [];
  weeks.forEach(week => {
    const wp = plan[week.id];
    week.days.forEach((d, i) => {
      if (!d.inMonth) return;
      const cell = wp?.[emp]?.[i];
      const label = `${DAYS[i]} ${String(d.day).padStart(2,"0")}`;
      rows.push({ day: label, shift: cell ? `${cell.a}${cell.b?" / "+cell.b:""}` : null });
    });
  });
  return rows;
}


function EmpSettingsPanel({empNames, empEmails, onSave, onClose}) {
  const [names,  setNames]  = useState({ ...empNames  });
  const [emails, setEmails] = useState({ ...empEmails });

  const setN = (emp, v) => setNames(p  => ({ ...p, [emp]: v }));
  const setE = (emp, v) => setEmails(p => ({ ...p, [emp]: v }));

  const inpStyle = (accent) => ({
    width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid "+(accent||"#E5E7EB"),
    fontSize:13, outline:"none", fontFamily:"inherit", boxSizing:"border-box",
  });

  return (
    <Overlay onClose={onClose}>
      <div style={{marginBottom:18}}>
        <div style={{fontWeight:700,fontSize:16,color:"#111827"}}>👥 Paramètres de l'équipe</div>
        <div style={{fontSize:12,color:"#9CA3AF",marginTop:3}}>Noms affichés + emails de notification</div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
        {EMPS.map(emp => (
          <div key={emp} style={{background:C[emp].bg+"55",borderRadius:10,padding:"10px 14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{width:9,height:9,borderRadius:"50%",background:C[emp].dot,flexShrink:0}}/>
              <span style={{fontSize:10,fontWeight:700,color:C[emp].text,textTransform:"uppercase",letterSpacing:"0.5px"}}>
                {emp}
              </span>
            </div>
            <div style={{display:"flex",gap:8,flexDirection:"column"}}>
              {/* Nom affiché */}
              <div>
                <div style={{fontSize:11,color:"#6B7280",marginBottom:4,fontWeight:500}}>✏️ Nom affiché</div>
                <input
                  value={names[emp]||""}
                  onChange={e=>setN(emp,e.target.value)}
                  placeholder={N(emp)}
                  style={{...inpStyle(C[emp].border), fontWeight:600, color:C[emp].text}}
                />
              </div>
              {/* Email */}
              <div>
                <div style={{fontSize:11,color:"#6B7280",marginBottom:4,fontWeight:500}}>📧 Email de notification</div>
                <input
                  type="email"
                  value={emails[emp]||""}
                  onChange={e=>setE(emp,e.target.value)}
                  placeholder="prenom@email.com"
                  style={inpStyle()}
                />
                {emails[emp] && (
                  <div style={{fontSize:10,color:"#10B981",marginTop:3}}>✓ Sera notifié à la publication</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:8}}>
        <button onClick={onClose} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>
          Annuler
        </button>
        <button onClick={()=>onSave(names, emails)} style={{flex:2,padding:"12px 0",border:"none",borderRadius:8,background:"#111827",color:"white",fontSize:14,fontWeight:700,cursor:"pointer"}}>
          Enregistrer
        </button>
      </div>
    </Overlay>
  );
}


function ChangePwdPanel({onClose}) {
  const [current, setCurrent] = useState("");
  const [next1,   setNext1]   = useState("");
  const [next2,   setNext2]   = useState("");
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!current || !next1 || !next2) { setError("Tous les champs sont requis"); return; }
    if (next1 !== next2)              { setError("Les nouveaux mots de passe ne correspondent pas"); return; }
    if (next1.length < 6)             { setError("Minimum 6 caractères"); return; }
    setLoading(true); setError("");
    const currentHash = await hashPwd(current);
    const storedHash  = localStorage.getItem("rlb-rh-hash") || DEFAULT_RH_HASH;
    if (currentHash !== storedHash) { setError("Mot de passe actuel incorrect"); setLoading(false); return; }
    const newHash = await hashPwd(next1);
    localStorage.setItem("rlb-rh-hash", newHash);
    setSuccess(true); setLoading(false);
  };

  const inp = (val, set, ph) => (
    <input type="password" value={val} onChange={e=>{set(e.target.value);setError("");}}
      placeholder={ph}
      style={{width:"100%",padding:"10px 12px",borderRadius:8,border:error?"1.5px solid #EF4444":"1px solid #E5E7EB",fontSize:13,outline:"none",fontFamily:"inherit",marginBottom:10,boxSizing:"border-box"}}
    />
  );

  if (success) return (
    <Overlay onClose={onClose}>
      <div style={{textAlign:"center",padding:"8px 0 16px"}}>
        <div style={{fontSize:40,marginBottom:12}}>✅</div>
        <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Mot de passe modifié</div>
        <div style={{color:"#6B7280",fontSize:13,marginBottom:20}}>Le nouveau mot de passe est actif.</div>
        <button onClick={onClose} style={{padding:"12px 32px",border:"none",borderRadius:8,background:"#111827",color:"white",fontSize:14,fontWeight:600,cursor:"pointer"}}>Fermer</button>
      </div>
    </Overlay>
  );

  return (
    <Overlay onClose={onClose}>
      <div style={{fontWeight:700,fontSize:16,color:"#111827",marginBottom:4}}>🔒 Changer le mot de passe RH</div>
      <div style={{fontSize:12,color:"#9CA3AF",marginBottom:16}}>Accès Laetitia uniquement</div>
      {inp(current, setCurrent, "Mot de passe actuel")}
      {inp(next1,   setNext1,   "Nouveau mot de passe")}
      {inp(next2,   setNext2,   "Confirmer le nouveau mot de passe")}
      {error && <div style={{color:"#EF4444",fontSize:12,marginBottom:10}}>⚠️ {error}</div>}
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={onClose} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>Annuler</button>
        <button onClick={handleSave} disabled={loading} style={{flex:2,padding:"12px 0",border:"none",borderRadius:8,background:"#111827",color:"white",fontSize:14,fontWeight:700,cursor:"pointer"}}>
          {loading?"...":"Enregistrer"}
        </button>
      </div>
    </Overlay>
  );
}

function Login({onLogin}) {
  const [pending, setPending] = useState(null);
  const [pwd,     setPwd]     = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const handleSelect = (u) => {
    if (u.role === "rh") { setPending(u); setPwd(""); setError(""); setTimeout(() => inputRef.current?.focus(), 100); }
    else onLogin(u);
  };

  const handleLogin = async () => {
    if (!pwd) return;
    setLoading(true); setError("");
    const hash       = await hashPwd(pwd);
    const storedHash = localStorage.getItem("rlb-rh-hash") || DEFAULT_RH_HASH;
    if (hash === storedHash) { onLogin(pending); }
    else { setError("Mot de passe incorrect"); setPwd(""); setTimeout(() => inputRef.current?.focus(), 50); }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#111827 0%,#1F2937 60%,#374151 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"system-ui,-apple-system,sans-serif"}}>
      <div style={{marginBottom:32,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:12}}>📅</div>
        <div style={{fontWeight:800,fontSize:22,color:"white",letterSpacing:"-0.5px"}}>RÉSIDENCE LE BELLEVILLE</div>
        <div style={{color:"#9CA3AF",fontSize:13,marginTop:4}}>Accès interne équipe</div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10,width:"100%",maxWidth:380}}>
        {USERS.map(u => (
          <div key={u.id}>
            <button onClick={() => handleSelect(u)}
              style={{
                width:"100%", background: pending?.id===u.id ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
                border: pending?.id===u.id ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(255,255,255,0.15)",
                borderRadius: pending?.id===u.id ? "12px 12px 0 0" : 12,
                padding:"14px 20px", display:"flex", alignItems:"center", gap:14,
                cursor:"pointer", color:"white", transition:"all 0.15s", textAlign:"left",
              }}
              onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.15)"}
              onMouseLeave={e => e.currentTarget.style.background=pending?.id===u.id?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.08)"}>
              <span style={{fontSize:24}}>{u.emoji}</span>
              <div>
                <div style={{fontWeight:700,fontSize:14}}>{u.name}</div>
                <div style={{fontSize:11,color:"#9CA3AF",marginTop:1}}>
                  {u.role==="rh" ? "🔑 Accès RH — mot de passe requis" : "👁️ Consultation seule"}
                </div>
              </div>
              {u.role==="rh" && <span style={{marginLeft:"auto",background:"#DC2626",borderRadius:4,fontSize:10,padding:"2px 6px",fontWeight:700}}>RH</span>}
            </button>

            {/* Champ mot de passe inline sous Laetitia */}
            {pending?.id===u.id && (
              <div style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.3)",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"14px 16px"}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{position:"relative",flex:1}}>
                    <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14}}>🔒</span>
                    <input
                      ref={inputRef}
                      type="password"
                      value={pwd}
                      onChange={e => { setPwd(e.target.value); setError(""); }}
                      onKeyDown={e => e.key==="Enter" && handleLogin()}
                      placeholder="Mot de passe RH…"
                      style={{
                        width:"100%", padding:"10px 12px 10px 34px",
                        borderRadius:8, border: error ? "1.5px solid #EF4444" : "1px solid rgba(255,255,255,0.25)",
                        background:"rgba(255,255,255,0.1)", color:"white",
                        fontSize:13, outline:"none", fontFamily:"inherit",
                        boxSizing:"border-box",
                      }}
                    />
                  </div>
                  <button onClick={handleLogin} disabled={!pwd||loading}
                    style={{
                      padding:"10px 18px", borderRadius:8, border:"none", cursor:"pointer",
                      background: pwd&&!loading ? "#DC2626" : "rgba(255,255,255,0.15)",
                      color:"white", fontSize:13, fontWeight:700, flexShrink:0, transition:"all 0.15s",
                    }}>
                    {loading ? "…" : "Entrer"}
                  </button>
                </div>
                {error && <div style={{color:"#FCA5A5",fontSize:12,marginTop:8,fontWeight:500}}>⚠️ {error}</div>}
                <div style={{color:"#6B7280",fontSize:11,marginTop:8}}>Mot de passe par défaut : RLB2026</div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{marginTop:24,color:"#6B7280",fontSize:11}}>Résidence Le Belleville — Accès interne</div>
    </div>
  );
}
