import { useState, useEffect, useMemo, useRef } from "react";

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const DAYS   = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const EMPS   = ["MICKAEL","ZACK","KURTIS","ENZO"];

// ─── SYSTÈME EMPLOYÉS DYNAMIQUE ──────────────────────────────────────────────

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
    return C_EXTRA[Math.max(0, idx) % C_EXTRA.length];
  }
});

const DEFAULT_EMPS = ["MICKAEL","ZACK","KURTIS","ENZO"];


const USERS = [
  { id:"laetitia", name:"Laetitia", role:"rh",      emoji:"👩‍💼", label:"RH" },
  { id:"mickael",  name:"Mickael",  role:"employee", emoji:"👨‍💼", emp:"MICKAEL" },
  { id:"zack",     name:"Zack",     role:"employee", emoji:"🧑",   emp:"ZACK" },
  { id:"enzo",     name:"Enzo",     role:"employee", emoji:"👦",   emp:"ENZO" },
  { id:"kurtis",   name:"Kurtis",   role:"employee", emoji:"🧔",   emp:"KURTIS" },
];

// Heures hebdo contractuelles par défaut (35h)
const EMOJI_LIST = ['👨\u200d💼', '🧑', '👦', '🧔', '👩', '👨', '🧒', '👴', '👵', '🧑\u200d💼'];

const DEFAULT_CONTRACTS = { MICKAEL:35, ZACK:35, KURTIS:35, ENZO:35 };
const DEFAULT_EMP_NAMES = { MICKAEL:"Mickael", ZACK:"Zack", KURTIS:"Kurtis", ENZO:"Enzo" };
const DEFAULT_EMP_EMAILS = { MICKAEL:"", ZACK:"", KURTIS:"", ENZO:"" };


// Noms affichés (mis à jour dynamiquement par l'app)
let NAMES = { ...DEFAULT_EMP_NAMES };
const N = emp => NAMES[emp] || N(emp);

const PRESETS_A = ['08:00-13:00', '08:30-13:00', '08:30-13:30', '08:45-12:00', '09:00-13:00', '09:15-12:45', '10:00-12:30', '10:15-12:45', '11:45-16:00', '11:45-16:30'];
const PRESETS_B = ['13:00-18:30', '14:00-17:00', '14:00-18:00', '14:00-18:30', '14:00-19:00', '14:15-18:00', '14:15-18:30', '14:45-18:00', '14:45-18:30', '15:30-18:30'];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Storage : window.storage (Claude) avec fallback localStorage (déploiement externe)
const S = {
  // Lecture — window.storage (Claude) avec fallback localStorage + timeout 2s
  async get(k) {
    if (typeof window.storage !== "undefined") {
      try {
        const r = await Promise.race([
          window.storage.get(k, true),
          new Promise(res => setTimeout(() => res(null), 2000)),
        ]);
        if (r) return JSON.parse(r.value);
      } catch {}
    }
    try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
  },
  // Écriture — window.storage puis localStorage
  async set(k, v) {
    if (typeof window.storage !== "undefined") {
      try { await window.storage.set(k, JSON.stringify(v), true); } catch {}
    }
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  },
  // Données personnelles locales uniquement
  getLocal(k)    { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  setLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── AUTHENTIFICATION RH ─────────────────────────────────────────────────────

const DEFAULT_RH_HASH = "d31db950efb62b522f978c0d3e3b9a067e0f87da9c46865da77c25031fb703ce"; 

async function hashPwd(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}


// ─── EMAILJS ─────────────────────────────────────────────────────────────────
const EJS_SERVICE  = "service_f8wposw";
const EJS_TEMPLATE = "template_qhm7l64";
const EJS_KEY      = "zUbP2O2gaX5Y_aqBF";

// Charge le SDK EmailJS depuis le CDN (pas de npm requis)
async function loadEJS() {
  if (window.emailjs) return window.emailjs;
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    s.onload  = () => { window.emailjs.init({ publicKey: EJS_KEY }); res(window.emailjs); };
    s.onerror = rej;
    document.head.appendChild(s);
  });
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
    const label = (() => {
      const s = days[0], e = days[6];
      if (s.month === e.month) return `${fmt(s)} – ${fmt(e)} ${MONTHS[s.month-1]}`;
      return `${fmt(s)} ${MONTHS[s.month-1].slice(0,3)} – ${fmt(e)} ${MONTHS[e.month-1].slice(0,3)}`;
    })();
    const id    = `w${cur.toISOString().slice(0,10).replace(/-/g,"")}`;
    weeks.push({ id, label, days });
    cur.setDate(cur.getDate()+7);
  }
  return weeks;
}

function parseMin(range) {
  if (!range) return 0;
  // Accepte "08:30-13:00" ET "8h30-13h00"
  const toM = t => {
    if (!t) return 0;
    const clean = t.trim().replace(/h/i,":");
    const [h,m] = clean.split(":").map(s=>parseInt(s)||0);
    return h*60+(m||0);
  };
  const dash = range.lastIndexOf("-");
  if (dash <= 0) return 0;
  return Math.max(0, toM(range.slice(dash+1)) - toM(range.slice(0,dash)));
}
function cellMin(cell)  { try { return !cell ? 0 : (parseMin(cell.a)||0)+((cell.b?parseMin(cell.b):0)||0); } catch { return 0; } }
function fmtH(m)        { const h=Math.floor(m/60),mn=m%60; return mn?`${h}h${String(mn).padStart(2,"0")}`:`${h}h`; }
function fmtHDec(m)     { const h=m/60; return h%1===0?`${h}h`:`${h.toFixed(2)}h`; } // 151.67h au lieu de 151h40
// Heures contractuelles pour un mois = hebdo × (nb jours ouvrés du mois / 5)
function contractMonthMin(weeklyH) {
  // Formule légale française : heures hebdo × 52 semaines / 12 mois
  // 39h → 169h/mois | 35h → 151.67h/mois
  return Math.round(weeklyH * 52 / 12 * 60);
}

// ─── APP PRINCIPALE ───────────────────────────────────────────────────────────

export default function App() {
  // Restaurer la session sauvegardée (persist login)
  const savedUser = (() => {
    try { return JSON.parse(localStorage.getItem("rlb-session")); } catch { return null; }
  })();
  const [user, setUser] = useState(savedUser);
  // Cache pour le login screen (disponible avant Firebase)
  const [preLoginEmps,  setPreLoginEmps]  = useState(() => {
    try { return JSON.parse(localStorage.getItem("rlb-emp-cache"))   || DEFAULT_EMPS;      } catch { return DEFAULT_EMPS; }
  });
  const [preLoginNames, setPreLoginNames] = useState(() => {
    try { return JSON.parse(localStorage.getItem("rlb-names-cache")) || DEFAULT_EMP_NAMES; } catch { return DEFAULT_EMP_NAMES; }
  });
  const [plan,     setPlan]     = useState({});           // { [weekId]: { [emp]: [...7 cells] } }
  const [contracts,setContracts]= useState(DEFAULT_CONTRACTS);
  const [empNames, setEmpNames]  = useState(DEFAULT_EMP_NAMES);
  const [emps,      setEmps]      = useState(DEFAULT_EMPS);
  const [empEmails, setEmpEmails] = useState(DEFAULT_EMP_EMAILS);
  const [notifs,   setNotifs]   = useState([]);
  const [lastSeen, setLastSeen] = useState(null);
  const [curMonth, setCurMonth] = useState({ year:2026, month:6 });
  const [weekIdx,  setWeekIdx]  = useState(0);
  const [panel,    setPanel]    = useState(null);
  const [myOnly,   setMyOnly]   = useState(false);
  const [showPortal, setShowPortal] = useState(!savedUser); // Afficher portail si pas de session
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
  const [loading,  setLoading]  = useState(false);
  const isDesktop = useIsDesktop();

  const weeks = useMemo(() => getWeeksForMonth(curMonth.year, curMonth.month), [curMonth]);

  // Charge les données partagées
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const p  = await S.get("rlb-plan") || {};
      const en = await S.get("rlb-empnames") || DEFAULT_EMP_NAMES;
      const el = await S.get("rlb-emp-list") || DEFAULT_EMPS;
      setEmps(el); _dynEmps = el.filter(e => !(e in C_BASE));
      setPreLoginEmps(el);
      try { localStorage.setItem("rlb-emp-cache", JSON.stringify(el)); } catch {}
      const c  = await S.get("rlb-contracts") || DEFAULT_CONTRACTS;
      const n  = await S.get("rlb-notifs") || [];
      const ls = S.getLocal(`rlb-seen-${user.id}`);
      setPlan(p); setContracts(c); setNotifs(n); setLastSeen(ls);
      setEmpNames(en); NAMES = en;
      const em = await S.get("rlb-empemails") || DEFAULT_EMP_EMAILS;
      setEmpEmails(em);
      S.setLocal(`rlb-seen-${user.id}`, Date.now());
      setLoading(false);
    };
    // Timeout de sécurité : 5s max, puis afficher l'app quand même
    const timer = setTimeout(() => setLoading(false), 5000);
    load().finally(() => clearTimeout(timer));
  }, [user]);

  // Quand on change de mois, revenir à la semaine 1
  // Sync couleurs dynamiques
  useEffect(() => { _dynEmps = emps.filter(e => !(e in C_BASE)); }, [emps]);

  // Rafraîchir les données employés depuis Firebase avant le login
  // → garantit que la page de login est toujours à jour
  useEffect(() => {
    const refreshLoginData = async () => {
      try {
        const el = await S.get("rlb-emp-list");
        const en = await S.get("rlb-empnames");
        if (el && el.length > 0) {
          setPreLoginEmps(el);
          try { localStorage.setItem("rlb-emp-cache", JSON.stringify(el)); } catch {}
        }
        if (en && Object.keys(en).length > 0) {
          setPreLoginNames(en);
          try { localStorage.setItem("rlb-names-cache", JSON.stringify(en)); } catch {}
        }
      } catch {}
    };
    refreshLoginData();
  }, []); // Une seule fois au démarrage

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
    return Object.fromEntries(emps.map(e => [e, Array(7).fill(null)]));
  };

  const week     = weeks[weekIdx] || weeks[0];
  // S'assurer que tous les employés actuels ont une entrée dans weekPlan
  const weekPlan = (() => {
    const wp = week ? getWeekPlan(week.id) : {};
    const result = { ...wp };
    emps.forEach(e => { if (!result[e]) result[e] = Array(7).fill(null); });
    return result;
  })();

  // Calcul total heures du mois par employé
  const monthHours = useMemo(() => {
    const res = Object.fromEntries(emps.map(e => [e, 0]));
    weeks.forEach(w => {
      const wp = plan[w.id];
      if (!wp) return;
      w.days.forEach((d,i) => {
        if (!d.inMonth) return;
        emps.forEach(e => { res[e] = (res[e]||0) + cellMin(wp[e]?.[i]); });
      });
    });
    return res;
  }, [plan, weeks, emps]);

  // ── Sauvegarde cellule unique
  const saveCell = async (weekId, emp, dayIdx, data) => {
    const baseWeek = getWeekPlan(weekId);
    const empArr   = baseWeek[emp] ? [...baseWeek[emp]] : Array(7).fill(null);
    const next = { ...plan, [weekId]: { ...baseWeek, [emp]: empArr } };
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
  // Sauvegarde groupée — scope: "week" | "month"
  const saveBulk = async (emps, dayIndices, data, scope) => {
    const next = JSON.parse(JSON.stringify(plan));
    const weeksToApply = scope === "month" ? weeks : [weeks[weekIdx]];
    weeksToApply.forEach(wk => {
      if (!next[wk.id]) next[wk.id] = getWeekPlan(wk.id);
      emps.forEach(emp => {
        if (!next[wk.id][emp]) next[wk.id][emp] = Array(7).fill(null);
        dayIndices.forEach(di => {
          if (wk.days[di]?.inMonth) next[wk.id][emp][di] = data;
        });
      });
    });
    setPlan(next);
    await S.set("rlb-plan", next);
    const lines = emps.map(e => N(e)).join(", ");
    const scopeLabel = scope === "month" ? `tout ${MONTHS[curMonth.month-1]}` : (weeks[weekIdx]?.label || "");
    const notif = { ts:Date.now(), type:"bulk",
      msg:`⚡ Saisie groupée — ${lines}`,
      detail:`${dayIndices.map(d=>DAYS[d]).join(", ")} · ${scopeLabel} · ${data?`${data.a}${data.b?" / "+data.b:""}` :"Repos"}`,
      by:user.name };
    pushNotif(notif);
    setPanel(null);
  };

  // ── Publier
  // Dupliquer la semaine courante vers la semaine suivante
  const duplicateWeek = async () => {
    if (weekIdx >= weeks.length - 1) return;
    const srcWeek  = weeks[weekIdx];
    const dstWeek  = weeks[weekIdx + 1];
    if (!window.confirm(`Dupliquer "${srcWeek.label}" → "${dstWeek.label}" ?\nLes données existantes de la semaine suivante seront remplacées.`)) return;

    const srcPlan = plan[srcWeek.id] || getWeekPlan(srcWeek.id);

    // Copie profonde en respectant les jours dans le mois de destination
    const dstPlan = {};
    emps.forEach(emp => {
      dstPlan[emp] = srcPlan[emp]
        ? srcPlan[emp].map((cell, di) => dstWeek.days[di]?.inMonth ? cell : null)
        : Array(7).fill(null);
    });

    const next = { ...plan, [dstWeek.id]: dstPlan };
    setPlan(next);
    await S.set("rlb-plan", next);

    const notif = { ts:Date.now(), type:"edit",
      msg:`📋 Semaine dupliquée : ${srcWeek.label} → ${dstWeek.label}`,
      detail:`Copié par ${user.name}`, by:user.name };
    pushNotif(notif);
    setWeekIdx(weekIdx + 1); // aller à la semaine destination
  };

  const publish = async (selectedEmps) => {
    const notif = { ts:Date.now(), type:"publish",
      msg:`📢 Planning ${MONTHS[curMonth.month-1]} ${curMonth.year} publié`,
      detail:`Publié par ${user.name}`, by:user.name };
    pushNotif(notif);
    setPanel("confirm");
  };

  // ── Sauvegarder contrats
  const saveEmpSettings = async (names, emails, empList) => {
    const list     = empList || emps;
    const removed  = emps.filter(e => !list.includes(e));
    const newContracts = { ...contracts };
    list.forEach(e    => { if (newContracts[e] === undefined) newContracts[e] = 35; });
    removed.forEach(e => { delete newContracts[e]; });
    const newNames  = { ...names  }; removed.forEach(e => delete newNames[e]);
    const newEmails = { ...emails }; removed.forEach(e => delete newEmails[e]);
    setEmps(list);       _dynEmps = list.filter(e => !(e in C_BASE));
    setEmpNames(newNames);  NAMES = newNames;
    setEmpEmails(newEmails);
    setContracts(newContracts);
    await S.set("rlb-emp-list",  list);
    await S.set("rlb-empnames",  newNames);
    await S.set("rlb-empemails", newEmails);
    await S.set("rlb-contracts", newContracts);
    // Mettre à jour le cache login
    try {
      localStorage.setItem("rlb-emp-cache",   JSON.stringify(list));
      localStorage.setItem("rlb-names-cache", JSON.stringify(newNames));
    } catch {}
    setPreLoginEmps(list);
    setPreLoginNames(newNames);
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

  if (showPortal) return <Portal onEnterPlanning={()=>setShowPortal(false)} />;

  if (!user) return <Login preEmps={preLoginEmps} preNames={preLoginNames} onLogin={u => { setUser(u); setMyOnly(u.role==="employee"); }} />;
  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#F7F8FA",flexDirection:"column",gap:12}}>
      <div style={{fontSize:32}}>📅</div><div style={{color:"#6B7280",fontSize:14}}>Chargement…</div>
    </div>
  );

  const empsToShow = myOnly && user.emp ? [user.emp] : emps;

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
          <button onClick={() => setUser(null)} style={{background:"#374151",border:"none",borderRadius:6,color:"#D1D5DB",fontSize:11,padding:"4px 8px",cursor:"pointer"}}
          onClick={() => { try { localStorage.removeItem("rlb-session"); } catch {} setUser(null); }}
          >Changer</button>
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

      {/* ── TOGGLE VUE (visible pour tous en vue mois, employés en vue semaine) ── */}
      {(user.role==="employee" || viewMode==="month") && (
        <div style={{padding:"8px 16px 4px",display:"flex",gap:8}}>
          <ToggleBtn label="👥 Toute l'équipe" active={!myOnly} onClick={()=>setMyOnly(false)} />
          {user.emp && <ToggleBtn label="🙋 Mon planning" active={myOnly} onClick={()=>setMyOnly(true)} accent />}
        </div>
      )}

      {/* ── TOGGLE SEMAINE / MOIS ── */}
      <div style={{padding:"4px 16px 8px",display:"flex",gap:8}}>
        <ToggleBtn label="📅 Semaine" active={viewMode==='week'}  onClick={()=>setViewMode('week')} />
        <ToggleBtn label="📋 Mois en un coup d'œil" active={viewMode==='month'} onClick={()=>setViewMode('month')} accent />
      </div>

      {/* ── GRILLE PLANNING ── */}
      {viewMode==='month' && (
        <MonthView
          emps={emps}
          weeks={weeks}
          plan={plan}
          contracts={contracts}
          curMonth={curMonth}
          user={user}
          myOnly={myOnly}
          empNames={empNames}
          empEmails={empEmails}
        />
      )}
      {viewMode==='week' && week && (
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
                {user.role==="rh" && (
                  <th style={{...TH,textAlign:"center",borderLeft:"2px solid #E5E7EB",background:"#F0FDF4",minWidth:55}}>
                    <div style={{fontWeight:700,color:"#065F46",fontSize:10}}>Total</div>
                    <div style={{color:"#6EE7B7",fontSize:9,fontWeight:400}}>semaine</div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {empsToShow.map(emp => {
                const cells   = (weekPlan[emp] || Array(7).fill(null)).map(c => c || null);
                const isMe    = user.emp===emp;
                const mHours  = monthHours?.[emp] ?? 0;
                return (
                  <tr key={emp} style={{background:isMe?C[emp].bg+"44":"white",borderBottom:"1px solid #F3F4F6"}}>
                    <td style={{padding:"8px 6px 8px 16px",verticalAlign:"middle",position:"sticky",left:0,width:isDesktop?110:70,background:isMe?C[emp].bg+"77":"white",zIndex:1,borderRight:"2px solid "+C[emp].border}}>
                      <div style={{fontWeight:700,fontSize:isDesktop?13:11,color:C[emp].text,whiteSpace:"nowrap"}}>
                        <span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:C[emp].dot,marginRight:5}}/>
                        {N(emp)}
                      </div>
                      <div style={{fontSize:10,color:"#9CA3AF",marginTop:2}}>{fmtH(mHours)}<span style={{opacity:0.6}}>/mois</span></div>
                    </td>
                    {cells.map((cell,di) => {
                      const inM  = week.days[di].inMonth;
                      const isRH = user.role==="rh";
                      return (
                        <td key={di} style={{padding:"4px 2px",textAlign:"center",verticalAlign:"middle",opacity:inM?1:0.4}}
                            onClick={()=> isRH && inM && setPanel({weekId:week.id, emp, day:di})}>
                          {cell ? (
                            <div style={{
                background:cell.a==="CP"?"#DCFCE7":C[emp].bg,
                border:"1px solid "+(cell.a==="CP"?"#86EFAC":C[emp].border),
                borderRadius:7,padding:isDesktop?"8px 6px":"5px 3px",
                cursor:isRH&&inM?"pointer":"default",transition:"transform 0.1s"}}
                                 onMouseEnter={e=>isRH&&inM&&(e.currentTarget.style.transform="scale(1.05)")}
                                 onMouseLeave={e=>(e.currentTarget.style.transform="scale(1)")}>
                              <div style={{fontSize:isDesktop?12:10,fontWeight:700,color:cell.a==="CP"?"#065F46":C[emp].text,lineHeight:1.3}}>{cell.a==="CP"?"🌴 CP":cell.a}</div>
                              {cell.b && <div style={{fontSize:10,fontWeight:700,color:C[emp].text,lineHeight:1.3,marginTop:2}}>{cell.b}</div>}
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
                  {user.role==="rh" && (
                      <td style={{padding:"4px 3px",textAlign:"center",verticalAlign:"middle",borderLeft:"2px solid #E5E7EB",background:"#F0FDF4"}}>
                        {(() => {
                          const weekMin = cells.reduce((acc,cell) => acc + cellMin(cell), 0);
                          return weekMin > 0
                            ? <span style={{fontSize:11,fontWeight:800,color:"#065F46",background:"#D1FAE5",borderRadius:5,padding:"3px 6px"}}>{fmtH(weekMin)}</span>
                            : <span style={{fontSize:10,color:"#D1D5DB"}}>—</span>;
                        })()}
                      </td>
                  )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── LÉGENDE COULEURS ── */}
      <div style={{padding:"8px 16px 4px",display:"flex",flexWrap:"wrap",gap:6}}>
        {emps.map(e=>(
          <span key={e} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:C[e].text,background:C[e].bg,borderRadius:20,padding:"3px 8px"}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:C[e].dot,display:"inline-block"}}/>
            {N(e)}
          </span>
        ))}
      </div>

      {/* ── ACTIONS RH ── */}
      {user.role==="rh" && (
        <div style={{padding:"12px 16px 8px",display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>setPanel("bulk")} style={{...BTN_BASE,background:"#1D4ED8",flex:1,minWidth:100}}>⚡ Saisie groupée</button>
          <button onClick={()=>setPanel("duplicate")} style={{...BTN_BASE,background:"#7C3AED",flex:1,minWidth:100}}>
            📋 Dupliquer
          </button>
          <button onClick={()=>setPanel("hours")} style={{...BTN_BASE,background:"#059669",flex:1,minWidth:100}}>📊 Compteur</button>
          <button onClick={()=>setPanel("publish_select")} style={{...BTN_BASE,background:"#DC2626",flex:"0 0 100%"}}>📢 Publier le planning — {MONTHS[curMonth.month-1]}</button>
        </div>
      )}

      <div style={{padding:"4px 16px 24px",color:"#9CA3AF",fontSize:11}}>
        {user.role==="rh"?"✏️ Tapez un créneau pour l'éditer · Naviguez librement entre les mois":"🔒 Lecture seule — seule la RH peut modifier"}
      </div>

      {/* ── OVERLAYS ── */}

      {panel==="changepwd" && <ChangePwdPanel onClose={()=>setPanel(null)} />}

      {panel==="empnames" && (
        <EmpSettingsPanel
          emps={emps}
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

      {panel==="duplicate" && (
        <DuplicatePanel
          weeks={weeks}
          weekIdx={weekIdx}
          plan={plan}
          emps={emps}
          getWeekPlan={getWeekPlan}
          curMonth={curMonth}
          onDuplicate={async (srcId, dstId, srcPlan, dstPlan) => {
            const next = { ...plan, [dstId]: dstPlan };
            setPlan(next);
            await S.set("rlb-plan", next);
            const notif = { ts:Date.now(), type:"edit",
              msg:`📋 Semaine dupliquée`,
              detail:`Par ${user.name}`, by:user.name };
            pushNotif(notif);
            setPanel(null);
          }}
          onClose={()=>setPanel(null)}
        />
      )}

      {panel==="publish_select" && (
        <PublishSelectPanel
          emps={emps}
          empEmails={empEmails}
          curMonth={curMonth}
          onPublish={async (selectedEmps) => {
            await publish(selectedEmps);
          }}
          onClose={()=>setPanel(null)}
        />
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
          emps={emps}
          monthHours={monthHours}
          contracts={contracts}
          curMonth={curMonth}
          onSave={saveContracts}
          onClose={()=>setPanel(null)}
        />
      )}

      {panel==="bulk" && week && (
        <BulkEditPanel
          emps={emps}
          weeks={weeks}
          weekIdx={weekIdx}
          monthLabel={MONTHS[curMonth.month-1]}
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

function ToggleBtn({label,active,onClick,accent,accent2}) {
  return (
    <button onClick={onClick} style={{flex:1,padding:"7px 0",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
      background:active?(accent2?"#059669":accent?"#111827":"#E5E7EB"):"#F3F4F6",
      color:active?(accent2||accent?"white":"#111827"):"#9CA3AF",transition:"all 0.15s"}}>
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
        overscrollBehavior:"contain",
        WebkitOverflowScrolling:"touch",
        boxSizing:"border-box",
        boxShadow:isDesktop?"0 20px 60px rgba(0,0,0,0.3)":"none",
      }}>
        {/* En-tête : barre + bouton ✕ */}
        <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
          {!isDesktop && (
            <div style={{flex:1,display:"flex",justifyContent:"center"}}>
              <div style={{width:36,height:4,background:"#E5E7EB",borderRadius:2}}/>
            </div>
          )}
          <button onClick={onClose} style={{
            background:"#F3F4F6", border:"none", borderRadius:"50%",
            width:30, height:30, cursor:"pointer", fontSize:14, color:"#6B7280",
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── COMPTEUR D'HEURES ───────────────────────────────────────────────────────

function HoursPanel({emps: empsProp, monthHours, contracts, curMonth, onSave, onClose}) {
  const EMPS_HP = empsProp || DEFAULT_EMPS;
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

      {EMPS_HP.map(emp => {
        const workedMin   = monthHours[emp]||0;
        const contractMin = contractMonthMin(local[emp]||35);
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
                  <span style={{fontSize:12,color:"#6B7280"}}>{local[emp]||35}h/sem<br/><span style={{fontWeight:600,color:"#374151"}}>{fmtHDec(contractMin)}</span></span>
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
          💡 Les heures contractuelles sont calculées selon la formule légale française : heures hebdo × 52 / 12.
          Modifiez les heures hebdo via "Modifier contrats".
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
          <button onClick={()=>{onChange(null);setCustom("");}} style={{
            padding:"6px 9px",borderRadius:7,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
            background:!value?"#111827":"#F3F4F6",
            color:!value?"white":"#374151",
            transition:"all 0.1s",
          }}>
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
  const isCp    = current?.a === "CP";
  const [repos,  setRepos]  = useState(!current && !isCp);
  const [cp,     setCp]     = useState(isCp);
  const [shiftA, setShiftA] = useState(current?.a||null);
  const [shiftB, setShiftB] = useState(current?.b||null);
  const canSave = repos || cp || !!shiftA || !!shiftB;

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
        <ToggleBtn label="🛌 Repos"   active={repos&&!cp}  onClick={()=>{setRepos(true);setCp(false);}} />
        <ToggleBtn label="🌴 CP"      active={cp}          onClick={()=>{setRepos(false);setCp(true);setShiftA("CP");setShiftB(null);}} accent2 />
        <ToggleBtn label="💼 Travail" active={!repos&&!cp} onClick={()=>{setRepos(false);setCp(false);if(shiftA==="CP")setShiftA(null);}} accent />
      </div>
      {cp && <div style={{background:"#DCFCE7",border:"1px solid #86EFAC",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#065F46",fontWeight:600}}>🌴 Congés payés — journée complète</div>}
      {!repos&&!cp&&<><ShiftPicker label="Créneau matin" emoji="🌅" value={shiftA} onChange={setShiftA} presets={PRESETS_A}/><ShiftPicker label="Créneau soir (optionnel)" emoji="🌆" value={shiftB} onChange={setShiftB} presets={PRESETS_B}/></>}
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={onClose} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>Annuler</button>
        <button disabled={!canSave} onClick={()=>repos?onSave(null):cp?onSave({a:'CP',b:null}):onSave({a:shiftA||shiftB,b:shiftA?(shiftB&&shiftB.trim())||null:null})} style={{flex:2,padding:"12px 0",border:"none",borderRadius:8,background:canSave?"#111827":"#E5E7EB",color:canSave?"white":"#9CA3AF",fontSize:14,fontWeight:700,cursor:canSave?"pointer":"not-allowed"}}>Enregistrer</button>
      </div>
    </Overlay>
  );
}

// ─── PANEL SAISIE GROUPÉE ────────────────────────────────────────────────────

function BulkEditPanel({emps: empsProp, weeks, weekIdx, monthLabel, onSave, onClose}) {
  const EMPS_LOCAL = empsProp || DEFAULT_EMPS;
  const week     = weeks[weekIdx];
  const [selEmps,  setSelEmps]  = useState([]);
  const [selDays,  setSelDays]  = useState([]);
  const [scope,    setScope]    = useState("week"); // "week" | "month"
  const [repos,    setRepos]    = useState(false);
  const [shiftA,   setShiftA]   = useState(null);
  const [shiftB,   setShiftB]   = useState(null);
  const [step,     setStep]     = useState(1);

  const toggleEmp = e => setSelEmps(s=>s.includes(e)?s.filter(x=>x!==e):[...s,e]);
  const toggleDay = d => setSelDays(s=>s.includes(d)?s.filter(x=>x!==d):[...s,d]);
  const allEmps   = selEmps.length===EMPS_LOCAL.length;
  // Jours disponibles dans la semaine courante (pour l'aperçu)
  const inMonthIdxs = week.days.map((d,i)=>d.inMonth?i:-1).filter(i=>i>=0);

  const STEP_LABELS = ["","Qui travaille ?","Périmètre & Jours","Quel horaire ?"];

  return (
    <Overlay onClose={onClose}>
      <div style={{marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:16,color:"#111827"}}>⚡ Saisie groupée</div>
        <div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{week.label}</div>
        <div style={{display:"flex",gap:4,marginTop:10}}>
          {[1,2,3].map(s=><div key={s} style={{flex:1,height:3,borderRadius:2,background:step>=s?"#1D4ED8":"#E5E7EB",transition:"background 0.2s"}}/>)}
        </div>
        <div style={{fontWeight:600,fontSize:13,color:"#374151",marginTop:10}}>{STEP_LABELS[step]}</div>
      </div>

      {/* ÉTAPE 1 — Employés */}
      {step===1&&(
        <div>
          <button onClick={()=>setSelEmps(allEmps?[]:[...EMPS_LOCAL])} style={{display:"block",width:"100%",marginBottom:10,padding:"8px 0",border:"1px dashed #D1D5DB",borderRadius:8,background:"#F9FAFB",fontSize:12,fontWeight:600,color:"#374151",cursor:"pointer"}}>
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

      {/* ÉTAPE 2 — Périmètre + Jours */}
      {step===2&&(
        <div>
          {/* Scope semaine / mois */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:8}}>Appliquer sur :</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <button onClick={()=>setScope("week")} style={{
                padding:"12px 8px",borderRadius:8,border:"none",cursor:"pointer",
                background:scope==="week"?"#111827":"#F3F4F6",
                color:scope==="week"?"white":"#374151",
                fontSize:12,fontWeight:700,transition:"all 0.15s",
              }}>
                📅 Cette semaine<br/>
                <span style={{fontSize:10,opacity:0.7}}>{week.label}</span>
              </button>
              <button onClick={()=>setScope("month")} style={{
                padding:"12px 8px",borderRadius:8,border:"none",cursor:"pointer",
                background:scope==="month"?"#1D4ED8":"#F3F4F6",
                color:scope==="month"?"white":"#374151",
                fontSize:12,fontWeight:700,transition:"all 0.15s",
              }}>
                📆 Tout le mois<br/>
                <span style={{fontSize:10,opacity:0.7}}>{monthLabel}</span>
              </button>
            </div>
          </div>

          {/* Sélection jours de la semaine */}
          <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:8}}>Quels jours :</div>
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            {[
              {label:"Lun – Ven", days:[0,1,2,3,4]},
              {label:"Week-end",  days:[5,6]},
              {label:"Tous",      days:[0,1,2,3,4,5,6]},
            ].map(r=>(
              <button key={r.label} onClick={()=>setSelDays(r.days)} style={{padding:"6px 12px",borderRadius:20,border:"1px solid #E5E7EB",background:"white",fontSize:12,color:"#374151",cursor:"pointer",fontWeight:500}}>
                {r.label}
              </button>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:12}}>
            {DAYS.map((d,i)=>{
              const on=selDays.includes(i);
              return (
                <button key={d} onClick={()=>toggleDay(i)} style={{padding:"10px 4px",borderRadius:8,border:"none",cursor:"pointer",background:on?"#111827":"#F3F4F6",color:on?"white":"#374151",fontSize:12,fontWeight:700,transition:"all 0.12s"}}>
                  {d}
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

      {/* ÉTAPE 3 — Horaire */}
      {step===3&&(
        <div>
          <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,padding:"9px 12px",marginBottom:14,fontSize:12}}>
            <span style={{fontWeight:700,color:"#1E40AF"}}>{selEmps.map(e=>N(e)).join(", ")}</span>
            <span style={{color:"#6B7280",marginLeft:6}}>· {selDays.map(d=>DAYS[d]).join(", ")}</span>
            <span style={{color:"#6B7280",marginLeft:6}}>· {scope==="month"?`tout ${monthLabel}`:week.label}</span>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <ToggleBtn label="🛌 Repos"   active={repos}  onClick={()=>setRepos(true)} />
            <ToggleBtn label="💼 Travail" active={!repos} onClick={()=>setRepos(false)} accent />
          </div>
          {!repos&&<><ShiftPicker label="Créneau matin" emoji="🌅" value={shiftA} onChange={setShiftA} presets={PRESETS_A}/><ShiftPicker label="Créneau soir (optionnel)" emoji="🌆" value={shiftB} onChange={setShiftB} presets={PRESETS_B}/></>}
          {(repos||shiftA)&&(
            <div style={{background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12}}>
              ✅ Application sur <strong>{scope==="month"?`tout ${monthLabel}`:"cette semaine"}</strong> — {selDays.map(d=>DAYS[d]).join(", ")}
            </div>
          )}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setStep(2)} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>← Retour</button>
            <button disabled={!(repos||shiftA)} onClick={()=>onSave(selEmps, selDays, repos?null:{a:shiftA,b:shiftB||null}, scope)} style={{flex:2,padding:"12px 0",border:"none",borderRadius:10,background:(repos||shiftA)?"#111827":"#E5E7EB",color:(repos||shiftA)?"white":"#9CA3AF",fontSize:14,fontWeight:700,cursor:(repos||shiftA)?"pointer":"not-allowed"}}>
              Appliquer
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


// ─── PANEL DUPLICATION INTER-MOIS ────────────────────────────────────────────

function DuplicatePanel({weeks, weekIdx, plan, emps, getWeekPlan, curMonth, onDuplicate, onClose}) {
  const nowY = curMonth.year;
  const nowM = curMonth.month;

  const [srcMonth, setSrcMonth] = useState({ year:nowY, month:nowM });
  const [dstMonth, setDstMonth] = useState({ year:nowY, month:nowM });
  const [srcWkIdx, setSrcWkIdx] = useState(weekIdx);
  const [dstWkIdx, setDstWkIdx] = useState(Math.min(weekIdx+1, weeks.length-1));
  const [done,     setDone]     = useState(false);

  const srcWeeks = useMemo(()=>getWeeksForMonth(srcMonth.year, srcMonth.month),[srcMonth]);
  const dstWeeks = useMemo(()=>getWeeksForMonth(dstMonth.year, dstMonth.month),[dstMonth]);

  // Limiter srcWkIdx/dstWkIdx si le mois change
  const safeIdx = (idx, arr) => Math.min(idx, arr.length-1);
  const srcIdx  = safeIdx(srcWkIdx, srcWeeks);
  const dstIdx  = safeIdx(dstWkIdx, dstWeeks);
  const srcWeek = srcWeeks[srcIdx];
  const dstWeek = dstWeeks[dstIdx];
  const same    = srcWeek?.id === dstWeek?.id;

  const goMonth = (which, delta, cur, set) => {
    let m = cur.month + delta, y = cur.year;
    if (m > 12) { m=1; y++; } if (m < 1) { m=12; y--; }
    set({ year:y, month:m });
  };

  const handleDo = async () => {
    if (same || !srcWeek || !dstWeek) return;
    const srcPlan = plan[srcWeek.id] || Object.fromEntries(emps.map(e=>[e,Array(7).fill(null)]));
    const dstPlan = {};
    emps.forEach(emp => {
      dstPlan[emp] = (srcPlan[emp]||Array(7).fill(null)).map((cell,di) =>
        dstWeek.days[di]?.inMonth ? cell : null
      );
    });
    await onDuplicate(srcWeek.id, dstWeek.id, srcPlan, dstPlan);
    setDone(true);
  };

  const MonthNav = ({cur, onChange, label}) => (
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
      <button onClick={()=>onChange(-1)} style={{background:"none",border:"1px solid #E5E7EB",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:14}}>‹</button>
      <div style={{flex:1,textAlign:"center",fontWeight:700,fontSize:13,color:"#111827"}}>{MONTHS[cur.month-1]} {cur.year}</div>
      <button onClick={()=>onChange(1)}  style={{background:"none",border:"1px solid #E5E7EB",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:14}}>›</button>
    </div>
  );

  const WkBtn = (w, i, activeIdx, setIdx) => (
    <button key={i} onClick={()=>setIdx(i)} style={{
      flex:1, padding:"8px 4px", borderRadius:8, border:"none", cursor:"pointer",
      fontSize:11, fontWeight:600, textAlign:"center",
      background: i===activeIdx ? "#111827" : "#F3F4F6",
      color: i===activeIdx ? "white" : "#374151",
      transition:"all 0.15s",
    }}>
      Sem.{i+1}<br/>
      <span style={{fontSize:9,opacity:0.7}}>{w.label.split("–")[0].trim()}</span>
    </button>
  );

  if (done) return (
    <Overlay onClose={onClose}>
      <div style={{textAlign:"center",padding:"8px 0 16px"}}>
        <div style={{fontSize:40,marginBottom:12}}>✅</div>
        <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Planning dupliqué !</div>
        <div style={{color:"#6B7280",fontSize:13,marginBottom:20}}>{srcWeek?.label} → {dstWeek?.label}</div>
        <button onClick={onClose} style={{padding:"12px 32px",border:"none",borderRadius:8,background:"#111827",color:"white",fontSize:14,fontWeight:600,cursor:"pointer"}}>Fermer</button>
      </div>
    </Overlay>
  );

  return (
    <Overlay onClose={onClose}>
      <div style={{fontWeight:700,fontSize:16,color:"#111827",marginBottom:16}}>📋 Dupliquer une semaine</div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        {/* SOURCE */}
        <div style={{background:"#F0FDF4",borderRadius:10,padding:"10px"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#065F46",marginBottom:8}}>📤 Source</div>
          <MonthNav cur={srcMonth} onChange={d=>goMonth("src",d,srcMonth,setSrcMonth)} />
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {srcWeeks.map((w,i)=>WkBtn(w,i,srcIdx,setSrcWkIdx))}
          </div>
          {srcWeek && <div style={{marginTop:6,fontSize:10,color:"#065F46",textAlign:"center"}}>{srcWeek.label}</div>}
        </div>

        {/* DESTINATION */}
        <div style={{background:"#FEF3C7",borderRadius:10,padding:"10px"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#92400E",marginBottom:8}}>📥 Destination</div>
          <MonthNav cur={dstMonth} onChange={d=>goMonth("dst",d,dstMonth,setDstMonth)} />
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {dstWeeks.map((w,i)=>WkBtn(w,i,dstIdx,setDstWkIdx))}
          </div>
          {dstWeek && <div style={{marginTop:6,fontSize:10,color:"#92400E",textAlign:"center"}}>{dstWeek.label}</div>}
        </div>
      </div>

      {/* Résumé */}
      {srcWeek && dstWeek && !same && (
        <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,textAlign:"center"}}>
          <strong style={{color:"#1E40AF"}}>{srcWeek.label}</strong>
          <span style={{color:"#6B7280",margin:"0 10px"}}>→</span>
          <strong style={{color:"#1E40AF"}}>{dstWeek.label}</strong>
          <div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>⚠️ La semaine destination sera remplacée</div>
        </div>
      )}
      {same && <div style={{background:"#FEF3C7",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#92400E",textAlign:"center"}}>⚠️ Choisissez deux semaines différentes</div>}

      <div style={{display:"flex",gap:8}}>
        <button onClick={onClose} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>Annuler</button>
        <button disabled={same||!srcWeek||!dstWeek} onClick={handleDo} style={{flex:2,padding:"12px 0",border:"none",borderRadius:8,background:(!same&&srcWeek&&dstWeek)?"#7C3AED":"#E5E7EB",color:(!same&&srcWeek&&dstWeek)?"white":"#9CA3AF",fontSize:14,fontWeight:700,cursor:(!same&&srcWeek&&dstWeek)?"pointer":"not-allowed"}}>
          Dupliquer →
        </button>
      </div>
    </Overlay>
  );
}


function EmpSettingsPanel({emps, empNames, empEmails, onSave, onClose}) {
  const [localEmps,   setLocalEmps]   = useState([...emps]);
  const [names,       setNames]       = useState({ ...empNames });
  const [emails,      setEmails]      = useState({ ...empEmails });
  const [newEmpName,  setNewEmpName]  = useState("");
  const [showAdd,     setShowAdd]     = useState(false);

  const setN = (emp, v) => setNames(p  => ({ ...p, [emp]: v }));
  const setE = (emp, v) => setEmails(p => ({ ...p, [emp]: v }));

  const addEmp = () => {
    if (!newEmpName.trim()) return;
    const id = newEmpName.trim().toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12) + "_" + Date.now().toString().slice(-4);
    setLocalEmps(p => [...p, id]);
    setN(id, newEmpName.trim());
    setE(id, "");
    setNewEmpName("");
    setShowAdd(false);
  };

  const [confirmDel, setConfirmDel] = useState(null);
  const removeEmp = (emp) => setConfirmDel(emp);
  const confirmRemove = () => { if(confirmDel) setLocalEmps(p=>p.filter(e=>e!==confirmDel)); setConfirmDel(null); };

  const inpStyle = (accent) => ({
    width:"100%", padding:"8px 10px", borderRadius:8,
    border:"1px solid "+(accent||"#E5E7EB"),
    fontSize:13, outline:"none", fontFamily:"inherit", boxSizing:"border-box",
  });

  return (
    <Overlay onClose={onClose}>
      <div style={{marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:16,color:"#111827"}}>👥 Gestion de l'équipe</div>
        <div style={{fontSize:12,color:"#9CA3AF",marginTop:3}}>Ajouter, modifier ou supprimer des employés</div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
        {localEmps.map(emp => {
          const color = C[emp];
          return (
            <div key={emp} style={{background:color.bg+"55",borderRadius:10,padding:"10px 14px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{width:9,height:9,borderRadius:"50%",background:color.dot,flexShrink:0}}/>
                <span style={{fontSize:10,fontWeight:700,color:color.text,textTransform:"uppercase",letterSpacing:"0.5px",flex:1}}>
                  {emp}
                </span>
                {confirmDel===emp
                  ? <div style={{display:"flex",gap:4,alignItems:"center"}}>
                      <span style={{fontSize:11,color:"#EF4444",fontWeight:600}}>Supprimer ?</span>
                      <button onClick={confirmRemove} style={{background:"#EF4444",border:"none",borderRadius:5,padding:"2px 8px",fontSize:11,color:"white",cursor:"pointer",fontWeight:700}}>Oui</button>
                      <button onClick={()=>setConfirmDel(null)} style={{background:"#F3F4F6",border:"none",borderRadius:5,padding:"2px 8px",fontSize:11,color:"#374151",cursor:"pointer"}}>Non</button>
                    </div>
                  : <button onClick={()=>removeEmp(emp)} style={{background:"#FEE2E2",border:"none",borderRadius:6,padding:"2px 8px",fontSize:11,color:"#EF4444",cursor:"pointer",fontWeight:600}}>🗑️ Supprimer</button>
                }
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <div>
                  <div style={{fontSize:11,color:"#6B7280",marginBottom:3,fontWeight:500}}>✏️ Nom affiché</div>
                  <input value={names[emp]||""} onChange={e=>setN(emp,e.target.value)}
                    placeholder={emp[0]+emp.slice(1).toLowerCase()}
                    style={{...inpStyle(color.border), fontWeight:600, color:color.text}}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:"#6B7280",marginBottom:3,fontWeight:500}}>📧 Email notification</div>
                  <input type="email" value={emails[emp]||""} onChange={e=>setE(emp,e.target.value)}
                    placeholder="prenom@email.com" style={inpStyle()}/>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ajouter un employé */}
      {showAdd ? (
        <div style={{background:"#F0F9FF",border:"1px solid #BAE6FD",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:"#0369A1",marginBottom:8}}>➕ Nouvel employé</div>
          <input
            value={newEmpName}
            onChange={e=>setNewEmpName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addEmp()}
            placeholder="Prénom du salarié…"
            autoFocus
            style={{...inpStyle("#BAE6FD"), marginBottom:8}}
          />
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{setShowAdd(false);setNewEmpName("");}} style={{flex:1,padding:"8px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:12,fontWeight:600,cursor:"pointer"}}>Annuler</button>
            <button onClick={addEmp} disabled={!newEmpName.trim()} style={{flex:2,padding:"8px 0",border:"none",borderRadius:8,background:newEmpName.trim()?"#1D4ED8":"#E5E7EB",color:newEmpName.trim()?"white":"#9CA3AF",fontSize:12,fontWeight:700,cursor:newEmpName.trim()?"pointer":"not-allowed"}}>Ajouter</button>
          </div>
        </div>
      ) : (
        <button onClick={()=>setShowAdd(true)} style={{width:"100%",marginBottom:14,padding:"10px 0",border:"2px dashed #D1D5DB",borderRadius:10,background:"#F9FAFB",color:"#374151",fontSize:13,fontWeight:600,cursor:"pointer"}}>
          ➕ Ajouter un employé
        </button>
      )}

      <div style={{display:"flex",gap:8}}>
        <button onClick={onClose} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>
          Annuler
        </button>
        <button onClick={()=>onSave(names, emails, localEmps)} style={{flex:2,padding:"12px 0",border:"none",borderRadius:8,background:"#111827",color:"white",fontSize:14,fontWeight:700,cursor:"pointer"}}>
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

// ─── VUE CALENDRIER MENSUEL ──────────────────────────────────────────────────

function MonthView({ emps: empsProp, weeks, plan, contracts, curMonth, user, myOnly }) {
  const EMPS_MV = empsProp || DEFAULT_EMPS;
  const empsToShow = myOnly && user.emp ? [user.emp] : EMPS_MV;
  const isRH = user.role === "rh";

  // Total heures par employé (RH uniquement)
  const totals = {};
  if (isRH) {
    empsToShow.forEach(emp => {
      totals[emp] = weeks.reduce((acc, week) => {
        return acc + week.days.reduce((a2, d, i) => {
          try { return d.inMonth ? a2 + (cellMin(plan[week.id]?.[emp]?.[i])||0) : a2; } catch { return a2; }
        }, 0);
      }, 0);
    });
  }

  // Total personnel calculé directement depuis weeks
  const myTotal = user.emp ? weeks.reduce((acc, week) =>
    acc + week.days.reduce((a2, d, i) =>
      d.inMonth ? a2 + (cellMin(plan[week.id]?.[user.emp]?.[i])||0) : a2
    , 0)
  , 0) : 0;

  return (
    <div style={{padding:"8px 12px 24px"}}>

      {/* ── Bandeau total personnel (employé en vue équipe) ── */}
      {user.emp && !myOnly && myTotal > 0 && (
        <div style={{
          background:C[user.emp].bg, border:"1px solid "+C[user.emp].border,
          borderRadius:10, padding:"10px 16px", marginBottom:12,
          display:"flex", alignItems:"center", justifyContent:"space-between",
        }}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{width:9,height:9,borderRadius:"50%",background:C[user.emp].dot}}/>
            <span style={{fontSize:13,fontWeight:700,color:C[user.emp].text}}>Mon total — {MONTHS[curMonth.month-1]}</span>
          </div>
          <span style={{fontSize:16,fontWeight:800,color:"#111827"}}>{fmtH(myTotal)}</span>
        </div>
      )}

      {/* ── Grille calendrier ── */}
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",minWidth:320,tableLayout:"fixed"}}>

          {/* Entête jours de la semaine */}
          <thead>
            <tr>
              {DAYS.map((d,i) => (
                <th key={d} style={{
                  padding:"6px 2px", fontSize:11, fontWeight:700,
                  color: i>=5 ? "#EF4444" : "#6B7280",
                  textAlign:"center", borderBottom:"2px solid #E5E7EB",
                  textTransform:"uppercase", letterSpacing:"0.3px",
                }}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>

          {/* Semaines */}
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={week.id} style={{verticalAlign:"top"}}>
                {week.days.map((d, di) => {
                  const inMonth = d.inMonth;
                  const isWE    = di >= 5;
                  const cellBg  = !inMonth ? "#FAFAFA" : isWE ? "#FFF5F5" : "white";

                  return (
                    <td key={di} style={{
                      border:"1px solid #F0F0F0",
                      background: cellBg,
                      padding:"4px 3px",
                      minHeight:70,
                      verticalAlign:"top",
                      opacity: inMonth ? 1 : 0.3,
                    }}>
                      {/* Numéro du jour */}
                      <div style={{
                        fontSize:11, fontWeight:700,
                        color: isWE ? "#EF4444" : "#374151",
                        marginBottom:3, textAlign:"right", paddingRight:2,
                      }}>
                        {String(d.day).padStart(2,"0")}
                      </div>

                      {/* Créneaux par employé */}
                      {inMonth && empsToShow.map(emp => {
                        const cell = plan[week.id]?.[emp]?.[di];
                        if (!cell) return null;
                        return (
                          <div key={emp} style={{
                            background:C[emp].bg,
                            border:"1px solid "+C[emp].border,
                            borderRadius:4, padding:"2px 4px",
                            marginBottom:2,
                          }}>
                            {empsToShow.length > 1 && (
                              <div style={{display:"flex",alignItems:"center",gap:3,marginBottom:1}}>
                                <span style={{width:5,height:5,borderRadius:"50%",background:C[emp].dot,flexShrink:0}}/>
                                <span style={{fontSize:8,fontWeight:700,color:C[emp].text}}>{N(emp)}</span>
                              </div>
                            )}
                            <div style={{fontSize:9,fontWeight:700,color:C[emp].text,lineHeight:1.3}}>{cell.a}</div>
                            {cell.b && <div style={{fontSize:10,fontWeight:700,color:C[emp].text,lineHeight:1.3,marginTop:2}}>{cell.b}</div>}
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Totaux heures — RH uniquement ── */}
      {isRH && (
        <div style={{marginTop:16,background:"white",borderRadius:10,border:"1px solid #E5E7EB",overflow:"hidden"}}>
          <div style={{padding:"10px 14px",background:"#F9FAFB",borderBottom:"1px solid #E5E7EB",fontSize:12,fontWeight:700,color:"#374151"}}>
            📊 Récap heures — {MONTHS[curMonth.month-1]} {curMonth.year}
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:0}}>
            {empsToShow.map((emp,i) => {
              const contractMin = contractMonthMin(contracts[emp]||35);
              const diff  = totals[emp] - contractMin;
              const color = diff < -60 ? "#EF4444" : diff > 60 ? "#F59E0B" : "#10B981";
              return (
                <div key={emp} style={{
                  flex:"1 1 120px", padding:"12px 14px",
                  borderRight: i < empsToShow.length-1 ? "1px solid #F0F0F0" : "none",
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:C[emp].dot}}/>
                    <span style={{fontSize:12,fontWeight:700,color:C[emp].text}}>{N(emp)}</span>
                  </div>
                  <div style={{fontSize:16,fontWeight:800,color:"#111827"}}>{fmtH(totals[emp])}</div>
                  <div style={{fontSize:11,color:"#6B7280"}}>/{fmtHDec(contractMin)}</div>
                  <div style={{fontSize:11,fontWeight:700,color,marginTop:4}}>
                    {diff===0?"✅ OK":diff>0?`+${fmtH(diff)}`:`-${fmtH(Math.abs(diff))}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── PANEL PUBLICATION SÉLECTIVE ─────────────────────────────────────────────

function PublishSelectPanel({emps, empEmails, curMonth, onPublish, onClose}) {
  const [selected, setSelected] = useState(
    emps.filter(e => empEmails[e]) // pré-sélectionner ceux avec email
  );
  const [sending, setSending] = useState(false);

  const toggleEmp = e => setSelected(s => s.includes(e) ? s.filter(x=>x!==e) : [...s,e]);
  const allSel    = selected.length === emps.length;
  const monthLabel = `${MONTHS[curMonth.month-1]} ${curMonth.year}`;

  const handlePublish = async () => {
    setSending(true);
    await onPublish(selected);
    setSending(false);
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{fontWeight:700,fontSize:16,color:"#111827",marginBottom:4}}>📢 Publier le planning</div>
      <div style={{fontSize:12,color:"#9CA3AF",marginBottom:16}}>{monthLabel} — Choisir les destinataires</div>

      <button onClick={()=>setSelected(allSel?[]:emps.filter(e=>empEmails[e]))} style={{
        display:"block",width:"100%",marginBottom:10,padding:"8px 0",
        border:"1px dashed #D1D5DB",borderRadius:8,background:"#F9FAFB",
        fontSize:12,fontWeight:600,color:"#374151",cursor:"pointer",
      }}>
        {allSel ? "✕ Tout désélectionner" : "✓ Tous avec email"}
      </button>

      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
        {emps.map(emp => {
          const hasEmail = !!empEmails[emp];
          const isSel    = selected.includes(emp);
          return (
            <button key={emp} onClick={()=>hasEmail&&toggleEmp(emp)} style={{
              display:"flex",alignItems:"center",gap:12,
              padding:"10px 14px",borderRadius:10,border:"none",cursor:hasEmail?"pointer":"not-allowed",
              background:isSel?C[emp].bg:"#F9FAFB",
              outline:isSel?`2px solid ${C[emp].dot}`:"2px solid transparent",
              opacity:hasEmail?1:0.45,transition:"all 0.15s",
            }}>
              <span style={{width:9,height:9,borderRadius:"50%",background:C[emp].dot,flexShrink:0}}/>
              <span style={{fontWeight:700,fontSize:13,color:isSel?C[emp].text:"#374151",flex:1,textAlign:"left"}}>{N(emp)}</span>
              {hasEmail
                ? <span style={{fontSize:11,color:"#6B7280"}}>{empEmails[emp]}</span>
                : <span style={{fontSize:11,color:"#EF4444"}}>⚠️ Pas d'email</span>
              }
              {isSel && <span style={{fontSize:14}}>✓</span>}
            </button>
          );
        })}
      </div>

      <div style={{background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#065F46"}}>
        📧 {selected.length} email(s) seront envoyés · 🔔 Toute l'équipe recevra la notification in-app
      </div>

      <div style={{display:"flex",gap:8}}>
        <button onClick={onClose} style={{flex:1,padding:"12px 0",border:"1px solid #E5E7EB",borderRadius:8,background:"white",color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer"}}>
          Annuler
        </button>
        <button onClick={handlePublish} disabled={sending} style={{flex:2,padding:"12px 0",border:"none",borderRadius:8,background:sending?"#E5E7EB":"#DC2626",color:"white",fontSize:14,fontWeight:700,cursor:sending?"not-allowed":"pointer"}}>
          {sending ? "Envoi en cours…" : "📢 Publier"}
        </button>
      </div>
    </Overlay>
  );
}


// ─── PAGE PORTAIL ─────────────────────────────────────────────────────────────

function Portal({onEnterPlanning}) {
  const isDesktop = useIsDesktop();
  const [hoverLeft,  setHoverLeft]  = useState(false);
  const [hoverRight, setHoverRight] = useState(false);

  return (
    <div style={{
      minHeight:"100vh", display:"flex",
      flexDirection: isDesktop ? "row" : "column",
      fontFamily:"system-ui,-apple-system,sans-serif",
      overflow:"hidden",
    }}>

      {/* ── CÔTÉ GAUCHE : MAINTENANCE ── */}
      <a href="https://beylev-vercel.vercel.app/" target="_blank" rel="noopener noreferrer"
        onMouseEnter={()=>setHoverLeft(true)}
        onMouseLeave={()=>setHoverLeft(false)}
        style={{
          flex:1, display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          padding:isDesktop?"48px 40px":"40px 24px",
          background: hoverLeft
            ? "linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)"
            : "linear-gradient(135deg,#0f0f1a 0%,#1a1a2e 100%)",
          textDecoration:"none", cursor:"pointer",
          transition:"all 0.4s ease",
          position:"relative", overflow:"hidden",
          minHeight: isDesktop ? "auto" : "50vh",
        }}>
        {/* Cercle décoratif */}
        <div style={{
          position:"absolute", width:300, height:300,
          borderRadius:"50%", background:"rgba(99,102,241,0.08)",
          top:-80, left:-80, transition:"all 0.4s",
          transform: hoverLeft ? "scale(1.3)" : "scale(1)",
        }}/>
        <div style={{
          position:"absolute", width:200, height:200,
          borderRadius:"50%", background:"rgba(99,102,241,0.05)",
          bottom:-60, right:-40,
        }}/>

        <div style={{position:"relative", textAlign:"center"}}>
          <div style={{fontSize: isDesktop?80:56, marginBottom:20, filter:"drop-shadow(0 0 20px rgba(99,102,241,0.5))", transition:"transform 0.3s", transform:hoverLeft?"scale(1.1)":"scale(1)"}}>
            🔧
          </div>
          <div style={{
            fontSize: isDesktop?13:11, fontWeight:700, letterSpacing:3,
            color:"#6366F1", textTransform:"uppercase", marginBottom:12,
          }}>
            Beylev
          </div>
          <div style={{
            fontSize: isDesktop?32:24, fontWeight:800, color:"white",
            lineHeight:1.2, marginBottom:16, letterSpacing:"-0.5px",
          }}>
            Maintenance
          </div>
          <div style={{
            fontSize: isDesktop?15:13, color:"#94A3B8", lineHeight:1.6,
            maxWidth:280, marginBottom:32,
          }}>
            Suivi des interventions,<br/>tickets et équipements
          </div>
          <div style={{
            display:"inline-flex", alignItems:"center", gap:10,
            background: hoverLeft ? "#6366F1" : "rgba(99,102,241,0.15)",
            border:"1px solid rgba(99,102,241,0.4)",
            borderRadius:50, padding:"12px 28px",
            color:"white", fontSize:14, fontWeight:700,
            transition:"all 0.3s",
          }}>
            Accéder
            <span style={{fontSize:18, transition:"transform 0.3s", transform:hoverLeft?"translateX(4px)":"translateX(0)"}}>→</span>
          </div>
        </div>
      </a>

      {/* ── SÉPARATEUR ── */}
      {isDesktop && (
        <div style={{width:1, background:"linear-gradient(to bottom, transparent, rgba(255,255,255,0.15), transparent)", flexShrink:0}}/>
      )}

      {/* ── CÔTÉ DROIT : PLANNING ── */}
      <div onClick={onEnterPlanning}
        onMouseEnter={()=>setHoverRight(true)}
        onMouseLeave={()=>setHoverRight(false)}
        style={{
          flex:1, display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          padding:isDesktop?"48px 40px":"40px 24px",
          background: hoverRight
            ? "linear-gradient(135deg,#111827 0%,#1F2937 50%,#374151 100%)"
            : "linear-gradient(135deg,#0a0f1a 0%,#111827 100%)",
          cursor:"pointer", transition:"all 0.4s ease",
          position:"relative", overflow:"hidden",
          minHeight: isDesktop ? "auto" : "50vh",
        }}>
        {/* Cercle décoratif */}
        <div style={{
          position:"absolute", width:300, height:300,
          borderRadius:"50%", background:"rgba(220,38,38,0.07)",
          top:-80, right:-80, transition:"all 0.4s",
          transform: hoverRight ? "scale(1.3)" : "scale(1)",
        }}/>
        <div style={{
          position:"absolute", width:200, height:200,
          borderRadius:"50%", background:"rgba(220,38,38,0.04)",
          bottom:-60, left:-40,
        }}/>

        <div style={{position:"relative", textAlign:"center"}}>
          <div style={{fontSize: isDesktop?80:56, marginBottom:20, filter:"drop-shadow(0 0 20px rgba(220,38,38,0.4))", transition:"transform 0.3s", transform:hoverRight?"scale(1.1)":"scale(1)"}}>
            📅
          </div>
          <div style={{
            fontSize: isDesktop?13:11, fontWeight:700, letterSpacing:3,
            color:"#DC2626", textTransform:"uppercase", marginBottom:12,
          }}>
            Résidence Le Belleville
          </div>
          <div style={{
            fontSize: isDesktop?32:24, fontWeight:800, color:"white",
            lineHeight:1.2, marginBottom:16, letterSpacing:"-0.5px",
          }}>
            Planning<br/>Équipe
          </div>
          <div style={{
            fontSize: isDesktop?15:13, color:"#94A3B8", lineHeight:1.6,
            maxWidth:280, marginBottom:32,
          }}>
            Gestion des horaires,<br/>congés et planning mensuel
          </div>
          <div style={{
            display:"inline-flex", alignItems:"center", gap:10,
            background: hoverRight ? "#DC2626" : "rgba(220,38,38,0.15)",
            border:"1px solid rgba(220,38,38,0.4)",
            borderRadius:50, padding:"12px 28px",
            color:"white", fontSize:14, fontWeight:700,
            transition:"all 0.3s",
          }}>
            Accéder
            <span style={{fontSize:18, transition:"transform 0.3s", transform:hoverRight?"translateX(4px)":"translateX(0)"}}>→</span>
          </div>
        </div>
      </div>

      {/* ── BRANDING BAS ── */}
      <div style={{
        position:"absolute", bottom:20, left:0, right:0,
        textAlign:"center", pointerEvents:"none",
      }}>
        <span style={{fontSize:11, color:"rgba(255,255,255,0.2)", letterSpacing:2, textTransform:"uppercase"}}>
          Beylev Group
        </span>
      </div>
    </div>
  );
}


function Login({preEmps, preNames, onLogin}) {
  const [pending, setPending] = useState(null);
  const [pwd,     setPwd]     = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  // Construire la liste dynamique depuis les employés
  const empEmojis = ["👨‍💼","🧑","👦","🧔","👩","👨","🧒","👴","🧑‍💼","👷"];
  const dynamicUsers = [
    { id:"laetitia", name:"Laetitia", role:"rh", emoji:"👩‍💼" },
    ...(preEmps||DEFAULT_EMPS).map((emp,i) => ({
      id: emp.toLowerCase().replace(/[^a-z0-9]/g,""),
      name: (preNames||DEFAULT_EMP_NAMES)[emp] || emp[0]+emp.slice(1).toLowerCase(),
      role:"employee", emoji: empEmojis[i%empEmojis.length], emp,
    })),
  ];

  const handleSelect = (u) => {
    if (u.role === "rh") { setPending(u); setPwd(""); setError(""); setTimeout(()=>inputRef.current?.focus(),100); }
    else onLogin(u);
  };

  const handleLogin = async () => {
    if (!pwd) return;
    setLoading(true); setError("");
    const hash = await hashPwd(pwd);
    const storedHash = localStorage.getItem("rlb-rh-hash") || DEFAULT_RH_HASH;
    if (hash === storedHash) { onLogin(pending); }
    else { setError("Mot de passe incorrect"); setPwd(""); setTimeout(()=>inputRef.current?.focus(),50); }
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
        {dynamicUsers.map(u=>(
          <div key={u.id}>
            <button onClick={()=>handleSelect(u)} style={{
              width:"100%",background:pending?.id===u.id?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.08)",
              border:pending?.id===u.id?"1px solid rgba(255,255,255,0.4)":"1px solid rgba(255,255,255,0.15)",
              borderRadius:pending?.id===u.id?"12px 12px 0 0":12,
              padding:"14px 20px",display:"flex",alignItems:"center",gap:14,
              cursor:"pointer",color:"white",transition:"all 0.15s",textAlign:"left",
            }}>
              <span style={{fontSize:24}}>{u.emoji}</span>
              <div>
                <div style={{fontWeight:700,fontSize:14}}>{u.name}</div>
                <div style={{fontSize:11,color:"#9CA3AF",marginTop:1}}>
                  {u.role==="rh"?"🔑 Accès RH — mot de passe requis":"👁️ Consultation seule"}
                </div>
              </div>
              {u.role==="rh"&&<span style={{marginLeft:"auto",background:"#DC2626",borderRadius:4,fontSize:10,padding:"2px 6px",fontWeight:700}}>RH</span>}
            </button>
            {pending?.id===u.id&&(
              <div style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.3)",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"14px 16px"}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{position:"relative",flex:1}}>
                    <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14}}>🔒</span>
                    <input ref={inputRef} type="password" value={pwd}
                      onChange={e=>{setPwd(e.target.value);setError("");}}
                      onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                      placeholder="Mot de passe RH…"
                      style={{width:"100%",padding:"10px 12px 10px 34px",borderRadius:8,border:error?"1.5px solid #EF4444":"1px solid rgba(255,255,255,0.25)",background:"rgba(255,255,255,0.1)",color:"white",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}
                    />
                  </div>
                  <button onClick={handleLogin} disabled={!pwd||loading} style={{padding:"10px 18px",borderRadius:8,border:"none",cursor:"pointer",background:pwd&&!loading?"#DC2626":"rgba(255,255,255,0.15)",color:"white",fontSize:13,fontWeight:700,flexShrink:0}}>
                    {loading?"…":"Entrer"}
                  </button>
                </div>
                {error&&<div style={{color:"#FCA5A5",fontSize:12,marginTop:8,fontWeight:500}}>⚠️ {error}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{marginTop:24,color:"#6B7280",fontSize:11}}>Résidence Le Belleville — Accès interne</div>
    </div>
  );
}
