import type { ScoredQuestionRecord } from './score-questions.ts';

import { appendFileSync } from 'node:fs';

export type ScoreLogEntryAsked = {
  kind: 'asked';
  at: string;
  sessionId: string;
  toolUseId: string;
  constantsVersion: number;
  questions: ScoredQuestionRecord[];
};

export type ScoreLogEntryAnswered = {
  kind: 'answered';
  at: string;
  sessionId: string;
  toolUseId: string;
  answers: Record<string, string>;
};

export type ScoreLogEntry = ScoreLogEntryAsked | ScoreLogEntryAnswered;

export type ScoreLogAppend = { isAppended: true } | { isAppended: false; error: string };

/** Appends the entry as one JSON line to the log at `logPath`. Never throws. */
export function appendScoreLogEntry(logPath: string, entry: ScoreLogEntry): ScoreLogAppend
{
  try
  {
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`);

    return { isAppended: true };
  }
  catch (error)
  {
    return { isAppended: false, error: error instanceof Error ? error.message : String(error) };
  }
}
