import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// I10 · F1.12: las reglas de liga viven solo en bats_core/rules.py; el motor las ignora.
const SRC = join(import.meta.dirname, '..', 'src');
const PROHIBIDOS = /\b(type_of_month|egg|rotation|paradox|pseudo)\b/i;

const archivos = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? archivos(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );

describe('el motor no conoce la liga', () => {
  it.each(archivos(SRC))('%s', archivo => {
    expect(readFileSync(archivo, 'utf8')).not.toMatch(PROHIBIDOS);
  });
});

describe('el núcleo es puro', () => {
  const nucleo = [...archivos(join(SRC, 'core')), ...archivos(join(SRC, 'engine'))];
  it.each(nucleo)('%s no usa pg, fetch ni process.env', archivo => {
    const texto = readFileSync(archivo, 'utf8');
    expect(texto).not.toMatch(/from ['"]pg['"]/);
    expect(texto).not.toMatch(/\bfetch\s*\(/);
    expect(texto).not.toMatch(/process\.env/);
  });
});
