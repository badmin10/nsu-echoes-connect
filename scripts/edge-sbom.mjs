import { readFile, writeFile } from "node:fs/promises";

// OSV-Scanner does not parse Deno's current lockfile. Export its resolved npm
// packages as CycloneDX so the edge function's dependencies are scanned too.
const lock = JSON.parse(
  await readFile(new URL("../supabase/functions/deno.lock", import.meta.url), "utf8"),
);
const components = Object.keys(lock.npm ?? {}).map((specifier) => {
  const separator = specifier.lastIndexOf("@");
  const name = specifier.slice(0, separator);
  const version = specifier.slice(separator + 1).split("_")[0];
  return {
    type: "library",
    name,
    version,
    purl: `pkg:npm/${name.replace(/^@/, "%40")}@${version}`,
  };
});
if (!components.length) throw new Error("No resolved edge packages found in deno.lock");
await writeFile(
  process.argv[2] ?? "audit-edge.cdx.json",
  JSON.stringify(
    {
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      version: 1,
      components,
    },
    null,
    2,
  ),
);
console.log(`Exported ${components.length} resolved edge packages for vulnerability scanning.`);
