import { z } from 'zod';
import { gqlRequest } from './graphql.js';
import type { Config } from './config.js';

export interface ToolDeps {
  gql: (query: string, variables: Record<string, unknown>) => Promise<any>;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  run: (deps: ToolDeps, args: any) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>;
}

const MUTATION_PAYLOAD = '{ champStableId errors { message } }';

// pf: options par type, typées pour guider Claude (le SDK MCP expose ces types en JSON Schema).
// Le serveur valide les clés par type (OPTS_BY_TYPE) ; .passthrough() autorise les options
// PF avancées (visa: accredited_users, formule: formule_expression, te_fenua…) non typées ici.
const optionsSchema = z.object({
  drop_down_options: z.array(z.string()).optional().describe('Valeurs de la liste déroulante. Pour une liste à deux niveaux (linked_drop_down_list) : préfixer chaque option primaire par -- (ex: "--Catégorie A--") puis lister ses sous-options ensuite, ligne par ligne.'),
  drop_down_other: z.boolean().optional().describe('Autoriser une réponse libre « Autre » (drop_down_list).'),
  positive_number: z.boolean().optional().describe('Forcer un nombre positif (integer_number, decimal_number).'),
  min_number: z.number().optional().describe('Borne minimale (integer_number, decimal_number).'),
  max_number: z.number().optional().describe('Borne maximale (integer_number, decimal_number).'),
  character_limit: z.number().optional().describe('Limite de caractères (textarea).'),
  date_in_past: z.boolean().optional().describe("N'autoriser que des dates passées (date, datetime)."),
  accredited_users: z.array(z.string()).optional().describe('Emails des personnes accréditées à cocher le visa (champ visa).'),
  header_section_level: z.number().int().min(1).max(3).optional().describe('Niveau de titre (1 à 3) pour un champ header_section.'),
  expression_reguliere: z.string().optional().describe('Expression régulière de validation (champ formatted), ancrée avec ^ et $. Ex: ^[0-9]{5}$'),
  expression_reguliere_indications: z.string().optional().describe('Indication affichée à l\'usager sur le format attendu (champ formatted).'),
  expression_reguliere_exemple_text: z.string().optional().describe('Exemple de saisie valide montré à l\'usager (champ formatted).'),
  expression_reguliere_error_message: z.string().optional().describe('Message d\'erreur si la saisie ne respecte pas l\'expression régulière (champ formatted).'),
  formule_expression: z.string().optional().describe("Expression d'un champ formule, en RÉFÉRENÇANT les champs par leur libellé : {Libellé}. Appelle d'abord l'outil aide_formule pour la syntaxe, les variables et fonctions disponibles. Le type de sortie et les dépendances sont inférés automatiquement (ne pas les fournir)."),
  table_id: z.string().optional().describe("id de la table Baserow d'un champ referentiel_de_polynesie (OBLIGATOIRE pour ce type). Liste via l'outil lister_referentiels_de_polynesie."),
  mode: z.enum(['autocomplete', 'exact_match']).optional().describe('Mode de remplissage du champ référentiel : autocomplete (avec complétion) ou exact_match (sans complétion).'),
  hint: z.string().optional().describe("Indications de saisie affichées à l'usager pour un champ référentiel (ex: « Saisissez le nom de votre commune »).")
}).passthrough().describe('Options spécifiques au type de champ. Seules les options valides pour le type choisi sont acceptées (sinon erreur listant les options valides).');

function mutationResult(payload: { champStableId: string | null; errors: Array<{ message: string }> | null }) {
  if (payload.errors && payload.errors.length > 0) {
    return { isError: true, content: [{ type: 'text' as const, text: 'Échec : ' + payload.errors.map((e) => e.message).join(' ; ') }] };
  }
  return { content: [{ type: 'text' as const, text: `OK (champ stable_id = ${payload.champStableId}).` }] };
}

const demarcheInput = (n: number) => ({ number: n });

export const tools: ToolDef[] = [
  {
    name: 'lire_demarche',
    description: "Liste les champs de la révision brouillon d'une démarche (stable_id, type, libellé, condition…). À appeler avant de modifier/déplacer/supprimer un champ existant.",
    inputSchema: { demarcheNumber: z.number().int().describe('Numéro de la démarche.') },
    run: async ({ gql }, { demarcheNumber }) => {
      const query = `query($demarche: FindDemarcheInput!){ demarcheChamps(demarche: $demarche){ stableId typeChamp libelle description obligatoire prive parentStableId position aCondition options } }`;
      const data = await gql(query, { demarche: demarcheInput(demarcheNumber) });
      return { content: [{ type: 'text', text: JSON.stringify(data.demarcheChamps, null, 2) }] };
    }
  },
  {
    name: 'ajouter_champ',
    description: "Ajoute un champ à la révision brouillon. Renvoie le stable_id du nouveau champ. Options par type via `options` : listes → drop_down_options/drop_down_other ; nombres → positive_number/min_number/max_number ; texte long → character_limit ; référentiel → table_id (OBLIGATOIRE, à récupérer via lister_referentiels_de_polynesie), mode, hint.",
    inputSchema: {
      demarcheNumber: z.number().int(),
      typeChamp: z.string().describe('text, textarea, integer_number, decimal_number, email, phone, date, yes_no, checkbox, drop_down_list, header_section, repetition, etc.'),
      libelle: z.string(),
      description: z.string().optional(),
      obligatoire: z.boolean().optional(),
      prive: z.boolean().optional(),
      parentStableId: z.string().optional().describe('Pour insérer dans une répétition/bloc.'),
      apresStableId: z.string().optional().describe('Insérer juste après ce champ.'),
      options: optionsSchema.optional()
    },
    run: async ({ gql }, a) => {
      const query = `mutation($input: DemarcheAjouterChampInput!){ demarcheAjouterChamp(input: $input) ${MUTATION_PAYLOAD} }`;
      const input: Record<string, unknown> = { demarche: demarcheInput(a.demarcheNumber), typeChamp: a.typeChamp, libelle: a.libelle };
      for (const k of ['description', 'obligatoire', 'prive', 'parentStableId', 'apresStableId', 'options'] as const) {
        if (a[k] !== undefined) input[k] = a[k];
      }
      const data = await gql(query, { input });
      return mutationResult(data.demarcheAjouterChamp);
    }
  },
  {
    name: 'modifier_champ',
    description: "Modifie un champ existant (libellé, description, obligatoire, type). Le changement de type d'un champ déjà publié est restreint aux types compatibles. Options par type via `options` : listes → drop_down_options/drop_down_other ; nombres → positive_number/min_number/max_number ; texte long → character_limit ; référentiel → table_id (OBLIGATOIRE pour referentiel_de_polynesie, via lister_referentiels_de_polynesie), mode, hint.",
    inputSchema: {
      demarcheNumber: z.number().int(),
      stableId: z.string(),
      libelle: z.string().optional(),
      description: z.string().optional(),
      obligatoire: z.boolean().optional(),
      typeChamp: z.string().optional(),
      options: optionsSchema.optional()
    },
    run: async ({ gql }, a) => {
      const query = `mutation($input: DemarcheModifierChampInput!){ demarcheModifierChamp(input: $input) ${MUTATION_PAYLOAD} }`;
      const input: Record<string, unknown> = { demarche: demarcheInput(a.demarcheNumber), stableId: a.stableId };
      for (const k of ['libelle', 'description', 'obligatoire', 'typeChamp', 'options'] as const) {
        if (a[k] !== undefined) input[k] = a[k];
      }
      const data = await gql(query, { input });
      return mutationResult(data.demarcheModifierChamp);
    }
  },
  {
    name: 'deplacer_champ',
    description: "Déplace un champ juste après un autre champ de la même démarche.",
    inputSchema: { demarcheNumber: z.number().int(), stableId: z.string(), apresStableId: z.string() },
    run: async ({ gql }, a) => {
      const query = `mutation($input: DemarcheDeplacerChampInput!){ demarcheDeplacerChamp(input: $input) ${MUTATION_PAYLOAD} }`;
      const data = await gql(query, { input: { demarche: demarcheInput(a.demarcheNumber), stableId: a.stableId, apresStableId: a.apresStableId } });
      return mutationResult(data.demarcheDeplacerChamp);
    }
  },
  {
    name: 'supprimer_champ',
    description: "Supprime un champ de la révision brouillon.",
    inputSchema: { demarcheNumber: z.number().int(), stableId: z.string() },
    run: async ({ gql }, a) => {
      const query = `mutation($input: DemarcheSupprimerChampInput!){ demarcheSupprimerChamp(input: $input) ${MUTATION_PAYLOAD} }`;
      const data = await gql(query, { input: { demarche: demarcheInput(a.demarcheNumber), stableId: a.stableId } });
      return mutationResult(data.demarcheSupprimerChamp);
    }
  },
  {
    name: 'definir_condition',
    description: "Définit (ou retire, si termes vide) la condition d'affichage d'un champ. Les champs sources doivent être situés AVANT le champ conditionné.",
    inputSchema: {
      demarcheNumber: z.number().int(),
      stableId: z.string(),
      combinateur: z.enum(['ET', 'OU']).optional(),
      termes: z.array(z.object({
        champSourceStableId: z.string(),
        operateur: z.enum(['egal', 'different', 'superieur', 'superieur_ou_egal', 'inferieur', 'inferieur_ou_egal', 'inclut', 'exclut', 'dans_archipel', 'hors_archipel', 'dans_departement', 'dans_region']),
        valeur: z.string()
      }))
    },
    run: async ({ gql }, a) => {
      const query = `mutation($input: DemarcheDefinirConditionInput!){ demarcheDefinirCondition(input: $input) ${MUTATION_PAYLOAD} }`;
      const input: Record<string, unknown> = { demarche: demarcheInput(a.demarcheNumber), stableId: a.stableId, termes: a.termes };
      if (a.combinateur !== undefined) input.combinateur = a.combinateur;
      const data = await gql(query, { input });
      return mutationResult(data.demarcheDefinirCondition);
    }
  },
  {
    name: 'aide_formule',
    description: "Renvoie la documentation pour écrire l'expression d'un champ formule donné (variables référençables, fonctions disponibles, syntaxe, exemples). À appeler AVANT de définir formule_expression sur un champ formule via modifier_champ.",
    inputSchema: { demarcheNumber: z.number().int(), stableId: z.string().describe('stable_id du champ formule.') },
    run: async ({ gql }, { demarcheNumber, stableId }) => {
      const query = `query($demarche: FindDemarcheInput!, $stableId: String!){ aideFormule(demarche: $demarche, stableId: $stableId) }`;
      const data = await gql(query, { demarche: { number: demarcheNumber }, stableId });
      return { content: [{ type: 'text', text: data.aideFormule }] };
    }
  },
  {
    name: 'lire_referentiel_champ',
    description: "Pour un champ référentiel (referentiel_de_polynesie) : liste les colonnes Baserow disponibles (nom + type) et le mapping actuel (pré-remplissage / rapatriement). À appeler avant de configurer le mapping. Erreur si Baserow est injoignable.",
    inputSchema: {
      demarcheNumber: z.number().int().describe('Numéro de la démarche.'),
      stableId: z.string().describe('stable_id du champ référentiel.')
    },
    run: async ({ gql }, { demarcheNumber, stableId }) => {
      const query = `query($demarche: FindDemarcheInput!, $stableId: String!){ referentielChampConfig(demarche: $demarche, stableId: $stableId){ tableId colonnes { nom typeMapping } mappingActuel } }`;
      const data = await gql(query, { demarche: { number: demarcheNumber }, stableId });
      return { content: [{ type: 'text', text: JSON.stringify(data.referentielChampConfig, null, 2) }] };
    }
  },
  {
    name: 'configurer_referentiel_mapping',
    description: "Configure le mapping d'un champ référentiel : pour chaque colonne, soit la pré-remplir vers un champ cible (prefillStableId, situé APRÈS le référentiel, type compatible), soit la rapatrier/afficher (displayUsager/displayInstructeur). Appelle d'abord lire_referentiel_champ pour connaître les colonnes.",
    inputSchema: {
      demarcheNumber: z.number().int().describe('Numéro de la démarche.'),
      stableId: z.string().describe('stable_id du champ référentiel.'),
      colonnes: z.array(z.object({
        colonne: z.string().describe('Nom de la colonne Baserow.'),
        prefillStableId: z.string().optional().describe('Si fourni : pré-remplit ce champ cible (doit être situé après le référentiel, type compatible).'),
        displayUsager: z.boolean().optional().describe("Rapatrier/afficher la valeur de cette colonne à l'usager."),
        displayInstructeur: z.boolean().optional().describe("Rapatrier/afficher la valeur de cette colonne à l'instructeur."),
        libelle: z.string().optional().describe('Libellé affiché pour cette colonne (défaut : nom de la colonne).')
      })).describe('Liste des colonnes à configurer.')
    },
    run: async ({ gql }, a) => {
      const query = `mutation($input: DemarcheConfigurerReferentielMappingInput!){ demarcheConfigurerReferentielMapping(input: $input) { champStableId errors { message } } }`;
      const data = await gql(query, { input: { demarche: { number: a.demarcheNumber }, stableId: a.stableId, colonnes: a.colonnes } });
      return mutationResult(data.demarcheConfigurerReferentielMapping);
    }
  },
  {
    name: 'lister_referentiels_de_polynesie',
    description: "Liste les référentiels Baserow disponibles (id + nom) à utiliser comme table_id d'un champ referentiel_de_polynesie.",
    inputSchema: {},
    run: async ({ gql }) => {
      const data = await gql(`query { referentielsDePolynesie { id nom } }`, {});
      return { content: [{ type: 'text', text: JSON.stringify(data.referentielsDePolynesie, null, 2) }] };
    }
  },
  {
    name: 'lister_colonnes_referentiel',
    description: "Liste les colonnes (nom + type) d'une table de référentiel Baserow à partir de son tableId, AVANT de créer le champ — pour préparer le mapping. Erreur si Baserow injoignable.",
    inputSchema: { tableId: z.string().describe('id de la table Baserow (cf. lister_referentiels_de_polynesie).') },
    run: async ({ gql }, { tableId }) => {
      const data = await gql(`query($tableId: String!){ referentielColonnes(tableId: $tableId){ nom typeMapping } }`, { tableId });
      return { content: [{ type: 'text', text: JSON.stringify(data.referentielColonnes, null, 2) }] };
    }
  }
];

export function realDeps(config: Config): ToolDeps {
  return { gql: (query, variables) => gqlRequest(config, query, variables) };
}
