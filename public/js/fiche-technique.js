window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const $ = (sel) => document.querySelector(sel);
  function money(v){ const n = Number(v ?? 0); return Number.isFinite(n) ? n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' MAD' : '0,00 MAD'; }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g,(c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  async function fetchJSON(url){ const res = await authFetch(url); const text = await res.text(); let data={}; try{data=text?JSON.parse(text):{}}catch{} if(!res.ok) throw new Error(data?.error||text||`Erreur API (${res.status})`); return data; }

  async function exportPdf(){
    if(!window.html2canvas || !window.jspdf) throw new Error('Librairies PDF non chargées');
    const root = document.getElementById('sheet-export-root');
    const canvas = await html2canvas(root,{scale:1.6,useCORS:true,backgroundColor:'#f6f7f2'});
    const img = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p','mm','a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 12;
    const imgHeight = canvas.height * imgWidth / canvas.width;
    let remaining = imgHeight;
    let position = 6;
    pdf.addImage(img,'PNG',6,position,imgWidth,imgHeight);
    remaining -= (pageHeight - 12);
    while(remaining > 0){
      pdf.addPage();
      position = remaining - imgHeight + 6;
      pdf.addImage(img,'PNG',6,position,imgWidth,imgHeight);
      remaining -= (pageHeight - 12);
    }
    pdf.save('fiche_technique_v4_marrakech_safi.pdf');
  }

  async function init(){
    const data = await fetchJSON(`/api/dashboard/technical-sheet-data?${params.toString()}`);
    $('#sheet-subtitle').textContent = `Édition du ${new Date().toLocaleDateString('fr-FR')} · Synthèse cartographique et financière du périmètre filtré`;
    $('#sheet-footer-date').textContent = `Édité le ${new Date().toLocaleString('fr-FR')}`;
    $('#s-programmes').textContent = data.summary.nb_programmes;
    $('#s-projets').textContent = data.summary.nb_projets;
    $('#s-ao').textContent = data.summary.nb_ao;
    $('#s-marches').textContent = data.summary.nb_marches;
    $('#s-communes').textContent = data.summary.nb_communes;
    $('#s-budget').textContent = money(data.summary.budget_total);
    $('#s-montant').textContent = money(data.summary.marches_total);
    $('#s-paiements').textContent = money(data.summary.paiements_total);
    $('#s-reste').textContent = money(data.summary.reste_total);
    const criteria = [
      ['Programme', params.get('programme_id') || 'Tous'],
      ['Projet', params.get('projet_id') || 'Tous'],
      ['AO', params.get('ao_id') || 'Tous'],
      ['Marché', params.get('marche_id') || 'Tous'],
      ['Exercice', params.get('exercice') || 'Tous'],
      ['Commune', params.get('commune') || 'Toutes'],
      ['Statut', params.get('statut') || 'Tous'],
      ['Date du', params.get('date_from') || '—'],
      ['Date au', params.get('date_to') || '—']
    ];
    $('#criteria-list').innerHTML = criteria.map(([k,v])=>`<div class="criteria-item"><b>${esc(k)}</b>${esc(v)}</div>`).join('');
    $('#sheet-table tbody').innerHTML = data.rows.map((r)=>`<tr><td>${esc(r.programme||'')}</td><td>${esc((r.projet_code?r.projet_code+' — ':'')+(r.projet_intitule||''))}</td><td>${esc(r.numero_ao||'')}</td><td>${esc(r.commune_rurale||'')}</td><td>${esc(r.type_beneficiaire||'')}</td><td>${esc(r.numero_marche||'')}</td><td>${esc(r.fournisseur||'')}</td><td>${money(r.marche_montant)}</td><td>${money(r.montant_paye)}</td><td>${money(r.reste_a_payer)}</td><td>${esc(r.exercice||'')}</td></tr>`).join('');

    const map = L.map('sheet-map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    const communes = L.geoJSON(data.map.communes || {type:'FeatureCollection',features:[]}, {style:()=>({color:'#8b5e34',weight:2,fillColor:'#d8c4ab',fillOpacity:0.12})}).addTo(map);
    const projets = L.geoJSON(data.map.projets || {type:'FeatureCollection',features:[]}, {
      style:()=>({color:'#285f35',weight:2,fillOpacity:0.35}),
      pointToLayer:(f,latlng)=>{
        const montant = Number(f?.properties?.marche_montant || 0);
        const radius = montant > 0 ? Math.max(6, Math.min(18, Math.round(Math.log10(montant + 1) * 3.5))) : 6;
        return L.circleMarker(latlng,{radius,color:'#285f35',fillColor:'#3d9b4f',fillOpacity:0.9,weight:2});
      }
    }).addTo(map);
    setTimeout(()=>{
      map.invalidateSize();
      if (communes.getLayers().length && communes.getBounds().isValid()) map.fitBounds(communes.getBounds().pad(0.15));
      else if (projets.getLayers().length && projets.getBounds().isValid()) map.fitBounds(projets.getBounds().pad(0.18));
      else map.setView([31.9,-7.9],8);
    },150);

    $('#btn-export-pdf')?.addEventListener('click', ()=>exportPdf().catch((e)=>alert(e.message)));
  }

  if (!window.L) { document.body.innerHTML = `<div style="padding:30px;font-family:Arial">Erreur fiche technique : Leaflet n'est pas chargé.</div>`; return; }
  init().catch((e)=>{ document.body.innerHTML = `<div style="padding:30px;font-family:Arial">Erreur fiche technique : ${esc(e.message)}</div>`; });
});
