import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { t } from '../../i18n';
import type { Lang } from '../../types';
import { answerKey, checkTyped, type TypedVerdict } from '../normalize';
import { hintLength, meaningsOf, type Item, type OrderQuestion, type WordQuestion } from '../questions';
import { WordVisual } from './bits';

export interface Outcome {
  verdict: TypedVerdict;
  given?: string;
  /** The spelling hint was used: a right answer earns half credit. */
  hinted?: boolean;
  /** "No lo sé": counted as wrong, but the feedback is not "almost". */
  skipped?: boolean;
}

interface Props<Q> {
  question: Q;
  lang: Lang;
  answered: boolean;
  onAnswer: (outcome: Outcome) => void;
}

function Prompt({ title, children }: { title: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="prompt">
      <h2 className="prompt-title" tabIndex={-1} ref={ref}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Basque({ text }: { text: string }) {
  return (
    <p className="prompt-basque" lang="eu">
      {text}
    </p>
  );
}

function Meaning({ item, lang }: { item: Item; lang: Lang }) {
  return (
    <p className="prompt-meaning" lang={lang}>
      {meaningsOf(item.entry, lang).join(' / ')}
    </p>
  );
}

export function ChoiceQuestionView({ question, lang, answered, onAnswer }: Props<Extract<WordQuestion, { kind: 'meaning-choice' | 'basque-choice' }>>) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [hint, setHint] = useState(false);
  const { item, options } = question;

  const choose = (index: number) => {
    if (answered || !options[index]) return;
    setChosen(index);
    onAnswer({ verdict: options[index].correct ? 'exact' : 'wrong', given: options[index].label });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const n = Number.parseInt(e.key, 10);
    if (n >= 1 && n <= options.length) choose(n - 1);
  };

  const optionLang = question.kind === 'meaning-choice' ? lang : 'eu';

  return (
    <div onKeyDown={onKeyDown}>
      {question.kind === 'meaning-choice' ? (
        <Prompt title={t('whatMeans')}>
          {/* The picture would give the meaning away: show it only after answering. */}
          {answered && <WordVisual entry={item.entry} />}
          <Basque text={item.entry.basque} />
        </Prompt>
      ) : (
        <Prompt title={question.pictureOnly && !hint ? t('whatIsThis') : t('howSay')}>
          <WordVisual entry={item.entry} />
          {question.pictureOnly && !hint ? (
            <button className="btn btn-small" onClick={() => setHint(true)}>
              {t('showHint')}
            </button>
          ) : (
            <Meaning item={item} lang={lang} />
          )}
        </Prompt>
      )}
      <div className="options" role="group" aria-label={t('whatMeans')}>
        {options.map((option, index) => {
          const state = !answered ? '' : option.correct ? 'is-correct' : index === chosen ? 'is-wrong' : 'is-dim';
          return (
            <button key={option.label} className={`option ${state}`} onClick={() => choose(index)} aria-disabled={answered} lang={optionLang}>
              <span className="option-key" aria-hidden="true">
                {index + 1}
              </span>
              <span className="option-label">{option.label}</span>
              {answered && option.correct && <span className="option-mark" aria-label="correcta">✓</span>}
              {answered && !option.correct && index === chosen && <span className="option-mark" aria-label="incorrecta">✗</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SpellQuestionView({ question, lang, answered, onAnswer }: Props<Extract<WordQuestion, { kind: 'spell' }>>) {
  const { item, tiles } = question;
  const target = Array.from(item.entry.basque);
  const [placed, setPlaced] = useState<number[]>([]);
  const [typed, setTyped] = useState('');
  // Number of leading letters filled in by the hint (0 = no hint used).
  const [hinted, setHinted] = useState(0);
  const letters = target.filter((c) => c !== ' ' && c !== '-');
  const slots = letters.length;
  const hintSize = hintLength(slots);
  const skip = () => !answered && onAnswer({ verdict: 'wrong', hinted: hinted > 0, skipped: true });

  const helpButtons = (onHint: () => void) =>
    !answered && (
      <div className="button-row help-row">
        {hintSize > 0 && (
          <button className="btn btn-small" onClick={onHint} disabled={hinted > 0}>
            💡 {t('hint')}
          </button>
        )}
        <button className="btn btn-link" onClick={skip}>
          {t('dontKnow')}
        </button>
      </div>
    );

  if (!tiles) {
    const submit = () => !answered && typed.trim() && onAnswer({ verdict: checkTyped(typed, [item.entry.basque], 'basque'), given: typed, hinted: hinted > 0 });
    // Long words are typed freely: the hint pre-types the first third (spaces and hyphens included).
    const hint = () => {
      let count = 0;
      const prefix = Array.from(item.entry.basque).findIndex((c) => c !== ' ' && c !== '-' && ++count > hintSize);
      setTyped(Array.from(item.entry.basque).slice(0, prefix < 0 ? undefined : prefix).join(''));
      setHinted(hintSize);
    };
    return (
      <div>
        <Prompt title={t('spellIt')}>
          <WordVisual entry={item.entry} />
          <Meaning item={item} lang={lang} />
        </Prompt>
        <TypedAnswer value={typed} onChange={setTyped} onSubmit={submit} answered={answered} lang="eu" />
        {helpButtons(hint)}
      </div>
    );
  }

  const complete = placed.length === slots;
  const built = (() => {
    let next = 0;
    return target.map((c) => (c === ' ' || c === '-' ? c : placed[next] !== undefined ? tiles[placed[next++]!]! : null));
  })();

  const place = (tileIndex: number) => {
    if (answered || placed.includes(tileIndex) || complete) return;
    setPlaced((p) => [...p, tileIndex]);
  };
  // Hinted letters are locked in place; erasing stops at them.
  const erase = () => !answered && setPlaced((p) => (p.length > hinted ? p.slice(0, -1) : p));
  const check = () => {
    if (answered || !complete) return;
    const word = built.join('');
    onAnswer({ verdict: checkTyped(word, [item.entry.basque], 'basque'), given: word, hinted: hinted > 0 });
  };
  /** Replaces whatever was placed with the correct first letters, taken from the tiles. */
  const hint = () => {
    if (answered || hinted > 0) return;
    const used: number[] = [];
    for (const letter of letters.slice(0, hintSize)) {
      const index = tiles.findIndex((tile, i) => !used.includes(i) && answerKey(tile) === answerKey(letter));
      if (index < 0) return;
      used.push(index);
    }
    setPlaced(used);
    setHinted(used.length);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (answered) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      erase();
    } else if (e.key === 'Enter' && complete) {
      e.preventDefault();
      check();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const key = answerKey(e.key);
      const index = tiles.findIndex((tile, i) => !placed.includes(i) && answerKey(tile) === key);
      if (index >= 0) {
        e.preventDefault();
        place(index);
      }
    }
  };

  return (
    <div onKeyDown={onKeyDown}>
      <Prompt title={t('spellIt')}>
        <WordVisual entry={item.entry} />
        <Meaning item={item} lang={lang} />
      </Prompt>
      <div className="spell-slots" aria-label={t('yourAnswer')} aria-live="polite" lang="eu">
        {built.map((c, i) =>
          target[i] === ' ' ? (
            <span key={i} className="slot slot-space" aria-hidden="true" />
          ) : target[i] === '-' ? (
            <span key={i} className="slot slot-fixed">
              -
            </span>
          ) : (
            <span key={i} className={c ? (letterIndex(target, i) < hinted ? 'slot slot-filled slot-hint' : 'slot slot-filled') : 'slot'}>
              {c ?? ''}
            </span>
          ),
        )}
      </div>
      <div className="tiles" role="group" aria-label="Letras">
        {tiles.map((tile, i) => (
          <button key={i} className={placed.includes(i) ? 'tile is-used' : 'tile'} onClick={() => place(i)} aria-disabled={answered || placed.includes(i)} lang="eu">
            {tile}
          </button>
        ))}
      </div>
      <div className="button-row">
        <button className="btn" onClick={erase} disabled={answered || placed.length <= hinted}>
          ⌫ {t('erase')}
        </button>
        <button className="btn btn-primary" onClick={check} disabled={answered || !complete}>
          {t('check')}
        </button>
      </div>
      {helpButtons(hint)}
    </div>
  );
}

/** Position of target[i] among the letters only (spaces and hyphens are not slots). */
function letterIndex(target: string[], i: number): number {
  return target.slice(0, i).filter((c) => c !== ' ' && c !== '-').length;
}

export function TypeMeaningView({ question, lang, answered, onAnswer }: Props<Extract<WordQuestion, { kind: 'type-meaning' }>>) {
  const [typed, setTyped] = useState('');
  const { entry } = question.item;
  // Any configured alternative in any language is accepted.
  const accepted = [...entry.translations.es, ...(entry.translations.ru ?? [])];
  const submit = () => !answered && typed.trim() && onAnswer({ verdict: checkTyped(typed, accepted, 'meaning'), given: typed });

  return (
    <div>
      <Prompt title={t('typeMeaning')}>
        {answered && <WordVisual entry={entry} />}
        <Basque text={entry.basque} />
      </Prompt>
      <TypedAnswer value={typed} onChange={setTyped} onSubmit={submit} answered={answered} lang={lang} />
      {!answered && (
        <button className="btn btn-link" onClick={() => onAnswer({ verdict: 'wrong', skipped: true })}>
          {t('dontKnow')}
        </button>
      )}
    </div>
  );
}

function TypedAnswer(props: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  answered: boolean;
  lang: string;
}) {
  return (
    <form
      className="typed-answer"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      <label className="visually-hidden" htmlFor="typed-answer">
        {t('typeHere')}
      </label>
      <input
        id="typed-answer"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        readOnly={props.answered}
        placeholder={t('typeHere')}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        lang={props.lang}
        maxLength={80}
      />
      <button className="btn btn-primary" type="submit" disabled={props.answered || props.value.trim() === ''}>
        {t('check')}
      </button>
    </form>
  );
}

export function OrderQuestionView({ question, answered, onAnswer }: Props<OrderQuestion>) {
  const [sequence, setSequence] = useState<Item[]>([]);
  const remaining = question.shuffled.filter((i) => !sequence.includes(i));
  const complete = remaining.length === 0;

  const check = () => {
    if (answered || !complete) return;
    const correct = sequence.every((item, i) => item.key === question.items[i]!.key);
    onAnswer({ verdict: correct ? 'exact' : 'wrong', given: sequence.map((i) => i.entry.basque).join(' → ') });
  };

  return (
    <div>
      <Prompt title={t('orderIt', { group: question.group.title })}>
        <p>{t('orderHint')}</p>
      </Prompt>
      <ol className="order-sequence" aria-label={t('yourAnswer')} lang="eu">
        {sequence.map((item, index) => {
          const state = !answered ? '' : item.key === question.items[index]!.key ? 'is-correct' : 'is-wrong';
          return (
            <li key={item.key}>
              <button className={`order-chip ${state}`} disabled={answered} onClick={() => setSequence((s) => s.filter((x) => x !== item))}>
                <span className="order-num">{index + 1}</span> {item.entry.basque}
                {answered && <span aria-label={state === 'is-correct' ? 'correcta' : 'incorrecta'}>{state === 'is-correct' ? ' ✓' : ' ✗'}</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="tiles" role="group" lang="eu">
        {remaining.map((item) => (
          <button key={item.key} className="order-chip" disabled={answered} onClick={() => setSequence((s) => [...s, item])}>
            {item.entry.basque}
          </button>
        ))}
      </div>
      <div className="button-row">
        <button className="btn" onClick={() => setSequence((s) => s.slice(0, -1))} disabled={answered || sequence.length === 0}>
          ⌫ {t('erase')}
        </button>
        <button className="btn btn-primary" onClick={check} disabled={answered || !complete}>
          {t('check')}
        </button>
      </div>
    </div>
  );
}
