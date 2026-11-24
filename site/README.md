# The landing page

`index.html` is the page, and `app/` holds the replica of the app that the page scrolls through. Nothing in `app/` is a screenshot: each `scene-*.html` is the real markup and the real, pruned stylesheet of the running app, so the replica looks exactly like it.

## Rebuild the replica after the app changes

1. Run the app (`make start`, or `npm run dev`) with a candidate named like the demo one and open each screen: the name page, the list of candidates, the candidate's workspace, and the interviewer's view with the phases hidden and then revealed.
2. Save the rendered document of each screen as `workspace.html`, `welcome.html`, `picker.html`, `interviewer.html` and `revealed.html` with its stylesheet inlined, then run `python3 scripts/build-site.py` on the workspace one to prune the stylesheet into `site/app/app.css`.
3. Put the markup of each screen in `site/app/<name>.frag.html`, then run `python3 scripts/build-landing.py` to write the four `scene-*.html` files.

Compare the pruned page with the real one pixel by pixel before you publish, as a stylesheet that is pruned too much loses the dark mode first.

## Fonts

`fonts/` has the Geist and Geist Mono files the app itself uses, under the SIL Open Font License 1.1 (https://openfontlicense.org/).
