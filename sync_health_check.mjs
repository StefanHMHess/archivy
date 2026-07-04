import { spawnSync } from "node:child_process";

const checks = [
  {
    name: "Env Keys",
    script: "check_env_keys.mjs",
    markers: ["\"hasService\": true", "\"hasAnon\": true"],
  },
  {
    name: "Vertraege Contacts",
    script: "verify_vertraege_contacts.mjs",
    markers: ["VERTRAEGE_COUNT", "ROWS_WITH_DIRECT_CONTACT_FIELDS"],
  },
  {
    name: "Vorgaenge Service",
    script: "tmp_check_vorgaenge_service.mjs",
    markers: ["VORGAENGE_COUNT"],
  },
];

function runCheck(check) {
  const result = spawnSync("node", [check.script], {
    encoding: "utf8",
    shell: false,
  });

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const combined = `${stdout}\n${stderr}`;

  const hasAllMarkers = check.markers.every((m) => combined.includes(m));
  const ok = result.status === 0 && hasAllMarkers;

  return {
    ...check,
    ok,
    status: result.status,
    output: combined,
  };
}

function extractMetric(output, key) {
  const re = new RegExp(`${key}\\s+([^\\r\\n]+)`);
  const m = output.match(re);
  return m ? m[1].trim() : null;
}

const results = checks.map(runCheck);

console.log("SYNC HEALTH CHECK");
console.log("=================");

for (const r of results) {
  console.log(`${r.ok ? "OK" : "FAIL"} - ${r.name} (${r.script})`);

  if (r.name === "Vertraege Contacts") {
    const count = extractMetric(r.output, "VERTRAEGE_COUNT");
    const rows = extractMetric(r.output, "ROWS_WITH_DIRECT_CONTACT_FIELDS");
    if (count) console.log(`  VERTRAEGE_COUNT: ${count}`);
    if (rows) console.log(`  ROWS_WITH_DIRECT_CONTACT_FIELDS: ${rows}`);
  }

  if (r.name === "Vorgaenge Service") {
    const count = extractMetric(r.output, "VORGAENGE_COUNT");
    if (count) console.log(`  VORGAENGE_COUNT: ${count}`);
  }

  if (!r.ok) {
    const snippet = r.output.trim().slice(0, 600);
    if (snippet) console.log(`  Details: ${snippet}`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log("-----------------");
console.log(`RESULT: ${failed.length === 0 ? "OK" : "FAIL"}`);

if (failed.length > 0) {
  process.exitCode = 1;
}
