# mcp-mes-demarches

Serveur MCP (stdio) qui permet de construire la structure d'une démarche **mes-demarches**
en langage naturel via Claude.

`schema.graphql` est une copie du contrat GraphQL de mes-demarches (source de vérité :
`mes-demarches/app/graphql/schema.graphql`, régénéré via `bin/rails graphql:schema:dump`).

---

## Qu'est-ce que c'est ?

Ce serveur MCP expose six outils que Claude peut appeler pour créer et modifier
la structure d'un formulaire (démarche) dans mes-demarches, via l'API GraphQL v2.
Vous lui décrivez en français le formulaire voulu, il génère les appels d'outils
dans le bon ordre.

---

## Prérequis

- **Node.js ≥ 18**
- Un **token API mes-demarches** créé depuis le profil administrateur, avec :
  - **Accès en écriture** (`write_access`)
  - **Périmètre limité** à la démarche cible
  - En production : **réseau autorisé** = réseau de l'administrateur

---

## Installation et compilation

```bash
npm install
npm run build
```

Les fichiers compilés sont générés dans `dist/`.

---

## Les 6 outils

| Outil | Rôle |
|---|---|
| `lire_demarche` | Liste les champs de la révision brouillon (stable_id, type, libellé, condition…). À appeler en premier avant toute modification. |
| `ajouter_champ` | Ajoute un champ (texte, date, liste, répétition…) à la révision brouillon. |
| `modifier_champ` | Modifie un champ existant (libellé, description, obligatoire, type). |
| `deplacer_champ` | Déplace un champ juste après un autre champ. |
| `supprimer_champ` | Supprime un champ de la révision brouillon. |
| `definir_condition` | Définit (ou retire) la condition d'affichage d'un champ. |

---

## Configuration Claude Desktop

Ajoutez dans `claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "mes-demarches": {
      "command": "node",
      "args": ["/home/clautier/Rubymine/mcp-mes-demarches/dist/index.js"],
      "env": {
        "MD_GRAPHQL_URL": "https://mes-demarches.gov.pf/api/v2/graphql",
        "MD_API_TOKEN": "votre_token"
      }
    }
  }
}
```

## Configuration Claude Code (CLI)

```bash
claude mcp add mes-demarches \
  --env MD_GRAPHQL_URL=https://mes-demarches.gov.pf/api/v2/graphql \
  --env MD_API_TOKEN=votre_token \
  -- node /home/clautier/Rubymine/mcp-mes-demarches/dist/index.js
```

Ou, si vous préférez configurer via fichier JSON (`.claude/mcp.json` ou
`~/.claude/mcp.json`), utilisez le même bloc `mcpServers` que pour Claude Desktop
ci-dessus.

---

## Exemple de dialogue

**Vous :**
> Démarche n°42. Ajoute un champ texte « Nom », puis un champ « SIRET » qui
> s'affiche uniquement si le champ « Type d'usager » est égal à « entreprise ».

**Claude :**
1. Appelle `lire_demarche` → récupère les stable_ids existants.
2. Appelle `ajouter_champ` avec `typeChamp: "text"`, `libelle: "Nom"`.
3. Appelle `ajouter_champ` avec `typeChamp: "siret"`, `libelle: "SIRET"` → reçoit son stable_id.
4. Appelle `definir_condition` avec le stable_id du champ SIRET,
   `termes: [{ champSourceStableId: "<id-type-usager>", operateur: "egal", valeur: "entreprise" }]`.

---

## Variables d'environnement

| Variable | Description |
|---|---|
| `MD_GRAPHQL_URL` | URL de l'endpoint GraphQL v2 (ex : `https://mes-demarches.gov.pf/api/v2/graphql`) |
| `MD_API_TOKEN` | Token API administrateur avec droits en écriture sur la démarche cible |
