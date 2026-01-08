import React, { useEffect, useMemo, useRef, useState } from 'react';

type TableItem = {
  tableId: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  capacity?: number | null;
  groupId: number | null;
};

type Group = {
  groupId: number;
  tableIds: number[];
};

type Reservation = {
  id: number;
  groupId: number;
  time: string;
  name: string;
  partySize: number;
  notes?: string | null;
};

type ModalState = {
  groupId: number;
  tableNames: string;
  reservation: Reservation | null;
};

type ToastState = {
  message: string;
  type?: 'error';
};

const API_BASE = 'http://localhost:4000/api';

const formatTime = (time: string) => {
  const [hourStr, minuteStr] = time.split(':');
  const hour = Number(hourStr);
  if (Number.isNaN(hour)) {
    return time;
  }
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${minuteStr} ${suffix}`;
};

const todayISO = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const App: React.FC = () => {
  const [dateInput, setDateInput] = useState(todayISO());
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [tables, setTables] = useState<TableItem[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(957);
  const notificationTimeouts = useRef<number[]>([]);

  const dragRef = useRef<{
    tableId: number;
    startX: number;
    startY: number;
    pointerStartX: number;
    pointerStartY: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const reservationByGroup = useMemo(() => {
    const map = new Map<number, Reservation>();
    reservations.forEach((res) => map.set(res.groupId, res));
    return map;
  }, [reservations]);

  const groupMap = useMemo(() => {
    const map = new Map<number, Group>();
    groups.forEach((group) => map.set(group.groupId, group));
    return map;
  }, [groups]);

  const selectedGroupId = useMemo(() => {
    if (selectedTableIds.length === 0) {
      return null;
    }
    const groupIds = selectedTableIds
      .map((id) => tables.find((table) => table.tableId === id)?.groupId ?? null)
      .filter((id): id is number => id !== null);
    if (groupIds.length !== selectedTableIds.length) {
      return null;
    }
    const unique = new Set(groupIds);
    if (unique.size !== 1) {
      return null;
    }
    return groupIds[0];
  }, [selectedTableIds, tables]);

  const showToast = (message: string, type?: 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      showToast('Notifications are not supported in this browser.', 'error');
      return;
    }
    if (Notification.permission === 'granted') {
      showToast('Notifications already enabled.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Notifications blocked. Enable them in Chrome settings.', 'error');
    }
  };

  const clearNotifications = () => {
    notificationTimeouts.current.forEach((id) => window.clearTimeout(id));
    notificationTimeouts.current = [];
  };

  const scheduleNotifications = () => {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }
    clearNotifications();
    if (!activeDate) {
      return;
    }
    const now = Date.now();
    reservations.forEach((reservation) => {
      const [hourStr, minuteStr] = reservation.time.split(':');
      const hour = Number(hourStr);
      const minute = Number(minuteStr);
      if (Number.isNaN(hour) || Number.isNaN(minute)) {
        return;
      }
      const reservationDateTime = new Date(`${activeDate}T${reservation.time}:00`);
      const offsets = [
        { minutes: 60, label: '1 hour' },
        { minutes: 30, label: '30 minutes' }
      ];
      offsets.forEach((offset) => {
        const notifyAt = reservationDateTime.getTime() - offset.minutes * 60 * 1000;
        const delay = notifyAt - now;
        if (delay <= 0) {
          return;
        }
        const timeoutId = window.setTimeout(() => {
          new Notification('Upcoming reservation', {
            body: `${reservation.name} in ${offset.label} (${formatTime(reservation.time)})`
          });
        }, delay);
        notificationTimeouts.current.push(timeoutId);
      });
    });
  };

  const loadLayout = async (date: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/layout/${date}`);
      if (!response.ok) {
        throw new Error('Failed to load layout.');
      }
      const payload = await response.json();
      setTables(payload.tables);
      setGroups(payload.groups);
      setReservations(payload.reservations);
      setSelectedTableIds([]);
    } catch (err) {
      showToast('Could not load layout.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openDate = async () => {
    if (!dateInput) {
      showToast('Pick a date first.', 'error');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/layout/${dateInput}/init`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to initialize layout.');
      }
      setActiveDate(dateInput);
      await loadLayout(dateInput);
    } catch (err) {
      showToast('Could not open date.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const refreshLayout = async () => {
    if (!activeDate) {
      return;
    }
    await loadLayout(activeDate);
  };

  const handleTableClick = (tableId: number, event: React.MouseEvent) => {
    if (event.shiftKey) {
      setSelectedTableIds((prev) =>
        prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]
      );
      return;
    }
    setSelectedTableIds([tableId]);
  };

  const handlePointerDown = (table: TableItem, event: React.PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    dragRef.current = {
      tableId: table.tableId,
      startX: table.x,
      startY: table.y,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY
    };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current) {
      return;
    }
    const { tableId, startX, startY, pointerStartX, pointerStartY } = dragRef.current;
    const deltaX = event.clientX - pointerStartX;
    const deltaY = event.clientY - pointerStartY;
    setTables((prev) =>
      prev.map((table) =>
        table.tableId === tableId
          ? { ...table, x: Math.max(0, startX + deltaX), y: Math.max(0, startY + deltaY) }
          : table
      )
    );
  };

  const handlePointerUp = async (event: React.PointerEvent) => {
    if (!dragRef.current || !activeDate) {
      return;
    }
    const { tableId } = dragRef.current;
    dragRef.current = null;
    const table = tables.find((item) => item.tableId === tableId);
    if (!table) {
      return;
    }
    try {
      await fetch(`${API_BASE}/layout/${activeDate}/table/${tableId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: table.x, y: table.y })
      });
      console.log(`Table ${table.name} (${table.tableId}) position: x=${table.x}, y=${table.y}`);
    } catch (err) {
      showToast('Could not save position.', 'error');
    }
  };

  const handleGroup = async () => {
    if (!activeDate) {
      return;
    }
    if (selectedTableIds.length < 2) {
      showToast('Select at least two tables to group.', 'error');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/layout/${activeDate}/group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableIds: selectedTableIds })
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Failed to group.');
      }
      await refreshLayout();
    } catch (err) {
      showToast('Grouping failed. Ungroup tables first.', 'error');
    }
  };

  const handleUngroup = async () => {
    if (!activeDate || !selectedGroupId) {
      showToast('Select a grouped set of tables.', 'error');
      return;
    }
    if (reservationByGroup.has(selectedGroupId)) {
      showToast('Delete the reservation before ungrouping.', 'error');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/layout/${activeDate}/ungroup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: selectedGroupId })
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Failed to ungroup.');
      }
      await refreshLayout();
    } catch (err) {
      showToast('Ungroup failed.', 'error');
    }
  };

  const handleTableDoubleClick = async (table: TableItem) => {
    if (!activeDate) {
      return;
    }
    let groupId = table.groupId;
    if (!groupId) {
      try {
        const response = await fetch(`${API_BASE}/layout/${activeDate}/group`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableIds: [table.tableId] })
        });
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error || 'Failed to create group.');
        }
        const payload = await response.json();
        groupId = payload.groupId;
        setTables((prev) =>
          prev.map((item) =>
            item.tableId === table.tableId ? { ...item, groupId } : item
          )
        );
      } catch (err) {
        showToast('Could not create group.', 'error');
        return;
      }
    }

    if (groupId === null) {
      showToast('Could not open reservation.', 'error');
      return;
    }
    const reservation = reservationByGroup.get(groupId) || null;
    const groupTables = groupMap.get(groupId)?.tableIds || [table.tableId];
    const tableNames = groupTables
      .map((id) => tables.find((item) => item.tableId === id)?.name || `T${id}`)
      .join(', ');
    setModal({ groupId, tableNames, reservation });
  };

  const handleReservationSave = async (data: {
    time: string;
    name: string;
    partySize: number;
    notes?: string;
  }) => {
    if (!activeDate || !modal) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/layout/${activeDate}/reservation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: modal.groupId, ...data })
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Failed to save reservation.');
      }
      setModal(null);
      await refreshLayout();
    } catch (err) {
      showToast('Reservation save failed.', 'error');
    }
  };

  const handleReservationDelete = async () => {
    if (!activeDate || !modal?.reservation) {
      return;
    }
    try {
      await fetch(`${API_BASE}/layout/${activeDate}/reservation/${modal.reservation.id}`, {
        method: 'DELETE'
      });
      setModal(null);
      await refreshLayout();
    } catch (err) {
      showToast('Reservation delete failed.', 'error');
    }
  };

  const reservationLabels = useMemo(() => {
    const LABEL_PADDING = 12;
    return reservations
      .map((reservation) => {
        const tablesInGroup = tables.filter((table) => table.groupId === reservation.groupId);
        if (tablesInGroup.length === 0) {
          return null;
        }
        const avgX =
          tablesInGroup.reduce((sum, table) => sum + table.x + table.width / 2, 0) /
          tablesInGroup.length;
        const maxY = Math.max(
          ...tablesInGroup.map((table) => table.y + table.height)
        );
        const clampedX = Math.min(
          Math.max(avgX, LABEL_PADDING),
          canvasWidth - LABEL_PADDING
        );
        return {
          id: reservation.id,
          x: clampedX,
          y: maxY + 10,
          text: `${reservation.name} - ${formatTime(reservation.time)} (${reservation.partySize})`
        };
      })
      .filter(Boolean) as Array<{ id: number; x: number; y: number; text: string }>;
  }, [reservations, tables]);

  useEffect(() => {
    const updateWidth = () => {
      if (canvasRef.current) {
        setCanvasWidth(canvasRef.current.offsetWidth || 957);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    scheduleNotifications();
    return () => clearNotifications();
  }, [reservations, activeDate]);

  if (!activeDate) {
    return (
      <div className="app">
        <header className="header">
          <h1>Razorback Pizza Reservations</h1>
        </header>
        <main className="page">
          <div className="card date-picker">
            <label>
              Select date
              <input
                className="input"
                type="date"
                value={dateInput}
                onChange={(event) => setDateInput(event.target.value)}
              />
            </label>
            <button className="button" onClick={openDate} disabled={loading}>
              {loading ? 'Opening...' : 'Open'}
            </button>
            <div className="footer-note">
              Reservation app for Razorback Pizza. Create or load a floor plan for the selected date.
            </div>
          </div>
        </main>
        {toast && (
          <div className={`toast ${toast.type || ''}`.trim()}>{toast.message}</div>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Floor Plan for {activeDate}</h1>
        <button className="button secondary" onClick={() => setActiveDate(null)}>
          Change date
        </button>
      </header>
      <main className="page">
        <div className="toolbar">
          <button className="button" onClick={handleGroup}>
            Group
          </button>
          <button className="button secondary" onClick={handleUngroup}>
            Ungroup
          </button>
          <button className="button secondary" onClick={refreshLayout}>
            Refresh
          </button>
          <button className="button secondary" onClick={requestNotificationPermission}>
            Enable notifications
          </button>
          <div className="footer-note">Shift+click to multi-select tables.</div>
        </div>
        <div className="canvas" ref={canvasRef}>
          {tables.map((table) => {
            const reserved = table.groupId ? reservationByGroup.has(table.groupId) : false;
            const selected = selectedTableIds.includes(table.tableId);
            return (
              <div
                key={table.tableId}
                className={`table${reserved ? ' reserved' : ''}${selected ? ' selected' : ''}`}
                style={{
                  width: table.width,
                  height: table.height,
                  left: table.x,
                  top: table.y
                }}
                onClick={(event) => handleTableClick(table.tableId, event)}
                onDoubleClick={() => handleTableDoubleClick(table)}
                onPointerDown={(event) => handlePointerDown(table, event)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                {table.name}
              </div>
            );
          })}
          {reservationLabels.map((label) => (
            <div
              key={label.id}
              className="reservation-label"
              style={{ left: label.x, top: label.y }}
            >
              {label.text}
            </div>
          ))}
        </div>
      </main>
      {modal && (
        <ReservationModal
          modal={modal}
          onClose={() => setModal(null)}
          onSave={handleReservationSave}
          onDelete={handleReservationDelete}
        />
      )}
      {toast && <div className={`toast ${toast.type || ''}`.trim()}>{toast.message}</div>}
    </div>
  );
};

type ReservationModalProps = {
  modal: ModalState;
  onClose: () => void;
  onSave: (data: { time: string; name: string; partySize: number; notes?: string }) => void;
  onDelete: () => void;
};

const ReservationModal: React.FC<ReservationModalProps> = ({
  modal,
  onClose,
  onSave,
  onDelete
}) => {
  const [time, setTime] = useState(modal.reservation?.time || '18:30');
  const [name, setName] = useState(modal.reservation?.name || '');
  const [partySize, setPartySize] = useState(
    modal.reservation?.partySize?.toString() || '2'
  );
  const [notes, setNotes] = useState(modal.reservation?.notes || '');

  const submit = () => {
    const size = Number(partySize);
    if (!time || !name || Number.isNaN(size)) {
      return;
    }
    onSave({ time, name, partySize: size, notes });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>Reservation</h2>
        <div className="footer-note">Tables: {modal.tableNames}</div>
        <label>
          Time
          <input
            className="input"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </label>
        <label>
          Name
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Party size
          <input
            className="input"
            type="number"
            min="1"
            value={partySize}
            onChange={(event) => setPartySize(event.target.value)}
          />
        </label>
        <label>
          Notes
          <input
            className="input"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <div className="toolbar">
          <button className="button" onClick={submit}>
            Save
          </button>
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {modal.reservation && (
            <button className="button secondary" onClick={onDelete}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
