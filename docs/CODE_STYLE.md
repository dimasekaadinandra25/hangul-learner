# Code style

How the code in this repo is written, so any developer can read and change it.

## How the app is put together

- `ui/` is the whole interface: plain HTML, CSS and JavaScript, no framework and no build step. Tauri shows `ui/index.html` in a window.
- The scripts are classic `<script>` tags (not modules), loaded in the order listed at the bottom of `ui/index.html`. They all share **one global scope**: a top-level `const`, `let` or `function` in one file can be used by every file loaded after it.
- Because of that shared scope, two files must never declare the same top-level name. `npm run check` fails if they do.
- `ui/content/` holds the learning content: words, grammar, stories, conversations. `ui/js/` holds the code. `ui/css/` holds the styles.
- `src-tauri/src/main.rs` is the Rust side: saving files, downloads, the tray, notifications, the mini window.

## Rules for code

1. One statement per line. Indent with 2 spaces. Keep lines under about 120 characters.
2. Use names that say what a thing is: `progress`, `unitIndex`, `wrongAnswers`, not `p`, `i2`, `w`. Short names are fine for tiny lambdas (`x => x.id`) and loop counters.
3. Put a short comment above every top-level function that says what it does, or why it exists, when the name alone doesn't make that clear.
4. Start each file with a header comment: what the file is for, what it needs from earlier files, and the main names it provides to later files.
5. Prefer `if`/`else` or a lookup object over long chains of `? :`.
6. When a function grows past about 40 lines, split it into helpers with clear names.
7. Comments explain *why* (a Korean grammar rule, a browser quirk, a saved-file format), not *what* the next line does.

## Names that must stay as they are

Other files and the end-to-end tests (`tools/e2e/e2e.js`) use these, so renaming one means changing every user:

- top-level names (`P` is the learner's progress, `L` the running lesson, `UNITS`, `VOCAB`, `speak`, `show` and so on);
- element ids, CSS classes and `data-*` attributes;
- the fields saved in `progress.json` and the `localStorage` keys (saved files must keep loading);
- the names of the Tauri commands in `main.rs`.

## Checking a change

- `npm run check` runs the logic checks (lesson building, scheduling, Korean grammar helpers, content rules).
- `npm run e2e` builds the app and drives it like a learner would (about 160 tests).
