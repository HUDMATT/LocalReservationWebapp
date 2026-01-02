# LocalReservationWebapp

Lightweight, local-only restaurant reservation system designed for Windows 7. Runs fully offline on localhost with a React SPA, Node.js + Express API, and a local SQLite database.

## Requirements (Windows 7)
- Node.js 14.x (last major line that supports Windows 7).
- npm (comes with Node.js).

## Project structure
- `server/` Node.js + Express API + SQLite.
- `client/` React single-page app.
- `scripts/` helper `.cmd` launch scripts.

## Database setup
The SQLite file is stored at:
- `server/db/reservations.sqlite`

Initialize schema + seed data (12 sample tables):
```bash
cd server
npm install
npm run db:setup
```

If you want to change the default floor layout, edit `server/db/seed.sql` and re-run `npm run db:setup` on a fresh database.

## Run (development)
Terminal 1:
```bash
cd server
npm install
npm start
```

Terminal 2:
```bash
cd client
npm install
npm start
```

Then open: http://localhost:3000

## Build for production
```bash
cd client
npm run build
```

The server will automatically serve `client/build` when it exists. After building the client, run:
```bash
cd server
npm start
```

Open: http://localhost:4000

## Start on boot (Task Scheduler)
You can use the provided scripts:
- `scripts/start-server.cmd` (runs the server)
- `scripts/start-client.cmd` (runs the React dev server)

For production mode, use the server only (client build is served by Express). Suggested Task Scheduler setup:
1. Create a new task.
2. Trigger: At startup.
3. Action: Start a program.
   - Program/script: `C:\Path\To\node.exe`
   - Add arguments: `C:\Path\To\LocalReservationWebapp\server\src\index.js`
   - Start in: `C:\Path\To\LocalReservationWebapp\server`
4. Check "Run whether user is logged on or not" and "Run with highest privileges".

Alternatively point the task to `scripts/start-server.cmd`.

## Backup
To back up the database, stop the server and copy:
- `server/db/reservations.sqlite`

## API endpoints
- `GET /api/tables/default`
- `POST /api/layout/:date/init`
- `GET /api/layout/:date`
- `PUT /api/layout/:date/table/:tableId`
- `POST /api/layout/:date/group`
- `POST /api/layout/:date/ungroup`
- `POST /api/layout/:date/reservation`
- `DELETE /api/layout/:date/reservation/:reservationId`

## Notes
- Layouts are initialized per date the first time you open a date.
- Grouping is blocked if a reservation exists for that group (delete reservation first).
- Everything runs locally and offline.
