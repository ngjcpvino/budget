/* =====================================================================
   LA FEUILLE GOOGLE (le serveur, Api.gs) : envoyer les changements, recevoir ceux de l'autre appareil
   - Enregistrer : le changement entre dans l'app, dans la mémoire de l'appareil et dans la file des envois (memoriser),
     puis part tout de suite. Sans réseau, il attend dans la file (« Hors ligne : sera envoyé plus tard. ») et repart seul :
     au retour du réseau, au retour dans l'app, et aux 30 secondes.
   - Recevoir : seulement ce qui a changé depuis le curseur (la dernière rangée du Journal vue par cet appareil).
     Une ligne qui attend encore son envoi garde la version de l'appareil.
   - La feuille vérifie tout et décide de la version (son heure à elle) : l'horloge de l'appareil ne compte pas.
   ===================================================================== */

const API_URL = window.BUDGET_API || 'https://script.google.com/macros/s/AKfycbwhcPGCW-l4odWfpw_DDBycANrEKn87DXGaiW2qlu62CT34C5vBT4lvq75aP5hS2p2ZIg/exec';

let cleAppareil = '';        // la clé de cet appareil (reçue une fois, avec un code de liaison)
let nomAppareil = '';        // « iPad », « Ordi » : ce que le Journal de la feuille note
let curseur = 0;             // la dernière rangée du Journal que l'appareil a vue
let generation = '';         // change quand toute la feuille doit être relue
let fileEnvois = [];         // les changements pas encore reçus par la feuille : { n, genre, objet | id, base }
let synchroEnCours = false, synchroARefaire = false, toutARelire = false, dernierChargement = 0, minuterieReessai = null;
let numeroEnvoi = 0;
let messageApres = '';       // un message à montrer une fois la synchronisation finie (un refus de la feuille)

/* Un appel au serveur → son résultat; une erreur : « reseau », « CLE:… », « CODE:… », « LIAISON:… » ou un texte */
async function appelServeur(action, data = {}, delai = 30000) {
  const controleur = new AbortController(), minuterie = setTimeout(() => controleur.abort(), delai);
  let reponse;
  try {
    reponse = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action, data, cle: cleAppareil, empreinte: code.e || '' }), signal: controleur.signal });
  } catch (e) {
    throw new Error('reseau');
  } finally {
    clearTimeout(minuterie);
  }
  let r;
  try { r = await reponse.json(); } catch (e) { throw new Error('reseau'); }
  if (!r.ok) throw new Error(r.erreur || 'Le serveur ne répond pas comme prévu.');
  return r.resultat;
}

/* ----- Enregistrer : dans l'app (déjà fait par l'appelant), dans l'appareil, dans la file; puis l'envoi -----
   changements : [{ genre: 'ligne' | 'creer', objet }, { genre: 'annuler', id }, { genre: 'modifier', id, objet (la nouvelle ligne) },
   { genre: 'rec', objet }, { genre: 'supprimerRec', id }]. Pour annuler et modifier, l'annulation (id + « ~a ») est déjà dans l'app */
function memoriser(changements, fermer = true) {
  if (fermer) changements = changements.concat(fermeturesDe(changements));
  const lignes = [], recurrentes = [], envois = [];
  changements.forEach(c => {
    const envoi = { n: Date.now() * 1000 + (numeroEnvoi++ % 1000), genre: c.genre };
    if (c.id) envoi.id = c.id;
    if (c.objet) envoi.objet = JSON.parse(JSON.stringify(c.objet));
    envois.push(envoi);
    if (c.genre === 'ligne' || c.genre === 'creer') lignes.push(c.objet);
    else if (c.genre === 'annuler' || c.genre === 'modifier') lignes.push(c.objet, donnees.ex.find(e => e.id === c.id + '~a'));
    else if (c.genre === 'rec') recurrentes.push(c.objet);
    else if (c.genre === 'supprimerRec') recurrentes.push(donnees.rec.find(r => r.id === c.id));
  });
  fileEnvois.push(...envois);
  ecrireMemoire({ lignes: lignes.filter(Boolean), recurrentes: recurrentes.filter(Boolean), envois });
  synchroniser();
}

/* ----- Une vieille année importée se ferme à zéro le 31 décembre (ses lignes « Fermeture AAAA ») : les années d'après ne bougent pas.
   La corriger (l'utilisateur, 2026-11-26 : « on a importé et je n'ai pas tout vérifié; si on modifie une année antérieure, elle s'auto balance au
   31 décembre ») : après un changement qui la touche, une ligne « Fermeture » de plus, le 31 décembre, ramène à zéro ce que la 2e personne
   doit à la 1re et chaque carte de crédit (rien ne s'efface : l'ajustement s'ajoute); puis les années fermées d'après, dans l'ordre.
   Les tiers et les placements suivent, comme avant. Une ligne de fermeture ne se modifie pas (editerEntree) ----- */
const estFermeture = id => /^imp\d{4}-fermeture/.test(id || '');
const anneesFermees = () => [...new Set(donnees.ex.map(e => (/^imp(\d{4})-fermeture/.exec(e.id) || [])[1]).filter(Boolean))].sort();
function fermeturesDe(changements) {
  const touches = changements.filter(c => ['ligne', 'creer', 'modifier', 'annuler'].includes(c.genre) && !estFermeture(c.objet ? c.objet.id : c.id));
  const dates = touches.flatMap(c => [c.objet && c.objet.d, c.id && (donnees.ex.find(e => e.id === c.id) || {}).d]);
  return touches.length ? fermer(dates, touches[0].objet ? touches[0].objet.id : touches[0].id) : [];
}
function fermer(dates, declencheur) {
  const fermees = anneesFermees(), touchees = dates.filter(Boolean).map(d => d.slice(0, 4)).filter(y => fermees.includes(y)).sort();
  if (!touchees.length) return [];
  const [N, J] = lesDeux(), t = Date.now(), changements = [], suite = String(declencheur).replace(/~a$/, '').slice(0, 40);
  const ajouter = (y, sorte, o) => {
    const base = 'imp' + y + '-fermeture-' + sorte + '-' + suite;
    let n = 1;
    while (donnees.ex.some(e => e.id === base + (n > 1 ? '-' + n : ''))) n++;
    const ligne = { d: y + '-12-31', desc: 'Fermeture ' + y, cat: '', env: '', mode: '', to: '', nz: 0, nzf: '', nz2: 0, nzf2: '', nz3: 0, nzf3: '', nb: '', ...o, id: base + (n > 1 ? '-' + n : ''), u: t };
    donnees.ex.push(ligne);
    changements.push({ genre: 'ligne', objet: ligne });
  };
  fermees.filter(y => y >= touchees[0]).forEach(y => {
    const lignes = lignesJusqua(y + '-12-31'), dette = auCent(soldes(lignes).solde);
    if (dette) ajouter(y, 'dette', dette > 0 ? { type: 'r', amt: dette, by: J, nzf: N } : { type: 'r', amt: -dette, by: N, nzf: J });
    donnees.modes.filter(m => m.k === 'p' && estPersonne(m.o)).forEach(m => {
      const cle = cleCompte(m), reste = auCent((+m.s || 0) + lignes.reduce((s, e) => s + montantPourCompte(e, cle), 0));
      if (!reste) return;
      // L'autre compte : celui de la fermeture de l'importation (son débit), sinon son 1er compte qui n'est pas une carte
      const avant = donnees.ex.find(e => e.d === y + '-12-31' && estFermeture(e.id) && e.type === 't' && (e.to === cle || e.mode === cle));
      const debit = donnees.modes.find(x => x.o === m.o && x.k !== 'p'), autre = avant ? (avant.to === cle ? avant.mode : avant.to) : debit ? cleCompte(debit) : '';
      // Ce qui reste à payer : la personne paie sa carte; payé en trop : la carte lui rend
      ajouter(y, 'carte-' + (m.o === N ? 'n' : 'j'), reste > 0 ? { type: 't', amt: reste, by: m.o, mode: autre, to: cle } : { type: 't', amt: -reste, by: m.o, mode: cle, to: autre });
    });
  });
  return changements;
}

/* Une ligne pas encore partie vers la feuille, supprimée : elle n'a jamais été écrite; elle sort de l'app, de l'appareil et de la file */
function oublierBrouillon(x) {
  const ns = fileEnvois.filter(e => !e.parti && e.objet && e.objet.id === x.id).map(e => e.n);
  fileEnvois = fileEnvois.filter(e => !ns.includes(e.n));
  donnees.ex = donnees.ex.filter(e => e !== x);
  ecrireMemoire({ retirer: ns, effacer: [x.id] });
}

/* Les Réglages ont changé (une catégorie, un tiers, un compte…) : ils partent d'un bloc, avec la version lue (base).
   Un seul envoi des Réglages attend à la fois : le plus récent remplace les autres */
function changerReglages() {
  donnees.cats.sort((x, y) => x.localeCompare(y, 'fr', { sensitivity: 'base' }));
  trierComptes();
  const vieux = fileEnvois.filter(e => e.genre === 'cfg' && !e.parti).map(e => e.n);
  fileEnvois = fileEnvois.filter(e => !vieux.includes(e.n));
  const envoi = { n: Date.now() * 1000 + (numeroEnvoi++ % 1000), genre: 'cfg', objet: JSON.parse(JSON.stringify(configuration())), base: donnees.cu || 0 };
  fileEnvois.push(envoi);
  ecrireMemoire({ etat: { reglages: { ...configuration(), u: donnees.cu || 0 } }, envois: [envoi], retirer: vieux });
  synchroniser();
}
function configuration() {
  return { p: donnees.p, cats: donnees.cats, tiers: donnees.tiers, modes: donnees.modes, ic: donnees.ic || {}, cc: donnees.cc || {}, gone: donnees.gone || [], yrs: donnees.yrs || [], env: donnees.env || [] };
}

/* ----- Les messages au centre de l'écran (la règle commune « un message se voit »; l'utilisateur, 2026-11-27, choix 4 sur l'aperçu) -----
   Par-dessus tout, avec son symbole (dans le style) : ⚠️ une erreur, ✅ une bonne nouvelle (bon). Il part tout seul après quelques
   secondes (plus longtemps pour un long texte) ou quand on le touche; un nouveau remplace celui qui est là.
   Tout ce qui n'est pas une bonne nouvelle va aussi au journal des erreurs (noterErreur) */
let minuterieMessage = null;
const dureeMessage = texte => Math.min(3000 + 50 * texte.length, 8000);
function afficherMessage(texte, bon = false) {
  const x = trouver('#message');
  texte = String(texte);
  x.textContent = texte;
  x.classList.toggle('bon', bon);
  x.classList.add('ouvert');
  clearTimeout(minuterieMessage);
  minuterieMessage = setTimeout(fermerMessage, dureeMessage(texte));
  if (!bon) noterErreur(texte);
}
function fermerMessage() {
  clearTimeout(minuterieMessage);
  trouver('#message').classList.remove('ouvert');
}

/* Ce qui attend la feuille (l'utilisateur, 2026-11-27, choix 1 : le calme) : rien pendant la lecture et l'envoi. Un envoi qui ne passe pas :
   le message au centre une fois, puis la petite bande sous l'en-tête (« Hors ligne : sera envoyé plus tard. ») tant que la file n'est pas partie */
function montrerAttente(oui) {
  trouver('#attente').classList.toggle('ouvert', oui);
}
const enAttenteAffichee = () => trouver('#attente').classList.contains('ouvert');

/* ----- Le journal des erreurs (l'utilisateur, 2026-11-27 : « Les deux ») : gardé dans l'appareil, les 100 dernières (Plus → Erreurs),
   et envoyé avec le prochain appel à la feuille (son onglet « Erreurs »; la feuille ne garde jamais deux fois la même) ----- */
const ERREURS_GARDEES = 100;
let erreurs = [];            // la plus récente en premier : { id, t (l'heure de l'appareil), texte, envoyee }
function noterErreur(texte) {
  erreurs = [{ id: nouvelId(), t: Date.now(), texte: texte.slice(0, 300) }, ...erreurs].slice(0, ERREURS_GARDEES);
  ecrireMemoire({ etat: { erreurs } });
  if (vue === 'err' && !verrou) afficher();
}
/* Les erreurs pas encore envoyées partent avec l'appel (data); la feuille dit si elle les a notées */
function avecErreurs(data) {
  const parties = erreurs.filter(x => !x.envoyee);
  return parties.length ? { ...data, erreurs: parties.map(({ id, t, texte }) => ({ id, t, texte })), appareil: nomAppareil || deviner() } : data;
}
function erreursNotees(data, r) {
  if (!data.erreurs || !r || !r.erreursNotees) return;
  const ids = new Set(data.erreurs.map(x => x.id));
  erreurs.forEach(x => { if (ids.has(x.id)) x.envoyee = true; });
  ecrireMemoire({ etat: { erreurs } });
}

/* ----- Synchroniser : envoyer la file, recevoir ce qui a changé (ou tout relire) ----- */
async function synchroniser({ tout = false } = {}) {
  if (tout) toutARelire = true;
  if (verrou || !cleAppareil) return;
  if (synchroEnCours) { synchroARefaire = true; return; }
  synchroEnCours = true;
  synchroARefaire = false;
  clearTimeout(minuterieReessai);
  dernierChargement = Date.now();
  let echec = false;
  try {
    if (toutARelire || lecture || !generation) {
      if (lecture === 'echec') { lecture = 'attente'; afficher(); }
      const data = avecErreurs({}), r = await appelServeur('lire', data, 90000);
      erreursNotees(data, r);
      toutARelire = false;
      await appliquerTout(r);
    } else if (fileEnvois.length) {
      const lot = fileEnvois.slice();
      lot.forEach(e => { e.parti = true; });
      const data = avecErreurs({ changements: lot.map(({ n, parti, ...reste }) => reste), curseur, appareil: nomAppareil });
      const r = await appelServeur('ecrire', data);
      erreursNotees(data, r);
      fileEnvois = fileEnvois.filter(e => !lot.includes(e));
      await appliquerReponse(r, lot.map(e => e.n));
    } else {
      const data = avecErreurs({ curseur, generation }), r = await appelServeur('changements', data);
      erreursNotees(data, r);
      if (r.complet) await appliquerTout(r); else await appliquerReponse(r, []);
    }
    lecture = '';
    genererRecurrentes();
    attribuerCouleurs();
    montrerAttente(false);
    afficher();
    if (messageApres && !toutARelire) { afficherMessage(messageApres); messageApres = ''; }
  } catch (e) {
    echec = true;
    fileEnvois.forEach(x => { delete x.parti; });
    if (erreurCle(e) || erreurCode(e)) return;
    if (lecture) { lecture = 'echec'; afficher(); }
    /* Rien n'attend : sans réseau, rien à dire; une autre panne se dit. Quelque chose attend : dit une fois, puis la bande reste */
    const panne = e.message === 'reseau' ? 'Hors ligne : sera envoyé plus tard.' : 'Connexion impossible : ' + e.message;
    if (!fileEnvois.length) { if (e.message !== 'reseau') afficherMessage(panne); }
    else if (!enAttenteAffichee()) { afficherMessage(panne); montrerAttente(true); }
  } finally {
    synchroEnCours = false;
    if (!echec && (synchroARefaire || fileEnvois.length || toutARelire)) synchroniser();
    else if (fileEnvois.length) minuterieReessai = setTimeout(synchroniser, 30000);
  }
}

/* Actualiser (Plus) et Réessayer : tout relire */
function actualiser() {
  synchroniser({ tout: true });
}

/* Les identifiants des changements qui attendent encore (leur version de l'appareil gagne sur celle qui arrive) */
function enAttente() {
  const s = new Set();
  fileEnvois.forEach(e => {
    if (e.genre === 'cfg') return;
    /* Annuler, modifier : la ligne, son annulation et la nouvelle ligne attendent ensemble */
    if (e.genre === 'annuler' || e.genre === 'modifier') {
      s.add('l:' + e.id);
      s.add('l:' + e.id + '~a');
      if (e.objet) s.add('l:' + e.objet.id);
      return;
    }
    s.add((e.genre === 'rec' || e.genre === 'supprimerRec' ? 'r:' : 'l:') + (e.id || e.objet.id));
  });
  return s;
}

/* Les Réglages reçus de la feuille */
function appliquerReglages(cfg) {
  ['p', 'cats', 'tiers', 'modes', 'gone', 'yrs', 'env'].forEach(k => { donnees[k] = cfg[k] || []; });
  donnees.ic = cfg.ic || {};
  donnees.cc = cfg.cc || {};
  donnees.cu = cfg.u || 0;
  normaliserComptes();
  donnees.cats = donnees.cats.filter(c => !donnees.gone.includes(c)).sort((x, y) => x.localeCompare(y, 'fr', { sensitivity: 'base' }));
}

/* Une lecture complète : tout est remplacé, sauf ce qui attend encore son envoi */
async function appliquerTout(r) {
  const attente = enAttente(), garder = (prefixe, liste) => liste.filter(x => attente.has(prefixe + x.id));
  const lignes = new Map(r.ex.map(e => [e.id, e])), recurrentes = new Map(r.rec.map(x => [x.id, x]));
  garder('l:', donnees.ex).forEach(e => lignes.set(e.id, e));
  garder('r:', donnees.rec).forEach(x => recurrentes.set(x.id, x));
  donnees.ex = [...lignes.values()];
  donnees.rec = [...recurrentes.values()];
  if (r.cfg && !fileEnvois.some(e => e.genre === 'cfg')) appliquerReglages(r.cfg);
  curseur = r.curseur;
  generation = r.generation;
  await ecrireMemoire({ vider: true, lignes: donnees.ex, recurrentes: donnees.rec, etat: { curseur, generation, reglages: { ...configuration(), u: donnees.cu } } });
}

/* La réponse à un envoi (ou les changements) : ce qui a changé depuis le curseur, ce qui a été reçu, ce qui a été refusé */
async function appliquerReponse(r, partis) {
  const attente = enAttente(), lignesChangees = [], recChangees = [];
  /* Une ligne « creer » que la feuille avait déjà (l'autre appareil l'a ajoutée, peut-être corrigée) : la version de la feuille */
  (r.acceptes || []).filter(a => a.objet && a.genre === 'ligne').forEach(a => r.ex.push(a.objet));
  if (r.ex.length) {
    const parId = new Map(donnees.ex.map(e => [e.id, e]));
    r.ex.forEach(o => { if (!attente.has('l:' + o.id)) { parId.set(o.id, o); lignesChangees.push(o); } });
    donnees.ex = [...parId.values()];
  }
  if (r.rec.length) {
    const parId = new Map(donnees.rec.map(x => [x.id, x]));
    r.rec.forEach(o => { if (!attente.has('r:' + o.id)) { parId.set(o.id, o); recChangees.push(o); } });
    donnees.rec = [...parId.values()];
  }
  /* Les Réglages reçus (le cas échéant), et la version à donner aux Réglages qui attendent encore */
  (r.acceptes || []).filter(a => a.genre === 'cfg').forEach(a => {
    donnees.cu = a.u;
    fileEnvois.filter(e => e.genre === 'cfg').forEach(e => { e.base = a.u; });
  });
  if (r.cfg && !fileEnvois.some(e => e.genre === 'cfg')) appliquerReglages(r.cfg);
  /* Ce que la feuille a refusé : on le dit, et on reprend la version de la feuille */
  (r.refuses || []).forEach(x => {
    toutARelire = true;
    messageApres = x.raison === 'REGLAGES:changes' ? "Les réglages ont changé sur l'autre appareil : refais ton dernier changement."
      : x.raison === 'LIGNE:changee' ? "Cette ligne a été modifiée sur l'autre appareil : ta modification n'a pas été enregistrée."
      : 'Pas enregistré (' + x.raison + ') : vérifie la ligne et recommence.';
  });
  if (r.generation && generation && r.generation !== generation) toutARelire = true;
  curseur = r.curseur;
  await ecrireMemoire({ lignes: lignesChangees, recurrentes: recChangees, retirer: partis, etat: { curseur, generation, reglages: { ...configuration(), u: donnees.cu } } });
}

/* Le serveur ne reconnaît pas la clé de l'appareil (jamais relié, ou retiré) : l'écran de liaison */
function erreurCle(e) {
  if (!/^CLE:/.test(String(e && e.message))) return false;
  cleAppareil = '';
  ecrireMemoire({ etat: { cle: '' } });
  verrouiller('liaison');
  return true;
}

/* Revenir à l'app (pas plus d'une fois aux 30 secondes), et le retour du réseau : on se remet à jour.
   Après 5 minutes sans s'en servir, l'app revient plutôt sur l'écran du code */
document.addEventListener('visibilitychange', () => {
  if (document.hidden || verrou) return;
  if (Date.now() - derniereActivite > DELAI_CODE) verrouiller();
  else if (Date.now() - dernierChargement > 30000 || fileEnvois.length) synchroniser();
});
window.addEventListener('online', () => {
  if (!verrou) synchroniser();
  else if (verrou.etape === 'reseau') verrouiller();
});
