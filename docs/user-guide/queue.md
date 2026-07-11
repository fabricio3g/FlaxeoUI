# Job queue

Flaxeo runs **one** generation at a time (sd-cli single-flight). The queue lets you line up more work safely.

## Basics

- **Generate while busy** → job goes to **Waiting**.
- **Queue** button (command strip) shows count badge.
- **Pause** finishes the current job then stops starting more.
- **Cancel current** aborts the running job; the next waiting job starts.
- **Clear** under Recent removes done / failed / cancelled history in the panel (not gallery files).

## Tips

- Reorder with ↑↓ before a job starts.
- Form jobs (Edit / Video with uploads) keep file snapshots in memory until the app restarts.
- Progress chip shows phase (loading encoder → diffusion → VAE, etc.).
