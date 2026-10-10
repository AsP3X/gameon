# No deprecated APIs

**Applies to:** every code change, in `web/` and `server/`.

Do not call, extend, or suppress a deprecated API, type, method, library, or language feature.
Search the change for `@deprecated`, `#[deprecated]`, deprecation warnings from `cargo`, `tsc` and
the linter, and any `#[allow(deprecated)]` or lint-disable comment that hides one.

- Replace each use with the current supported API.
- If the platform or library has no supported replacement, implement the behavior in the project.
- Do not add a new deprecated shim so callers can keep the old path.
- Do not silence a deprecation to leave the old call in place.

When you add a dependency, use its current major version and its current API (for example the
`rand` 0.9 names, not the 0.8 ones they replaced).
