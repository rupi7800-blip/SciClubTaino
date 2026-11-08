'use strict';
/* =====================================================================
   SCI CLUB TAINO · web app
   ===================================================================== */
const CFG = window.SCT_CONFIG || {};
const DEMO = !(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
const TZ = 'Europe/Rome';
const MESI_TESS = CFG.durataTesseramentoMesi || 12;

/* ---------- utilità ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p2 = n => String(n).padStart(2, '0');
const oggiISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
const fmtOra = d => d ? new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—';
const fmtGiorno = d => new Date(d).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const fmtDataOra = d => new Date(d).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fmtDataSemplice = s => s ? new Date(s + 'T12:00:00Z').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }) : '—';
const dataParti = d => {
  const x = new Date(d);
  return {
    g: x.toLocaleDateString('it-IT', { day: 'numeric', timeZone: TZ }),
    m: x.toLocaleDateString('it-IT', { month: 'short', timeZone: TZ }).replace('.', ''),
    gs: x.toLocaleDateString('it-IT', { weekday: 'short', timeZone: TZ }).replace('.', '')
  };
};
// valori per i campi data/ora dei moduli (ora locale del telefono)
const dataInput = iso => { const d = new Date(iso); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const oraInput = iso => { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const componi = (data, ora) => (data && ora) ? new Date(`${data}T${ora}`) : null;
const aggiungiMesi = (iso, mesi) => {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + mesi); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const giorniTra = (daISO, aISO) => Math.round((new Date(aISO + 'T12:00:00Z') - new Date(daISO + 'T12:00:00Z')) / 86400000);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());

function statoTessera(lista) {
  const oggi = oggiISO();
  const attiva = (lista || []).filter(t => t.stato === 'attiva' && t.data_iscrizione && t.scadenza)
    .sort((a, b) => b.scadenza.localeCompare(a.scadenza));
  const inAttesa = (lista || []).find(t => t.stato === 'in_attesa');
  const corrente = attiva.find(t => t.data_iscrizione <= oggi && t.scadenza >= oggi);
  const futura = attiva.find(t => t.data_iscrizione > oggi);
  const ultima = attiva[0];
  if (corrente) return { codice: 'attiva', t: corrente, inAttesa, futura, giorni: giorniTra(oggi, corrente.scadenza) };
  if (futura) return { codice: 'attiva', t: futura, inAttesa, futura, giorni: giorniTra(oggi, futura.scadenza), nonIniziata: true };
  if (inAttesa) return { codice: 'in_attesa', t: inAttesa, ultima };
  if (ultima) return { codice: 'scaduta', t: ultima };
  const rif = (lista || []).find(t => t.stato === 'rifiutata');
  if (rif) return { codice: 'rifiutata', t: rif };
  return { codice: 'nessuna' };
}
const NOMI_STATO = { attiva: 'Attiva', in_attesa: 'In attesa di conferma', scaduta: 'Scaduta', rifiutata: 'Non accettata', nessuna: 'Non iscritto' };

function traduci(msg = '') {
  const m = String(msg);
  const mappa = [
    [/Invalid login credentials/i, 'Email o password non corrette'],
    [/Email not confirmed/i, 'Devi prima confermare l\'email: apri il messaggio che ti abbiamo inviato'],
    [/User already registered/i, 'Esiste già un account con questa email: accedi'],
    [/Password should be at least/i, 'La password deve avere almeno 6 caratteri'],
    [/Unable to validate email address/i, 'Indirizzo email non valido'],
    [/rate limit|too many/i, 'Troppi tentativi ravvicinati: riprova tra qualche minuto'],
    [/Failed to fetch|NetworkError|Load failed/i, 'Nessuna connessione: controlla la rete e riprova'],
    [/duplicate key.*una_richiesta_in_attesa/i, 'Hai già una richiesta in attesa di conferma'],
    [/row-level security/i, 'Operazione non permessa']
  ];
  for (const [re, t] of mappa) if (re.test(m)) return t;
  return m || 'Si è verificato un errore';
}

/* =====================================================================
   DATI · modalità prova (sul telefono)
   ===================================================================== */
function creaDemo() {
  const KEY = 'sct-demo-v1';
  const ascoltatori = [];
  const avvisa = () => ascoltatori.forEach(f => setTimeout(f));
  const salva = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* spazio pieno */ } };
  const tra = (giorni, ora, min = 0) => { const d = new Date(); d.setDate(d.getDate() + giorni); d.setHours(ora, min, 0, 0); return d.toISOString(); };
  const oggi = oggiISO();
  function semina() {
    const soci = [
      ['s1', 'Marco', 'Rossi', 'attiva'], ['s2', 'Giulia', 'Bianchi', 'attiva'], ['s3', 'Luca', 'Ferrari', 'in_attesa'],
      ['s4', 'Sara', 'Colombo', 'scaduta'], ['s5', 'Paolo', 'Ricci', 'attiva']
    ];
    const profili = {}, tess = [];
    for (const [id, nome, cognome, st] of soci) {
      profili[id] = { user_id: id, nome, cognome, telefono: '333 000 00' + id.slice(1), email: `${nome.toLowerCase()}@esempio.it`, data_nascita: '1985-03-12', privacy: true };
      if (st === 'attiva') tess.push({ id: uuid(), user_id: id, richiesto: tra(-60, 10), data_iscrizione: aggiungiMesi(oggi, -2).slice(0, 8) + '01', stato: 'attiva' });
      if (st === 'in_attesa') tess.push({ id: uuid(), user_id: id, richiesto: tra(-1, 18), stato: 'in_attesa' });
      if (st === 'scaduta') tess.push({ id: uuid(), user_id: id, richiesto: tra(-420, 10), data_iscrizione: aggiungiMesi(oggi, -14).slice(0, 8) + '01', stato: 'attiva' });
    }
    tess.forEach(t => { if (t.data_iscrizione) t.scadenza = aggiungiMesi(t.data_iscrizione, 12); });
    const eventi = [
      { id: 'e1', titolo: 'Domenica a Cervinia', destinazione: 'Breuil-Cervinia (AO)', dest_lat: 45.9339, dest_lon: 7.6296,
        ritrovo_luogo: 'Taino (VA) · piazzale del municipio', ritrovo_lat: 45.767, ritrovo_lon: 8.617,
        ritrovo_entro: tra(6, 5, 45), partenza: tra(6, 6, 0), rientro: tra(6, 19, 30), mezzo: 'pullman', posti: 50,
        chiusura: tra(4, 20, 0), quota: 'Soci 45 € (viaggio) · skipass a parte', sito_info: 'https://www.cervinia.it',
        solo_soci: true, descrizione: 'Uscita sociale sulle piste di Cervinia. Pranzo libero in quota.\nPortare documento e tessera.', extra: 37 },
      { id: 'e2', titolo: 'Gita a Champoluc', destinazione: 'Champoluc · Monterosa Ski (AO)', dest_lat: 45.8317, dest_lon: 7.7270,
        ritrovo_luogo: 'Taino (VA) · piazzale del municipio', ritrovo_lat: 45.767, ritrovo_lon: 8.617,
        ritrovo_entro: tra(13, 6, 0), partenza: tra(13, 6, 15), rientro: tra(13, 19, 0), mezzo: 'pullman', posti: 54,
        chiusura: tra(11, 21, 0), quota: '40 €', sito_info: 'https://www.monterosaski.com', solo_soci: false,
        descrizione: 'Aperta anche ai non soci fino a esaurimento posti.', extra: 12 },
      { id: 'e3', titolo: 'Apertura stagione a Bielmonte', destinazione: 'Bielmonte (BI)', dest_lat: 45.6676, dest_lon: 8.0882,
        ritrovo_luogo: 'Taino (VA)', ritrovo_lat: 45.767, ritrovo_lon: 8.617,
        ritrovo_entro: tra(1, 7, 15), partenza: tra(1, 7, 30), rientro: tra(1, 17, 30), mezzo: 'auto', posti: 16,
        chiusura: tra(0, new Date().getHours() + 3, 0), quota: 'Viaggio in auto condivisa', solo_soci: true, descrizione: '', extra: 14 }
    ];
    return { utente: null, profili, tess, eventi, isc: [] };
  }
  let db = null;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
  if (!db || !db.eventi) { db = semina(); salva(); }
  const uid = () => db.utente && db.utente.id;
  const conta = e => (e.extra || 0) + db.isc.filter(i => i.evento_id === e.id).length;
  const io = () => { if (!uid()) throw new Error('Devi accedere'); return uid(); };

  return {
    demo: true,
    async init() { },
    onAuth(f) { ascoltatori.push(f); },
    utente() { return db.utente; },
    async accedi(email) { if (!email) throw new Error('Inserisci l\'email'); db.utente = { id: 'io-' + email.toLowerCase(), email }; salva(); avvisa(); },
    async registrati(email, pw) { await this.accedi(email, pw); return { conferma: false }; },
    async esci() { db.utente = null; salva(); avvisa(); },
    async recuperaPassword() { },
    async nuovaPassword() { },
    async isAdmin() { return !!db.utente; },
    async profilo() { return db.profili[uid()] || null; },
    async salvaProfilo(p) { const id = io(); db.profili[id] = { ...db.profili[id], ...p, user_id: id, email: db.utente.email }; salva(); },
    async tesseramenti() { const id = io(); return db.tess.filter(t => t.user_id === id).sort((a, b) => b.richiesto.localeCompare(a.richiesto)); },
    async richiediTesseramento(note) {
      const id = io();
      if (db.tess.some(t => t.user_id === id && t.stato === 'in_attesa')) throw new Error('Hai già una richiesta in attesa di conferma');
      db.tess.push({ id: uuid(), user_id: id, richiesto: new Date().toISOString(), stato: 'in_attesa', note: note || null }); salva();
    },
    async eventi() {
      const id = uid();
      return db.eventi.slice().sort((a, b) => a.partenza.localeCompare(b.partenza))
        .map(e => ({ ...e, iscritti: conta(e), mio: !!id && db.isc.some(i => i.evento_id === e.id && i.user_id === id) }));
    },
    async iscriviti(evId) {
      const id = io(); const e = db.eventi.find(x => x.id === evId);
      if (!db.profili[id]) throw new Error('Completa prima i tuoi dati nella sezione Tessera');
      if (!e) throw new Error('Evento non trovato');
      if (Date.now() > new Date(e.chiusura)) throw new Error('Le iscrizioni a questo evento sono chiuse');
      if (e.solo_soci && statoTessera(db.tess.filter(t => t.user_id === id)).codice !== 'attiva') throw new Error('Per questo evento serve il tesseramento attivo');
      if (db.isc.some(i => i.evento_id === evId && i.user_id === id)) return;
      if (conta(e) >= e.posti) throw new Error('Posti esauriti');
      db.isc.push({ id: uuid(), evento_id: evId, user_id: id, creato: new Date().toISOString() }); salva();
    },
    async annulla(evId) {
      const id = io(); const e = db.eventi.find(x => x.id === evId);
      if (e && Date.now() > new Date(e.chiusura)) throw new Error('Iscrizioni chiuse: per cancellarti contatta gli organizzatori');
      db.isc = db.isc.filter(i => !(i.evento_id === evId && i.user_id === id)); salva();
    },
    async salvaEvento(e) {
      if (e.id) { const i = db.eventi.findIndex(x => x.id === e.id); db.eventi[i] = { ...db.eventi[i], ...e }; }
      else db.eventi.push({ ...e, id: uuid() });
      salva();
    },
    async eliminaEvento(id) { db.eventi = db.eventi.filter(e => e.id !== id); db.isc = db.isc.filter(i => i.evento_id !== id); salva(); },
    async iscritti(evId) {
      const e = db.eventi.find(x => x.id === evId);
      const veri = db.isc.filter(i => i.evento_id === evId).map(i => ({ ...i, profilo: db.profili[i.user_id] || { nome: 'Socio', cognome: '' } }));
      const finti = Array.from({ length: Math.min(e?.extra || 0, 60) }, (_, k) => {
        const p = Object.values(db.profili)[k % 5];
        return { id: 'f' + k, user_id: p.user_id, creato: new Date(Date.now() - (k + 1) * 3.6e6).toISOString(), profilo: { ...p, nome: p.nome, cognome: p.cognome + (k >= 5 ? ' ' + (k + 1) : '') } };
      });
      return [...finti.reverse(), ...veri];
    },
    async eliminaIscrizione(id) { db.isc = db.isc.filter(i => i.id !== id); salva(); },
    async soci() { return Object.values(db.profili).map(p => ({ ...p, tesseramenti: db.tess.filter(t => t.user_id === p.user_id) })); },
    async aggiornaTesseramento(id, f) { const t = db.tess.find(x => x.id === id); Object.assign(t, f); salva(); },
    async creaTesseramento(user_id, f) { db.tess.push({ id: uuid(), user_id, richiesto: new Date().toISOString(), ...f }); salva(); },
    async eliminaTesseramento(id) { db.tess = db.tess.filter(t => t.id !== id); salva(); },
    async elencoAdmin() { return db.utente ? [{ user_id: db.utente.id, email: db.utente.email }] : []; },
    async aggiungiAdmin() { throw new Error('In modalità prova sei già amministratore: la gestione del team si attiva con Supabase'); },
    async rimuoviAdmin() { throw new Error('Non disponibile in modalità prova'); },
    azzera() { localStorage.removeItem(KEY); location.reload(); }
  };
}

/* =====================================================================
   DATI · Supabase (versione reale, condivisa)
   ===================================================================== */
function creaSupabase() {
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  let sessione = null, admin = null;
  const ascoltatori = [];
  const ck = ({ data, error }) => { if (error) throw new Error(traduci(error.message)); return data; };
  const id = () => { if (!sessione) throw new Error('Devi accedere'); return sessione.user.id; };
  const ritorno = () => location.origin + location.pathname;
  return {
    demo: false,
    async init() {
      const { data } = await sb.auth.getSession(); sessione = data.session;
      sb.auth.onAuthStateChange((evento, s) => {
        const cambiato = (s?.user?.id || null) !== (sessione?.user?.id || null);
        sessione = s;
        if (evento === 'PASSWORD_RECOVERY') { setTimeout(() => { location.hash = '#/nuova-password'; }); return; }
        if (cambiato) { admin = null; ascoltatori.forEach(f => setTimeout(f)); }
      });
    },
    onAuth(f) { ascoltatori.push(f); },
    utente() { return sessione ? { id: sessione.user.id, email: sessione.user.email } : null; },
    async accedi(email, pw) { ck(await sb.auth.signInWithPassword({ email, password: pw })); },
    async registrati(email, pw) { const d = ck(await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: ritorno() } })); return { conferma: !d.session }; },
    async esci() { await sb.auth.signOut(); },
    async recuperaPassword(email) { ck(await sb.auth.resetPasswordForEmail(email, { redirectTo: ritorno() })); },
    async nuovaPassword(pw) { ck(await sb.auth.updateUser({ password: pw })); },
    async isAdmin() {
      if (!sessione) return false;
      if (admin === null) { const { data } = await sb.rpc('is_admin'); admin = !!data; }
      return admin;
    },
    async profilo() { return ck(await sb.from('profili').select('*').eq('user_id', id()).maybeSingle()); },
    async salvaProfilo(p) { ck(await sb.from('profili').upsert({ ...p, user_id: id(), email: sessione.user.email })); },
    async tesseramenti() { return ck(await sb.from('tesseramenti').select('*').eq('user_id', id()).order('richiesto', { ascending: false })); },
    async richiediTesseramento(note) { ck(await sb.from('tesseramenti').insert({ user_id: id(), note: note || null })); },
    async eventi() {
      const [ev, cnt] = await Promise.all([
        sb.from('eventi').select('*').order('partenza').then(ck),
        sb.rpc('conteggi_iscrizioni').then(ck)
      ]);
      const mie = sessione ? ck(await sb.from('iscrizioni').select('evento_id').eq('user_id', sessione.user.id)) : [];
      const n = Object.fromEntries((cnt || []).map(c => [c.evento_id, c.iscritti]));
      const mieSet = new Set(mie.map(m => m.evento_id));
      return ev.map(e => ({ ...e, iscritti: n[e.id] || 0, mio: mieSet.has(e.id) }));
    },
    async iscriviti(evId, note) { ck(await sb.rpc('iscriviti_evento', { p_evento: evId, p_note: note || null })); },
    async annulla(evId) { ck(await sb.rpc('annulla_iscrizione', { p_evento: evId })); },
    async salvaEvento(e) {
      const { id: eid, iscritti, mio, ...r } = e;
      if (eid) ck(await sb.from('eventi').update(r).eq('id', eid)); else ck(await sb.from('eventi').insert(r));
    },
    async eliminaEvento(evId) { ck(await sb.from('eventi').delete().eq('id', evId)); },
    async iscritti(evId) { return ck(await sb.from('iscrizioni').select('*, profilo:profili(nome,cognome,telefono,email)').eq('evento_id', evId).order('creato')); },
    async eliminaIscrizione(iid) { ck(await sb.from('iscrizioni').delete().eq('id', iid)); },
    async soci() { return ck(await sb.from('profili').select('*, tesseramenti(*)').order('cognome')); },
    async aggiornaTesseramento(tid, f) { ck(await sb.from('tesseramenti').update(f).eq('id', tid)); },
    async creaTesseramento(user_id, f) { ck(await sb.from('tesseramenti').insert({ user_id, ...f })); },
    async eliminaTesseramento(tid) { ck(await sb.from('tesseramenti').delete().eq('id', tid)); },
    async elencoAdmin() { return ck(await sb.rpc('elenco_admin')); },
    async aggiungiAdmin(email) { ck(await sb.rpc('aggiungi_admin', { p_email: email })); },
    async rimuoviAdmin(uid) { ck(await sb.rpc('rimuovi_admin', { p_user: uid })); }
  };
}

const API = DEMO ? creaDemo() : creaSupabase();

/* =====================================================================
   STATO, AVVISI, DIALOGHI
   ===================================================================== */
const S = { utente: null, admin: false, profilo: null, tess: [], eventi: [] };
const app = $('#app');
let timerAvviso;
function avviso(testo, errore = false) {
  const el = $('#avviso'); el.textContent = testo; el.className = 'avviso' + (errore ? ' errore-av' : ''); el.hidden = false;
  clearTimeout(timerAvviso); timerAvviso = setTimeout(() => { el.hidden = true; }, errore ? 4500 : 2600);
}
function conferma(titolo, testo, ok = 'Conferma', classe = '') {
  return new Promise(res => {
    const d = $('#dialogo');
    d.innerHTML = `<h3>${esc(titolo)}</h3><p>${testo}</p><div class="bottoni-d">
      <button class="btn sec" value="no">Annulla</button><button class="btn ${classe}" value="si">${esc(ok)}</button></div>`;
    $$('button', d).forEach(b => b.onclick = () => { d.close(); res(b.value === 'si'); });
    d.oncancel = () => res(false);
    d.showModal();
  });
}
async function esegui(btn, fn, ok) {
  if (btn) { btn.disabled = true; btn.dataset.t = btn.textContent; btn.textContent = 'Attendi…'; }
  try { await fn(); if (ok) avviso(ok); return true; }
  catch (e) { avviso(traduci(e.message), true); return false; }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = btn.dataset.t; } }
}

async function caricaUtente() {
  S.utente = API.utente();
  S.admin = false; S.profilo = null; S.tess = [];
  if (S.utente) {
    try {
      [S.admin, S.profilo] = await Promise.all([API.isAdmin(), API.profilo()]);
      S.tess = S.profilo ? await API.tesseramenti() : [];
    } catch (e) { avviso(traduci(e.message), true); }
  }
  $('#menu-admin').hidden = !S.admin;
}

/* =====================================================================
   ROUTER
   ===================================================================== */
let pollTimer = null, mappaAttiva = null;
async function mostra() {
  clearInterval(pollTimer); pollTimer = null;
  if (mappaAttiva) { mappaAttiva.remove(); mappaAttiva = null; }
  const parti = (location.hash.replace(/^#\/?/, '') || 'eventi').split('/');
  const sez = parti[0];
  $$('.menu a').forEach(a => a.classList.toggle('attivo', a.dataset.sez === (sez === 'evento' ? 'eventi' : sez)));
  try {
    if (sez === 'eventi') await vistaEventi();
    else if (sez === 'evento') await vistaEvento(parti[1]);
    else if (sez === 'tessera') await vistaTessera(parti[1]);
    else if (sez === 'account') vistaAccount(parti[1]);
    else if (sez === 'nuova-password') vistaNuovaPassword();
    else if (sez === 'admin') {
      if (!S.admin) { location.hash = '#/eventi'; return; }
      await vistaAdmin(parti[1], parti[2]);
    } else location.hash = '#/eventi';
  } catch (e) {
    app.innerHTML = `<div class="scheda vuoto"><p>${esc(traduci(e.message))}</p><button class="btn" onclick="mostra()">Riprova</button></div>`;
  }
  aggiornaCountdown();
}
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); mostra(); });

/* =====================================================================
   EVENTI
   ===================================================================== */
const socioAttivo = () => statoTessera(S.tess).codice === 'attiva' && !statoTessera(S.tess).nonIniziata;

function bloccoOrari(e) {
  return `<div class="orari">
    <div class="orario limite"><span>Ritrovo entro</span><b>${fmtOra(e.ritrovo_entro)}</b><small>${esc(e.ritrovo_luogo)}</small></div>
    <div class="orario"><span>Partenza</span><b>${fmtOra(e.partenza)}</b></div>
    <div class="orario"><span>Rientro previsto</span><b>${e.rientro ? '~' + fmtOra(e.rientro) : '—'}</b></div>
  </div>`;
}
function bloccoPosti(e) {
  const liberi = Math.max(0, e.posti - e.iscritti);
  const pct = Math.min(100, e.iscritti / e.posti * 100);
  const cls = liberi === 0 ? 'pieno' : (liberi / e.posti <= .2 ? 'quasi' : '');
  return `<div class="posti">
    <div class="barra ${cls}"><i style="width:${pct}%"></i></div>
    <div class="posti-num"><span class="liberi ${liberi === 0 ? 'zero' : ''}"><b>${liberi}</b> ${liberi === 1 ? 'posto libero' : 'posti liberi'}</span>
    <span>${e.iscritti} iscritti su <b>${e.posti}</b> disponibili</span></div>
  </div>
  <div class="countdown" data-chiusura="${esc(e.chiusura)}"></div>`;
}
function bloccoAzioni(e, dettaglio = false) {
  const chiuso = Date.now() > new Date(e.chiusura);
  const liberi = e.posti - e.iscritti;
  let b = '';
  if (e.mio) {
    b = `<div class="iscritto-ok"><span>✓ Sei iscritto</span>${chiuso ? '' : `<button class="link-btn" data-annulla="${e.id}">Cancellami</button>`}</div>`;
  } else if (chiuso) b = `<button class="btn" disabled>Iscrizioni chiuse</button>`;
  else if (liberi <= 0) b = `<button class="btn" disabled>Posti esauriti</button>`;
  else if (!S.utente) b = `<a class="btn" href="#/account">Accedi per iscriverti</a>`;
  else if (!S.profilo) b = `<a class="btn" href="#/tessera">Completa i tuoi dati</a>`;
  else if (e.solo_soci && !socioAttivo()) b = `<a class="btn contorno" href="#/tessera">Serve la tessera attiva</a>`;
  else b = `<button class="btn" data-iscriviti="${e.id}">Iscriviti</button>`;
  return `<div class="ev-azioni">${b}${dettaglio ? '' : `<a class="btn sec" href="#/evento/${e.id}">Info utili →</a>`}</div>`;
}
function cardEvento(e) {
  const d = dataParti(e.partenza);
  const passato = new Date(e.rientro || e.partenza) < Date.now();
  return `<article class="evento" id="ev-${e.id}">
    <div class="ev-testa">
      <div class="ev-data"><span class="gs">${d.gs}</span><span class="g">${d.g}</span><span class="m">${d.m}</span></div>
      <div><h2>${esc(e.titolo)}</h2><p class="ev-dest">📍 ${esc(e.destinazione)}</p>
        <div class="etichette">${e.solo_soci ? '<span class="etichetta rossa">Solo soci</span>' : '<span class="etichetta verde">Aperto a tutti</span>'}
        <span class="etichetta">${{ pullman: '🚌 Pullman', auto: '🚗 Auto', minibus: '🚐 Minibus' }[e.mezzo] || ''}</span>
        ${e.quota ? `<span class="etichetta">${esc(e.quota)}</span>` : ''}</div></div>
    </div>
    ${bloccoOrari(e)}
    ${passato ? '' : bloccoPosti(e) + bloccoAzioni(e)}
    ${passato ? `<div class="ev-azioni"><a class="btn sec" href="#/evento/${e.id}">Dettagli</a></div>` : ''}
  </article>`;
}
function collegaAzioni(ricarica) {
  $$('[data-iscriviti]', app).forEach(b => b.onclick = async () => {
    const e = S.eventi.find(x => x.id === b.dataset.iscriviti);
    const ok = await conferma('Confermi l\'iscrizione?', `<b>${esc(e.titolo)}</b><br>${esc(fmtGiorno(e.partenza))}<br>Ritrovo entro le <b>${fmtOra(e.ritrovo_entro)}</b> a ${esc(e.ritrovo_luogo)}.`, 'Iscrivimi');
    if (ok && await esegui(b, () => API.iscriviti(e.id), 'Iscrizione confermata ✓')) ricarica();
  });
  $$('[data-annulla]', app).forEach(b => b.onclick = async () => {
    const e = S.eventi.find(x => x.id === b.dataset.annulla);
    const ok = await conferma('Vuoi cancellarti?', `Libererai il tuo posto per <b>${esc(e.titolo)}</b>.`, 'Cancellami', 'nero');
    if (ok && await esegui(b, () => API.annulla(e.id), 'Iscrizione cancellata')) ricarica();
  });
}
async function vistaEventi() {
  S.eventi = await API.eventi();
  const ora = Date.now();
  const futuri = S.eventi.filter(e => new Date(e.rientro || e.partenza) >= ora);
  const passati = S.eventi.filter(e => new Date(e.rientro || e.partenza) < ora).reverse().slice(0, 10);
  let avvisoT = '';
  if (S.utente && !S.profilo) avvisoT = `<div class="avviso-box giallo">Benvenuto! <a href="#/tessera">Completa i tuoi dati e chiedi il tesseramento</a> per iscriverti agli eventi.</div>`;
  else if (S.utente) {
    const st = statoTessera(S.tess);
    if (st.codice === 'in_attesa') avvisoT = `<div class="avviso-box giallo">La tua richiesta di tesseramento è in attesa di conferma dal club.</div>`;
    else if (st.codice !== 'attiva') avvisoT = `<div class="avviso-box rosso">La tua tessera non è attiva. <a href="#/tessera">Rinnova l'iscrizione</a></div>`;
    else if (st.giorni <= 30) avvisoT = `<div class="avviso-box giallo">La tua tessera scade tra ${st.giorni} giorni. <a href="#/tessera">Rinnova</a></div>`;
  }
  app.innerHTML = `${avvisoT}
    <div class="sezione-titolo"><h1>Prossimi eventi</h1></div>
    ${futuri.length ? futuri.map(cardEvento).join('') : '<div class="scheda vuoto">Nessun evento in programma per ora.<br>Torna a trovarci presto!</div>'}
    ${passati.length ? `<details class="scheda"><summary><b>Eventi passati</b></summary><div style="margin-top:12px">
      ${passati.map(e => `<div class="riga-lista"><div class="info"><b>${esc(e.titolo)}</b><small>${esc(fmtGiorno(e.partenza))} · ${esc(e.destinazione)}</small></div>
      <a class="btn sec piccolo" href="#/evento/${e.id}">Apri</a></div>`).join('')}</div></details>` : ''}`;
  collegaAzioni(vistaEventi);
  // aggiorna i posti ogni 30 secondi
  pollTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const nuovi = await API.eventi();
      for (const n of nuovi) {
        const v = S.eventi.find(x => x.id === n.id);
        if (v && (v.iscritti !== n.iscritti || v.mio !== n.mio)) {
          const card = $('#ev-' + n.id); if (card) { card.outerHTML = cardEvento(n); }
        }
      }
      S.eventi = nuovi; collegaAzioni(vistaEventi); aggiornaCountdown();
    } catch (e) { /* rete assente: riprova al giro dopo */ }
  }, 30000);
}

/* countdown chiusura iscrizioni (ogni secondo) */
function aggiornaCountdown() {
  $$('[data-chiusura]').forEach(el => {
    const diff = new Date(el.dataset.chiusura) - Date.now();
    if (diff <= 0) {
      el.className = 'countdown chiuso';
      el.innerHTML = `⛔ Iscrizioni chiuse il ${esc(fmtDataOra(el.dataset.chiusura))}`;
      if (!el.dataset.fatto && el.dataset.visto) { el.dataset.fatto = 1; setTimeout(mostra, 800); }
      return;
    }
    el.dataset.visto = 1;
    const s = Math.floor(diff / 1000), g = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    el.className = 'countdown' + (diff < 86400000 ? ' urgente' : '');
    el.innerHTML = `<span>⏳ Chiusura iscrizioni tra</span><span class="cd-tempo">${g > 0 ? g + 'g ' : ''}${p2(h)}:${p2(m)}:${p2(sec)}</span>`;
    el.title = 'Chiusura: ' + fmtDataOra(el.dataset.chiusura);
  });
}
setInterval(aggiornaCountdown, 1000);

/* ---------- dettaglio evento + info utili ---------- */
const FATTORE_MEZZO = { pullman: 1.2, minibus: 1.1, auto: 1 };
async function vistaEvento(id) {
  if (!S.eventi.length || !S.eventi.find(e => e.id === id)) S.eventi = await API.eventi();
  const e = S.eventi.find(x => x.id === id);
  if (!e) { app.innerHTML = `<div class="scheda vuoto">Evento non trovato.<br><a href="#/eventi">Torna agli eventi</a></div>`; return; }
  const passato = new Date(e.rientro || e.partenza) < Date.now();
  const dest = e.dest_lat ? `${e.dest_lat},${e.dest_lon}` : encodeURIComponent(e.destinazione);
  const orig = e.ritrovo_lat ? `${e.ritrovo_lat},${e.ritrovo_lon}` : encodeURIComponent(e.ritrovo_luogo);
  app.innerHTML = `<a class="indietro" href="#/eventi">← Tutti gli eventi</a>
    <article class="evento" id="ev-${e.id}">
      <div class="ev-testa"><div class="ev-data"><span class="gs">${dataParti(e.partenza).gs}</span><span class="g">${dataParti(e.partenza).g}</span><span class="m">${dataParti(e.partenza).m}</span></div>
      <div><h1 style="font-size:1.7rem;text-transform:none">${esc(e.titolo)}</h1><p class="ev-dest">📍 ${esc(e.destinazione)}</p>
      <p class="ev-dest" style="font-weight:500">${esc(fmtGiorno(e.partenza))}</p></div></div>
      ${bloccoOrari(e)}
      ${passato ? '' : bloccoPosti(e) + bloccoAzioni(e, true)}
    </article>
    ${e.descrizione || e.quota ? `<section class="scheda">${e.quota ? `<p><b>Quota:</b> ${esc(e.quota)}</p>` : ''}
      ${e.descrizione ? `<p style="white-space:pre-line">${esc(e.descrizione)}</p>` : ''}
      <p class="nota">${e.solo_soci ? 'Riservato ai soci con tessera attiva.' : 'Aperto anche ai non soci.'}</p></section>` : ''}
    <section class="scheda"><h2>🚌 Il viaggio</h2>
      <p class="nota" id="viaggio-info">Calcolo il percorso…</p>
      <div class="mappa" id="mappa"></div>
      <ol class="timeline" id="timeline"></ol>
      <p class="nota" style="margin-top:8px">Tempi ipotetici calcolati sul percorso più veloce${e.mezzo === 'pullman' ? ', maggiorati per il pullman' : ''}, senza traffico né soste.</p>
    </section>
    <section class="scheda"><h2>🏔️ Meteo sulla ski area</h2><div id="meteo" class="nota">Carico le previsioni…</div></section>
    <section class="scheda"><h2>🔗 Link utili</h2><div class="lista-link">
      ${e.sito_info ? `<a href="${esc(e.sito_info)}" target="_blank" rel="noopener">Sito della ski area / info <span>↗</span></a>` : ''}
      <a href="https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}&travelmode=driving" target="_blank" rel="noopener">Percorso su Google Maps <span>↗</span></a>
      <a href="https://www.google.com/maps/search/?api=1&query=${orig}" target="_blank" rel="noopener">Punto di ritrovo sulla mappa <span>↗</span></a>
      <a href="https://www.google.com/search?q=${encodeURIComponent(e.destinazione + ' webcam piste aperte')}" target="_blank" rel="noopener">Webcam e piste aperte <span>↗</span></a>
    </div></section>`;
  collegaAzioni(() => { S.eventi = []; vistaEvento(id); });
  if (!passato) pollTimer = setInterval(async () => {
    try { const n = (await API.eventi()).find(x => x.id === id); if (n && n.iscritti !== e.iscritti) { S.eventi = []; vistaEvento(id); } } catch (er) { /* */ }
  }, 30000);
  disegnaViaggio(e);
  caricaMeteo(e);
}

function riga(ora, titolo, sotto, forte) {
  return `<li class="${forte ? 'forte' : ''}"><span class="t-ora">${ora}</span><span class="t-punto"></span><span class="t-txt"><b>${esc(titolo)}</b>${sotto ? `<small>${esc(sotto)}</small>` : ''}</span></li>`;
}
async function disegnaViaggio(e) {
  const info = $('#viaggio-info'), tl = $('#timeline');
  const haCoord = e.ritrovo_lat && e.dest_lat;
  let durataMin = null, km = null, geo = null;
  if (haCoord) {
    try {
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${e.ritrovo_lon},${e.ritrovo_lat};${e.dest_lon},${e.dest_lat}?overview=full&geometries=geojson`);
      const j = await r.json();
      if (j.routes && j.routes[0]) { durataMin = j.routes[0].duration / 60; km = j.routes[0].distance / 1000; geo = j.routes[0].geometry; }
    } catch (er) { /* useremo una stima */ }
    if (!durataMin) { // stima in linea d'aria se il servizio non risponde
      const R = 6371, rad = x => x * Math.PI / 180;
      const a = Math.sin(rad(e.dest_lat - e.ritrovo_lat) / 2) ** 2 + Math.cos(rad(e.ritrovo_lat)) * Math.cos(rad(e.dest_lat)) * Math.sin(rad(e.dest_lon - e.ritrovo_lon) / 2) ** 2;
      km = 2 * R * Math.asin(Math.sqrt(a)) * 1.35; durataMin = km / 65 * 60;
    }
  }
  const viaggio = durataMin ? Math.round(durataMin * (FATTORE_MEZZO[e.mezzo] || 1) / 5) * 5 : null;
  const piu = (iso, min) => new Date(new Date(iso).getTime() + min * 60000);
  const hm = m => `${Math.floor(m / 60)} h ${p2(m % 60)} min`;
  if (info) info.textContent = viaggio ? `${Math.round(km)} km · circa ${hm(viaggio)} di viaggio${e.mezzo === 'pullman' ? ' in pullman' : ''}` : 'Percorso non disponibile: mancano le coordinate dei luoghi.';
  let h = riga(fmtOra(e.ritrovo_entro), 'Ritrovo — orario limite', e.ritrovo_luogo, true);
  h += riga(fmtOra(e.partenza), 'Partenza', 'Chi arriva dopo resta a casa: siate puntuali!');
  if (viaggio) h += riga('~' + fmtOra(piu(e.partenza, viaggio)), 'Arrivo stimato', e.destinazione);
  if (viaggio && e.rientro) h += riga('~' + fmtOra(piu(e.rientro, -viaggio)), 'Ripartenza stimata dalla ski area', 'Indicativa: confermata dagli accompagnatori');
  if (e.rientro) h += riga('~' + fmtOra(e.rientro), 'Rientro previsto', e.ritrovo_luogo, true);
  if (tl) tl.innerHTML = h;

  const box = $('#mappa');
  if (!box || !window.L || !haCoord) { if (box) box.remove(); return; }
  mappaAttiva = L.map(box, { scrollWheelZoom: false, attributionControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(mappaAttiva);
  const icona = (t, c) => L.divIcon({ className: '', html: `<div style="background:${c};color:#fff;font:700 12px Barlow,sans-serif;padding:4px 8px;border-radius:8px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);transform:translate(-50%,-120%)">${t}</div>` });
  L.marker([e.ritrovo_lat, e.ritrovo_lon], { icon: icona('Ritrovo ' + fmtOra(e.ritrovo_entro), '#e23340') }).addTo(mappaAttiva);
  L.marker([e.dest_lat, e.dest_lon], { icon: icona('⛷ ' + e.destinazione.split('(')[0].trim(), '#151515') }).addTo(mappaAttiva);
  if (geo) {
    const linea = L.geoJSON(geo, { style: { color: '#e23340', weight: 5, opacity: .85 } }).addTo(mappaAttiva);
    mappaAttiva.fitBounds(linea.getBounds(), { padding: [30, 30] });
  } else mappaAttiva.fitBounds([[e.ritrovo_lat, e.ritrovo_lon], [e.dest_lat, e.dest_lon]], { padding: [40, 40] });
}

const METEO_CODICI = { 0: '☀️ Sereno', 1: '🌤️ Poco nuvoloso', 2: '⛅ Nuvoloso', 3: '☁️ Coperto', 45: '🌫️ Nebbia', 48: '🌫️ Nebbia', 51: '🌦️ Pioviggine', 53: '🌦️ Pioviggine', 55: '🌦️ Pioviggine',
  61: '🌧️ Pioggia', 63: '🌧️ Pioggia', 65: '🌧️ Pioggia forte', 71: '🌨️ Neve debole', 73: '🌨️ Neve', 75: '❄️ Neve forte', 77: '🌨️ Nevischio',
  80: '🌦️ Rovesci', 81: '🌦️ Rovesci', 82: '⛈️ Rovesci forti', 85: '🌨️ Rovesci di neve', 86: '❄️ Rovesci di neve', 95: '⛈️ Temporale', 96: '⛈️ Temporale', 99: '⛈️ Temporale' };
async function caricaMeteo(e) {
  const box = $('#meteo'); if (!box) return;
  if (!e.dest_lat) { box.textContent = 'Previsioni non disponibili: manca la posizione della ski area.'; return; }
  const giorno = new Date(e.partenza).toLocaleDateString('sv-SE', { timeZone: TZ });
  const diff = giorniTra(oggiISO(), giorno);
  if (diff > 15) { box.textContent = `Le previsioni saranno disponibili circa 2 settimane prima (tra ${diff - 15} giorni).`; return; }
  if (diff < 0) { box.textContent = 'Evento concluso.'; return; }
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${e.dest_lat}&longitude=${e.dest_lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,snowfall_sum,wind_speed_10m_max&hourly=snow_depth,freezing_level_height&timezone=Europe%2FRome&start_date=${giorno}&end_date=${giorno}`;
    const j = await (await fetch(u)).json();
    const d = j.daily; if (!d) throw new Error();
    const neveSuolo = j.hourly?.snow_depth?.[12];
    const zero = j.hourly?.freezing_level_height?.[12];
    box.className = '';
    box.innerHTML = `<div class="meteo">
      <div><span>Cielo</span><b style="font-size:1.1rem;font-style:normal">${METEO_CODICI[d.weather_code[0]] || '—'}</b></div>
      <div><span>Temperatura</span><b>${Math.round(d.temperature_2m_min[0])}° / ${Math.round(d.temperature_2m_max[0])}°</b></div>
      <div><span>Neve fresca</span><b>${d.snowfall_sum[0] != null ? Math.round(d.snowfall_sum[0]) + ' cm' : '—'}</b></div>
      <div><span>Vento max</span><b>${Math.round(d.wind_speed_10m_max[0])} km/h</b></div>
      ${neveSuolo != null ? `<div><span>Neve al suolo*</span><b>${Math.round(neveSuolo * 100)} cm</b></div>` : ''}
      ${zero != null ? `<div><span>Zero termico</span><b>${Math.round(zero / 50) * 50} m</b></div>` : ''}
    </div><p class="nota" style="margin-top:8px">Previsione per ${esc(fmtGiorno(e.partenza))} alla quota della località (Open-Meteo). *Stima del modello, non il bollettino ufficiale delle piste.</p>`;
  } catch (er) { box.textContent = 'Previsioni non raggiungibili in questo momento.'; }
}

/* =====================================================================
   TESSERA
   ===================================================================== */
function moduloProfilo(p = {}) {
  return `<form id="f-profilo">
    <div class="riga"><div class="campo"><label for="p-nome">Nome</label><input id="p-nome" required maxlength="60" value="${esc(p.nome)}" autocomplete="given-name"></div>
    <div class="campo"><label for="p-cognome">Cognome</label><input id="p-cognome" required maxlength="60" value="${esc(p.cognome)}" autocomplete="family-name"></div></div>
    <div class="riga"><div class="campo"><label for="p-nascita">Data di nascita</label><input id="p-nascita" type="date" value="${esc(p.data_nascita)}" autocomplete="bday"></div>
    <div class="campo"><label for="p-tel">Cellulare</label><input id="p-tel" type="tel" maxlength="30" value="${esc(p.telefono)}" autocomplete="tel"></div></div>
    <div class="campo"><label class="check"><input type="checkbox" id="p-privacy" ${p.privacy ? 'checked' : ''} required>
      <span>Acconsento al trattamento dei miei dati da parte dello Sci Club Taino per la gestione del tesseramento e delle attività.</span></label></div>
    <p class="errore" id="p-err"></p>
    <button class="btn pieno">Salva i miei dati</button>
  </form>`;
}
function collegaProfilo(dopo) {
  $('#f-profilo').onsubmit = async ev => {
    ev.preventDefault();
    const dati = { nome: $('#p-nome').value.trim(), cognome: $('#p-cognome').value.trim(), data_nascita: $('#p-nascita').value || null,
      telefono: $('#p-tel').value.trim() || null, privacy: $('#p-privacy').checked };
    if (!dati.privacy) { $('#p-err').textContent = 'Serve il consenso per procedere'; return; }
    if (await esegui(ev.submitter, () => API.salvaProfilo(dati), 'Dati salvati')) { await caricaUtente(); dopo(); }
  };
}
async function vistaTessera(sotto) {
  if (!S.utente) {
    app.innerHTML = `<h1>La mia tessera</h1><div class="scheda"><p>Accedi o crea un account per chiedere il tesseramento annuale e iscriverti agli eventi.</p>
      <a class="btn pieno" href="#/account">Accedi o registrati</a></div>`; return;
  }
  await caricaUtente();
  if (!S.profilo || sotto === 'dati') {
    app.innerHTML = `${S.profilo ? '<a class="indietro" href="#/tessera">← La mia tessera</a>' : ''}<h1>${S.profilo ? 'I miei dati' : 'I tuoi dati'}</h1>
      <div class="scheda">${S.profilo ? '' : '<p>Prima di tutto ci servono alcuni dati per il tesseramento.</p>'}${moduloProfilo(S.profilo || {})}</div>`;
    collegaProfilo(() => { location.hash = '#/tessera'; if (location.hash === '#/tessera') mostra(); }); return;
  }
  const st = statoTessera(S.tess);
  const t = st.t || {};
  const puoChiedere = !st.inAttesa && st.codice !== 'in_attesa' && (st.codice !== 'attiva' || st.giorni <= 45) && !st.futura;
  let dettaglio = '';
  if (st.codice === 'attiva') dettaglio = st.nonIniziata ? `<div class="avviso-box verde">La tua nuova tessera parte il ${fmtDataSemplice(t.data_iscrizione)}.</div>` :
    (st.giorni <= 30 ? `<div class="avviso-box giallo">Mancano <b>${st.giorni} giorni</b> alla scadenza: puoi già chiedere il rinnovo.</div>` :
      `<div class="avviso-box verde">Tessera valida: mancano <b>${st.giorni} giorni</b> alla scadenza.</div>`);
  if (st.codice === 'in_attesa') dettaglio = `<div class="avviso-box giallo">Richiesta inviata il <b>${fmtDataSemplice(t.richiesto.slice(0, 10))}</b>. Il club la confermerà appena ricevuto il pagamento della quota: qui vedrai data di iscrizione e scadenza.</div>`;
  if (st.codice === 'scaduta') dettaglio = `<div class="avviso-box rosso">La tessera è scaduta il ${fmtDataSemplice(t.scadenza)}. Chiedi il rinnovo per tornare a iscriverti agli eventi riservati ai soci.</div>`;
  if (st.codice === 'nessuna') dettaglio = `<div class="avviso-box giallo">Non sei ancora socio per questa stagione. Invia la richiesta di iscrizione annuale.</div>`;
  if (st.inAttesa && st.codice === 'attiva') dettaglio += `<div class="avviso-box giallo">Rinnovo richiesto il ${fmtDataSemplice(st.inAttesa.richiesto.slice(0, 10))}, in attesa di conferma.</div>`;
  const storico = S.tess.filter(x => x.stato === 'attiva' && x.data_iscrizione);
  app.innerHTML = `<h1>La mia tessera</h1>
    <div class="tessera">
      <div class="t-club">Sci Club Taino</div>
      <div class="t-nome">${esc(S.profilo.nome)} ${esc(S.profilo.cognome)}</div>
      <div class="t-righe">
        <div><span>Data iscrizione</span><b>${st.codice === 'attiva' || st.codice === 'scaduta' ? fmtDataSemplice(t.data_iscrizione) : '—'}</b></div>
        <div><span>Scadenza</span><b>${st.codice === 'attiva' || st.codice === 'scaduta' ? fmtDataSemplice(t.scadenza) : '—'}</b></div>
      </div>
      <span class="stato ${st.codice}">${NOMI_STATO[st.codice]}</span>
    </div>
    ${dettaglio}
    ${puoChiedere ? `<div class="scheda"><h3>${st.codice === 'attiva' || st.codice === 'scaduta' ? 'Rinnovo annuale' : 'Iscrizione annuale'}</h3>
      <p class="nota">La richiesta arriva agli amministratori del club, che la confermano dopo il pagamento della quota. L'iscrizione dura ${MESI_TESS} mesi.</p>
      <div class="campo"><label for="t-note">Note per il club (facoltative)</label><input id="t-note" maxlength="300" placeholder="Es. pago in contanti al prossimo allenamento"></div>
      <button class="btn pieno" id="b-richiedi">${st.codice === 'attiva' || st.codice === 'scaduta' ? 'Chiedi il rinnovo' : 'Chiedi l\'iscrizione'}</button></div>` : ''}
    ${storico.length > 1 ? `<div class="scheda"><h3>Storico iscrizioni</h3>${storico.map(x => `<div class="riga-lista"><div class="info">${fmtDataSemplice(x.data_iscrizione)} → ${fmtDataSemplice(x.scadenza)}</div></div>`).join('')}</div>` : ''}
    <div class="scheda"><div class="riga-lista"><div class="info"><b>I miei dati</b><small>${esc(S.profilo.telefono || 'Nessun telefono')} · ${esc(S.utente.email)}</small></div>
      <a class="btn sec piccolo" href="#/tessera/dati">Modifica</a></div></div>`;
  const b = $('#b-richiedi');
  if (b) b.onclick = async () => { if (await esegui(b, () => API.richiediTesseramento($('#t-note').value.trim()), 'Richiesta inviata ✓')) mostra(); };
}

/* =====================================================================
   ACCOUNT
   ===================================================================== */
function vistaAccount(modo) {
  if (S.utente) {
    app.innerHTML = `<h1>Account</h1>
      <div class="scheda"><p>Sei connesso come<br><b>${esc(S.utente.email)}</b></p>
      ${S.admin ? '<p><span class="etichetta rossa">Amministratore</span></p>' : ''}
      <button class="btn sec pieno" id="b-esci">Esci</button></div>
      ${bloccoInstalla()}
      ${API.demo ? `<div class="scheda"><h3>Modalità prova</h3><p class="nota">Stai provando l'app con dati di esempio salvati solo su questo dispositivo. Con l'accesso puoi vedere anche la sezione Gestione.</p>
        <button class="btn sec pieno" id="b-azzera">Ripristina i dati di esempio</button></div>` : ''}
      ${contattiClub()}`;
    $('#b-esci').onclick = async () => { await API.esci(); avviso('Sei uscito'); location.hash = '#/eventi'; };
    if ($('#b-azzera')) $('#b-azzera').onclick = () => API.azzera();
    collegaInstalla();
    return;
  }
  const reg = modo === 'registrati', rec = modo === 'recupera';
  app.innerHTML = `<h1>${reg ? 'Crea account' : rec ? 'Password dimenticata' : 'Accedi'}</h1>
    <div class="scheda"><form id="f-acc">
      ${API.demo ? '<div class="avviso-box giallo">Modalità prova: inserisci un\'email qualsiasi e una password di almeno 6 caratteri.</div>' : ''}
      <div class="campo"><label for="a-email">Email</label><input id="a-email" type="email" required autocomplete="email" inputmode="email"></div>
      ${rec ? '' : `<div class="campo"><label for="a-pw">Password</label><input id="a-pw" type="password" required minlength="6" autocomplete="${reg ? 'new-password' : 'current-password'}"></div>`}
      ${reg ? '<div class="campo"><label for="a-pw2">Ripeti la password</label><input id="a-pw2" type="password" required minlength="6" autocomplete="new-password"></div>' : ''}
      <p class="errore" id="a-err"></p>
      <button class="btn pieno">${reg ? 'Crea account' : rec ? 'Inviami il link' : 'Accedi'}</button>
    </form>
    <p style="margin-top:14px;text-align:center">${reg ? '<a href="#/account">Hai già un account? Accedi</a>' :
      rec ? '<a href="#/account">Torna all\'accesso</a>' :
        '<a href="#/account/registrati"><b>Non hai un account? Registrati</b></a><br><a href="#/account/recupera">Password dimenticata?</a>'}</p></div>
    ${bloccoInstalla()}`;
  collegaInstalla();
  $('#f-acc').onsubmit = async ev => {
    ev.preventDefault();
    const email = $('#a-email').value.trim(), pw = $('#a-pw')?.value, err = $('#a-err');
    err.textContent = '';
    if (reg && pw !== $('#a-pw2').value) { err.textContent = 'Le due password non coincidono'; return; }
    const btn = ev.submitter; btn.disabled = true;
    try {
      if (rec) { await API.recuperaPassword(email); app.querySelector('.scheda').innerHTML = '<p>📧 Ti abbiamo inviato un\'email con il link per scegliere una nuova password.</p>'; return; }
      if (reg) {
        const r = await API.registrati(email, pw);
        if (r.conferma) { app.querySelector('.scheda').innerHTML = `<p>📧 Quasi fatto! Ti abbiamo inviato un'email a <b>${esc(email)}</b>.</p><p>Apri il link per confermare l'account, poi torna qui e accedi.</p>`; return; }
      } else await API.accedi(email, pw);
      await caricaUtente();
      location.hash = S.profilo ? '#/eventi' : '#/tessera';
    } catch (e) { err.textContent = traduci(e.message); }
    finally { if (btn.isConnected) btn.disabled = false; }
  };
}
function vistaNuovaPassword() {
  app.innerHTML = `<h1>Nuova password</h1><div class="scheda"><form id="f-np">
    <div class="campo"><label for="np">Nuova password</label><input id="np" type="password" minlength="6" required autocomplete="new-password"></div>
    <p class="errore" id="np-err"></p><button class="btn pieno">Salva</button></form></div>`;
  $('#f-np').onsubmit = async ev => {
    ev.preventDefault();
    if (await esegui(ev.submitter, () => API.nuovaPassword($('#np').value), 'Password aggiornata ✓')) location.hash = '#/eventi';
  };
}
function contattiClub() {
  if (!CFG.emailClub && !CFG.telefonoClub) return '';
  return `<div class="scheda"><h3>Contatti del club</h3>
    ${CFG.emailClub ? `<p>✉️ <a href="mailto:${esc(CFG.emailClub)}">${esc(CFG.emailClub)}</a></p>` : ''}
    ${CFG.telefonoClub ? `<p>📞 <a href="tel:${esc(CFG.telefonoClub.replace(/\s/g, ''))}">${esc(CFG.telefonoClub)}</a></p>` : ''}</div>`;
}

/* ---------- installazione come app ---------- */
let promptInstalla = null;
const installata = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalla = e; $('#btn-installa').hidden = false; });
window.addEventListener('appinstalled', () => { $('#btn-installa').hidden = true; avviso('App installata ✓'); });
function installa() {
  if (promptInstalla) { promptInstalla.prompt(); promptInstalla.userChoice.finally(() => { promptInstalla = null; }); return; }
  const d = $('#dialogo');
  d.innerHTML = isIOS()
    ? `<h3>Installa su iPhone</h3><ol><li>Apri questa pagina con <b>Safari</b></li><li>Tocca il tasto <b>Condividi</b> (il quadrato con la freccia ↑)</li><li>Scegli <b>Aggiungi alla schermata Home</b></li><li>Tocca <b>Aggiungi</b></li></ol><div class="bottoni-d"><button class="btn">Ho capito</button></div>`
    : `<h3>Installa su Android</h3><ol><li>Apri questa pagina con <b>Chrome</b></li><li>Tocca i <b>tre puntini</b> in alto a destra</li><li>Scegli <b>Installa app</b> (o <b>Aggiungi a schermata Home</b>)</li></ol><div class="bottoni-d"><button class="btn">Ho capito</button></div>`;
  $('button', d).onclick = () => d.close();
  d.showModal();
}
function bloccoInstalla() {
  if (installata()) return '';
  return `<div class="scheda"><h3>📲 Usala come un'app</h3><p class="nota">Aggiungi lo Sci Club Taino alla schermata del telefono: si apre a schermo intero, con la sua icona.</p>
    <button class="btn nero pieno" id="b-installa2">Installa l'app</button></div>`;
}
function collegaInstalla() { const b = $('#b-installa2'); if (b) b.onclick = installa; }
$('#btn-installa').onclick = installa;
if (!installata() && isIOS()) $('#btn-installa').hidden = false;

/* =====================================================================
   GESTIONE (amministratori)
   ===================================================================== */
function tabAdmin(att) {
  return `<h1>Gestione</h1><nav class="schede-tab">
    <a href="#/admin" class="${att === 'eventi' ? 'attivo' : ''}">🎿 Eventi</a>
    <a href="#/admin/soci" class="${att === 'soci' ? 'attivo' : ''}">🪪 Soci</a>
    <a href="#/admin/team" class="${att === 'team' ? 'attivo' : ''}">🛠️ Amministratori</a></nav>`;
}
async function vistaAdmin(sez, id) {
  if (!sez) return adminEventi();
  if (sez === 'evento') return adminFormEvento(id);
  if (sez === 'iscritti') return adminIscritti(id);
  if (sez === 'soci') return adminSoci(id);
  if (sez === 'team') return adminTeam();
  location.hash = '#/admin';
}

async function adminEventi() {
  S.eventi = await API.eventi();
  const ora = Date.now();
  const futuri = S.eventi.filter(e => new Date(e.rientro || e.partenza) >= ora);
  const passati = S.eventi.filter(e => new Date(e.rientro || e.partenza) < ora).reverse();
  const riga = e => `<div class="riga-lista"><div class="info"><b>${esc(e.titolo)}</b>
      <small>${esc(fmtGiorno(e.partenza))} · ${e.iscritti}/${e.posti} iscritti · ${Date.now() > new Date(e.chiusura) ? 'iscrizioni chiuse' : 'chiusura ' + esc(fmtDataOra(e.chiusura))}</small></div>
      <div class="bottoni"><a class="btn piccolo" href="#/admin/iscritti/${e.id}">Iscritti</a><a class="btn sec piccolo" href="#/admin/evento/${e.id}">Modifica</a></div></div>`;
  app.innerHTML = `${tabAdmin('eventi')}
    <a class="btn pieno" href="#/admin/evento/nuovo" style="margin-bottom:16px">＋ Nuovo evento</a>
    <div class="scheda"><h3>In programma</h3>${futuri.length ? futuri.map(riga).join('') : '<p class="nota">Nessun evento in programma.</p>'}</div>
    ${passati.length ? `<details class="scheda"><summary><b>Eventi passati (${passati.length})</b></summary>${passati.map(riga).join('')}</details>` : ''}`;
}

function campoLuogo(pref, etichetta, nome, lat, lon, aiuto) {
  return `<div class="campo"><label for="${pref}-q">${etichetta}</label>
    <div class="cerca-luogo"><input id="${pref}-q" value="${esc(nome)}" required placeholder="Scrivi e premi Cerca">
    <button type="button" class="btn nero piccolo" data-cerca="${pref}">Cerca</button></div>
    <input type="hidden" id="${pref}-lat" value="${lat ?? ''}"><input type="hidden" id="${pref}-lon" value="${lon ?? ''}">
    <div class="risultati" id="${pref}-ris"></div>
    <div class="scelto" id="${pref}-ok">${lat ? '✓ Posizione sulla mappa impostata' : ''}</div>
    ${aiuto ? `<div class="legenda">${aiuto}</div>` : ''}</div>`;
}
function collegaLuoghi() {
  $$('[data-cerca]').forEach(b => b.onclick = async () => {
    const pref = b.dataset.cerca, q = $(`#${pref}-q`).value.trim(), ris = $(`#${pref}-ris`);
    if (q.length < 3) { ris.innerHTML = '<p class="nota">Scrivi almeno 3 lettere</p>'; return; }
    ris.innerHTML = '<p class="nota">Cerco…</p>';
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=it&countrycodes=it,ch,fr,at&q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (!j.length) { ris.innerHTML = '<p class="nota">Nessun risultato: prova con il nome del paese.</p>'; return; }
      ris.innerHTML = j.map((x, i) => `<button type="button" data-i="${i}">📍 ${esc(x.display_name)}</button>`).join('');
      $$('button', ris).forEach(bt => bt.onclick = () => {
        const x = j[bt.dataset.i];
        $(`#${pref}-lat`).value = (+x.lat).toFixed(5); $(`#${pref}-lon`).value = (+x.lon).toFixed(5);
        if (!$(`#${pref}-q`).dataset.toccato) $(`#${pref}-q`).value = x.name || x.display_name.split(',')[0];
        $(`#${pref}-ok`).textContent = '✓ ' + x.display_name.split(',').slice(0, 3).join(',');
        ris.innerHTML = '';
      });
    } catch (e) { ris.innerHTML = '<p class="nota">Ricerca non disponibile, riprova.</p>'; }
  });
  $$('.cerca-luogo input').forEach(i => i.addEventListener('input', () => {
    const pref = i.id.replace('-q', ''); $(`#${pref}-lat`).value = ''; $(`#${pref}-lon`).value = ''; $(`#${pref}-ok`).textContent = '';
  }));
}

async function adminFormEvento(id) {
  let e = null;
  if (id && id !== 'nuovo') { S.eventi = await API.eventi(); e = S.eventi.find(x => x.id === id); if (!e) { location.hash = '#/admin'; return; } }
  let ultimo = null; try { ultimo = JSON.parse(localStorage.getItem('sct-ultimo-ritrovo')); } catch (er) { /* */ }
  const rit = e ? { nome: e.ritrovo_luogo, lat: e.ritrovo_lat, lon: e.ritrovo_lon } : (ultimo || CFG.ritrovoPredefinito || { nome: '' });
  const domani = new Date(Date.now() + 7 * 864e5).toISOString();
  const d = e ? dataInput(e.partenza) : dataInput(domani);
  const chiusuraDef = e ? e.chiusura : (() => { const x = new Date(d + 'T20:00'); x.setDate(x.getDate() - 2); return x.toISOString(); })();
  app.innerHTML = `<a class="indietro" href="#/admin">← Gestione eventi</a><h1>${e ? 'Modifica evento' : 'Nuovo evento'}</h1>
  <form id="f-ev" class="scheda">
    <div class="campo"><label for="e-titolo">Titolo</label><input id="e-titolo" required maxlength="120" value="${esc(e?.titolo)}" placeholder="Es. Domenica a Cervinia"></div>
    ${campoLuogo('e-dest', 'Ski area / destinazione', e?.destinazione || '', e?.dest_lat, e?.dest_lon, 'Premi Cerca e scegli il risultato giusto: serve per mappa, tempi di viaggio e meteo.')}
    <div class="campo"><label for="e-data">Data dell'evento</label><input id="e-data" type="date" required value="${d}"></div>
    <div class="riga3">
      <div class="campo"><label for="e-ritrovo">Ritrovo entro</label><input id="e-ritrovo" type="time" required value="${e ? oraInput(e.ritrovo_entro) : '05:45'}"></div>
      <div class="campo"><label for="e-partenza">Partenza</label><input id="e-partenza" type="time" required value="${e ? oraInput(e.partenza) : '06:00'}"></div>
      <div class="campo"><label for="e-rientro">Rientro</label><input id="e-rientro" type="time" value="${e?.rientro ? oraInput(e.rientro) : '19:30'}"></div>
    </div>
    ${campoLuogo('e-rit', 'Luogo di ritrovo', rit.nome || '', rit.lat, rit.lon, 'Ricordo l\'ultimo luogo usato per i prossimi eventi.')}
    <div class="riga">
      <div class="campo"><label for="e-mezzo">Mezzo</label><select id="e-mezzo">
        ${['pullman', 'minibus', 'auto'].map(m => `<option value="${m}" ${(e?.mezzo || 'pullman') === m ? 'selected' : ''}>${{ pullman: '🚌 Pullman', minibus: '🚐 Minibus', auto: '🚗 Auto' }[m]}</option>`).join('')}</select></div>
      <div class="campo"><label for="e-posti">Posti disponibili</label><input id="e-posti" type="number" min="1" max="1000" required value="${e?.posti || 50}" inputmode="numeric"></div>
    </div>
    <div class="campo"><label>Chiusura iscrizioni</label><div class="riga">
      <input id="e-ch-data" type="date" required value="${dataInput(chiusuraDef)}"><input id="e-ch-ora" type="time" required value="${oraInput(chiusuraDef)}"></div>
      <div class="legenda">Dopo questo momento nessuno può più iscriversi o cancellarsi dall'app.</div></div>
    <div class="campo"><label for="e-quota">Quota (facoltativa)</label><input id="e-quota" maxlength="200" value="${esc(e?.quota)}" placeholder="Es. Soci 45 € · non soci 55 €"></div>
    <div class="campo"><label for="e-sito">Link info ski area (facoltativo)</label><input id="e-sito" type="url" value="${esc(e?.sito_info)}" placeholder="https://…"></div>
    <div class="campo"><label for="e-desc">Descrizione e cosa portare (facoltativa)</label><textarea id="e-desc" maxlength="3000">${esc(e?.descrizione)}</textarea></div>
    <div class="campo"><label class="check"><input type="checkbox" id="e-soci" ${e ? (e.solo_soci ? 'checked' : '') : 'checked'}><span>Riservato ai soci con tessera attiva</span></label></div>
    <p class="errore" id="e-err"></p>
    <button class="btn pieno">${e ? 'Salva modifiche' : 'Pubblica evento'}</button>
    ${e ? '<button type="button" class="btn sec pieno" id="e-elimina" style="margin-top:10px">Elimina evento</button>' : ''}
  </form>`;
  collegaLuoghi();
  $('#e-data').onchange = () => { // sposta la chiusura di conseguenza sui nuovi eventi
    if (e) return; const x = new Date($('#e-data').value + 'T20:00'); x.setDate(x.getDate() - 2); $('#e-ch-data').value = dataInput(x.toISOString());
  };
  $('#f-ev').onsubmit = async ev => {
    ev.preventDefault();
    const err = $('#e-err'); err.textContent = '';
    const data = $('#e-data').value;
    const ritrovo = componi(data, $('#e-ritrovo').value), partenza = componi(data, $('#e-partenza').value);
    let rientro = $('#e-rientro').value ? componi(data, $('#e-rientro').value) : null;
    if (rientro && rientro <= partenza) rientro = new Date(rientro.getTime() + 864e5); // rientro dopo mezzanotte
    const chiusura = componi($('#e-ch-data').value, $('#e-ch-ora').value);
    if (ritrovo > partenza) { err.textContent = 'L\'orario di ritrovo deve essere prima della partenza'; return; }
    if (chiusura > ritrovo) { err.textContent = 'La chiusura delle iscrizioni deve essere prima del ritrovo'; return; }
    const num = v => v === '' ? null : +v;
    const dati = {
      titolo: $('#e-titolo').value.trim(), destinazione: $('#e-dest-q').value.trim(),
      dest_lat: num($('#e-dest-lat').value), dest_lon: num($('#e-dest-lon').value),
      ritrovo_luogo: $('#e-rit-q').value.trim(), ritrovo_lat: num($('#e-rit-lat').value), ritrovo_lon: num($('#e-rit-lon').value),
      ritrovo_entro: ritrovo.toISOString(), partenza: partenza.toISOString(), rientro: rientro ? rientro.toISOString() : null,
      mezzo: $('#e-mezzo').value, posti: +$('#e-posti').value, chiusura: chiusura.toISOString(),
      quota: $('#e-quota').value.trim() || null, sito_info: $('#e-sito').value.trim() || null,
      descrizione: $('#e-desc').value.trim() || null, solo_soci: $('#e-soci').checked
    };
    if (e && dati.posti < e.iscritti) { err.textContent = `Ci sono già ${e.iscritti} iscritti: i posti non possono essere meno`; return; }
    if (!dati.dest_lat && !await conferma('Ski area senza posizione', 'Non hai scelto la destinazione dai risultati di ricerca: mappa, tempi di viaggio e meteo non saranno disponibili. Pubblico lo stesso?', 'Pubblica')) return;
    if (e) dati.id = e.id;
    if (await esegui(ev.submitter, () => API.salvaEvento(dati), e ? 'Evento aggiornato ✓' : 'Evento pubblicato ✓')) {
      try { localStorage.setItem('sct-ultimo-ritrovo', JSON.stringify({ nome: dati.ritrovo_luogo, lat: dati.ritrovo_lat, lon: dati.ritrovo_lon })); } catch (er) { /* */ }
      location.hash = '#/admin';
    }
  };
  if ($('#e-elimina')) $('#e-elimina').onclick = async () => {
    if (await conferma('Eliminare l\'evento?', `Verranno cancellate anche le <b>${e.iscritti}</b> iscrizioni. Non si può annullare.`, 'Elimina', 'nero')
      && await esegui($('#e-elimina'), () => API.eliminaEvento(e.id), 'Evento eliminato')) location.hash = '#/admin';
  };
}

async function adminIscritti(id) {
  S.eventi = await API.eventi();
  const e = S.eventi.find(x => x.id === id); if (!e) { location.hash = '#/admin'; return; }
  const lista = await API.iscritti(id);
  const testo = `${e.titolo} — ${fmtGiorno(e.partenza)}\nRitrovo entro ${fmtOra(e.ritrovo_entro)} · ${e.ritrovo_luogo}\n\n` +
    lista.map((i, k) => `${k + 1}. ${i.profilo?.cognome || ''} ${i.profilo?.nome || ''}${i.profilo?.telefono ? ' · ' + i.profilo.telefono : ''}`).join('\n');
  app.innerHTML = `<a class="indietro" href="#/admin">← Gestione eventi</a>
    <h1 style="font-size:1.7rem;text-transform:none">${esc(e.titolo)}</h1>
    <p class="nota">${esc(fmtGiorno(e.partenza))} · ${esc(e.destinazione)}</p>
    <article class="evento">${bloccoPosti(e)}</article>
    <div class="scheda"><div class="sezione-titolo" style="margin-top:0"><h3>Iscritti (${lista.length})</h3>
      <button class="btn sec piccolo" id="b-copia">📋 Copia elenco</button></div>
      ${lista.length ? lista.map((i, k) => `<div class="riga-lista"><div class="info"><b>${k + 1}. ${esc(i.profilo?.cognome)} ${esc(i.profilo?.nome)}</b>
        <small>${i.profilo?.telefono ? `<a href="tel:${esc(i.profilo.telefono.replace(/\s/g, ''))}">${esc(i.profilo.telefono)}</a> · ` : ''}iscritto ${esc(fmtDataOra(i.creato))}${i.note ? ' · ' + esc(i.note) : ''}</small></div>
        <div class="bottoni"><button class="btn sec piccolo" data-togli="${i.id}">Togli</button></div></div>`).join('') : '<p class="nota">Ancora nessun iscritto.</p>'}
    </div>`;
  $('#b-copia').onclick = async () => { try { await navigator.clipboard.writeText(testo); avviso('Elenco copiato: incollalo su WhatsApp o in una email'); } catch (er) { avviso('Copia non riuscita', true); } };
  $$('[data-togli]').forEach(b => b.onclick = async () => {
    if (await conferma('Togliere questa iscrizione?', 'Il posto tornerà libero.', 'Togli', 'nero') &&
      await esegui(b, () => API.eliminaIscrizione(b.dataset.togli), 'Iscrizione tolta')) adminIscritti(id);
  });
}

let filtroSoci = 'tutti';
async function adminSoci() {
  const soci = await API.soci();
  const oggi = oggiISO();
  const arricchiti = soci.map(s => ({ ...s, st: statoTessera(s.tesseramenti) }));
  const conta = c => arricchiti.filter(s => c === 'tutti' || (c === 'in_attesa' ? (s.st.codice === 'in_attesa' || s.st.inAttesa) : s.st.codice === c)).length;
  const filtrati = arricchiti.filter(s => filtroSoci === 'tutti' || (filtroSoci === 'in_attesa' ? (s.st.codice === 'in_attesa' || s.st.inAttesa) :
    filtroSoci === 'scaduta' ? ['scaduta', 'nessuna', 'rifiutata'].includes(s.st.codice) : s.st.codice === filtroSoci))
    .sort((a, b) => (a.cognome || '').localeCompare(b.cognome || '', 'it'));
  const scheda = s => {
    const st = s.st, t = st.t || {};
    const attesa = st.codice === 'in_attesa' ? st.t : st.inAttesa;
    let righe = '';
    if (st.codice === 'attiva' || st.codice === 'scaduta') righe += `<small>Iscrizione ${fmtDataSemplice(t.data_iscrizione)} → scadenza <b>${fmtDataSemplice(t.scadenza)}</b>${st.codice === 'attiva' ? ` (${st.giorni} gg)` : ''}</small>`;
    if (attesa) righe += `<small>📩 Richiesta del ${fmtDataSemplice(attesa.richiesto.slice(0, 10))}${attesa.note ? ' — “' + esc(attesa.note) + '”' : ''}</small>`;
    return `<div class="riga-lista"><div class="info"><b>${esc(s.cognome)} ${esc(s.nome)} <span class="stato ${st.codice}" style="margin:0 0 0 4px;font-size:.7rem">${NOMI_STATO[st.codice]}</span></b>
      <small>${esc(s.email || '')}${s.telefono ? ' · ' + esc(s.telefono) : ''}${s.data_nascita ? ' · nato/a ' + fmtDataSemplice(s.data_nascita) : ''}</small>${righe}</div>
      <div class="bottoni">${attesa ? `<button class="btn verde piccolo" data-conferma="${attesa.id}" data-socio="${s.user_id}">Conferma</button>` : ''}
      ${(st.codice === 'attiva' || st.codice === 'scaduta') && !attesa ? `<button class="btn sec piccolo" data-modifica="${t.id}" data-socio="${s.user_id}">Date</button>` : ''}
      ${!attesa && st.codice !== 'attiva' ? `<button class="btn piccolo" data-nuova="${s.user_id}">Iscrivi</button>` : ''}</div></div>`;
  };
  app.innerHTML = `${tabAdmin('soci')}
    <div class="contatori">
      ${[['tutti', 'Tutti'], ['attiva', 'Attivi'], ['in_attesa', 'Da confermare'], ['scaduta', 'Non attivi']].map(([k, n]) =>
        `<button data-filtro="${k}" class="${filtroSoci === k ? 'attivo' : ''}"><b>${k === 'scaduta' ? arricchiti.filter(s => ['scaduta', 'nessuna', 'rifiutata'].includes(s.st.codice)).length : conta(k)}</b><span>${n}</span></button>`).join('')}
    </div>
    <div class="campo"><input id="cerca-soci" placeholder="🔎 Cerca per nome, email o telefono"></div>
    <div class="scheda" id="lista-soci">${filtrati.length ? filtrati.map(scheda).join('') : '<p class="nota">Nessun socio in questo elenco.</p>'}</div>
    <p class="nota">Oggi: ${fmtDataSemplice(oggi)}. Per i soci che non hanno ancora un account, chiedi di registrarsi dall'app.</p>`;
  $$('[data-filtro]').forEach(b => b.onclick = () => { filtroSoci = b.dataset.filtro; adminSoci(); });
  $('#cerca-soci').oninput = ev => {
    const q = ev.target.value.toLowerCase();
    $$('#lista-soci .riga-lista').forEach(r => { r.hidden = q && !r.textContent.toLowerCase().includes(q); });
  };
  const dialogoDate = (titolo, da, a, testoOk, extra = '', conRifiuta = false) => new Promise(res => {
    const d = $('#dialogo');
    d.innerHTML = `<h3>${esc(titolo)}</h3>${extra}<div class="campo"><label for="d-da">Data di iscrizione</label><input id="d-da" type="date" value="${da}"></div>
      <div class="campo"><label for="d-a">Scadenza</label><input id="d-a" type="date" value="${a}"></div>
      <p class="legenda">La scadenza si calcola da sola (${MESI_TESS} mesi) quando cambi la data di iscrizione.</p>
      <div class="bottoni-d"><button class="btn sec" value="no">Annulla</button>${conRifiuta ? '<button class="btn nero" value="rifiuta">Rifiuta</button>' : ''}<button class="btn verde" value="si">${esc(testoOk)}</button></div>`;
    $('#d-da').onchange = () => { if ($('#d-da').value) $('#d-a').value = aggiungiMesi($('#d-da').value, MESI_TESS); };
    $$('.bottoni-d button', d).forEach(b => b.onclick = () => { const v = { da: $('#d-da').value, a: $('#d-a').value }; d.close(); res(b.value === 'si' ? v : b.value === 'rifiuta' ? { rifiuta: true } : null); });
    d.oncancel = () => res(null);
    d.showModal();
  });
  const inizioDopo = s => { // il rinnovo parte dal giorno dopo la scadenza se la tessera è ancora valida
    const st = statoTessera(s.tesseramenti);
    if (st.codice === 'attiva' && st.t.scadenza >= oggi) { const x = new Date(st.t.scadenza + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }
    return oggi;
  };
  $$('[data-conferma]').forEach(b => b.onclick = async () => {
    const s = soci.find(x => x.user_id === b.dataset.socio); const da = inizioDopo(s);
    const v = await dialogoDate(`Conferma ${s.nome} ${s.cognome}`, da, aggiungiMesi(da, MESI_TESS), 'Conferma iscrizione',
      '<p class="nota">Conferma dopo aver ricevuto la quota.</p>', true);
    if (v && v.rifiuta) {
      if (await conferma('Rifiutare la richiesta?', 'Il socio la vedrà come non accettata e potrà inviarne una nuova.', 'Rifiuta', 'nero') &&
        await esegui(b, () => API.aggiornaTesseramento(b.dataset.conferma, { stato: 'rifiutata' }), 'Richiesta rifiutata')) adminSoci();
      return;
    }
    if (v && v.da && v.a) { if (await esegui(b, () => API.aggiornaTesseramento(b.dataset.conferma, { stato: 'attiva', data_iscrizione: v.da, scadenza: v.a }), 'Tesseramento confermato ✓')) adminSoci(); }
  });
  $$('[data-modifica]').forEach(b => b.onclick = async () => {
    const s = soci.find(x => x.user_id === b.dataset.socio); const t = s.tesseramenti.find(x => x.id === b.dataset.modifica);
    const v = await dialogoDate(`Date di ${s.nome} ${s.cognome}`, t.data_iscrizione, t.scadenza, 'Salva');
    if (v && v.da && v.a) { if (await esegui(b, () => API.aggiornaTesseramento(t.id, { data_iscrizione: v.da, scadenza: v.a }), 'Date aggiornate ✓')) adminSoci(); }
  });
  $$('[data-nuova]').forEach(b => b.onclick = async () => {
    const s = soci.find(x => x.user_id === b.dataset.nuova);
    const v = await dialogoDate(`Iscrivi ${s.nome} ${s.cognome}`, oggi, aggiungiMesi(oggi, MESI_TESS), 'Iscrivi');
    if (v && v.da && v.a) { if (await esegui(b, () => API.creaTesseramento(s.user_id, { stato: 'attiva', data_iscrizione: v.da, scadenza: v.a }), 'Socio iscritto ✓')) adminSoci(); }
  });
}

async function adminTeam() {
  const lista = await API.elencoAdmin();
  app.innerHTML = `${tabAdmin('team')}
    <div class="scheda"><h3>Amministratori</h3>
      ${lista.map(a => `<div class="riga-lista"><div class="info"><b>${esc(a.email)}</b>${a.user_id === S.utente.id ? '<small>Sei tu</small>' : ''}</div>
      ${a.user_id === S.utente.id ? '' : `<div class="bottoni"><button class="btn sec piccolo" data-rimuovi="${a.user_id}">Rimuovi</button></div>`}</div>`).join('')}
    </div>
    <form class="scheda" id="f-admin"><h3>Aggiungi un amministratore</h3>
      <p class="nota">La persona deve prima creare il suo account nell'app con questa email.</p>
      <div class="campo"><input id="adm-email" type="email" required placeholder="email@esempio.it"></div>
      <button class="btn pieno">Aggiungi</button></form>`;
  $('#f-admin').onsubmit = async ev => {
    ev.preventDefault();
    if (await esegui(ev.submitter, () => API.aggiungiAdmin($('#adm-email').value.trim()), 'Amministratore aggiunto ✓')) adminTeam();
  };
  $$('[data-rimuovi]').forEach(b => b.onclick = async () => {
    if (await conferma('Rimuovere questo amministratore?', 'Non potrà più gestire eventi e soci.', 'Rimuovi', 'nero') &&
      await esegui(b, () => API.rimuoviAdmin(b.dataset.rimuovi), 'Rimosso')) adminTeam();
  });
}

/* =====================================================================
   AVVIO
   ===================================================================== */
(async function avvio() {
  if (DEMO) $('#banner-demo').hidden = false;
  try { await API.init(); } catch (e) { avviso(traduci(e.message), true); }
  API.onAuth(async () => { await caricaUtente(); mostra(); });
  await caricaUtente();
  await mostra();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
