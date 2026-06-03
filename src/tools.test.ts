import { describe, it, expect, vi } from 'vitest';
import { tools } from './tools.js';

const byName = (n: string) => tools.find((t) => t.name === n)!;

describe('tools', () => {
  it('expose les 6 outils', () => {
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['ajouter_champ', 'definir_condition', 'deplacer_champ', 'lire_demarche', 'modifier_champ', 'supprimer_champ']
    );
  });

  it('ajouter_champ appelle la mutation avec demarche.number et renvoie le stable_id', async () => {
    const gql = vi.fn().mockResolvedValue({ demarcheAjouterChamp: { champStableId: '42', errors: null } });
    const res = await byName('ajouter_champ').run({ gql }, { demarcheNumber: 7, typeChamp: 'text', libelle: 'Nom' });
    const [, variables] = gql.mock.calls[0];
    expect(variables.input.demarche).toEqual({ number: 7 });
    expect(variables.input.typeChamp).toBe('text');
    expect(variables.input.libelle).toBe('Nom');
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('42');
  });

  it('remonte les erreurs métier de la mutation comme isError', async () => {
    const gql = vi.fn().mockResolvedValue({ demarcheAjouterChamp: { champStableId: null, errors: [{ message: 'Type de champ inconnu' }] } });
    const res = await byName('ajouter_champ').run({ gql }, { demarcheNumber: 7, typeChamp: 'xxx', libelle: 'N' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Type de champ inconnu');
  });

  it('definir_condition transmet les termes et le combinateur', async () => {
    const gql = vi.fn().mockResolvedValue({ demarcheDefinirCondition: { champStableId: '9', errors: null } });
    await byName('definir_condition').run({ gql }, {
      demarcheNumber: 1, stableId: '9', combinateur: 'OU',
      termes: [{ champSourceStableId: '3', operateur: 'superieur', valeur: '18' }]
    });
    const [, variables] = gql.mock.calls[0];
    expect(variables.input.combinateur).toBe('OU');
    expect(variables.input.termes[0].operateur).toBe('superieur');
  });

  it('lire_demarche fait une query et renvoie la liste JSON avec les options', async () => {
    const champs = [{ stableId: '1', typeChamp: 'drop_down_list', libelle: 'Civilité', obligatoire: false, prive: false, parentStableId: null, position: 0, aCondition: false, options: { drop_down_options: ['M.', 'Mme'] } }];
    const gql = vi.fn().mockResolvedValue({ demarcheChamps: champs });
    const res = await byName('lire_demarche').run({ gql }, { demarcheNumber: 5 });
    const [, variables] = gql.mock.calls[0];
    expect(variables.demarche).toEqual({ number: 5 });
    expect(res.content[0].text).toContain('"libelle": "Civilité"');
    expect(res.content[0].text).toContain('"drop_down_options"');
  });

  it('ajouter_champ transmet les options', async () => {
    const gql = vi.fn().mockResolvedValue({ demarcheAjouterChamp: { champStableId: '50', errors: null } });
    await byName('ajouter_champ').run({ gql }, {
      demarcheNumber: 7, typeChamp: 'drop_down_list', libelle: 'Civilité',
      options: { drop_down_options: ['M.', 'Mme'], drop_down_other: true }
    });
    const [, variables] = gql.mock.calls[0];
    expect(variables.input.options).toEqual({ drop_down_options: ['M.', 'Mme'], drop_down_other: true });
  });

  it('modifier_champ transmet les options', async () => {
    const gql = vi.fn().mockResolvedValue({ demarcheModifierChamp: { champStableId: '9', errors: null } });
    await byName('modifier_champ').run({ gql }, { demarcheNumber: 1, stableId: '9', options: { max_number: 100 } });
    const [, variables] = gql.mock.calls[0];
    expect(variables.input.options).toEqual({ max_number: 100 });
  });
});
