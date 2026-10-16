import { describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { countOccurrences, methodBody, readSource } from '../support/sourceText';

const REPO_ROOT = resolve(__dirname, '../..');
const UNIT_DIR = resolve(__dirname);

/** Every suite known to read a `src/` file as text. */
const SOURCE_GUARD_SUITES = [
  'LiveSplashPotion.test.ts',
  'LiveStatusEffectPersistence.test.ts',
  'LivePeriodicStatusEffects.test.ts',
  'LivePillagerPatrol.test.ts',
  'LiveRaidEscalation.test.ts',
  'LiveWitchGunpowderDrops.test.ts',
  'RaiderRenderer.test.ts',
  'SplashPotionRenderer.test.ts',
];

describe('source text portability (298)', () => {
  describe('readSource', () => {
    it('normalises CRLF and LF inputs to byte-identical text', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sourcetext-'));
      try {
        const body = "const a = 1;\nconst b = 2;\n";
        const lf = join(dir, 'lf.ts');
        const crlf = join(dir, 'crlf.ts');
        writeFileSync(lf, body, 'utf8');
        writeFileSync(crlf, body.replace(/\n/g, '\r\n'), 'utf8');

        const fromLf = readSource(lf);
        const fromCrlf = readSource(crlf);
        expect(fromCrlf).toBe(fromLf);
        expect(fromLf).toBe(body);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('never returns a carriage return and never returns an empty string for a real file', () => {
      const text = readSource(resolve(REPO_ROOT, 'src/engine/Game.ts'));
      expect(text).not.toContain('\r');
      expect(text.length).toBeGreaterThan(0);
    });

    it('propagates a read error instead of returning an empty string', () => {
      expect(() => readSource(resolve(REPO_ROOT, 'src/engine/__does_not_exist__.ts'))).toThrow();
    });
  });

  describe('methodBody', () => {
    const sample = [
      'class Sample {',
      '  private run(): void {',
      '    const brace = "{";',
      "    const other = '}';",
      '    // } a comment brace',
      '    this.one();',
      '    this.two();',
      '  }',
      '  next(): void {}',
      '}',
    ].join('\n');

    it('extracts the balanced body of a method', () => {
      const body = methodBody(sample, 'private run(): void');
      expect(body.startsWith('{')).toBe(true);
      expect(body.endsWith('}')).toBe(true);
      expect(countOccurrences(body, 'this.one();')).toBe(1);
      expect(body).not.toContain('next(): void');
    });

    it('ignores braces inside strings and comments while counting depth', () => {
      const body = methodBody(sample, 'private run(): void');
      expect(countOccurrences(body, 'this.two();')).toBe(1);
    });

    it('throws a named error when the signature is absent', () => {
      expect(() => methodBody(sample, 'private missing(): void')).toThrow(/signature not found/);
    });

    it('throws a named error when the braces never balance', () => {
      expect(() => methodBody('function broken() { if (x) {', 'function broken()')).toThrow(/unmatched braces/);
    });
  });

  describe('countOccurrences', () => {
    it('counts non-overlapping occurrences and returns 0 for an empty needle', () => {
      expect(countOccurrences('a.b.a.b.a', 'a.')).toBe(2);
      expect(countOccurrences('aaa', '')).toBe(0);
      expect(countOccurrences('aaa', 'b')).toBe(0);
    });
  });

  describe('source-guard suite portability', () => {
    it('routes every source-guard suite through readSource', () => {
      const missing: string[] = [];
      for (const suite of SOURCE_GUARD_SUITES) {
        const text = readFileSync(join(UNIT_DIR, suite), 'utf8');
        if (!text.includes('readSource')) missing.push(suite);
      }
      expect(missing).toEqual([]);
    });

    it('no unit test reads a src/ path with readFileSync or fs.readFile directly', () => {
      const offenders: string[] = [];
      for (const name of readdirSync(UNIT_DIR)) {
        if (!name.endsWith('.test.ts')) continue;
        const text = readFileSync(join(UNIT_DIR, name), 'utf8');
        const paragraphs = text.split('\n');
        for (const line of paragraphs) {
          if (/(readFileSync|readFile)\s*\(/.test(line) && /'\.\.\/\.\.\/src|"\.\.\/\.\.\/src/.test(line)) {
            offenders.push(`${name}: ${line.trim()}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it('no test file under tests/unit embeds a multi-line newline anchor into indexOf', () => {
      const offenders: string[] = [];
      for (const name of readdirSync(UNIT_DIR)) {
        if (!name.endsWith('.test.ts')) continue;
        const text = readFileSync(join(UNIT_DIR, name), 'utf8');
        if (text.includes("indexOf('\\n") || text.includes('indexOf("\\n')) {
          offenders.push(name);
        }
      }
      expect(offenders).toEqual([]);
    });

    it('Game.ts normalises to LF through the shared reader', () => {
      const text = readSource(resolve(REPO_ROOT, 'src/engine/Game.ts'));
      expect(text).not.toContain('\r');
      expect(text.length).toBeGreaterThan(0);
      expect(text).toContain('private runFixedTick(');
    });
  });
});
