// PreToolUse hook on AskUserQuestion: turns the ratings of each option into the figure the user sees.
import type { AskUserQuestionInput } from './ask-user-question.ts';

import { parseArgs } from 'node:util';

import { isAskUserQuestionInput } from './ask-user-question.ts';
import { loadHookInput } from './load-hook-input.ts';
import { loadScoreConstants } from './load-score-constants.ts';
import { appendScoreLogEntry } from './score-log.ts';
import { scoreAskedQuestions } from './score-questions.ts';

const usage = 'show-scores.ts --constants <file> --log <file>';

type PreToolUseInput = {
  session_id: string;
  tool_use_id: string;
  tool_input: AskUserQuestionInput;
};

type ShowScoresArguments = { isParsed: true; constantsPath: string; logPath: string } | { isParsed: false; error: string };

function isPreToolUseInput(value: unknown): value is PreToolUseInput
{
  return typeof value === 'object' && value !== null
    && 'session_id' in value && typeof value.session_id === 'string'
    && 'tool_use_id' in value && typeof value.tool_use_id === 'string'
    && 'tool_input' in value && isAskUserQuestionInput(value.tool_input);
}

function parseShowScoresArguments(argumentTexts: string[]): ShowScoresArguments
{
  try
  {
    const parsedArguments = parseArgs({
      args: argumentTexts,
      options: { constants: { type: 'string' }, log: { type: 'string' } },
    });

    if (parsedArguments.values.constants === undefined || parsedArguments.values.log === undefined)
    {
      return { isParsed: false, error: `usage: ${usage}` };
    }

    return { isParsed: true, constantsPath: parsedArguments.values.constants, logPath: parsedArguments.values.log };
  }
  catch (error)
  {
    return { isParsed: false, error: `${error instanceof Error ? error.message : String(error)}; usage: ${usage}` };
  }
}

// A system message reaches the user and not the model; stderr of a hook that exits 0 reaches only the debug log.
function writeUnscoredWarning(cause: string): void
{
  process.stdout.write(JSON.stringify({ systemMessage: `ask-score: ${cause}; the question goes out unscored` }));
}

async function main(): Promise<void>
{
  const hookArguments = parseShowScoresArguments(process.argv.slice(2));

  if (!hookArguments.isParsed)
  {
    writeUnscoredWarning(`the hook command is malformed: ${hookArguments.error}`);

    return;
  }

  const constantsLoad = await loadScoreConstants(hookArguments.constantsPath);

  if (constantsLoad.kind === 'unloadable')
  {
    writeUnscoredWarning(`the constants at ${hookArguments.constantsPath} do not load: ${constantsLoad.error}`);

    return;
  }

  if (constantsLoad.kind === 'invalid')
  {
    writeUnscoredWarning(`the constants at ${hookArguments.constantsPath} are invalid: ${constantsLoad.problems.join('; ')}`);

    return;
  }

  const hookInputLoad = loadHookInput();

  if (!hookInputLoad.isLoaded)
  {
    writeUnscoredWarning(`stdin is no JSON: ${hookInputLoad.error}`);

    return;
  }

  const hookInput = hookInputLoad.hookInput;

  if (!isPreToolUseInput(hookInput))
  {
    writeUnscoredWarning('the hook input holds no AskUserQuestion call');

    return;
  }

  const scoring = scoreAskedQuestions(hookInput.tool_input, constantsLoad.constants);

  if (scoring.kind === 'rejected')
  {
    const problemLines = scoring.problems.map((problem) => { return `- ${problem}`; }).join('\n');
    const deniedOutput = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `The question was not shown to the user:\n${problemLines}`,
      },
    };

    process.stdout.write(JSON.stringify(deniedOutput));

    return;
  }

  const logAppend = appendScoreLogEntry(hookArguments.logPath, {
    kind: 'asked',
    at: new Date().toISOString(),
    sessionId: hookInput.session_id,
    toolUseId: hookInput.tool_use_id,
    constantsVersion: constantsLoad.constants.version,
    questions: scoring.records,
  });

  if (!logAppend.isAppended)
  {
    process.stderr.write(`show-scores: the score log is not writable, the question goes out unlogged: ${logAppend.error}\n`);
  }

  // "allow" would run the tool on the hook's answers and skip the user; "ask" shows the rewritten question.
  const scoredOutput = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      updatedInput: scoring.input,
    },
  };

  process.stdout.write(JSON.stringify(scoredOutput));
}

await main();
