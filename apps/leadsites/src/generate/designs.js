import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

let cache = null;

const firstScalar = (text, key) => {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const raw = re.exec(text)?.[1]?.trim() ?? "";
  return raw.replace(/^["']|["']$/g, "");
};

const titleize = (key) =>
  key.split("-").map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");

/** Index the DESIGN.md files that live in this repo. */
export function listDesigns({ refresh = false } = {}) {
  if (cache && !refresh) return cache;

  let entries = [];
  try {
    entries = fs.readdirSync(config.designDir, { withFileTypes: true });
  } catch {
    cache = [];
    return cache;
  }

  cache = entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const file = path.join(config.designDir, e.name, "DESIGN.md");
      if (!fs.existsSync(file)) return null;
      // The header block is enough for the picker; the body is only read on use.
      const head = fs.readFileSync(file, "utf8").slice(0, 4000);
      const description = firstScalar(head, "description");
      return {
        key: e.name,
        label: titleize(e.name),
        description: description.length > 260 ? `${description.slice(0, 257)}...` : description,
        primary: /^\s*primary:\s*"?(#[0-9a-fA-F]{3,8})/m.exec(head)?.[1] ?? null,
        bytes: fs.statSync(file).size,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));

  return cache;
}

export function readDesign(key) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(key)) throw new Error(`Invalid design key: ${key}`);
  const file = path.join(config.designDir, key, "DESIGN.md");
  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(config.designDir) + path.sep)) {
    throw new Error(`Invalid design key: ${key}`);
  }
  if (!fs.existsSync(resolved)) throw new Error(`No DESIGN.md for "${key}"`);
  return { key, markdown: fs.readFileSync(resolved, "utf8") };
}
