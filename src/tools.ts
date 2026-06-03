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
      const query = `query($demarche: FindDemarcheInput!){ demarcheChamps(demarche: $demarche){ stableId typeChamp libelle description obligatoire prive parentStableId position aCondition } }`;
      const data = await gql(query, { demarche: demarcheInput(demarcheNumber) });
      return { content: [{ type: 'text', text: JSON.stringify(data.demarcheChamps, null, 2) }] };
    }
  },
  {
    name: 'ajouter_champ',
    description: "Ajoute un champ à la révision brouillon. Renvoie le stable_id du nouveau champ.",
    inputSchema: {
      demarcheNumber: z.number().int(),
      typeChamp: z.string().describe('text, textarea, integer_number, decimal_number, email, phone, date, yes_no, checkbox, drop_down_list, header_section, repetition, etc.'),
      libelle: z.string(),
      description: z.string().optional(),
      obligatoire: z.boolean().optional(),
      prive: z.boolean().optional(),
      parentStableId: z.string().optional().describe('Pour insérer dans une répétition/bloc.'),
      apresStableId: z.string().optional().describe('Insérer juste après ce champ.')
    },
    run: async ({ gql }, a) => {
      const query = `mutation($input: DemarcheAjouterChampInput!){ demarcheAjouterChamp(input: $input) ${MUTATION_PAYLOAD} }`;
      const input: Record<string, unknown> = { demarche: demarcheInput(a.demarcheNumber), typeChamp: a.typeChamp, libelle: a.libelle };
      for (const k of ['description', 'obligatoire', 'prive', 'parentStableId', 'apresStableId'] as const) {
        if (a[k] !== undefined) input[k] = a[k];
      }
      const data = await gql(query, { input });
      return mutationResult(data.demarcheAjouterChamp);
    }
  },
  {
    name: 'modifier_champ',
    description: "Modifie un champ existant (libellé, description, obligatoire, type). Le changement de type d'un champ déjà publié est restreint aux types compatibles.",
    inputSchema: {
      demarcheNumber: z.number().int(),
      stableId: z.string(),
      libelle: z.string().optional(),
      description: z.string().optional(),
      obligatoire: z.boolean().optional(),
      typeChamp: z.string().optional()
    },
    run: async ({ gql }, a) => {
      const query = `mutation($input: DemarcheModifierChampInput!){ demarcheModifierChamp(input: $input) ${MUTATION_PAYLOAD} }`;
      const input: Record<string, unknown> = { demarche: demarcheInput(a.demarcheNumber), stableId: a.stableId };
      for (const k of ['libelle', 'description', 'obligatoire', 'typeChamp'] as const) {
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
  }
];

export function realDeps(config: Config): ToolDeps {
  return { gql: (query, variables) => gqlRequest(config, query, variables) };
}
