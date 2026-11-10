# Project Instructions

## Stack
- Use Node.js and Express on the server, with SQLite via `better-sqlite3` for persistence.
- Build the frontend with plain HTML, CSS, and JavaScript in `public/`.
- Do not use React or other frontend frameworks.

## Coding Style
- Assume the project owner is a beginner. Keep code straightforward and avoid unnecessary abstractions.
- Add short comments where they help explain non-obvious code.
- Explain code changes in plain language, including what changed and why.
- Keep `server.js` small. Put HTTP route handlers in `routes/`, database setup and queries in `db/`, and reusable business logic in `services/`.

## Server and Data Safety
- Validate all client-provided input on the server before using it.
- Return clear, consistent JSON error responses with appropriate HTTP status codes.
- Never hard-code secrets. Load configuration from a `.env` file using `dotenv`, and ensure `.env` is listed in `.gitignore`.
- This is a South African app. Verify that a client has valid POPIA consent before sending them any message. Enforce this check on the server, not only in the browser.

## Terminal Commands
- Before running any terminal command, show the exact command and briefly explain what it does.
- Wait for the project owner to explicitly confirm before running the command or proceeding with work that depends on its result.
- Do not run terminal commands before confirmation, even for routine setup, tests, or installs.
