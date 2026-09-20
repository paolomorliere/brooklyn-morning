import { useRef, useState } from 'preact/hooks';
import { ChevronLeft, FileUp, SlidersHorizontal } from 'lucide-preact';
import { TOPIC_META, TOPIC_ORDER } from '@/types';
import { BackupSection } from './settings/BackupSection';
import { GrocerySection } from './settings/GrocerySection';
import { CategoriesSheet } from './todo/CategoriesSheet';
import { Sheet } from '@/ui/Sheet';
import { useToast } from '@/ui/Toast';
import { prefsStore, updatePrefs } from '@/state/prefs';
import { todoStore } from '@/state/todo';
import { lessonActions, lessonStore } from '@/state/lessons';
import { readFileAsText } from '@/lib/share';
import { navigate } from '@/ui/router';

export function Settings() {
  const prefs = prefsStore.use();
  const todo = todoStore.use();
  const lessons = lessonStore.use();
  const toast = useToast();
  const [cats, setCats] = useState(false);
  const [licences, setLicences] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const importPack = async (f: File | undefined) => {
    if (!f) return;
    try {
      const err = await lessonActions.importPack(JSON.parse(await readFileAsText(f)));
      toast({ message: err ? `Not imported: ${err}` : 'Lesson pack imported' });
    } catch {
      toast({ message: 'Not imported: file is not valid JSON' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const readCount = lessons.progress?.readLessonIds.length ?? 0;

  return (
    <main class="screen">
      <header class="screen-header" style="align-items:center">
        <button class="icon-btn" aria-label="Back" onClick={() => (history.length > 1 ? history.back() : navigate('home'))} style="margin-left:-12px">
          <ChevronLeft size={24} />
        </button>
        <h1 style="flex:1">Settings</h1>
      </header>

      <div class="section-title"><h2>Morning</h2></div>
      <div class="row-btn" style="cursor:default;flex-wrap:wrap">
        <span class="grow">
          <div>Stories per topic</div>
          <div class="small muted">{prefs.storiesPerSection} each · about {Math.round(prefs.storiesPerSection * 1.6 + 3)} min with the lesson</div>
        </span>
        <div class="qty" aria-label={`Stories per topic ${prefs.storiesPerSection}`}>
          <button aria-label="Fewer stories" onClick={() => void updatePrefs({ storiesPerSection: Math.max(1, prefs.storiesPerSection - 1) })}>−</button>
          <span>{prefs.storiesPerSection}</span>
          <button aria-label="More stories" onClick={() => void updatePrefs({ storiesPerSection: Math.min(6, prefs.storiesPerSection + 1) })}>+</button>
        </div>
      </div>
      <div class="row-btn" style="cursor:default;display:block">
        <div>Topics</div>
        <div class="chip-row" style="margin:8px 0 0;padding-inline:0;flex-wrap:wrap;overflow:visible">
          {TOPIC_ORDER.map((t) => (
            <button key={t} class="chip" aria-pressed={prefs.topicsEnabled[t]} onClick={() => void updatePrefs({ topicsEnabled: { ...prefs.topicsEnabled, [t]: !prefs.topicsEnabled[t] } })}>
              {TOPIC_META[t].label}
            </button>
          ))}
        </div>
      </div>
      <div class="row-btn" style="cursor:default">
        <span class="grow">
          <div>Lessons</div>
          <div class="small muted">
            {lessons.totalWeeksAvailable} weeks ({lessons.totalWeeksAvailable * 7} lessons) downloaded · {readCount} read
            {lessons.progress ? ` · sequence started ${lessons.progress.startMonday}` : ''}
          </div>
          <div class="small faint" style="margin-top:4px">New weeks appear automatically when they are published. After the last week the app revisits earlier weeks and says so.</div>
        </span>
      </div>
      <button class="row-btn" onClick={() => fileRef.current?.click()}>
        <FileUp size={20} />
        <span class="grow">
          <div>Import a lesson pack (optional)</div>
          <div class="small muted">A week-NN.json file following the schema in the repo</div>
        </span>
      </button>
      <input ref={fileRef} type="file" accept="application/json,.json" class="visually-hidden" aria-label="Choose lesson pack" onChange={(e) => void importPack((e.target as HTMLInputElement).files?.[0])} />

      <BackupSection />

      <div class="section-title"><h2>To Do</h2></div>
      <button class="row-btn" onClick={() => setCats(true)}>
        <SlidersHorizontal size={20} />
        <span class="grow">
          <div>Manage categories</div>
          <div class="small muted">{todo.categories.length} categories · add, rename, reorder, remove</div>
        </span>
      </button>

      <GrocerySection />

      <div class="section-title"><h2>About</h2></div>
      <div class="row-btn" style="cursor:default">
        <span class="grow">
          <div>Brooklyn Morning</div>
          <div class="small muted">Personal app. No accounts, no tracking, no ads. Everything is stored on this phone only.</div>
        </span>
      </div>
      <button class="row-btn" onClick={() => setLicences(true)}>
        <span class="grow">
          <div>Sources and licences</div>
          <div class="small muted">News feeds, Open Food Facts, fonts, icons</div>
        </span>
      </button>

      {cats && <CategoriesSheet categories={todo.categories} tasks={todo.tasks} onClose={() => setCats(false)} />}
      {licences && (
        <Sheet title="Sources and licences" onClose={() => setLicences(false)}>
          <div style="font-size:var(--fs-15);line-height:1.6">
            <h3 style="font-size:var(--fs-18);margin-top:8px">News</h3>
            <p class="muted">Headlines and excerpts come from each publisher's public RSS feed and are shown as the publisher wrote them, labeled "From publisher". Where shown, "Opening of the article" is the first paragraphs of the article page, unedited, fetched when the edition was prepared. The app never rewrites or summarizes articles. Tap any headline to read the original on the publisher's site.</p>
            <h3 style="font-size:var(--fs-18);margin-top:16px">Groceries</h3>
            <p class="muted">Product names, sizes, and photos come from Open Food Facts (openfoodfacts.org), a non-profit open database. Data: Open Database License (ODbL). Photos: Creative Commons BY-SA, © their contributors. Trader Joe's is a trademark of its owner; this app is not affiliated with Trader Joe's. Being listed does not mean a store stocks the item.</p>
            <h3 style="font-size:var(--fs-18);margin-top:16px">Lessons and glossary</h3>
            <p class="muted">Written for this app. Educational only; not financial, legal, or medical advice.</p>
            <h3 style="font-size:var(--fs-18);margin-top:16px">Software</h3>
            <p class="muted">Fraunces and Inter typefaces (SIL Open Font License). Lucide icons (ISC). Preact, Vite, idb, Workbox and other open-source libraries (MIT/Apache). Hosted on GitHub Pages.</p>
          </div>
        </Sheet>
      )}
    </main>
  );
}
