// PostToolUse hook on AskUserQuestion: takes the figures off the result, so the model reads back the labels it wrote.
import type { AskUserQuestionOutput } from './ask-user-question.ts';

import { parseArgs } from 'node:util';

import { isAskUserQuestionOutput } from './ask-user-question.ts';
import { loadHookInput } from './load-hook-input.ts';
import { appendScoreLogEntry } from './score-log.ts';
import { hasScoredOptionLabel, stripScoresFromOutput } from './score-label.ts';

const usage = 'hide-scores.ts --log <file>';

type PostToolUseInput = {
  session_id: string;
  tool_use_id: string;
  tool_response: AskUserQuestionOutput;
};

type HideScoresArguments = { isParsed: true; logPath: string } | { isParsed: false; error: string };

type StrippedOutput = {
  systemMessage?: string;
  hookSpecificOutput: {
    hookEventName: 'PostToolUse';
    updatedToolOutput: AskUserQuestionOutput;
  };
};

function isPostToolUseInput(value: unknown): value is PostToolUseInput
{
  return typeof value === 'object' && value !== null
    && 'session_id' in value && typeof value.session_id === 'string'
    && 'tool_use_id' in value && typeof value.tool_use_id === 'string'
    && 'tool_response' in value && isAskUserQuestionOutput(value.tool_response);
}

function parseHideScoresArguments(argumentTexts: string[]): HideScoresArguments
{
  try
  {
    const parsedArguments = parseArgs({ args: argumentTexts, options: { log: { type: 'string' } } });

    if (parsedArguments.values.log === undefined)
    {
      return { isParsed: false, error: `usage: ${usage}` };
    }

    return { isParsed: true, logPath: parsedArguments.values.log };
  }
  catch (error)
  {
    return { isParsed: false, error: `${error instanceof Error ? error.message : String(error)}; usage: ${usage}` };
  }
}

// A system message reaches the user and not the model; stderr of a hook that exits 0 reaches only the debug log.
function writeExposedWarning(cause: string): void
{
  process.stdout.write(JSON.stringify({ systemMessage: `ask-score: ${cause}; the model reads the figures` }));
}

function main(): void
{
  const hookArguments = parseHideScoresArguments(process.argv.slice(2));
  const hookInputLoad = loadHookInput();

  if (!hookInputLoad.isLoaded)
  {
    writeExposedWarning(`stdin is no JSON: ${hookInputLoad.error}`);

    return;
  }

  const hookInput = hookInputLoad.hookInput;

  if (!isPostToolUseInput(hookInput))
  {
    writeExposedWarning('the hook input holds no AskUserQuestion result');

    return;
  }

  // Returning the output unchanged would still count as a rewrite and could override another hook's.
  if (!hasScoredOptionLabel(hookInput.tool_response))
  {
    return;
  }

  const strippedOutput: StrippedOutput = {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      updatedToolOutput: stripScoresFromOutput(hookInput.tool_response),
    },
  };

  // A malformed command loses the log entry, never the stripping.
  if (!hookArguments.isParsed)
  {
    strippedOutput.systemMessage = `ask-score: the hook command is malformed: ${hookArguments.error}; the answer goes on unlogged`;
    process.stdout.write(JSON.stringify(strippedOutput));

    return;
  }

  const logAppend = appendScoreLogEntry(hookArguments.logPath, {
    kind: 'answered',
    at: new Date().toISOString(),
    sessionId: hookInput.session_id,
    toolUseId: hookInput.tool_use_id,
    answers: hookInput.tool_response.answers,
  });

  if (!logAppend.isAppended)
  {
    process.stderr.write(`hide-scores: the score log is not writable, the answer goes on unlogged: ${logAppend.error}\n`);
  }

  process.stdout.write(JSON.stringify(strippedOutput));
}

main();
