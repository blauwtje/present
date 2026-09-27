import { scoreWords } from './format';

interface Props {
  value?: number;
  onPick: (score: number) => void;
  compact?: boolean;
  disabled?: boolean;
  label: string;
}

export function ScoreRow({ value, onPick, compact, disabled, label }: Props) {
  return (
    <div className={compact ? 'score-row compact' : 'score-row'} role="group" aria-label={label}>
      {scoreWords.map((word, i) => (
        <button
          key={word}
          type="button"
          disabled={disabled}
          aria-pressed={value === i + 1}
          aria-label={`${i + 1}: ${word}`}
          onClick={() => onPick(i + 1)}
        >
          <span className="n">{i + 1}</span>
          {!compact && <span className="w">{word}</span>}
        </button>
      ))}
    </div>
  );
}
