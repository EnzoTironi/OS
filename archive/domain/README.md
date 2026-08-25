# Archived pre-modeled ERP domain packs

These packages are on `main` for git history. They are outside the default npm workspace, TypeScript project, and CI.

Zoen is not a prebuilt SAP. Each company brings its own world. Kitchen derives Pack capabilities from the definitions that company activates, the same way a kitchen/recipe surface is a capability set rather than a shipped ERP module.

Live World and OSDK tests compile `packages/ontology/fixtures/commercial.zoen.ts`. That file is a lake copy of `commercial/src/commercial.zoen.ts`. `compileDefinition` on a `.zoen.ts` stays on the default path.

Do not add these folders back to `package.json` workspaces or `tsconfig.json` include.
