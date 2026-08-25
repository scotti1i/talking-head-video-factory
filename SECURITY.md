# Security

This repository must never contain customer footage, transcripts, review jobs, API keys, credentials, local environment files, Whisper models, or machine-specific configuration.

If you discover a credential or private customer artifact in git history, do not open a public issue containing the value. Revoke the credential first, then contact the repository owner privately through GitHub.

Runtime secrets belong in `~/.config/talking-head-factory/env` with mode `600`. Windows Inbox/Outbox contents and WSL `jobs/` are local state and are intentionally excluded from version control.
