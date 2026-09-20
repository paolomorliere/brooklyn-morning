// Assemble lesson packs from scripts/lessons/week-*.mjs into public/data/lessons/*.json + lessons.index.json.
// Validates: 7 lessons per week, required fields, unique ids. Read time estimated at ~200 wpm.
import { mkdir, readdir, writeFile } from 'node:fs/promises';

const dir = 'scripts/lessons';
const files = (await readdir(dir)).filter((f) => /^week-\d+\.mjs$/.test(f)).sort();
const index = { schemaVersion: 1, weeks: [] };
let total = 0;
await mkdir('public/data/lessons', { recursive: true });
for (const f of files) {
  const { default: w } = await import(`../${dir}/${f}`);
  if (w.lessons.length !== 7) throw new Error(`${f}: expected 7 lessons, got ${w.lessons.length}`);
  const lessons = w.lessons.map((l, i) => {
    for (const k of ['title', 'explanation', 'example']) if (!l[k] || (Array.isArray(l[k]) && !l[k].length)) throw new Error(`${f} lesson ${i + 1}: missing ${k}`);
    const words = [...l.explanation, ...l.example, l.exercise?.prompt ?? '', l.exercise?.answer ?? ''].join(' ').split(/\s+/).length;
    return { id: `week-${String(w.week).padStart(2, '0')}-d${i + 1}`, week: w.week, day: i + 1, theme: w.theme, title: l.title, explanation: l.explanation, example: l.example, exercise: l.exercise ?? null, readMinutes: Math.max(2, Math.round(words / 170)) };
  });
  const out = `week-${String(w.week).padStart(2, '0')}.json`;
  await writeFile(`public/data/lessons/${out}`, JSON.stringify({ schemaVersion: 1, week: w.week, theme: w.theme, lessons }, null, 1));
  index.weeks.push({ week: w.week, theme: w.theme, file: out });
  total += lessons.length;
  console.log(`${out}: ${w.theme} (${lessons.map((l) => l.readMinutes).join('/')} min)`);
}
await writeFile('public/data/lessons/lessons.index.json', JSON.stringify(index, null, 1));
console.log(`${index.weeks.length} weeks, ${total} lessons`);
