/* Copie intacte de la page, prise avant toute modification du DOM :
   elle sert de modèle pour enregistrer la frise sous forme de fichier .html autonome. */
const PRISTINE = (() => {
  const root = document.documentElement.cloneNode(true);
  const data = root.querySelector('#frise-data');
  if (data) data.textContent = '';
  return root;
})();
