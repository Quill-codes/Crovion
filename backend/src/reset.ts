/**
 * Drop everything and re-seed from `defaults.ts`.
 *
 * Leads are wiped with it — this is a development reset, not a content rollback,
 * and pretending otherwise by preserving one table would make it the kind of
 * command whose blast radius has to be remembered rather than read.
 */
import { db, seedIfEmpty } from "./db.ts";

db.exec("DELETE FROM drops; DELETE FROM stops; DELETE FROM leads; DELETE FROM meta;");
seedIfEmpty();
console.log("[crovion] database reset and re-seeded from defaults.ts");
