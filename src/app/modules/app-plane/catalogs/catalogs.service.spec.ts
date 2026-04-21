import { CatalogsService } from './catalogs.service';

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('CatalogsService', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // generateCode — static method, catalog code normalization
  // ISO 25010: Corrección Funcional
  // TEST_PLAN: TP-WS-008
  // ═══════════════════════════════════════════════════════════════════════════

  describe('generateCode (static)', () => {
    it('converts spaces to underscores', () => {
      expect(CatalogsService.generateCode('Estado Actual')).toBe('ESTADO_ACTUAL');
    });

    it('strips Spanish accents (á é í ó ú)', () => {
      expect(CatalogsService.generateCode('Área Geográfica')).toBe('AREA_GEOGRAFICA');
    });

    it('strips ñ and ü', () => {
      expect(CatalogsService.generateCode('Año Niño')).toBe('ANO_NINO');
    });

    it('converts to uppercase', () => {
      expect(CatalogsService.generateCode('priority')).toBe('PRIORITY');
    });

    it('removes non-alphanumeric characters except underscores', () => {
      expect(CatalogsService.generateCode('Fondo / Donante')).toBe('FONDO__DONANTE');
    });

    it('removes leading and trailing underscores', () => {
      expect(CatalogsService.generateCode(' Región ')).toBe('REGION');
    });

    it('collapses multiple consecutive spaces into a single underscore (\\s+ regex)', () => {
      // The regex \s+ matches one-or-more whitespace → replaces entire run with single '_'
      const result = CatalogsService.generateCode('A  B');
      expect(result).toBe('A_B');
    });

    it('falls back to CATALOG for empty string', () => {
      expect(CatalogsService.generateCode('')).toBe('CATALOG');
    });

    it('falls back to CATALOG for string with only special chars', () => {
      expect(CatalogsService.generateCode('---')).toBe('CATALOG');
    });

    it('preserves digits', () => {
      expect(CatalogsService.generateCode('Fase 2')).toBe('FASE_2');
    });

    it('handles single word without modification (uppercase)', () => {
      expect(CatalogsService.generateCode('Status')).toBe('STATUS');
    });

    it('handles mixed accents and special chars', () => {
      expect(CatalogsService.generateCode('Línea Estratégica')).toBe('LINEA_ESTRATEGICA');
    });

    it('handles already uppercase input', () => {
      expect(CatalogsService.generateCode('TIPO_DE_PROYECTO')).toBe('TIPO_DE_PROYECTO');
    });
  });
});
