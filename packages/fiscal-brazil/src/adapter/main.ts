import {
  configFromEnvironment,
  startFiscalAdapter,
} from "./server.js";

await startFiscalAdapter(configFromEnvironment(process.env));
