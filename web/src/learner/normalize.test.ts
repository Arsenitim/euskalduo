import { describe, expect, it } from 'vitest';
import { checkTyped } from './normalize';

describe('checkTyped', () => {
  it('accepts every configured alternative, ignoring case and extra spaces', () => {
    expect(checkTyped('  Concurso ', ['campeonato', 'concurso'], 'meaning')).toBe('exact');
    expect(checkTyped('campeonato', ['campeonato', 'concurso'], 'meaning')).toBe('exact');
    expect(checkTyped('campeonato, concurso', ['campeonato', 'concurso'], 'meaning')).toBe('wrong');
  });

  it('accepts a missing accent as "almost" so the correct spelling can be shown', () => {
    expect(checkTyped('fabrica', ['taller', 'fábrica'], 'meaning')).toBe('almost');
    expect(checkTyped('comodo', ['cómodo'], 'meaning')).toBe('almost');
    expect(checkTyped('cómodo', ['cómodo'], 'meaning')).toBe('exact');
  });

  it('treats decomposed and precomposed accents as identical', () => {
    expect(checkTyped('fábrica', ['fábrica'], 'meaning')).toBe('exact');
  });

  it('makes a leading Spanish article optional only for meanings', () => {
    expect(checkTyped('manzana', ['la manzana'], 'meaning')).toBe('exact');
    expect(checkTyped('el reloj', ['reloj'], 'meaning')).toBe('exact');
    expect(checkTyped('cubo de basura', ['cubo de la basura'], 'meaning')).toBe('wrong');
  });

  it('does not treat Basque morphological variants as interchangeable', () => {
    expect(checkTyped('hiri', ['Hiria'], 'basque')).toBe('wrong');
    expect(checkTyped('hiria', ['Hiria'], 'basque')).toBe('exact');
    expect(checkTyped('bizkar - zorroa', ['Bizkar-zorroa'], 'basque')).toBe('exact');
    expect(checkTyped('bizkarzorroa', ['Bizkar-zorroa'], 'basque')).toBe('wrong');
    expect(checkTyped('aire  girotua', ['Aire girotua'], 'basque')).toBe('exact');
  });

  it('rejects empty input', () => {
    expect(checkTyped('   ', ['x'], 'basque')).toBe('wrong');
  });
});
