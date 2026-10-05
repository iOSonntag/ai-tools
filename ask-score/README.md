# ask-score

A pair of Claude Code hooks that put a figure on each option of an AskUserQuestion call: the likelihood that
the option is the best answer. Claude rates each option on nine axes, the hooks turn the ratings into the
figure the user sees, and they take the figure off again before Claude reads the answer. Claude neither sets
nor sees the figure, so it cannot steer it.

`RULE.md` is the instruction Claude follows: the rating block, the nine axes, and their anchors. The
description of each option ends in
`[ease n, convention n, agreement n, intent n, truth n, durability n, integrity n, growth n, evidence n]`,
each `n` from 0 to 10, or `–` for an axis outside the question.

## Install

Node 22.18 or later runs the TypeScript as it is, through type stripping; there is no build step and no
dependency.

1. Clone this repository.
2. Copy `example-constants.ts` to a place of your own outside the clone, such as
   `~/.claude/ask-score/constants.ts`, and point its type import at `score-options.ts` in the clone. These
   are your weights; keep them where Claude does not read them.
3. Register both hooks in `~/.claude/settings.json`, with absolute paths:

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "AskUserQuestion",
           "hooks": [
             {
               "type": "command",
               "command": "node --disable-warning=ExperimentalWarning /path/to/ai-tools/ask-score/show-scores.ts --constants /path/to/constants.ts --log /path/to/scores.log",
               "timeout": 10
             }
           ]
         }
       ],
       "PostToolUse": [
         {
           "matcher": "AskUserQuestion",
           "hooks": [
             {
               "type": "command",
               "command": "node --disable-warning=ExperimentalWarning /path/to/ai-tools/ask-score/hide-scores.ts --log /path/to/scores.log",
               "timeout": 10
             }
           ]
         }
       ]
     }
   }
   ```

4. Load `RULE.md` into every session with an import in `~/.claude/CLAUDE.md` or in a rule file under
   `~/.claude/rules/`: `@/path/to/ai-tools/ask-score/RULE.md`.

## Flow

1. **PreToolUse, `show-scores.ts`.** Loads the constants, parses the ratings of every option, and checks
   their form.
   - A call that breaks the form is denied with one message per fault, so Claude fixes it and asks again:
     ratings missing or malformed, intent or evidence left as `–`, a label that already ends in a figure, or
     an axis rated for some options of a question and `–` for others. One bad question denies the whole call.
   - A valid call returns `ask` with `updatedInput`: each label gets ` - n%`, and each description loses its
     ratings. `allow` would run the tool on the hook's own input and skip the user.
   - Logs an `asked` record.
2. **The user** picks among the labels with figures.
3. **PostToolUse, `hide-scores.ts`.** Strips ` - n%` from the labels and the answers through
   `updatedToolOutput`, so Claude reads back the labels it wrote. Logs an `answered` record. When no label
   carries a figure it returns nothing, because an unchanged output still counts as a rewrite and could
   override another hook's.

Both hooks fail open and say so. A malformed command, constants that do not load or are invalid, or a hook
input they cannot read end in a `systemMessage` that names the cause, which the user sees and Claude does
not; the call goes on, the question unscored or the figures left in. A log that is not writable only loses
its record.

## The figure

`score-options.ts` computes it from the ratings and the constants.

- **Scale.** Each rating maps linearly onto a floor to 1: 0 keeps the floor, 10 gives 1.
- **Quality.** The weighted geometric mean of every rated axis except intent and evidence, with
  `qualityWeights` renormalised over the axes the question rates.
- **Worth.** Intent times quality. Intent is a gate: no other axis makes up for a missed goal. A question
  that rates intent alone takes intent as its quality too, so its figures stand on the same scale.
- **Trust.** Evidence pulls the log worth of each option toward the mean of its question. Evidence 10 keeps
  the full distance, evidence 0 only `evidenceTrustFloor` of it, so the options of a guess move together.
- **Sharpness.** The worths are raised to `sharpness` before they are shared out.
- **None of them.** A virtual outside option, rated `outsideOptionRating` on every rated axis, stands for
  the chance that no offered option is the best answer.
- **Single choice.** The options and the outside option share 100%, rounded to `percentStep` by largest
  remainder. The outside share shows on no label, so the figures sum to at most 100, and the rest is
  "none of them".
- **Multiple choice.** Each option is scored alone against the outside option and rounded to the nearest
  step.

## The constants

The constants module default-exports a `ScoreConstants` (declared in `score-options.ts`): the quality
weights, the two floors, the sharpness, the outside rating, the percent step, and a `version` that tells the
figures of one set from another in the log. `load-score-constants.ts` validates it on every call and names
each fault. `example-constants.ts` gives the pull axes no weight, because they exist to keep cheapness,
habit, and agreement out of the merit ratings, not to count. The tests score against the example.

## Files

- `show-scores.ts`, `hide-scores.ts`: the two hook entries.
- `score-questions.ts`: validates a call, collects its problems, puts the figures on the labels, and builds
  the log records.
- `score-options.ts`: the computation and the type of the constants.
- `load-score-constants.ts`: imports the constants module and validates it; never throws.
- `example-constants.ts`: a starting set of constants.
- `ratings.ts`: the axis names and the parser of the rating block.
- `score-label.ts`: adds, detects, and strips the ` - n%` suffix on labels and answers.
- `ask-user-question.ts`: the types and guards of the AskUserQuestion fields the hooks read.
- `load-hook-input.ts`: reads the hook input from stdin; never throws.
- `score-log.ts`: appends to the log; never throws.
- `print-score-log.sh`: the viewer of the log.
- `RULE.md`: the instruction Claude follows.

## Log

One JSON line per record, joined by `toolUseId`:

- `asked`: per option the label without figure, the ratings, and the figure, plus the constants version.
- `answered`: the answers as the user saw them, figures included.

A denied call logs nothing. `./print-score-log.sh <log-file> [count]` shows the last asks, 5 by default,
with each figure, the ratings grouped as pull, merit, and evidence, the "none of them" rest, and the picks.
It needs `jq`.

## Tests

`node --test *.test.ts` in this folder.

## When a Claude Code update breaks it

Claude Code documents none of the hook behaviour on AskUserQuestion that this hook relies on. It was
verified live on 2.1.287. Check these first:

1. `ask` with `updatedInput` shows the rewritten question to the user; `allow` skips the user.
2. PostToolUse receives the rewritten input, with the figures in the labels.
3. A multiple choice joins the labels with ", " and writes a label holding ", " or a quote as a JSON string.
4. An answer that matches no option label turns the result into the free-text wording, so the labels and
   the answers must be stripped alike.

Missing figures point at `show-scores.ts`, figures Claude can see at `hide-scores.ts`. Both depend on the
field names of the hook input: `session_id`, `tool_use_id`, `tool_input`, and `tool_response`.

A known gap: when the user rejects the call to clarify, the answers come back inside the rejection, which
PostToolUse does not see, so Claude reads the figures.
