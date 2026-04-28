import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (process.env[m[1]] == null) process.env[m[1]] = v;
  }
}

async function main() {
  loadDotEnvLocal();
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const supabase = createClient(url, key);
  const email = `xtdtest${Date.now()}@qq.com`;
  const password = `TestPassw0rd!${Math.floor(Math.random() * 1000)}`;

  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email, password });
  console.log("[signup] status:", signUpErr?.status ?? 200);
  console.log("[signup] error:", signUpErr?.message ?? null);
  console.log("[signup] user:", signUpData?.user?.id ?? null);

  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  console.log("[signin] status:", signInErr?.status ?? 200);
  console.log("[signin] error:", signInErr?.message ?? null);
  console.log("[signin] session:", !!signInData?.session);
}

main().catch((e) => {
  console.error("[auth-smoke] exception:", e);
  process.exit(1);
});

