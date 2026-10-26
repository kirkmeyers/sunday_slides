# Sunday request file format

The slide listener on Pro 3 reads the communicator's manuscript each Sunday and writes this file into the service folder on creative.space:

```
/Volumes/Video_Team/_Service Prep/Sunday/<YYYYMMDD>_DAL/Sermon content/<YYYYMMDD>_DAL_requests.txt
```

The Sunday slide tool loads it. It's plain UTF-8 text, one line per entry, in the order things happen in the sermon. Real examples are in `samples/sunday/`.

## Header

Lines starting with `#` come first. Unknown keys are ignored, so new ones can be added later.

```
# format: sunday-requests 1
# service: 2026-10-25
# title: TA- Acts 27 (When Trials Come)
# series: Acts
# communicator: Timothy Ateek
# translation: ESV
# passage: Acts 27
```

| Key | Meaning |
| --- | --- |
| `format` | Always `sunday-requests 1` for this version. |
| `service` | The Sunday's date, `YYYY-MM-DD`. |
| `title`, `series` | From the Planning Center plan. |
| `communicator` | Who's preaching. |
| `translation` | The translation assumed when a scripture line doesn't name one. |
| `passage` | The sermon's main passage, from the manuscript's title line, if it has one. |

A `# flag:` line can appear anywhere in the header. It's something a person should check, in plain words: `# flag: Check 2 scripture references: Acts 26:1-8, Acts 26:19-20`.

## Entries

Each entry starts with a type and a colon.

| Line | Meaning | Example |
| --- | --- | --- |
| `Point:` | A sermon point. One slide. | `Point: Pray for a miracle` |
| `Scripture:` | A scripture slide (or slides). The reference, with the translation in parentheses when it isn't the header's. | `Scripture: Acts 26:9-11` |
| `> ` | The verse text, on the lines right after a `Scripture:` line, as the communicator wrote it in the manuscript. Verse numbers stay inline. | `> 9 “I myself was convinced…` |
| `Quote:` | A quote. The quote comes first, then ` – ` and who said it. | `Quote: “You have, like no other person…” – Charles Swindoll` |
| `Text:` | Any other on-screen text: a question, a prompt, a list item. One slide. | `Text: There was a time in my life when…` |
| `Cue:` | A production cue at this point in the sermon (pink in TA's manuscripts). Not a slide; it's for the operator, and the tool can turn it into a slide note or a placeholder. | `Cue: Show Truman Show poster` |

Notes for the tool:

- **Scripture text:** the `>` lines are what the manuscript says, already checked against ESV by the listener. A `Scripture:` line may be followed by `# check: …` when it needs a look (`# check: Doesn't match ESV closely`). The tool can use the `>` text as is, or fetch the passage itself by reference.
- **Long passages** come as one entry (Acts 26:1-8 is eight verses). Splitting them across slides is the tool's decision.
- **Blank lines** don't mean anything; skip them.
- **Order** matters: entries, including cues, are in sermon order.
