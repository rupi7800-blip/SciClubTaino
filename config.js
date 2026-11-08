// =====================================================================
//  SCI CLUB TAINO · impostazioni dell'app
//  Finché i due campi Supabase sono vuoti, l'app funziona in
//  "modalità prova": i dati restano solo sul telefono che la usa.
// =====================================================================
window.SCT_CONFIG = {
  // Da Supabase → Project Settings → API (o "Connect")
  supabaseUrl: '',        // es. 'https://abcdefgh.supabase.co'
  supabaseAnonKey: '',    // la chiave "anon public" (o "publishable")

  // Durata del tesseramento proposta all'amministratore quando conferma
  durataTesseramentoMesi: 12,

  // Luogo di ritrovo proposto quando si crea un nuovo evento
  ritrovoPredefinito: { nome: 'Taino (VA)', lat: 45.767, lon: 8.617 },

  // Contatti mostrati nell'app (lascia vuoto per non mostrarli)
  emailClub: '',
  telefonoClub: ''
};
