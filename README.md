# Sci Club Taino · app dei soci

Web app installabile sul telefono (Android e iPhone) per:

- **tesseramento annuale**: il socio lo chiede dall'app, l'amministratore lo conferma; entrambi vedono data di iscrizione e scadenza;
- **eventi**: gli amministratori li pubblicano dall'app, i soci si iscrivono con un tocco;
- **posti liberi** sempre aggiornati e **conto alla rovescia** alla chiusura delle iscrizioni;
- **orari evidenziati**: ritrovo entro (orario limite), partenza, rientro previsto;
- **info utili** per ogni evento: percorso sulla mappa con tempi ipotetici, meteo sulla ski area, link.
- **corso di sci a Pila**: 4 domeniche (ultime 2 di gennaio, prime 2 di febbraio), 100 posti con contatore e conto alla rovescia, spiegazione del corso, **questionario** che suggerisce il livello, iscrizione con scelta del livello (anche per figli e familiari), elenco iscritti diviso per livello per gli amministratori.

Finché Supabase non è collegato l'app gira in **modalità prova** con dati di esempio salvati solo sul telefono.

---

## Come attivarla davvero (una volta sola, ~15 minuti)

### 1. Crea il database su Supabase
1. Vai su **supabase.com** → *Start your project* → accedi con GitHub.
2. *New project* → nome `sci-club-taino`, scegli una password (salvala), regione **Central EU (Frankfurt)** → *Create*.
3. Menu a sinistra **SQL Editor** → *New query* → incolla tutto il contenuto del file `supabase-setup.sql` → **Run**. Deve comparire *Success*.

### 2. Imposta l'indirizzo dell'app per le email
**Authentication → URL Configuration**:
- *Site URL*: `https://rupi7800-blip.github.io/SciClubTaino/`
- *Redirect URLs*: aggiungi lo stesso indirizzo.

### 3. Collega l'app
1. Su Supabase: **Project Settings → API** (o il pulsante *Connect*). Copia **Project URL** e la chiave **anon public**.
2. Su GitHub apri `config.js` → matita ✏️ → incolla i due valori tra gli apici:
   ```js
   supabaseUrl: 'https://xxxx.supabase.co',
   supabaseAnonKey: 'eyJ...',
   ```
3. *Commit changes*. Dopo un minuto l'app è collegata (sparisce la striscia gialla "Modalità prova").

La chiave *anon* è fatta per stare nel sito: i dati sono protetti dalle regole del file SQL.

### 4. Diventa amministratore
1. Apri l'app → *Account* → **Registrati** con la tua email e conferma dal link ricevuto.
2. Su Supabase → **SQL Editor** → esegui (con la tua email):
   ```sql
   insert into public.amministratori (user_id)
   select id from auth.users where email = 'la-tua-email@esempio.it';
   ```
3. Riapri l'app: compare la sezione **Gestione**. Gli altri amministratori li aggiungi da lì.

---

## Installare l'app sul telefono
- **Android (Chrome)**: tasto *📲 Installa app* in alto, oppure ⋮ → *Installa app*.
- **iPhone (Safari)**: tasto Condividi ↑ → *Aggiungi alla schermata Home*.

Per pubblicarla su **Play Store / App Store** si può impacchettare questa stessa app con PWABuilder (passo successivo).

## File
| File | A cosa serve |
|---|---|
| `index.html`, `app.css`, `app.js` | l'app |
| `config.js` | collegamento a Supabase e impostazioni |
| `supabase-setup.sql` | tabelle e regole del database |
| `manifest.webmanifest`, `sw.js`, `icons/` | icona e installazione come app |

> **Aggiornamenti:** quando il file `supabase-setup.sql` cambia (es. aggiunta del corso), rieseguilo tutto nel SQL Editor: si può rilanciare senza perdere dati.
