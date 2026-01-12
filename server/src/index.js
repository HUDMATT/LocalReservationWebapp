const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { run, get, all } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

const ensureLayoutInstance = async (date) => {
  let row = await get('SELECT id FROM layout_instances WHERE date = ?', [date]);
  if (row) {
    return { id: row.id, existed: true };
  }
  const created = await run('INSERT INTO layout_instances (date) VALUES (?)', [date]);
  const layoutId = created.lastID;
  await run(
    'INSERT INTO table_state (layoutInstanceId, tableId, x, y, groupId) SELECT ?, id, defaultX, defaultY, NULL FROM tables',
    [layoutId]
  );
  return { id: layoutId, existed: false };
};

const fetchLayoutPayload = async (layoutInstanceId) => {
  const tables = await all(
    `SELECT ts.tableId, ts.x, ts.y, ts.groupId, t.name, t.width, t.height, t.capacity
     FROM table_state ts
     JOIN tables t ON t.id = ts.tableId
     WHERE ts.layoutInstanceId = ?
     ORDER BY ts.tableId`,
    [layoutInstanceId]
  );

  const groupRows = await all(
    'SELECT groupId, tableId FROM table_state WHERE layoutInstanceId = ? AND groupId IS NOT NULL',
    [layoutInstanceId]
  );
  const groups = {};
  groupRows.forEach((row) => {
    if (!groups[row.groupId]) {
      groups[row.groupId] = [];
    }
    groups[row.groupId].push(row.tableId);
  });
  const groupList = Object.keys(groups).map((groupId) => ({
    groupId: Number(groupId),
    tableIds: groups[groupId]
  }));

  const reservations = await all(
    `SELECT id, groupId, time, name, partySize, notes, createdAt, updatedAt
     FROM reservations
     WHERE layoutInstanceId = ?`,
    [layoutInstanceId]
  );

  return {
    layoutInstanceId,
    tables,
    groups: groupList,
    reservations
  };
};

app.get('/api/tables/default', async (req, res) => {
  try {
    const rows = await all(
      'SELECT id, name, defaultX, defaultY, width, height, capacity FROM tables ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tables.' });
  }
});

app.post('/api/layout/:date/init', async (req, res) => {
  try {
    const { date } = req.params;
    const result = await ensureLayoutInstance(date);
    res.json({ layoutInstanceId: result.id, existed: result.existed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to initialize layout.' });
  }
});

app.get('/api/layout/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const layout = await get('SELECT id FROM layout_instances WHERE date = ?', [date]);
    if (!layout) {
      res.status(404).json({ error: 'Layout not found for date.' });
      return;
    }
    const payload = await fetchLayoutPayload(layout.id);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load layout.' });
  }
});

app.put('/api/layout/:date/table/:tableId', async (req, res) => {
  try {
    const { date, tableId } = req.params;
    const { x, y, groupId } = req.body;
    const layout = await get('SELECT id FROM layout_instances WHERE date = ?', [date]);
    if (!layout) {
      res.status(404).json({ error: 'Layout not found.' });
      return;
    }
    const updates = [];
    const params = [];
    if (Number.isFinite(x)) {
      updates.push('x = ?');
      params.push(Math.round(x));
    }
    if (Number.isFinite(y)) {
      updates.push('y = ?');
      params.push(Math.round(y));
    }
    if (groupId === null || Number.isFinite(groupId)) {
      updates.push('groupId = ?');
      params.push(groupId);
    }
    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update.' });
      return;
    }
    params.push(layout.id, tableId);
    await run(
      `UPDATE table_state SET ${updates.join(', ')} WHERE layoutInstanceId = ? AND tableId = ?`,
      params
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update table.' });
  }
});

app.post('/api/layout/:date/group', async (req, res) => {
  try {
    const { date } = req.params;
    const { tableIds } = req.body;
    if (!Array.isArray(tableIds) || tableIds.length === 0) {
      res.status(400).json({ error: 'tableIds required.' });
      return;
    }
    const layout = await get('SELECT id FROM layout_instances WHERE date = ?', [date]);
    if (!layout) {
      res.status(404).json({ error: 'Layout not found.' });
      return;
    }

    const placeholders = tableIds.map(() => '?').join(',');
    const existingGroups = await all(
      `SELECT DISTINCT groupId FROM table_state WHERE layoutInstanceId = ? AND tableId IN (${placeholders}) AND groupId IS NOT NULL`,
      [layout.id, ...tableIds]
    );
    if (existingGroups.length > 0) {
      const groupIds = existingGroups.map((row) => row.groupId);
      const groupPlaceholders = groupIds.map(() => '?').join(',');
      const reserved = await get(
        `SELECT COUNT(*) AS count FROM reservations WHERE layoutInstanceId = ? AND groupId IN (${groupPlaceholders})`,
        [layout.id, ...groupIds]
      );
      if (reserved.count > 0) {
        res.status(409).json({ error: 'Remove reservations before regrouping.' });
        return;
      }
      await run(
        `UPDATE table_state SET groupId = NULL WHERE layoutInstanceId = ? AND tableId IN (${placeholders})`,
        [layout.id, ...tableIds]
      );
      await run(
        `DELETE FROM table_groups
         WHERE layoutInstanceId = ?
           AND id IN (${groupPlaceholders})
           AND id NOT IN (
             SELECT DISTINCT groupId FROM table_state WHERE layoutInstanceId = ? AND groupId IS NOT NULL
           )`,
        [layout.id, ...groupIds, layout.id]
      );
    }

    const newGroup = await run('INSERT INTO table_groups (layoutInstanceId) VALUES (?)', [
      layout.id
    ]);
    const groupId = newGroup.lastID;

    await run(
      `UPDATE table_state SET groupId = ? WHERE layoutInstanceId = ? AND tableId IN (${placeholders})`,
      [groupId, layout.id, ...tableIds]
    );

    res.json({ groupId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create group.' });
  }
});

app.post('/api/layout/:date/ungroup', async (req, res) => {
  try {
    const { date } = req.params;
    const { groupId } = req.body;
    if (!Number.isFinite(groupId)) {
      res.status(400).json({ error: 'groupId required.' });
      return;
    }
    const layout = await get('SELECT id FROM layout_instances WHERE date = ?', [date]);
    if (!layout) {
      res.status(404).json({ error: 'Layout not found.' });
      return;
    }

    const existingReservation = await get(
      'SELECT id FROM reservations WHERE layoutInstanceId = ? AND groupId = ?',
      [layout.id, groupId]
    );
    if (existingReservation) {
      res.status(409).json({ error: 'Remove the reservation before ungrouping.' });
      return;
    }

    await run(
      'UPDATE table_state SET groupId = NULL WHERE layoutInstanceId = ? AND groupId = ?',
      [layout.id, groupId]
    );
    await run('DELETE FROM table_groups WHERE id = ? AND layoutInstanceId = ?', [
      groupId,
      layout.id
    ]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to ungroup.' });
  }
});

app.post('/api/layout/:date/reservation', async (req, res) => {
  try {
    const { date } = req.params;
    const { groupId, reservationId, time, name, partySize, notes } = req.body;
    if (!Number.isFinite(groupId) || !time || !name || !Number.isFinite(partySize)) {
      res.status(400).json({ error: 'Missing reservation fields.' });
      return;
    }
    const layout = await get('SELECT id FROM layout_instances WHERE date = ?', [date]);
    if (!layout) {
      res.status(404).json({ error: 'Layout not found.' });
      return;
    }
    const now = new Date().toISOString();
    if (Number.isFinite(reservationId)) {
      const existing = await get(
        'SELECT id FROM reservations WHERE id = ? AND layoutInstanceId = ?',
        [reservationId, layout.id]
      );
      if (!existing) {
        res.status(404).json({ error: 'Reservation not found.' });
        return;
      }
      await run(
        'UPDATE reservations SET time = ?, name = ?, partySize = ?, notes = ?, updatedAt = ? WHERE id = ?',
        [time, name, partySize, notes || null, now, reservationId]
      );
      res.json({ id: reservationId, groupId, time, name, partySize, notes: notes || null });
      return;
    }
    const created = await run(
      'INSERT INTO reservations (layoutInstanceId, groupId, time, name, partySize, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [layout.id, groupId, time, name, partySize, notes || null, now, now]
    );
    res.json({ id: created.lastID, groupId, time, name, partySize, notes: notes || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save reservation.' });
  }
});

app.delete('/api/layout/:date/reservation/:reservationId', async (req, res) => {
  try {
    const { date, reservationId } = req.params;
    const layout = await get('SELECT id FROM layout_instances WHERE date = ?', [date]);
    if (!layout) {
      res.status(404).json({ error: 'Layout not found.' });
      return;
    }
    await run('DELETE FROM reservations WHERE id = ? AND layoutInstanceId = ?', [
      reservationId,
      layout.id
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete reservation.' });
  }
});

const clientBuildPath = path.join(__dirname, '..', '..', 'client', 'build');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
