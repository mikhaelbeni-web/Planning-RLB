import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const DAYS_FR   = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function parseMin(range) {
  if (!range) return 0;
  const toM = t => { const clean=t.trim().replace(/h/i,":"); const [h,m]=clean.split(":").map(s=>parseInt(s)||0); return h*60+(m||0); };
  const dash=range.lastIndexOf("-"); if(dash<=0) return 0;
  return Math.max(0,toM(range.slice(dash+1))-toM(range.slice(0,dash)));
}
function fmtH(m){const h=Math.floor(m/60),mn=m%60;return mn?`${h}h${String(mn).padStart(2,"0")}`:`${h}h`;}

export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS") return res.status(200).end();
  if(req.method!=="POST") return res.status(405).json({error:"Méthode non autorisée"});

  const {to,name,month,calendarWeeks,totalHours}=req.body;
  if(!to||!name) return res.status(400).json({error:"Données manquantes"});

  let computedTotal=totalHours;
  if(!computedTotal&&calendarWeeks){
    let totalMin=0;
    calendarWeeks.forEach(week=>{(week.days||[]).forEach(d=>{if(!d.inMonth||!d.cell)return;totalMin+=parseMin(d.cell.a)+(d.cell.b?parseMin(d.cell.b):0);});});
    computedTotal=totalMin>0?fmtH(totalMin):null;
  }

  const rows=(calendarWeeks||[]).map(week=>{
    const cells=(week.days||[]).map(d=>{
      if(!d.inMonth) return `<td style="padding:4px;background:#F9FAFB;border:1px solid #F0F0F0;min-width:70px;"></td>`;
      const isWE=d.dayIdx>=5,bg=isWE?"#FFF5F5":"white",cell=d.cell;
      let content=`<div style="color:#D1D5DB;font-size:9px;margin-top:2px;">Repos</div>`;
      if(cell&&cell.a){content=`<div style="background:#DBEAFE;border:1px solid #93C5FD;border-radius:4px;padding:3px 4px;margin-top:2px;"><div style="font-size:10px;font-weight:700;color:#1E40AF;line-height:1.4;">${cell.a}</div>${cell.b?`<div style="font-size:10px;font-weight:700;color:#1E40AF;line-height:1.4;margin-top:1px;">${cell.b}</div>`:""}</div>`;}
      return `<td style="padding:4px 3px;background:${bg};border:1px solid #F0F0F0;min-width:70px;vertical-align:top;"><div style="font-size:11px;font-weight:700;color:${isWE?"#EF4444":"#374151"};text-align:right;padding-right:2px;">${String(d.day).padStart(2,"0")}</div>${content}</td>`;
    });
    return `<tr>${cells.join("")}</tr>`;
  }).join("");

  const html=`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:system-ui,sans-serif">
<div style="max-width:680px;margin:0 auto;padding:20px 12px">
  <div style="background:#111827;border-radius:12px 12px 0 0;padding:24px;text-align:center">
    <div style="font-size:28px;margin-bottom:8px">📅</div>
    <div style="color:white;font-weight:800;font-size:17px">RÉSIDENCE LE BELLEVILLE</div>
    <div style="color:#9CA3AF;font-size:13px;margin-top:4px">Planning ${month}</div>
  </div>
  <div style="background:white;border-radius:0 0 12px 12px;padding:20px">
    <p style="color:#374151;font-size:14px;margin-bottom:12px">Bonjour <strong>${name}</strong> 👋</p>
    <p style="color:#6B7280;font-size:13px;margin-bottom:20px">Votre planning <strong>${month}</strong> vient d'être publié :</p>
    <div style="overflow-x:auto;margin-bottom:20px">
      <table style="border-collapse:collapse;width:100%;min-width:490px">
        <thead><tr style="background:#F9FAFB">${DAYS_FR.map((d,i)=>`<th style="padding:7px 4px;font-size:10px;font-weight:700;color:${i>=5?"#EF4444":"#6B7280"};text-align:center;border:1px solid #F0F0F0;text-transform:uppercase;">${d}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${computedTotal?`<div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:10px 14px;margin-bottom:16px;"><span style="color:#0369A1;font-size:13px;font-weight:600;">⏱ Total ce mois : <strong>${computedTotal}</strong></span></div>`:""}
    <div style="border-top:1px solid #F3F4F6;padding-top:16px;margin-top:8px;text-align:center">
      <a href="https://planning-rlb.vercel.app" style="display:inline-block;background:#111827;color:white;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;">📅 Voir mon planning en ligne</a>
      <p style="color:#9CA3AF;font-size:11px;margin-top:12px">Résidence Le Belleville — Planning interne</p>
    </div>
  </div>
</div>
</body></html>`;

  try {
    await resend.emails.send({from:"Planning RLB <planning@beylev.com>",to:[to],subject:`📅 Planning ${month} — Résidence Le Belleville`,html});
    return res.status(200).json({success:true});
  } catch(err){
    console.error("Resend error:",err);
    return res.status(500).json({error:err.message});
  }
}
