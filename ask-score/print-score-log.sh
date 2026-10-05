#!/usr/bin/env bash
# Prints the last asks of the AskUserQuestion score log in a readable form: each
# question with the figure and the ratings of every option, and what was picked.

set -euo pipefail

scoreLogPath="${1:-}"
askCount="${2:-5}"

if [[ -z "$scoreLogPath" || ! "$askCount" =~ ^[1-9][0-9]*$ ]]; then
  echo "usage: $(basename "$0") <log-file> [count]   prints the last count asks, 5 by default" >&2
  exit 2
fi

if [[ ! -f "$scoreLogPath" ]]; then
  echo "no score log at $scoreLogPath" >&2
  exit 1
fi

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  isColored=true
else
  isColored=false
fi

jq -nRr --argjson askCount "$askCount" --argjson isColored "$isColored" '
  def paint($code): if $isColored then "\u001b[\($code)m\(.)\u001b[0m" else . end;

  def formatLocalTime: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 | strflocaltime("%Y-%m-%d %H:%M");

  def formatPercent: "   \(.)%" | .[-4:];

  def formatRating($axisName): "\($axisName) \(.ratings[$axisName] // "–")";

  def formatRatings:
    [
      ([formatRating("ease"), formatRating("convention"), formatRating("agreement")] | join("  ")),
      ([formatRating("intent"), formatRating("truth"), formatRating("durability"), formatRating("integrity"), formatRating("growth")] | join("  ")),
      formatRating("evidence")
    ]
    | join("  │  ");

  def displayedLabel: "\(.label) - \(.percent)%";

  # A multiple choice joins the picked labels with ", " and writes a label holding ", " or a quote as a JSON string.
  def isPickedIn($answer):
    displayedLabel as $label
    | $answer != null
      and ($answer == $label or ($answer | split(", ") | any(.[]; . == $label)) or ($answer | contains($label | tojson)));

  def findTypedText($options):
    ($options | map(displayedLabel)) as $labels
    | reduce (($labels[] | tojson), $labels[]) as $labelForm (.; split($labelForm) | join(""))
    | split(", ")
    | map(select(test("\\S")))
    | join(", ")
    | gsub("^\\s+|\\s+$"; "")
    | . as $text
    | (if test("^\".*\"$"; "s") then (try fromjson catch $text) else $text end)
    | gsub("^\\s+|\\s+$"; "");

  def formatOption($answer):
    isPickedIn($answer) as $isPicked
    | (if $isPicked then "✓" | paint("1;32") else " " end) as $mark
    | (if $isPicked then .label | paint("1") else .label end) as $label
    | "  \($mark) \(.percent | formatPercent)  \($label)\n          \(formatRatings | paint("2"))";

  def formatQuestion($answers):
    .options as $options
    | $answers[.question] as $answer
    | [
        "",
        (.question | paint("1")) + (if .isMultiSelect then "  " + ("(multiple choice)" | paint("2")) else "" end),
        (.options[] | formatOption($answer)),
        (if .isMultiSelect then empty else "    \(100 - ([.options[].percent] | add) | formatPercent)  none of them" | paint("2") end),
        ($answer // "" | findTypedText($options) | select(length > 0) | "  " + ("✎" | paint("33")) + "  " + gsub("\n"; "\n     "))
      ]
    | join("\n");

  def formatAsk($answeredById):
    $answeredById[.toolUseId].answers as $answers
    | [
        "",
        ("━━ \(.at | formatLocalTime)  ·  session \(.sessionId[0:8])  ·  constants v\(.constantsVersion) " | paint("36")),
        (if $answers == null then "  no answer logged" | paint("2") else empty end),
        (.questions[] | formatQuestion($answers))
      ]
    | join("\n");

  [inputs | select(length > 0)] as $lines
  | [$lines[] | fromjson? | select(type == "object")] as $entries
  | ($entries | map(select(.kind == "answered")) | INDEX(.toolUseId)) as $answeredById
  | (($lines | length) - ($entries | length)) as $skippedCount
  | (
      ($entries | map(select(.kind == "asked")) | .[(0 - $askCount):] | .[] | formatAsk($answeredById)),
      (if $skippedCount > 0 then "\n\($skippedCount) unreadable lines skipped" | paint("2") else empty end)
    )
' "$scoreLogPath"
