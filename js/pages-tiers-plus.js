/* =====================================================================
   TIERS, PLUS, COMPARATIF
   ===================================================================== */

/* ----- Page Tiers : ce que chaque tiers doit à chacun (tout jusqu'au 31 décembre de l'année choisie); toucher un tiers ouvre ses transactions de l'année ----- */
function pageTiers() {
  const [N, J] = donnees.p, y = anneeCourante, maintenant = soldesAu(y).ti, avant = soldesAu(y - 1).ti;
  const lignes = depensesAnnee(), rien = { [N]: 0, [J]: 0 };
  return donnees.tiers.map(t => {
    const o = maintenant[t] || rien;
    return `<div class="carte tiers ${tiersOuvert === t ? 'ouvert' : ''}" onclick="ouvrirTiers('${js(t)}')"><h3>${securiser(t)}</h3>`
      + `<p>Doit à ${securiser(N)} <b class=texte-n>${argent(o[N])}</b></p><p>Doit à ${securiser(J)} <b class=texte-jc>${argent(o[J])}</b></p>`
      + `<div class=boutons><button class=bouton-principal onclick="event.stopPropagation();editerPaiement(null,{by:'${js(t)}'})">↩ Inscrire un remboursement</button></div>`
      + (tiersOuvert === t ? listeTiers(t, lignes, avant[t] || rien) : '') + '</div>';
  }).join('') + `<div class=boutons><button onclick="ajouterTiers()">+ Ajouter un tiers</button></div>`;
}
function ouvrirTiers(t) {
  tiersOuvert = tiersOuvert === t ? '' : t;
  afficher();
}
/* Une rangée par transaction (sa part, ou le remboursement en moins), la plus récente en haut, puis ce qui restait dû de l'année d'avant */
function listeTiers(t, lignes, report) {
  const [N, J] = donnees.p, y = anneeCourante - 1, liste = [];
  lignes.forEach(e => {
    if ((e.type === 'r' || e.type === 't') && e.by === t) liste.push({ e, v: -(+e.amt || 0), qui: e.type === 'r' ? 'à ' + e.nzf : 'sur la ' + nomCompte(e.to) });
    else if (compteDansBudget(e)) {
      const v = partDe(e, t);
      if (v) liste.push({ e, v, qui: e.by });
    }
  });
  liste.sort((a, b) => b.e.d.localeCompare(a.e.d));
  const reports = [N, J].filter(p => Math.abs(report[p]) > 0.004)
    .map(p => `<div class=rangee-tiers><span class="quand texte-discret">${y}</span><span class=quoi>Reporté de ${y}<small>à ${securiser(p)}</small></span><b class=${p === N ? 'texte-n' : 'texte-jc'}>${argent(report[p])}</b></div>`);
  const rangeeTiers = x => `<div class=rangee-tiers onclick="editerEntree('${x.e.id}')"><span class="quand texte-discret">${dateCourte(x.e.d)}</span>`
    + `<span class=quoi>${securiser(x.e.desc || (x.e.type === 'r' || x.e.type === 't' ? LIBELLES_TYPE.r : x.e.cat))}<small>${securiser(x.qui)}</small></span>`
    + `<b class="${x.v < 0 ? '' : x.e.by === N ? 'texte-n' : 'texte-jc'}">${x.v < 0 ? '− ' + argent(-x.v) : argent(x.v)}</b></div>`;
  return `<div class=liste-tiers onclick="event.stopPropagation()">${liste.map(rangeeTiers).join('')}${reports.join('')}${liste.length || reports.length ? '' : `<div class=vide>Aucune transaction en ${anneeCourante}.</div>`}</div>`;
}
function ajouterTiers() {
  demanderTexte('Nom du tiers', '', nom => {
    if (!donnees.tiers.includes(nom)) {
      donnees.tiers.push(nom);
      changerReglages();
    }
    fermerFenetre();
    afficher();
  }, fermerFenetre);
}

/* ----- Page Plus ----- */
function pagePlus() {
  return `<div class=carte><h3>Données</h3><div class=boutons><button onclick="actualiser()">Actualiser</button><button onclick="copieSecurite()">Copie de sécurité</button><button onclick="remettreUneCopie()">Remettre une copie</button></div></div>`
    + `<div class=carte><h3>Erreurs</h3><div class=boutons><button onclick="aller('err')">Voir les erreurs</button></div></div>`
    + `<div class=carte><h3>Comptes</h3><div class=boutons><button onclick="aller('cpt')">Voir les soldes des comptes</button><button onclick="aller('gl')">GL</button></div></div>`
    + `<div class=carte><h3>Récurrentes</h3><div class=boutons><button onclick="pageRecurrentes()">Gérer les récurrentes</button></div></div>`
    + `<div class=carte><h3>Modifier</h3><div class=boutons><button onclick="listeModifiable('cats')">Catégories</button><button onclick="listeModifiable('tiers')">Tiers</button><button onclick="listeModifiable('env')">Placements</button><button onclick="listeModifiable('modes')">Comptes</button></div></div>`
    + `<div class=carte><h3>Code d'entrée</h3><div class=boutons><button onclick="verrouiller('actuel')">Changer le code</button></div>`
    + `<label class=espace-haut>Relier un autre appareil : envoyer le lien et le code à<input id=f_courriel type=email autocomplete=email></label>`
    + '<div class=boutons><button id=b_courriel class=bouton-principal onclick="relierAutreAppareil()">Envoyer</button></div></div>'
    + '<div class=carte><div class=boutons><button onclick="verrouiller()">Déconnexion</button></div></div>';
}

/* Plus → Erreurs : le journal des erreurs de cet appareil, la plus récente en haut (les rangées de Dépenses, comme le GL; rien ne s'y touche) */
function pageErreurs() {
  return `<p class=texte-discret>Les erreurs de cet appareil, la plus récente en haut (les ${ERREURS_GARDEES} dernières).</p>`
    + (erreurs.map(x => `<div class=ligne-depense>${caseDate(dateIso(new Date(x.t)))}<span class=icone>⚠️</span>`
      + `<div><b>${securiser(x.texte)}</b><small>${heureCourte(x.t)} · ${securiser(nomAppareil || deviner())}</small></div></div>`).join('')
      || '<div class=vide>Aucune erreur.</div>');
}

/* ----- Remettre une copie de la nuit (l'utilisateur, 2026-11-27, choix 2 sur l'aperçu : « Construit pour que je sois autonome ») -----
   Une seule fenêtre : la nuit la plus récente choisie d'avance, le menu pour les autres, ce qu'elle contient, Annuler · Confirmer.
   La feuille garde son adresse; une copie d'elle est gardée à côté, dans le Drive; les lignes reçues depuis la nuit de la copie
   (sauf celles qui attendent encore leur envoi : elles partent ensuite, comme toujours) sont remises par-dessus. Le serveur fait le reste */
let remise = null;           // la fenêtre ouverte : { copies, id, contenu, envoi, dessinee }
const nomNuit = (quand, long) => {
  const d = new Date(quand), jour = JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_ABREGES[d.getMonth()], heure = heureCourte(quand);
  const cetteNuit = dateIso(d) === aujourdhui();
  if (long) return cetteNuit ? 'Cette nuit (' + jour + ', ' + heure + ')' : jour.charAt(0).toUpperCase() + jour.slice(1) + ', ' + heure;
  return cetteNuit ? 'de cette nuit' : 'du ' + jour;
};
/* Ce que l'appareil a reçu depuis la nuit de la copie (une ligne qui attend encore son envoi partira ensuite, comme toujours) */
function depuisLaCopie(quand) {
  const attente = enAttente();
  return { lignes: donnees.ex.filter(e => (e.u || 0) > quand && !attente.has('l:' + e.id)), recurrentes: donnees.rec.filter(x => (x.u || 0) > quand && !attente.has('r:' + x.id)) };
}
async function remettreUneCopie() {
  if (lecture) return afficherMessage(PAS_LUES);
  remise = { copies: [], id: '', contenu: null, envoi: false, liste: false };
  dessinerRemise();
  try {
    const r = await appelServeur('copies', {}, 120000);
    if (!remise) return;
    Object.assign(remise, { copies: r.copies, id: r.copies.length ? r.copies[0].id : '', contenu: r.contenu, liste: true });
    dessinerRemise();
  } catch (e) {
    remise = null;
    fermerFenetre();
    if (erreurCle(e) || erreurCode(e)) return;
    afficherMessage(texteRemise(e));
  }
}
const texteRemise = e => e.message === 'reseau' ? 'Il faut le réseau pour remettre une copie.'
  : e.message === 'COPIE:illisible' ? 'Cette copie ne se lit pas : choisis une autre nuit. Ta feuille n\'a pas changé.'
  : e.message === 'COPIE:inconnue' ? 'Cette copie n\'est plus dans le Drive.' : 'Connexion impossible : ' + e.message;
async function choisirCopie(id) {
  if (!remise || remise.envoi) return;
  Object.assign(remise, { id, contenu: null });
  dessinerRemise();
  try {
    const c = await appelServeur('contenuCopie', { id }, 120000);
    if (remise && remise.id === id) { remise.contenu = c; dessinerRemise(); }
  } catch (e) {
    if (erreurCle(e) || erreurCode(e)) return;
    afficherMessage(texteRemise(e));
  }
}
function dessinerRemise() {
  const r = remise;
  if (!r) return;
  /* La fenêtre fermée entre-temps (toucher à côté) : on oublie tout */
  if (r.dessinee && !trouver('#f_remise')) { remise = null; return; }
  r.dessinee = true;
  const copie = r.copies.find(c => c.id === r.id), c = r.contenu;
  const menu = r.copies.length ? `<label>La nuit<select id=f_copie onchange="choisirCopie(this.value)"${r.envoi ? ' disabled' : ''}>`
    + r.copies.map(x => `<option value="${securiser(x.id)}"${x.id === r.id ? ' selected' : ''}>${securiser(nomNuit(x.quand, true))}</option>`).join('') + '</select></label>' : '';
  let corps;
  if (!r.liste) corps = '<p class=texte-discret>Lecture des copies…</p>';
  else if (!r.copies.length) corps = '<p class=texte-discret>Aucune copie de la nuit dans ton Drive (le dossier « Sauvegardes Apps »).</p>';
  else if (!c) corps = '<p class=texte-discret>Lecture de la copie…</p>';
  else {
    const d = depuisLaCopie(copie.quand), n = d.lignes.length + d.recurrentes.length;
    const ensuite = n === 0 ? 'Rien n\'a été entré depuis cette nuit-là.' : n === 1 ? 'Puis la ligne entrée depuis cette nuit-là est remise par-dessus.'
      : `Puis les ${n.toLocaleString('fr-CA')} lignes entrées depuis cette nuit-là sont remises par-dessus.`;
    corps = `<div class="carte espace-haut"><h3>Ce qu'elle contient</h3><p class=texte-discret>Dépenses <b>${c.lignes.toLocaleString('fr-CA')} ${c.lignes > 1 ? 'lignes' : 'ligne'}</b></p>`
      + `<p class=texte-discret>La plus récente <b>${c.recente ? securiser(c.recente.desc) + ', ' + dateCourte(c.recente.d) : '—'}</b></p>`
      + `<p class=texte-discret>Récurrentes <b>${c.recurrentes.toLocaleString('fr-CA')}</b></p></div>`
      + `<p class=texte-discret>Ta feuille d'aujourd'hui est d'abord copiée à côté, dans ton Drive (« Budget — avant la remise du ${dateCourte(aujourdhui())} »). ${ensuite}</p>`;
  }
  ouvrirFenetre(`<div id=f_remise><h2>Remettre une copie</h2>${menu}${corps}<div class="boutons espace-haut">`
    + `<button onclick="remise=null;fermerFenetre()"${r.envoi ? ' disabled' : ''}>Annuler</button>`
    + `<button class=bouton-danger onclick="confirmerRemise()"${!c || r.envoi ? ' disabled' : ''}>${r.envoi ? 'Remise…' : 'Confirmer'}</button></div></div>`);
}
async function confirmerRemise() {
  const r = remise;
  if (!r || r.envoi || !r.contenu) return;
  const copie = r.copies.find(c => c.id === r.id);
  r.envoi = true;
  dessinerRemise();
  /* D'abord, ce que l'autre appareil a envoyé depuis la dernière lecture (sans réseau : on remet ce qu'on a) */
  try { await synchroniser(); } catch (e) { /* on continue avec ce que l'appareil a */ }
  const d = depuisLaCopie(copie.quand);
  try {
    const res = await appelServeur('remettreCopie', { id: copie.id, lignes: d.lignes, recurrentes: d.recurrentes,
      reglages: donnees.cu > copie.quand ? { ...configuration(), u: donnees.cu } : null, appareil: nomAppareil || deviner() }, 280000);
    remise = null;
    fermerFenetre();
    synchroniser({ tout: true });
    afficherMessage('Copie ' + nomNuit(copie.quand) + ' remise.' + (res.remises === 1 ? ' 1 ligne remise par-dessus.' : res.remises > 1 ? ` ${res.remises.toLocaleString('fr-CA')} lignes remises par-dessus.` : ''), true);
  } catch (e) {
    r.envoi = false;
    if (erreurCle(e) || erreurCode(e)) return;
    dessinerRemise();
    afficherMessage(e.message === 'reseau' ? 'Pas de réponse de la feuille : réessaie (remettre deux fois la même copie ne double rien).' : texteRemise(e));
  }
}

/* La copie de sécurité : tout le budget dans un fichier (budget-2026-11-02.json) */
function copieSecurite() {
  const texte = JSON.stringify({ ex: donnees.ex, rec: donnees.rec, cfg: configuration() });
  ouvrirFenetre(`<h2>Copie de sécurité</h2><textarea id=f_bk class=zone-copie>${securiser(texte)}</textarea><div class="boutons espace-haut"><button onclick="fermerFenetre()">Fermer</button><button class=bouton-principal onclick="telecharger()">Télécharger</button></div>`);
}
/* Sur l'iPad et l'iPhone, l'app de l'écran d'accueil ne télécharge pas : le menu Partager le fait (« Enregistrer dans Fichiers »).
   Ailleurs (l'ordi) : le téléchargement habituel. Partager annulé : rien */
async function telecharger() {
  const nom = 'budget-' + aujourdhui() + '.json', texte = trouver('#f_bk').value;
  if (navigator.standalone !== undefined && navigator.canShare) {
    const fichier = new File([texte], nom, { type: 'application/json' });
    if (navigator.canShare({ files: [fichier] })) {
      try { return await navigator.share({ files: [fichier] }); }
      catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
  lien.download = nom;
  lien.click();
}

/* ----- Comparatif entre les années (menu des années) : les années décochées restent décochées sur l'appareil;
   « Même période » = du 1er janvier à la même date qu'aujourd'hui ----- */
function cocherAnnee(y) {
  decochees = decochees.includes(y) ? decochees.filter(x => x !== y) : [...decochees, y];
  try { localStorage.setItem('budgetCmp', JSON.stringify(decochees)); } catch (e) { /* le choix vaut pour cette fois */ }
  afficher();
}
const ecart = (v, avant) => {
  const x = (v / avant - 1) * 100;
  return (x < 0 ? '−' : '+') + Math.abs(x).toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
};
function pageComparatif() {
  const [N, J] = donnees.p, choix = cmpMode, jour = aujourdhui().slice(5);
  const annees = [...new Set(lignesVivantes().filter(compteDansBudget).map(e => +e.d.slice(0, 4)))].sort(), cochees = annees.filter(y => !decochees.includes(y));
  if (!annees.length) return `<div class=carte><div class=vide>Aucune donnée à comparer.</div></div>`;
  const haut = `<div class=filtres>${annees.map(y => `<button class="coche ${cochees.includes(y) ? 'bouton-principal' : ''}" onclick="cocherAnnee(${y})">${cochees.includes(y) ? '☑' : '☐'} ${y}</button>`).join('')}</div>`
    + `<div class=filtres><button class="${cmpPeriode === 'p' ? 'bouton-principal' : ''}" onclick="cmpPeriode='p';afficher()">Même période</button><button class="${cmpPeriode === 'c' ? 'bouton-principal' : ''}" onclick="cmpPeriode='c';afficher()">Années complètes</button><select onchange="cmpMode=this.value;afficher()">${options(MODES(), choix)}</select></div>`
    + `<p class=texte-discret>${cmpPeriode === 'p' ? `Du 1er janvier au ${+jour.slice(3)} ${MOIS_LONGS[+jour.slice(0, 2) - 1].toLowerCase()} de chaque année.` : 'Les années complètes.'}</p>`;
  if (!cochees.length) return haut + `<div class=carte><div class=vide>Coche au moins une année.</div></div>`;
  const S = cochees.map(y => stats(lignesVivantes().filter(e => e.d.startsWith(y) && (cmpPeriode === 'c' || e.d.slice(5) <= jour)), choix));
  const carte = (titre, valeurs, couleur) => `<div class=carte><h3>${titre}</h3><div class=annees style="--c:${couleur}">${valeurs.map((v, i) => `<div><small>${cochees[i]}${i && valeurs[i - 1] > 0 ? ' · ' + ecart(v, valeurs[i - 1]) : ''}</small><b>${argent(v)}</b></div>`).join('')}</div></div>`;
  const categories = [...new Set(S.flatMap(s => Object.keys(s.cat)))].filter(k => S.some(s => (s.cat[k] || 0) > 0.004)).sort((x, y) => (S[S.length - 1].cat[y] || 0) - (S[S.length - 1].cat[x] || 0));
  return haut + carte(securiser(libelleMode(choix)), S.map(s => s.tot), choix === N ? 'var(--couleur-n)' : choix === J ? 'var(--couleur-jc)' : 'var(--couleur-principale)')
    + categories.map(k => carte(iconeCategorie(k) + ' ' + securiser(k), S.map(s => s.cat[k] || 0), couleurCategorie(k))).join('');
}
