/**
 * Règle ESLint : « aucun TODO silencieux ».
 *
 * Le cahier des charges impose que chaque TODO soit enregistré dans le backlog.
 * Cette règle refuse tout TODO ou FIXME qui ne référence pas une story
 * (`D4-02`, `E-01`, `F-02`) ou une entrée du registre (`BL-03`) de
 * docs/08-backlog-mvp.md.
 *
 * Accepté   : // TODO(D7-03): brancher le fournisseur mobile money réel
 * Accepté   : // TODO(F-02): émettre la session en cookie httpOnly
 * Refusé    : // TODO: à faire plus tard
 *
 * Les lots reconnus suivent le backlog : `D1` à `D10` pour les tranches
 * verticales, `E` pour la validation transverse, `F` pour l'interface web.
 * Ajouter un lot au backlog suppose donc de l'ajouter ici — c'est voulu : une
 * référence à un lot inexistant est un TODO silencieux déguisé.
 */
const PATTERN = /\b(TODO|FIXME)\b/i;
const REFERENCED = /\b(TODO|FIXME)\((?:D(?:10|[1-9])-\d{2}|[EF]-\d{2}|BL-\d{2})\)\s*:/;

/** @type {import('eslint').Rule.RuleModule} */
const todoReference = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Impose que chaque TODO référence une story du backlog, par exemple TODO(D4-02): …',
    },
    schema: [],
    messages: {
      unreferenced:
        'TODO non référencé. Utilisez TODO(<story>): … où <story> est une story du backlog (ex. D4-02) ou une entrée du registre (ex. BL-03). Voir docs/08-backlog-mvp.md.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (PATTERN.test(comment.value) && !REFERENCED.test(comment.value)) {
            context.report({ loc: comment.loc, messageId: 'unreferenced' });
          }
        }
      },
    };
  },
};

export default {
  rules: { 'todo-reference': todoReference },
};
