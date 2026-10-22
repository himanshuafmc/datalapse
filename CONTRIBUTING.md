# Contributing

Thanks for helping. The most useful contributions right now:

- **Stories.** A well-sourced story spec (`stories/*.json`) on a topic people care about. Include the data source in `meta.sources_long` and on screen.
- **CSVs that import badly.** Open an issue with a small sample of the file (or its first rows) and what you expected.
- **Scene types.** See [AGENTS.md](AGENTS.md) for the five steps.
- **Catalogue entries.** Well-known indicators with an open licence (add them to `src/online/catalogue.js`; new sites also need adding to `src/online/hosts.js`, which is reviewed carefully).
- **Translations** of the interface, and fixed words on screen ("Data:", "SUBSCRIBE") in more languages (`src/spec/translate.js`).
- **Layouts.** If something looks cramped in one of the four formats, a screenshot and a story file that shows it are a great issue.

## How to work

1. Fork, then `npm install`.
2. Make the change. Keep pull requests to one topic.
3. Run `npm test`, `npm run build` and `npm run verify`. Run `npm run parity` if you touched the engine (`src/core`, `src/render`, `src/scenes`). Look at the screenshots in `tests/screenshots`.
4. Describe what changed and why. Add before/after screenshots for anything visual.

## Data in example stories

Use data with an open licence (CC BY, public domain or similar), name the source on screen, and note any licence terms in [DATA_SOURCES.md](DATA_SOURCES.md). Don't add data you can't trace to its origin.

## Code of conduct

Be kind, assume good intent, and keep discussions about the work.
