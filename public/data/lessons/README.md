# Lesson packs

One JSON file per week, listed in `lessons.index.json`. The app downloads any week it does not have yet every time it fetches the edition, so adding a file here and to the index is all it takes to extend the sequence — no action on the phone.

Source of truth is `scripts/lessons/week-NN.mjs`; run `node scripts/build-lessons.mjs` to regenerate the JSON (it validates 7 lessons per week and computes read times).

## Schema (`week-NN.json`)
```json
{
  "schemaVersion": 1,
  "week": 9,
  "theme": "Short theme name",
  "lessons": [
    {
      "id": "week-09-d1",
      "week": 9,
      "day": 1,
      "theme": "Short theme name",
      "title": "Lesson title",
      "explanation": ["Paragraph", "Paragraph", "Paragraph"],
      "example": ["Paragraph"],
      "exercise": { "prompt": "Question", "answer": "Answer" },
      "readMinutes": 3
    }
  ]
}
```
`exercise` may be `null`. Days run 1 (Monday) to 7 (Sunday). Ids must be unique.

## Rules
- Readable over coffee: no code, no tasks that need a computer.
- Structure: explanation → example → optional exercise with a revealable answer.
- Educational only; nothing here is financial, legal, or medical advice.
- When the app runs past the last week it cycles back and labels the card "Review week". It never presents old content as new.
