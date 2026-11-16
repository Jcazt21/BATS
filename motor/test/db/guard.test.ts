import { describe, expect, it } from 'vitest';

import { assertTestDsn } from '../../src/db/guard.js';

const REAL = 'postgresql://bats:pw@localhost/bats';

describe('assertTestDsn (I13)', () => {
  it('acepta una base desechable de test', () => {
    expect(() => assertTestDsn('postgresql://u@localhost:55432/bats_arena_test_1', { BATS_DB_DSN: REAL })).not.toThrow();
  });

  it('lanza si es igual a BATS_DB_DSN', () => {
    const dsn = 'postgresql://u@localhost/bats_test';
    expect(() => assertTestDsn(dsn, { BATS_DB_DSN: dsn })).toThrow(/BATS_DB_DSN/);
  });

  it.each([
    'postgresql://u:p@aws-0.pooler.supabase.com:6543/test',
    'postgresql://u:p@db.x.SUPABASE.co:5432/postgres_test',
  ])('lanza si apunta a Supabase (%s)', dsn => {
    expect(() => assertTestDsn(dsn, {})).toThrow(/supabase/i);
  });

  it('lanza si el DSN no contiene "test"', () => {
    expect(() => assertTestDsn('postgresql://u@localhost/bats', {})).toThrow(/test/);
  });

  it('lanza si falta el DSN', () => {
    expect(() => assertTestDsn(undefined, {})).toThrow(/BATS_TEST_DSN/);
  });
});
