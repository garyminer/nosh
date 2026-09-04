/* ============================================================
   offline.js — make Nosh work in a grocery store with no signal.

   Two pieces:

   1. A cache of the last-seen data for each screen, so the app can
      render your list instantly (and at all) while offline.

   2. An outbox. Every change you make is applied to the screen
      immediately and then either sent or, if the network is gone,
      queued. The queue drains automatically when you're back.

   The tricky part is an item added while offline: it only has a
   temporary local id, so anything you do to it afterwards (cross it
   off, change the quantity) refers to an id the server has never
   seen. When the queued insert finally lands we learn the real id
   and rewrite the rest of the queue to match. That mapping is kept
   in localStorage, not memory, because the queue can easily drain
   across two separate sessions.
   ============================================================ */

import { supabase } from './supabaseClient.js'

const CACHE_PREFIX = 'nosh:cache:'
const OUTBOX_KEY = 'nosh:outbox'
const IDMAP_KEY = 'nosh:idmap'
const IDMAP_TTL = 7 * 24 * 60 * 60 * 1000 // a week is plenty

/* ---------------- localStorage helpers (never throw) --------------- */

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // Quota or private-mode. Not fatal: we just lose the offline copy.
    return false
  }
}

/* ---------------- screen cache --------------- */

export const cacheGet = (key) => readJson(CACHE_PREFIX + key, null)
export const cacheSet = (key, value) => writeJson(CACHE_PREFIX + key, value)

/* The item detail screen only knows an item id, so offline it has to go
   looking through the cached lists for it. */
export function findCachedItem(itemId) {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(CACHE_PREFIX + 'list:')) continue
      const entry = readJson(key, null)
      const hit = entry?.items?.find((it) => it.id === itemId)
      if (hit) return { ...hit, lists: entry.list ? { id: entry.list.id, name: entry.list.name } : null,
                        _cats: entry.cats || [] }
    }
  } catch { /* fall through */ }
  return null
}

/* ---------------- outbox --------------- */

const listeners = new Set()
export function onOutboxChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify() {
  const n = pendingCount()
  for (const fn of listeners) { try { fn(n) } catch { /* a bad listener shouldn't wedge the queue */ } }
}

export const getOutbox = () => readJson(OUTBOX_KEY, [])
const setOutbox = (ops) => writeJson(OUTBOX_KEY, ops)
export const pendingCount = () => getOutbox().length

export function enqueue(op) {
  const q = getOutbox()
  q.push(op)
  setOutbox(q)
  notify()
}

/* Deleting an item whose insert is still sitting in the queue: drop the
   insert too, otherwise it replays on reconnect and the item you deleted
   comes back from the dead. Returns true if an insert was cancelled. */
export function cancelQueuedAdd(tempId) {
  if (!isTempId(tempId)) return false
  const q = getOutbox()
  const kept = q.filter((op) => !(op.k === 'add' && op.tempId === tempId))
  const alsoDropUpdates = kept.filter((op) => !(op.k === 'update' && op.id === tempId))
  if (alsoDropUpdates.length === q.length) return false
  setOutbox(alsoDropUpdates)
  notify()
  return true
}

/* ---------------- temporary id -> real id --------------- */

export const isTempId = (id) => typeof id === 'string' && id.startsWith('tmp-')

function readIdMap() {
  const m = readJson(IDMAP_KEY, {})
  const cutoff = Date.now() - IDMAP_TTL
  let pruned = false
  for (const k of Object.keys(m)) {
    if (!m[k] || (m[k].at || 0) < cutoff) { delete m[k]; pruned = true }
  }
  if (pruned) writeJson(IDMAP_KEY, m)
  return m
}

function rememberId(tempId, realId) {
  const m = readIdMap()
  m[tempId] = { id: realId, at: Date.now() }
  writeJson(IDMAP_KEY, m)
}

function resolveId(id) {
  if (!isTempId(id)) return id
  const hit = readIdMap()[id]
  return hit ? hit.id : id
}

/* ---------------- is this failure worth retrying? --------------- */

// supabase-js surfaces a dead network as a thrown TypeError or as an error
// object with no HTTP status. Anything the server actually answered (RLS
// rejection, row already gone) will never succeed on retry, so it gets
// dropped rather than blocking every later change behind it forever.
function isNetworkError(err) {
  if (!err) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = String(err.message || err).toLowerCase()
  return (
    msg.includes('failed to fetch') ||   // Chrome/Firefox
    msg.includes('load failed') ||       // Safari
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('timeout') ||
    err.name === 'TypeError'
  )
}

/* ---------------- sending --------------- */

/* Run a write now, or queue it if we're offline.
   Returns { data } | { queued: true } | { error } — callers keep their
   optimistic UI on `queued`, and only roll back on a real `error`. */
export async function sendOrQueue(op, run) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    enqueue(op)
    return { queued: true }
  }
  try {
    const { data, error } = await run()
    if (error) {
      if (isNetworkError(error)) { enqueue(op); return { queued: true } }
      return { error }
    }
    return { data }
  } catch (e) {
    if (isNetworkError(e)) { enqueue(op); return { queued: true } }
    return { error: e }
  }
}

/* ---------------- draining --------------- */

async function applyOp(op) {
  try {
    if (op.k === 'add') {
      const { data, error } = await supabase.rpc('add_item', {
        p_list_id: op.listId,
        p_name: op.name,
        p_quantity: op.quantity ?? 1,
        p_category_id: op.categoryId ?? null,
        p_note: op.note ?? null,
        // Ops queued before units existed simply have no unit.
        p_unit: op.unit ?? null,
      })
      if (error) return isNetworkError(error) ? 'retry' : 'drop'
      if (op.tempId && data?.id) rememberId(op.tempId, data.id)
      return 'ok'
    }

    if (op.k === 'update') {
      const id = resolveId(op.id)
      // Its insert never landed, so there is nothing to update. Dropping is
      // right: the insert itself carries the item's final name/qty/note.
      if (isTempId(id)) return 'drop'
      const { error } = await supabase.from('items').update(op.patch).eq('id', id)
      if (error) return isNetworkError(error) ? 'retry' : 'drop'
      return 'ok'
    }

    if (op.k === 'delete') {
      const ids = op.ids.map(resolveId).filter((id) => !isTempId(id))
      if (ids.length) {
        const { error } = await supabase.from('items').delete().in('id', ids)
        if (error) return isNetworkError(error) ? 'retry' : 'drop'
      }
      return 'ok'
    }

    if (op.k === 'rpc') {
      const { error } = await supabase.rpc(op.fn, op.args)
      if (error) return isNetworkError(error) ? 'retry' : 'drop'
      return 'ok'
    }

    return 'drop'
  } catch (e) {
    return isNetworkError(e) ? 'retry' : 'drop'
  }
}

let flushing = false

/* Drain the queue oldest-first. Stops at the first op that needs the network
   back, so ordering is never broken. Returns what happened. */
export async function flushOutbox() {
  if (flushing) return { sent: 0, dropped: 0, stalled: false }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { sent: 0, dropped: 0, stalled: pendingCount() > 0 }
  }

  flushing = true
  let sent = 0, dropped = 0, stalled = false
  try {
    while (getOutbox().length) {
      const op = getOutbox()[0]
      const result = await applyOp(op)
      if (result === 'retry') { stalled = true; break }
      if (result === 'drop') dropped++
      else sent++
      // Re-read rather than reusing a stale copy: something may have been
      // queued while that request was in flight.
      setOutbox(getOutbox().slice(1))
      notify()
    }
  } finally {
    flushing = false
    notify()
  }
  return { sent, dropped, stalled }
}

/* Call once at startup: drain now, and again whenever the network or the
   tab comes back. Returns an unsubscribe function. */
export function startOutboxSync(onFlushed) {
  const run = async () => {
    if (!pendingCount()) return
    const res = await flushOutbox()
    if ((res.sent || res.dropped) && onFlushed) onFlushed(res)
  }
  const onVisible = () => { if (document.visibilityState === 'visible') run() }

  window.addEventListener('online', run)
  document.addEventListener('visibilitychange', onVisible)
  run()

  return () => {
    window.removeEventListener('online', run)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
