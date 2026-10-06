/* ===== Frise d'exemple ===== */

function exampleDoc() {
  const pol = uid(), soc = uid(), war = uid();
  const D = (y, m, d) => ({ y, m: m || null, d: d || null });
  const ev = (title, start, cat, details, extra) => Object.assign({
    id: uid(), type: 'event', title, start, end: null, approx: false, categoryId: cat,
    color: null, imageId: null, imageCaption: '', details: details || '', link: '',
  }, extra || {});
  const pe = (title, start, end, cat, details, extra) => Object.assign(
    ev(title, start, cat, details, extra), { type: 'period', end });
  return {
    id: uid(),
    title: 'La Révolution française et l’Empire',
    subtitle: 'Frise d’exemple — cliquez sur un élément pour lire sa fiche',
    settings: { showImages: true, centuries: true, textSize: 1 },
    categories: [
      { id: pol, name: 'Régimes politiques', color: '#2563eb' },
      { id: soc, name: 'Droits et société', color: '#16a34a' },
      { id: war, name: 'Guerres', color: '#dc2626' },
    ],
    items: [
      pe('Monarchie absolue de Louis XVI', D(1774, 5, 10), D(1789, 7, 14), pol,
        'Louis XVI devient roi à la mort de son grand-père **Louis XV**. Il gouverne en monarque absolu, de droit divin.\n\n' +
        'À la fin des années 1780, le royaume traverse une grave **crise financière** : pour la résoudre, le roi convoque les états généraux.'),
      pe('Monarchie constitutionnelle', D(1789, 7, 14), D(1792, 9, 21), pol,
        'Le roi conserve le pouvoir exécutif, mais il doit partager le pouvoir avec une **Assemblée** élue.\n\n' +
        'La Constitution de **1791** organise la séparation des pouvoirs.'),
      pe('Première République', D(1792, 9, 22), D(1804, 5, 18), pol,
        'Proclamée le **22 septembre 1792**, au lendemain de l’abolition de la monarchie.\n\n' +
        'Elle connaît plusieurs régimes : la Convention, le Directoire puis le Consulat.'),
      pe('La Terreur', D(1793, 9, 5), D(1794, 7, 27), soc,
        'Période de répression contre les « ennemis de la Révolution », menée par le Comité de salut public autour de **Robespierre**.\n\n' +
        '- Loi des suspects (septembre 1793)\n- Tribunal révolutionnaire\n- Des dizaines de milliers de victimes\n\n' +
        'Elle prend fin avec la chute de Robespierre, le 9 thermidor an II (27 juillet 1794).'),
      pe('Consulat', D(1799, 11, 9), D(1804, 5, 18), pol,
        'Après son coup d’État, **Napoléon Bonaparte** devient Premier consul. Il concentre l’essentiel des pouvoirs.'),
      pe('Premier Empire', D(1804, 5, 18), D(1814, 4, 6), pol,
        'Napoléon Bonaparte devient **Napoléon Ier**, empereur des Français. L’Empire domine une grande partie de l’Europe, avant de s’effondrer en 1814.'),
      ev('Ouverture des états généraux', D(1789, 5, 5), pol,
        'Les députés des trois ordres (clergé, noblesse, tiers état) se réunissent à **Versailles**.\n\n' +
        'Le tiers état demande le vote par tête et non par ordre.'),
      ev('Serment du Jeu de paume', D(1789, 6, 20), pol,
        'Les députés du tiers état, réunis en Assemblée nationale, jurent de ne pas se séparer avant d’avoir donné une **Constitution** à la France.\n\n' +
        '> « [Nous jurons] de ne jamais nous séparer […] jusqu’à ce que la Constitution du royaume soit établie. »'),
      ev('Prise de la Bastille', D(1789, 7, 14), soc,
        'Le peuple de Paris s’empare de la **Bastille**, forteresse et prison qui symbolise l’arbitraire royal.\n\n' +
        'Le 14 juillet est devenu la fête nationale en 1880.',
        { link: 'https://fr.wikipedia.org/wiki/Prise_de_la_Bastille' }),
      ev('Abolition des privilèges', D(1789, 8, 4), soc,
        'Dans la nuit du 4 août, l’Assemblée abolit les **privilèges** et les droits féodaux.'),
      ev('Déclaration des droits de l’homme et du citoyen', D(1789, 8, 26), soc,
        '> « Les hommes naissent et demeurent libres et égaux en droits. » (article 1er)\n\n' +
        'Ce texte affirme les grands principes : **liberté**, **égalité** devant la loi, **souveraineté de la nation**.'),
      ev('Fuite à Varennes', D(1791, 6, 20), pol,
        'Le roi et sa famille tentent de s’enfuir. Ils sont reconnus et arrêtés à Varennes : la confiance envers le roi est brisée.'),
      ev('Exécution de Louis XVI', D(1793, 1, 21), pol,
        'Jugé par la Convention pour trahison, **Louis XVI** est guillotiné place de la Révolution (aujourd’hui place de la Concorde).'),
      ev('Coup d’État du 18 Brumaire', D(1799, 11, 9), pol,
        'Le général **Bonaparte** renverse le Directoire avec l’aide de Sieyès. C’est la fin de la période révolutionnaire.'),
      ev('Code civil', D(1804, 3, 21), soc,
        'Le Code civil (ou « Code Napoléon ») rassemble les lois qui régissent la vie des Français : propriété, famille, contrats…\n\n' +
        'Il conserve certains acquis de la Révolution, comme l’**égalité devant la loi**.'),
      ev('Sacre de Napoléon Ier', D(1804, 12, 2), pol,
        'Napoléon se couronne lui-même empereur à **Notre-Dame de Paris**, en présence du pape Pie VII.'),
      ev('Bataille d’Austerlitz', D(1805, 12, 2), war,
        'Victoire de Napoléon contre les armées russe et autrichienne. On l’appelle aussi la « bataille des Trois Empereurs ».'),
      ev('Bataille de Waterloo', D(1815, 6, 18), war,
        'Défaite définitive de Napoléon face aux armées britannique et prussienne. Il est exilé à **Sainte-Hélène**, où il meurt en 1821.'),
    ],
  };
}

function loadExample() {
  if (!confirmDiscard()) return;
  if (state.doc.items.length) autosaveNow();
  loadPayload({ doc: exampleDoc(), images: {}, readonly: false });
  state.fileName = null;
  renderAll();
  fitAll();
  toast('Frise d’exemple chargée. Cliquez sur un élément pour lire sa fiche.', 4000);
}
