import {
  compileCompanyPackages,
  writeCompanyPackageIndex,
  writeCompanyPolicies,
} from "./support.js";

const fixtures = await compileCompanyPackages();
await writeCompanyPolicies(Object.values(fixtures));
await writeCompanyPackageIndex(fixtures);
process.stdout.write(`${fixtures.surface.digest}\n`);
