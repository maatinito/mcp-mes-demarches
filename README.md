# mcp-mes-demarches

Serveur MCP (stdio) qui permet de construire la structure d'une démarche mes-demarches
en langage naturel via Claude. Voir la section « Configuration » (complétée ultérieurement)
pour le branchement.

`schema.graphql` est une copie du contrat GraphQL de mes-demarches (source de vérité :
`mes-demarches/app/graphql/schema.graphql`, régénéré via `bin/rails graphql:schema:dump`).
