import { config } from "../config.js";
import * as places from "./places.js";
import * as fixtures from "./fixtures.js";

const PROVIDERS = { places, fixtures };

export function getProvider(name = config.places.provider) {
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown places provider: ${name}`);
  return { name, ...provider };
}
