// READING POSTGRESQL'S ERRORS. When the database refuses a change, the
// Neon driver throws a NeonDbError carrying PostgreSQL's five-character
// SQLSTATE code and the name of the constraint that refused. The data
// layer turns the ones we expect into friendly messages; anything else is
// re-thrown and reaches an error boundary.
//
// Letting the database decide, then explaining, is deliberate. "Check
// first, then write" has a gap: another request can slip in between the
// check and the write. A constraint can't be raced.
import 'server-only'

type PgError = { code?: string; constraint?: string }

function pgError(error: unknown): PgError | null {
  if (typeof error !== 'object' || error === null) return null
  const e = error as PgError & { sourceError?: unknown }
  if (typeof e.code === 'string') return e
  return null
}

/**
 * A delete refused because other rows still point at this one.
 *
 * Two codes: 23503 foreign_key_violation is what ON DELETE NO ACTION (the
 * default) raises; ON DELETE RESTRICT, which this schema uses, raises
 * 23001 restrict_violation instead. Both mean "history depends on it".
 */
export function isReferencedError(error: unknown): boolean {
  const code = pgError(error)?.code
  return code === '23503' || code === '23001'
}

/** 23505: a UNIQUE constraint refused a duplicate (a slug or a closure date that exists). */
export function isUniqueError(error: unknown, constraint?: string): boolean {
  const e = pgError(error)
  return e?.code === '23505' && (!constraint || e.constraint === constraint)
}

/** 23514: a CHECK constraint refused a value (or the time-zone trigger in 007 did). */
export function isCheckError(error: unknown, constraint?: string): boolean {
  const e = pgError(error)
  return e?.code === '23514' && (!constraint || e.constraint === constraint)
}

/**
 * 23P01 exclusion_violation: an EXCLUDE constraint refused a row because
 * it overlaps another one. The one that matters most today:
 * bookings_no_overlap, which is how two clients racing for the same slot
 * end up with exactly one booking (the second insert fails with this).
 * Also working_hours_no_overlap and time_off_no_overlap.
 */
export function isExclusionError(error: unknown, constraint?: string): boolean {
  const e = pgError(error)
  return e?.code === '23P01' && (!constraint || e.constraint === constraint)
}
