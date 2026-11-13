import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Execute the actual migrations in PostgreSQL (WASM), with local stand-ins for
// Supabase-owned schemas. No network or production credentials are used.
test("database access controls", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA realtime;
    CREATE TABLE realtime.messages (extension TEXT);
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION realtime.topic() RETURNS TEXT LANGUAGE sql STABLE AS
      $$ SELECT current_setting('realtime.topic', true) $$;
    GRANT USAGE ON SCHEMA realtime TO authenticated;
    GRANT SELECT, INSERT ON realtime.messages TO authenticated;
    CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN, file_size_limit BIGINT, allowed_mime_types TEXT[]);
    INSERT INTO storage.buckets (id, name, public) VALUES ('profile-photos', 'profile-photos', false);
    CREATE TABLE storage.objects (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, bucket_id TEXT, name TEXT);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS
      $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1] $$;
    GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid(), storage.foldername(TEXT) TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    CREATE PUBLICATION supabase_realtime;
  `);
  const migrationDir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrationDir)).filter((f) => f.endsWith(".sql")).sort()) {
    if (file.endsWith("security_audit.sql")) {
      await db.exec(
        `UPDATE public.profiles SET photo_url='https://example.supabase.co/storage/v1/object/sign/profile-photos/legacy/photo.jpg?token=old', photos=ARRAY['https://example.supabase.co/storage/v1/object/sign/profile-photos/legacy/photo.jpg?token=old'] WHERE email='ayesha.k@northsouth.edu'`,
      );
    }
    await db.exec(await readFile(new URL(file, migrationDir), "utf8"));
  }
  await t.test("migration removes persistent signed tokens from saved profile photos", async () => {
    const { rows } = await db.query(
      "SELECT photo_url,photos FROM public.profiles WHERE email='ayesha.k@northsouth.edu'",
    );
    assert.equal(rows[0].photo_url, "legacy/photo.jpg");
    assert.deepEqual(rows[0].photos, ["legacy/photo.jpg"]);
  });
  const alice = "00000000-0000-4000-8000-000000000001";
  const bob = "00000000-0000-4000-8000-000000000002";
  const admin = "00000000-0000-4000-8000-000000000003";
  await db.query(
    "INSERT INTO auth.users(id,email) VALUES ($1,'alice@northsouth.edu'),($2,'bob@northsouth.edu'),($3,'admin@northsouth.edu')",
    [alice, bob, admin],
  );
  const { rows } = await db.query(
    "SELECT id,user_id FROM public.profiles WHERE user_id IS NOT NULL",
  );
  const aid = rows.find((p) => p.user_id === alice).id;
  const bid = rows.find((p) => p.user_id === bob).id;
  await db.exec("UPDATE public.profiles SET onboarding_complete = true WHERE user_id IS NOT NULL");
  await db.query("INSERT INTO public.user_roles(user_id,role) VALUES ($1,'admin')", [admin]);
  const asUser = async (uid, sql, params = []) => {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid]);
    await db.exec("SET ROLE authenticated");
    try {
      return await db.query(sql, params);
    } finally {
      await db.exec("RESET ROLE; RESET request.jwt.claim.sub");
    }
  };

  await t.test(
    "anonymous callers cannot browse private data or invoke verification RPCs",
    async () => {
      await db.exec("SET ROLE anon");
      try {
        assert.equal((await db.query("SELECT id FROM public.profiles")).rows.length, 0);
        await assert.rejects(db.query("SELECT body FROM public.messages"), /permission denied/);
        await assert.rejects(
          db.query("SELECT * FROM public.get_profile_verification($1)", [aid]),
          /permission denied/,
        );
      } finally {
        await db.exec("RESET ROLE");
      }
    },
  );
  await t.test("visible profiles do not expose email or verification documents", async () => {
    assert.equal(
      (await asUser(alice, "SELECT id FROM public.profiles WHERE id=$1", [bid])).rows.length,
      1,
    );
    for (const column of ["email", "id_card_path", "verification_note"]) {
      await assert.rejects(
        asUser(alice, `SELECT ${column} FROM public.profiles WHERE id=$1`, [bid]),
        /permission denied/,
      );
    }
    assert.equal(
      (await asUser(alice, "SELECT * FROM public.get_profile_verification($1)", [bid])).rows.length,
      0,
    );
    assert.equal(
      (await asUser(bob, "SELECT * FROM public.get_profile_verification($1)", [bid])).rows.length,
      1,
    );
    assert.equal(
      (await asUser(admin, "SELECT * FROM public.get_profile_verification($1)", [bid])).rows.length,
      1,
    );
  });
  await t.test("clients cannot reassign accounts, grant roles, or erase their ban", async () => {
    await assert.rejects(
      asUser(alice, "UPDATE public.profiles SET user_id=$1 WHERE id=$2", [bob, aid]),
      /permission denied/,
    );
    await assert.rejects(
      asUser(alice, "DELETE FROM public.profiles WHERE id=$1", [aid]),
      /permission denied/,
    );
    await assert.rejects(
      asUser(alice, "INSERT INTO public.user_roles(user_id,role) VALUES ($1,'admin')", [alice]),
      /permission denied/,
    );
    await asUser(
      alice,
      "UPDATE public.profiles SET verified=true,banned=true,verification_status='approved' WHERE id=$1",
      [aid],
    );
    const p = (
      await db.query(
        "SELECT verified,banned,verification_status FROM public.profiles WHERE id=$1",
        [aid],
      )
    ).rows[0];
    assert.deepEqual(p, { verified: false, banned: false, verification_status: "none" });
  });
  await t.test("ID review requires an uploaded file owned by the submitting account", async () => {
    await assert.rejects(
      asUser(
        alice,
        "UPDATE public.profiles SET id_card_path=$1,verification_status='pending' WHERE id=$2",
        [`${bob}/id.jpg`, aid],
      ),
      /own ID photo/,
    );
    await asUser(alice, "INSERT INTO storage.objects(bucket_id,name) VALUES ('id-cards',$1)", [
      `${alice}/id.jpg`,
    ]);
    await asUser(
      alice,
      "UPDATE public.profiles SET id_card_path=$1,verification_status='pending' WHERE id=$2",
      [`${alice}/id.jpg`, aid],
    );
    assert.equal(
      (await db.query("SELECT verification_status FROM public.profiles WHERE id=$1", [aid])).rows[0]
        .verification_status,
      "pending",
    );
    await asUser(
      admin,
      "UPDATE public.profiles SET verified=true,verification_status='approved' WHERE id=$1",
      [aid],
    );
    await asUser(alice, "UPDATE public.profiles SET id_card_path=$1 WHERE id=$2", [
      `${alice}/different.jpg`,
      aid,
    ]);
    assert.equal(
      (await db.query("SELECT id_card_path FROM public.profiles WHERE id=$1", [aid])).rows[0]
        .id_card_path,
      `${alice}/id.jpg`,
    );
  });
  await t.test("Ghost Mode prevents direct API reads and swipes", async () => {
    await asUser(bob, "UPDATE public.profiles SET ghost_from_depts=ARRAY['SBE'] WHERE id=$1", [
      bid,
    ]);
    assert.equal(
      (await asUser(alice, "SELECT id FROM public.profiles WHERE id=$1", [bid])).rows.length,
      0,
    );
    await assert.rejects(
      asUser(
        alice,
        "INSERT INTO public.swipes(from_profile_id,to_profile_id,action) VALUES ($1,$2,'like')",
        [aid, bid],
      ),
      /row-level security/,
    );
    await asUser(bob, "UPDATE public.profiles SET ghost_from_depts='{}' WHERE id=$1", [bid]);
  });
  await t.test("messages require a safe mutual match and immutable server timestamps", async () => {
    await assert.rejects(
      asUser(
        alice,
        "INSERT INTO public.messages(from_profile_id,to_profile_id,body) VALUES ($1,$2,'hello')",
        [aid, bid],
      ),
      /row-level security/,
    );
    await asUser(
      alice,
      "INSERT INTO public.swipes(from_profile_id,to_profile_id,action) VALUES ($1,$2,'like')",
      [aid, bid],
    );
    await asUser(
      bob,
      "INSERT INTO public.swipes(from_profile_id,to_profile_id,action) VALUES ($1,$2,'like')",
      [bid, aid],
    );
    await asUser(
      alice,
      "INSERT INTO public.messages(from_profile_id,to_profile_id,body) VALUES ($1,$2,'hello')",
      [aid, bid],
    );
    await assert.rejects(
      asUser(
        alice,
        "INSERT INTO public.messages(from_profile_id,to_profile_id,body,created_at) VALUES ($1,$2,'forged',now())",
        [aid, bid],
      ),
      /permission denied/,
    );
    await assert.rejects(
      asUser(alice, "UPDATE public.messages SET body='edited' WHERE from_profile_id=$1", [aid]),
      /permission denied/,
    );
    await assert.rejects(
      asUser(
        alice,
        "INSERT INTO public.messages(from_profile_id,to_profile_id,body,image_path) VALUES ($1,$2,'',$3)",
        [aid, bid, `${bob}/${aid}/stolen.jpg`],
      ),
      /Invalid conversation photo/,
    );
    const topic = `dm:${[aid, bid].sort().join(":")}`;
    await db.query("SELECT set_config('realtime.topic', $1, false)", [topic]);
    await asUser(alice, "INSERT INTO realtime.messages(extension) VALUES ('broadcast')");
    await assert.rejects(
      asUser(admin, "INSERT INTO realtime.messages(extension) VALUES ('broadcast')"),
      /row-level security/,
    );
    assert.equal(
      (await asUser(alice, "SELECT public.can_access_dm_topic($1) AS allowed", [topic])).rows[0]
        .allowed,
      true,
    );
    assert.equal(
      (await asUser(admin, "SELECT public.can_access_dm_topic($1) AS allowed", [topic])).rows[0]
        .allowed,
      false,
    );
    assert.equal(
      (await asUser(alice, "SELECT public.can_access_dm_topic('dm:invalid:invalid') AS allowed"))
        .rows[0].allowed,
      false,
    );
    await asUser(bob, "SELECT public.block_profile($1)", [aid]);
    await assert.rejects(
      asUser(alice, "INSERT INTO realtime.messages(extension) VALUES ('broadcast')"),
      /row-level security/,
    );
    assert.equal(
      (await asUser(alice, "SELECT public.can_access_dm_topic($1) AS allowed", [topic])).rows[0]
        .allowed,
      false,
    );
    await assert.rejects(
      asUser(
        alice,
        "INSERT INTO public.messages(from_profile_id,to_profile_id,body) VALUES ($1,$2,'blocked')",
        [aid, bid],
      ),
      /row-level security/,
    );
  });
  await t.test("push subscriptions cannot bypass endpoint validation", async () => {
    const keys = ["A".repeat(87), "B".repeat(22)];
    await assert.rejects(
      asUser(
        alice,
        "INSERT INTO public.push_subscriptions(profile_id,endpoint,p256dh,auth) VALUES ($1,'https://127.0.0.1/','key','key')",
        [aid],
      ),
      /permission denied/,
    );
    await assert.rejects(
      asUser(alice, "SELECT public.save_push_subscription('https://127.0.0.1/',$1,$2)", keys),
      /Unsupported push endpoint/,
    );
    await asUser(
      alice,
      "SELECT public.save_push_subscription('https://fcm.googleapis.com/fcm/send/device',$1,$2)",
      keys,
    );
    await assert.rejects(
      asUser(alice, "INSERT INTO public.push_deliveries(event_key) VALUES ('forged')"),
      /permission denied/,
    );
    await db.exec("INSERT INTO public.push_deliveries(event_key) VALUES ('message:once')");
    await assert.rejects(
      db.exec("INSERT INTO public.push_deliveries(event_key) VALUES ('message:once')"),
      /duplicate key/,
    );
  });
});
