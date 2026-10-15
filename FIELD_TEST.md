# Real-world test scenario (manual)

This is a repeatable “field test” script to validate the system in conditions similar to real usage (coach with a phone/tablet during a match).

## Setup
- Backend running on `127.0.0.1:8000`
- Frontend running on `127.0.0.1:5173`
- Seed demo data:

```bash
cd backend
source .venv/bin/activate
python -m app.scripts.seed
```

Demo accounts:
- `coach@demo.local` / `coach`
- `assistant@demo.local` / `assistant`

## Scenario A: full match flow (recommended)
1. **Login** as coach.
2. Go to **Zápasy**.
3. Use existing seeded match (ID shown by the seed script) or create a new match.
4. Open **Sestava** and confirm:
   - 11 starters and up to 5 subs
   - no duplicate match jersey numbers
5. Click **Start** (match becomes live).
6. Open **Live** for the match.
7. During the match, repeatedly record events:
   - goals/assists
   - cards
   - shots
   - passes/duels
   - use correct half + time in seconds
8. Validate on-screen:
   - roster stats increment immediately after each event
   - timeline shows the last events
9. After the match, fill **Hodnocení hráčů (1–10)** and save.
10. Go to **Analytika**:
    - check season team summary
    - check leaderboards
    - check player performance charts (rating should appear if filled)
11. Export:
    - players CSV export
    - match events export
## Scenario B: assistant workflow
1. Login as `assistant@demo.local`.
2. Open an already-started match.
3. Record events.
4. Verify assistant cannot:
   - create/delete players
   - create matches
   - save lineup/start/finish
   - export/import (coach-only)
## Data correctness checks
- Verify that "−" undoes the last event of that type for the player, that stats never go negative, and that a removed event disappears from the list and the CSV export.
- Verify a failed pass ("Nepřesná přihrávka") is counted separately from successful passes.
- Verify events are rejected unless match is **live**.
- Verify all data are scoped to the logged-in club.
