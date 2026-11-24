# exercises/

This is where the exercises you interview with live, and git ignores everything in here except the files the platform keeps (this one, `AGENTS.md`, `CLAUDE.md` and `_templates/`). It starts empty on purpose: your exercises, and the work of every candidate, stay on your machine.

Ways to fill it:

- `make new-exercise` makes one that runs right away, or copies an example from `examples/`.
- `make config` offers the examples, and `make exercises` brings in the exercises of a git repository or a folder you list under `sources:` in `interview.config.yaml`, which is how a company keeps its own set in its own repository.
- Copy a folder in by hand. Any folder with a `description.md` shows up in `make start`.
