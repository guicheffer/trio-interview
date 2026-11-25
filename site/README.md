# The landing page

`index.html` is the page. `app/` holds what the page scrolls through: each `scene-*.html` is the real markup and the real, pruned stylesheet of the running app, so the replica looks like it. Nothing in there is a screenshot.

## Rebuild after the app changes

The scenes are made from what was captured out of the running app, kept in `source/`:

| File | What it is |
| --- | --- |
| `welcome.html`, `picker.html`, `workspace.html`, `interviewer.html`, `revealed.html` | The rendered markup of each screen |
| `fibonacci-workspace.html` | The workspace with the exercise file open, editor and terminals included |
| `fibonacci-session.json` | The exercise file before and after the assistant's change, and the two terminals as the app drew them |

```bash
python3 scripts/build-site.py <capture with the app's stylesheet inlined> site/app   # prunes the stylesheet into app.css
python3 scripts/build-landing.py                                                     # writes the scene-*.html files
npx vitest run scripts/__tests__                                                     # checks them against the real editor and Node
```

To capture a screen, open it in the app, serialize the document with the stylesheets inlined and read the editor's own stylesheet from `vendor/monaco/`. A page cannot read the rules of a stylesheet that comes from another origin (the editor's comes from a CDN), so a capture made from `document.styleSheets` silently lacks them.

## What is real and what is a script

The editor draws the exercise file with the same classes and colours as the app, and the Run button runs the code that is in it, in a Worker, and prints what it logs the way Node does. The request to the assistant and its answer are a script: the terminal rows are written by `scripts/` from the exercise file before and after (the colours are those the real tool printed), and the closing message is text we wrote, so it is not a recording of a session.

## Credits

`fonts/` holds the Geist fonts the app uses (SIL Open Font License 1.1) and `vendor/monaco/` the stylesheet of monaco-editor 0.55.1 (MIT, see its LICENSE).
