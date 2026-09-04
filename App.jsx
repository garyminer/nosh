import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient.js'
import {
  cacheGet, cacheSet, sendOrQueue, startOutboxSync, cancelQueuedAdd,
  pendingCount, onOutboxChange, isTempId, findCachedItem,
} from './offline.js'

/* ============================================================
   Nosh — shared grocery lists
   Everything lives in this one file on purpose: fewer files to
   re-upload to GitHub when something changes.
   ============================================================ */

/* ---------------- routing (hash-based, no server config) --------------- */

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

function parseRoute(h) {
  const p = (h || '').replace(/^#/, '') || '/'
  let m
  if ((m = p.match(/^\/join\/(.+)$/))) return { name: 'join', code: decodeURIComponent(m[1]) }
  if ((m = p.match(/^\/l\/([^/]+)\/settings$/))) return { name: 'settings', listId: m[1] }
  if ((m = p.match(/^\/l\/([^/]+)$/))) return { name: 'list', listId: m[1] }
  if ((m = p.match(/^\/i\/([^/]+)$/))) return { name: 'item', itemId: m[1] }
  if (p === '/import') return { name: 'import' }
  return { name: 'home' }
}

const navigate = (to) => { window.location.hash = to }
const back = () => window.history.length > 1 ? window.history.back() : navigate('/')
const shareUrl = (code) => `${window.location.origin}/#/join/${code}`

/* ---------------- tiny icons --------------- */

const Ico = {
  check: (p) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="20 6 9 17 4 12"/></svg>,
  back: (p) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="15 18 9 12 15 6"/></svg>,
  gear: (p) => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  plus: (p) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  trash: (p) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  chev: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="9 18 15 12 9 6"/></svg>,
  up: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="18 15 12 9 6 15"/></svg>,
  down: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="6 9 12 15 18 9"/></svg>,
  sun: (p) => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="4.2"/><line x1="12" y1="1.6" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.4"/><line x1="4.2" y1="4.2" x2="5.9" y2="5.9"/><line x1="18.1" y1="18.1" x2="19.8" y2="19.8"/><line x1="1.6" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.4" y2="12"/><line x1="4.2" y1="19.8" x2="5.9" y2="18.1"/><line x1="18.1" y1="5.9" x2="19.8" y2="4.2"/></svg>,
  moon: (p) => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>,
  star: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polygon points="12 2.6 15 9 22 9.9 17 14.7 18.3 21.6 12 18.3 5.7 21.6 7 14.7 2 9.9 9 9"/></svg>,
}

function Logo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Nosh" style={{ display: 'block', flex: 'none' }}>
      <defs>
        <linearGradient id="noshBlue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3D8BFF" /><stop offset="1" stopColor="#0B3FE0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#noshBlue)" />
      <g fill="#fff">
        <rect x="13.2" y="12" width="3.1" height="12" rx="1.55" />
        <rect x="18.4" y="12" width="3.1" height="12" rx="1.55" />
        <rect x="23.6" y="12" width="3.1" height="12" rx="1.55" />
        <path d="M13.2 22h13.5v3.2a7 7 0 0 1-5 6.7V50a1.75 1.75 0 0 1-3.5 0V31.9a7 7 0 0 1-5-6.7z" />
        <path d="M52 12.5C39.5 14.6 31.5 23.4 31.5 36.5c0 4.4 3.6 6.9 7.5 5.2C47.9 37.8 53 26 52 12.5z" />
      </g>
      <path d="M50 15C43.4 21.5 37 29 33.8 39.5" stroke="#0B3FE0" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".85" />
    </svg>
  )
}

/* ---------------- category auto-guess --------------- */

const GUESS = [
  ['Produce', 'apple banana lettuce spinach kale tomato onion garlic potato carrot celery cucumber pepper broccoli avocado lemon lime orange grape berry berries strawberr blueberr mushroom zucchini squash cilantro parsley basil salad greens melon peach pear plum ginger corn cabbage'],
  ['Bakery', 'bread bagel bun roll tortilla croissant muffin donut cake pie baguette pita naan sourdough brioche'],
  ['Deli', 'deli ham turkey slices salami prosciutto rotisserie hummus olives pepperoni'],
  ['Meat & Seafood', 'chicken beef steak ground pork bacon sausage salmon shrimp tuna fish tilapia cod ribs brisket lamb turkey breast'],
  ['Dairy & Eggs', 'milk egg eggs cheese yogurt butter cream sour cream cottage mozzarella cheddar parmesan half creamer kefir'],
  ['Frozen', 'frozen ice cream popsicle waffles pizza tots peas frozen fries'],
  ['Canned & Jarred', 'canned can soup beans tomato sauce salsa broth stock tuna can jar pickles applesauce coconut milk'],
  ['Pasta, Rice & Grains', 'pasta spaghetti penne macaroni rice quinoa couscous noodle ramen lentil barley oats flour tortellini'],
  ['Breakfast & Cereal', 'cereal oatmeal granola pancake syrup pop tart breakfast bar'],
  ['Snacks', 'chips crackers cookies candy popcorn pretzel nuts almond peanut trail mix granola bar chocolate'],
  ['Beverages', 'water soda juice coffee tea sparkling gatorade lemonade beer wine kombucha energy drink cider'],
  ['Condiments & Spices', 'ketchup mustard mayo mayonnaise dressing vinegar oil soy sauce hot sauce salt pepper spice cumin paprika cinnamon honey jam jelly peanut butter nutella sriracha ranch bbq'],
  ['Baking', 'sugar flour baking soda baking powder yeast vanilla chocolate chips cocoa sprinkles cornstarch'],
  ['Household', 'paper towel toilet paper trash bag detergent dish soap sponge cleaner bleach foil wrap ziploc napkin light bulb batteries laundry'],
  ['Personal Care', 'shampoo conditioner soap toothpaste toothbrush deodorant razor lotion sunscreen floss tissue advil ibuprofen tylenol vitamin bandaid'],
  ['Baby & Pet', 'diaper wipes formula baby dog cat litter pet food kibble treats'],
]

function guessCategoryName(name) {
  const n = ' ' + name.toLowerCase().trim() + ' '
  let best = null, bestLen = 0
  for (const [cat, words] of GUESS) {
    for (const w of words.split(' ')) {
      if (w.length > 2 && n.includes(w) && w.length > bestLen) { best = cat; bestLen = w.length }
    }
  }
  return best
}

function guessCategoryId(name, categories) {
  const guess = guessCategoryName(name)
  if (!guess) return null
  const hit = categories.find((c) => c.name.toLowerCase() === guess.toLowerCase())
  return hit ? hit.id : null
}

/* ---------------- small helpers --------------- */

function matchesQuery(name, q) {
  const tokens = q.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return true
  const words = name.toLowerCase().split(/[\s\-/,()]+/).filter(Boolean)
  return tokens.every((t) => words.some((w) => w.startsWith(t)) || name.toLowerCase().includes(t))
}

const titleCase = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase())

/* ---------------- quantities and units --------------------------------

   Typing is the fast path, so "2 lbs chicken" should just work rather than
   making anyone open a picker. The catch is that a leading number is only
   sometimes a quantity: "7 up", "1000 island dressing" and "5 hour energy"
   are item names. What makes parsing safe is refusing to treat a number as a
   quantity unless a *recognised unit* follows it — "up", "island" and "hour"
   aren't units, so those names survive intact. Bare "2 bananas" is therefore
   left alone too; "bananas x2" is the unambiguous way to say it.
   ---------------------------------------------------------------------- */

const UNITS = [
  { u: 'lb',     alias: ['lb', 'lbs', 'pound', 'pounds', '#'] },
  { u: 'oz',     alias: ['oz', 'ounce', 'ounces'] },
  { u: 'fl oz',  alias: ['floz'] },                    // "fl oz" is folded to one token first
  { u: 'kg',     alias: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'] },
  { u: 'g',      alias: ['g', 'gram', 'grams'] },
  { u: 'gal',    alias: ['gal', 'gallon', 'gallons'] },
  { u: 'qt',     alias: ['qt', 'quart', 'quarts'] },
  { u: 'pt',     alias: ['pt', 'pint', 'pints'] },
  { u: 'L',      alias: ['l', 'liter', 'liters', 'litre', 'litres'] },
  { u: 'mL',     alias: ['ml', 'milliliter', 'milliliters'] },
  { u: 'dozen',  alias: ['dozen', 'dozens', 'doz'] },
  { u: 'bunch',  alias: ['bunch', 'bunches'] },
  { u: 'head',   alias: ['head', 'heads'] },
  { u: 'clove',  alias: ['clove', 'cloves'] },
  { u: 'bag',    alias: ['bag', 'bags'] },
  { u: 'box',    alias: ['box', 'boxes'] },
  { u: 'can',    alias: ['can', 'cans'] },
  { u: 'jar',    alias: ['jar', 'jars'] },
  { u: 'bottle', alias: ['bottle', 'bottles'] },
  { u: 'pack',   alias: ['pack', 'packs', 'package', 'packages', 'pkg'] },
  { u: 'loaf',   alias: ['loaf', 'loaves'] },
  { u: 'roll',   alias: ['roll', 'rolls'] },
]

export const UNIT_NAMES = UNITS.map((x) => x.u)

const UNIT_BY_ALIAS = (() => {
  const m = new Map()
  for (const { u, alias } of UNITS) {
    m.set(u.toLowerCase(), u)
    for (const a of alias) m.set(a, u)
  }
  return m
})()

const unitFromToken = (tok) =>
  UNIT_BY_ALIAS.get(String(tok || '').toLowerCase().replace(/\.$/, '')) || null

/* Local ids for rows that haven't reached the server yet. A bare Date.now()
   is not enough: adding several items at once (ticking a batch of regulars,
   or fast typing while offline) queues them inside the same millisecond, and
   two rows sharing a temp id would collide as React keys AND scramble the
   outbox's temp-id → real-id mapping. */
let tempSeq = 0
const nextTempId = (prefix = 'tmp') => `${prefix}-${Date.now().toString(36)}-${(tempSeq++).toString(36)}`

// PostgREST can hand back numeric as either a number or a string ("2.00"),
// and "2.00" + 1 would quietly become "2.001". Everything goes through here.
export function qtyNum(q) {
  const n = Number(q)
  return Number.isFinite(n) && n > 0 ? n : 1
}
export const formatQty = (q) => String(Math.round(qtyNum(q) * 100) / 100)

/* Pull a quantity and unit out of typed text. Returns the name with those
   parts removed. Shared by the add bar and the importer so both understand
   exactly the same shorthand. */
export function parseQuantityUnit(raw) {
  const original = String(raw || '').trim()
  if (!original) return { name: '', quantity: 1, unit: null }

  // "12 fl oz" -> "12 floz", so the unit is a single token like every other.
  let name = original.replace(/\bfl\.?\s*oz\b/gi, 'floz')
  let quantity = null
  let unit = null
  const num = (s) => Number(String(s).replace(',', '.'))

  // Explicit multipliers: "milk x2", "milk ×2", "milk (2)".
  let m = name.match(/^(.*?)\s*[x×]\s*(\d+(?:[.,]\d+)?)$/i)
  if (m) { name = m[1].trim(); quantity = num(m[2]) }
  else if ((m = name.match(/^(.*?)\s*\((\d+(?:[.,]\d+)?)\)$/))) { name = m[1].trim(); quantity = num(m[2]) }

  // Leading: "2 lbs of chicken", "2lb chicken", "3 dozen eggs".
  if ((m = name.match(/^(\d+(?:[.,]\d+)?)\s*([a-z#]+\.?)\s+(.+)$/i))) {
    const u = unitFromToken(m[2])
    if (u) {
      if (quantity === null) quantity = num(m[1])
      unit = u
      name = m[3].replace(/^of\s+/i, '').trim()
    }
  }

  // Trailing: "chicken 2 lbs".
  if (unit === null && (m = name.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([a-z#]+\.?)$/i))) {
    const u = unitFromToken(m[3])
    if (u) {
      if (quantity === null) quantity = num(m[2])
      unit = u
      name = m[1].trim()
    }
  }

  // If stripping left nothing behind, the text was the name all along.
  if (!name) return { name: original, quantity: 1, unit: null }

  const q = quantity === null ? 1 : quantity
  return {
    name,
    quantity: Number.isFinite(q) && q > 0 ? Math.round(q * 100) / 100 : 1,
    unit,
  }
}

/* ---------------- telling one item from the same item typed twice ---------

   Two levels, deliberately:

   itemKey()     — case, accents, punctuation and plurals. "Bananas",
                   "banana" and "BANANA" are unarguably the same thing, so
                   these merge silently.

   isNearMatch() — one word apart by a typo's worth of edits. This is a
                   guess, so it only ever *offers* to merge. Silently folding
                   "wheat bread" into "white bread" would quietly corrupt the
                   list, and a wrong merge is far worse than a duplicate row.
   ------------------------------------------------------------------------ */

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')   // jalapeño -> jalapeno
    .replace(/[^a-z0-9\s]/g, ' ')                        // half-and-half -> half and half
    .replace(/\s+/g, ' ')
    .trim()
}

/* A crude English singulariser. It does not need to be *correct*, only
   *consistent*: both spellings have to land on the same key. ("molasses"
   reducing to "molass" is harmless — it only ever collides with itself.) */
function singularWord(w) {
  if (w.length < 4) return w
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y'
  for (const suf of ['ches', 'shes', 'sses', 'xes', 'zes', 'oes']) {
    if (w.endsWith(suf) && w.length - 2 >= 3) return w.slice(0, -2)
  }
  if (w.endsWith('s') && !/(ss|us|is)$/.test(w) && w.length - 1 >= 3) return w.slice(0, -1)
  return w
}

const itemKey = (name) =>
  normalizeName(name).split(' ').filter(Boolean).map(singularWord).join(' ')

// Damerau-Levenshtein: like edit distance, but a transposition ("yogrut")
// costs 1 rather than 2, which is what most real typing mistakes look like.
function editDistance(a, b) {
  const la = a.length, lb = b.length
  const d = Array.from({ length: la + 1 }, (_, i) => {
    const row = new Array(lb + 1).fill(0)
    row[0] = i
    return row
  })
  for (let j = 0; j <= lb; j++) d[0][j] = j
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[la][lb]
}

/* Same number of words, exactly one of them different, and that word is long
   enough that a typo is likelier than a real distinction. The length floor is
   what keeps "beans"/"beers" and "green tea"/"green pea" apart. */
function isNearMatch(a, b) {
  const ka = itemKey(a), kb = itemKey(b)
  if (!ka || !kb || ka === kb) return false

  const wa = ka.split(' '), wb = kb.split(' ')
  if (wa.length !== wb.length) return false

  let diff = null
  for (let i = 0; i < wa.length; i++) {
    if (wa[i] === wb[i]) continue
    if (diff) return false          // more than one word differs: different item
    diff = [wa[i], wb[i]]
  }
  if (!diff) return false

  const [x, y] = diff
  const shortest = Math.min(x.length, y.length)
  if (shortest < 5) return false
  return editDistance(x, y) <= (shortest >= 8 ? 2 : 1)
}

/* ---------------- "who added this" helpers --------------- */

// Turn a person row from list_people() into something displayable.
function personLabel(p) {
  if (!p) return 'Someone'
  return p.display_name || (p.email || '').split('@')[0] || 'Someone'
}

function initialOf(label) {
  const c = (label || '?').trim()[0]
  return (c || '?').toUpperCase()
}

/* Hand-picked dot colours, for when the hash below lands somewhere you don't
   want. Keyed by display name (lowercased, any "(you)" stripped); the full name
   is tried first, then the first word, so "Annette" and "Annette M" both match.
   Values are HSL hues, 0-359: 0 red · 30 orange · 50 yellow · 140 green
   · 190 teal · 215 blue · 275 purple · 330 pink. */
const HUE_OVERRIDES = new Map([
  ['annette', 215],   // blue — the id hash had put her in the purples
])

// Stable per-person colour so the same person is the same colour everywhere.
function avatarHue(id, label) {
  const key = String(label || '').toLowerCase().replace(/\(you\)\s*$/, '').trim()
  if (HUE_OVERRIDES.has(key)) return HUE_OVERRIDES.get(key)
  const first = key.split(/\s+/)[0]
  if (HUE_OVERRIDES.has(first)) return HUE_OVERRIDES.get(first)

  let h = 0
  for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

function Avatar({ id, label, size = 24, title }) {
  const hue = avatarHue(id, label)
  const text = title || `Added by ${label}`
  return (
    <span className="who" title={text} aria-label={text}
          style={{ width: size, height: size, fontSize: Math.round(size * 0.46), '--h': String(hue) }}>
      {initialOf(label)}
    </span>
  )
}

const whenText = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/* ---------------- who else is on this list right now --------------- */

/* Presence answers "is anyone looking at this list?", which is the thing worth
   knowing: if Annette is at the store, adding milk in the next two minutes is
   the difference between getting milk and not.

   "Shopping" vs "just has it open" can't come from the database — there's no
   crossed_by column to attribute a cross-off to a person. It doesn't need one:
   each client knows what *it* just did, so a device that has crossed something
   off recently says so in its own presence payload. */
const SHOPPING_WINDOW_MS = 30 * 60 * 1000

function readPresence(channel, meId) {
  let state = {}
  try { state = channel.presenceState() } catch { return [] }
  const out = []
  for (const [userId, metas] of Object.entries(state || {})) {
    if (userId === meId) continue            // you know you're here
    const list = Array.isArray(metas) ? metas : []
    out.push({
      userId,
      shopping: list.some((m) => m && m.shopping),
      name: (list.find((m) => m && m.name) || {}).name || null,
    })
  }
  return out
}

/* Anyone mid-shop is what you care about, so they get named first and the
   people merely browsing don't dilute the sentence. */
function presenceSentence(present, nameOf) {
  if (!present.length) return ''
  const shopping = present.filter((p) => p.shopping)
  const featured = shopping.length ? shopping : present
  const names = featured.map(nameOf)

  const who = names.length === 1 ? names[0]
    : names.length === 2 ? `${names[0]} and ${names[1]}`
    : `${names[0]}, ${names[1]} and ${names.length - 2} more`
  const plural = names.length > 1
  const what = shopping.length
    ? `${plural ? 'are' : 'is'} shopping right now`
    : `${plural ? 'have' : 'has'} this list open`
  return `${who} ${what}`
}

function PresenceBar({ present, nameById }) {
  if (!present.length) return null

  const nameOf = (p) => nameById[p.userId] || p.name || 'Someone'
  const shopping = present.filter((p) => p.shopping)

  return (
    <div className={'presence' + (shopping.length ? ' active' : '')}>
      <span className="faces">
        {present.slice(0, 4).map((p) => (
          <Avatar key={p.userId} id={p.userId} label={nameOf(p)} size={22}
                  title={`${nameOf(p)} ${p.shopping ? 'is shopping right now' : 'has this list open'}`} />
        ))}
      </span>
      <span className="txt"><span className="pulse" />{presenceSentence(present, nameOf)}</span>
    </div>
  )
}

/* ---------------- keeping the screen on while you shop --------------- */

/* The screen going dark mid-aisle, every time, is the single most annoying
   thing about using a phone as a shopping list.

   Two things make this well-behaved rather than a battery bug:

   - The browser drops a screen wake lock whenever the page is hidden, so it
     has to be re-taken on the way back. That's not a nicety, it's required.
   - A list left open face-up on the counter would otherwise hold the screen
     on forever, so the lock is released after a stretch with no interaction
     and retaken the moment you touch the screen again. Re-taking is instant
     and invisible, so an early release mid-trip costs nothing.
*/
const WAKE_IDLE_MS = 10 * 60 * 1000
const WAKE_PREF_KEY = 'nosh:keep-awake'
const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator

function readWakePref() {
  try { return localStorage.getItem(WAKE_PREF_KEY) !== 'off' } catch { return true }
}
function writeWakePref(on) {
  try { localStorage.setItem(WAKE_PREF_KEY, on ? 'on' : 'off') } catch { /* private mode */ }
}

function useWakeLock(enabled) {
  useEffect(() => {
    if (!enabled || !wakeLockSupported) return

    let cancelled = false
    let sentinel = null
    let idleTimer = null

    const release = async () => {
      const s = sentinel
      sentinel = null
      if (s) { try { await s.release() } catch { /* already gone */ } }
    }

    const acquire = async () => {
      if (cancelled || sentinel || document.visibilityState !== 'visible') return
      try {
        const s = await navigator.wakeLock.request('screen')
        if (cancelled) { try { await s.release() } catch { /* ignore */ } ; return }
        sentinel = s
        // Fires when the browser takes it back (page hidden, battery saver).
        s.addEventListener('release', () => { if (sentinel === s) sentinel = null })
      } catch {
        // NotAllowedError when hidden, or blocked by policy / low battery.
        // Nothing to do: the screen just behaves as it did before.
      }
    }

    const onActivity = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(release, WAKE_IDLE_MS)
      acquire()
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') onActivity() }

    onActivity()
    document.addEventListener('visibilitychange', onVisibility)
    const events = ['pointerdown', 'keydown', 'scroll']
    for (const ev of events) window.addEventListener(ev, onActivity, { passive: true })

    return () => {
      cancelled = true
      clearTimeout(idleTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      for (const ev of events) window.removeEventListener(ev, onActivity)
      release()
    }
  }, [enabled])
}

/* ---------------- offline plumbing --------------- */

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine !== false)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return online
}

function usePending() {
  const [n, setN] = useState(pendingCount())
  useEffect(() => onOutboxChange(setN), [])
  return n
}

/* One strip at the top of the screen covering both states, because they're
   the same worry from the user's side: "is what I just tapped actually saved?" */
function SyncBar() {
  const online = useOnline()
  const pending = usePending()
  if (online && !pending) return null
  const label = !online
    ? (pending
        ? `Offline · ${pending} change${pending === 1 ? '' : 's'} saved on this device`
        : 'Offline · your list still works')
    : `Syncing ${pending} change${pending === 1 ? '' : 's'}…`
  return <div className={'syncbar' + (online ? ' syncing' : '')}>{label}</div>
}

// A network failure while reading isn't worth an error message — the cached
// copy is already on screen and the sync bar explains itself.
function isOfflineError(err) {
  if (!err) return false
  if (navigator.onLine === false) return true
  const m = String(err.message || err).toLowerCase()
  return m.includes('failed to fetch') || m.includes('load failed') ||
         m.includes('networkerror') || m.includes('network request failed')
}

function useCopy() {
  const [copied, setCopied] = useState('')
  const copy = async (text, key = 'x') => {
    try { await navigator.clipboard.writeText(text) }
    catch {
      const ta = document.createElement('textarea')
      ta.value = text; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      document.body.removeChild(ta)
    }
    setCopied(key); setTimeout(() => setCopied(''), 1800)
  }
  return [copied, copy]
}

/* ============================================================
   Root
   ============================================================ */

export default function App() {
  const hash = useHashRoute()
  const route = useMemo(() => parseRoute(hash), [hash])
  const [session, setSession] = useState(null)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setBooting(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Drain anything queued while offline, now and whenever the network or the
  // tab comes back. Only once we're signed in — the writes need a session.
  useEffect(() => {
    if (!session) return
    return startOutboxSync(() => {
      // Nudge the open screen to re-read once the queue has landed.
      window.dispatchEvent(new Event('nosh:synced'))
    })
  }, [session])

  if (booting) return <div className="empty">Loading…</div>
  if (!session) return <AuthScreen pendingJoin={route.name === 'join' ? route.code : null} />

  return (
    <div className="app">
      <SyncBar />
      {route.name === 'home' && <HomeScreen session={session} />}
      {route.name === 'list' && <ListScreen key={route.listId} listId={route.listId} session={session} />}
      {route.name === 'settings' && <ListSettings key={route.listId} listId={route.listId} session={session} />}
      {route.name === 'item' && <ItemScreen key={route.itemId} itemId={route.itemId} session={session} />}
      {route.name === 'join' && <JoinScreen code={route.code} />}
      {route.name === 'import' && <ImportScreen />}
    </div>
  )
}

/* ============================================================
   Auth
   ============================================================ */

/* Nosh has no confidential data in it, so there are no passwords: your email
   address IS your identity. Supabase Auth still runs underneath (every RLS
   policy in the database is built on auth.uid(), and realtime needs a real
   session), so we hand it a password derived from the email address itself.

   Be clear-eyed about what this means: this file ships to the browser, so the
   derivation below is public. Anyone who knows a member's email address can
   sign in as them and read or edit their lists. That is the deliberate trade
   for never sending a confirmation email — see nosh-migration-02-passwordless.sql. */
const derivePassword = (email) => `nosh:${email.trim().toLowerCase()}:v1`

function AuthScreen({ pendingJoin }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(''); setNote(''); setBusy(true)
    const addr = email.trim().toLowerCase()
    const secret = derivePassword(addr)
    const typed = name.trim()

    try {
      // Returning? Sign in. Anything other than "wrong credentials" is a real
      // failure (offline, rate limit) and shouldn't be retried as a signup.
      const { data: inData, error: inErr } =
        await supabase.auth.signInWithPassword({ email: addr, password: secret })

      if (!inErr) {
        if (typed) await saveDisplayName(inData.user.id, typed)
        return
      }
      if (!/invalid login credentials/i.test(inErr.message || '')) throw inErr

      // First time on this email — make the account.
      const { data: upData, error: upErr } = await supabase.auth.signUp({
        email: addr,
        password: secret,
        options: { data: { display_name: typed || addr.split('@')[0] } },
      })

      if (upErr) {
        if (/already registered|already exists/i.test(upErr.message || '')) {
          throw new Error(
            'This email has an older account with a password on it. Run ' +
            'nosh-migration-02-passwordless.sql in the Supabase SQL Editor to clear ' +
            'the old passwords, then try again.'
          )
        }
        throw upErr
      }

      if (!upData.session) {
        setNote(
          'Account created, but Supabase is still set to confirm email addresses. ' +
          'Open Supabase → Authentication → Sign In / Providers → Email, turn OFF ' +
          '"Confirm email", then press Continue again.'
        )
      }
    } catch (e2) {
      setErr(e2.message || String(e2))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="logo"><Logo size={64} /></div>
      <h1 className="center" style={{ margin: '14px 0 4px', fontSize: 30, fontWeight: 800, letterSpacing: '-.03em' }}>Nosh</h1>
      <p className="tag">One grocery list. Everyone in sync.</p>

      {pendingJoin && (
        <div className="card small">
          You've been invited to a list (code <span className="code-chip">{pendingJoin}</span>).
          Enter your email below to join it.
        </div>
      )}

      {err && <div className="err">{err}</div>}
      {note && <p className="ok-note">{note}</p>}

      <form onSubmit={submit}>
        <label className="field"><span>Email</span>
          <input className="input" type="email" required autoFocus value={email}
                 onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                 placeholder="you@example.com" />
        </label>
        <label className="field">
          <span>Your name <span className="muted" style={{ fontWeight: 500 }}>— first time only</span></span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                 placeholder="Gary" autoComplete="name" />
        </label>
        <button className="btn primary block" disabled={busy || !email.trim()}>
          {busy ? 'One moment…' : 'Continue'}
        </button>
      </form>

      <p className="center small muted" style={{ marginTop: 18 }}>
        No password. Your email is how the list knows who added what.
      </p>
    </div>
  )
}

// Keep profiles.display_name in step with whatever name the person last typed.
async function saveDisplayName(userId, displayName) {
  const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle()
  if (data && data.display_name === displayName) return
  await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId)
}

/* ============================================================
   Home — your lists + search across all of them
   ============================================================ */

function HomeScreen({ session }) {
  const [lists, setLists] = useState([])
  const [counts, setCounts] = useState({})
  const [allItems, setAllItems] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)

  const applyLists = useCallback((ls, its) => {
    setLists(ls || [])
    setAllItems(its || [])
    const c = {}
    for (const i of its || []) if (!i.crossed_off) c[i.list_id] = (c[i.list_id] || 0) + 1
    setCounts(c)
  }, [])

  // Cached copy first, so the home screen isn't a spinner when you're offline.
  useEffect(() => {
    const cached = cacheGet('home')
    if (cached) { applyLists(cached.lists, cached.items); setLoading(false) }
  }, [applyLists])

  const load = useCallback(async () => {
    setErr('')
    try {
      const [{ data: ls, error: e1 }, { data: its, error: e2 }] = await Promise.all([
        supabase.from('lists').select('*').order('created_at', { ascending: true }),
        supabase.from('items').select('id,name,list_id,crossed_off,quantity'),
      ])
      const e = e1 || e2
      if (e) {
        if (!isOfflineError(e)) setErr(e.message)
        return
      }
      applyLists(ls, its)
      cacheSet('home', { lists: ls || [], items: its || [], savedAt: Date.now() })
    } catch (e) {
      if (!isOfflineError(e)) setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [applyLists])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const on = () => load()
    window.addEventListener('nosh:synced', on)
    return () => window.removeEventListener('nosh:synced', on)
  }, [load])

  async function createList(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setBusy(true)
    const { data, error } = await supabase.rpc('create_list', { p_name: newName.trim() })
    setBusy(false)
    if (error) return setErr(error.message)
    setNewName(''); setShowNew(false)
    navigate(`/l/${data.id}`)
  }

  async function join(e) {
    e.preventDefault()
    if (!joinCode.trim()) return
    setBusy(true)
    const { data, error } = await supabase.rpc('join_list_by_code', { p_code: joinCode.trim() })
    setBusy(false)
    if (error) return setErr(error.message)
    setJoinCode('')
    navigate(`/l/${data}`)
  }

  const results = q.trim()
    ? allItems.filter((i) => matchesQuery(i.name, q)).slice(0, 40)
    : []
  const listName = (id) => (lists.find((l) => l.id === id) || {}).name || 'a list'

  return (
    <>
      <div className="topbar">
        <div className="brand" style={{ flex: 1 }}>
          <Logo size={30} />
          <div>
            <div className="name">Nosh</div>
          </div>
        </div>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>

      <div className="wrap">
        {err && <div className="err">{err}</div>}

        <input className="input" placeholder="Search everything you buy…" value={q}
               onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 14 }} />

        {q.trim() ? (
          results.length === 0 ? (
            <div className="empty">No items match “{q}”.</div>
          ) : (
            <div className="rows">
              {results.map((i) => (
                <div className="row" key={i.id}>
                  <div className="body" onClick={() => navigate(`/i/${i.id}`)}>
                    <div className="nm" style={i.crossed_off ? { textDecoration: 'line-through', color: 'var(--muted)' } : null}>{i.name}</div>
                    <div className="nt">in {listName(i.list_id)}{i.crossed_off ? ' · crossed off' : ''}</div>
                  </div>
                  <Ico.chev className="muted" />
                </div>
              ))}
            </div>
          )
        ) : loading ? (
          <div className="empty">Loading your lists…</div>
        ) : (
          <>
            {lists.length === 0 && (
              <div className="empty">
                <div className="big">No lists yet</div>
                Create one below, join someone else's with their 6-character code, or import lists you already have.
              </div>
            )}

            {lists.map((l) => (
              <div className="card tap" key={l.id} onClick={() => navigate(`/l/${l.id}`)}>
                <div className="counter">{counts[l.id] || 0}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{l.name}</h3>
                  <div className="meta">{counts[l.id] ? `${counts[l.id]} to buy` : 'All done'} · code {l.invite_code}</div>
                </div>
                <Ico.chev className="muted" />
              </div>
            ))}

            {showNew ? (
              <form className="card" onSubmit={createList}>
                <label className="field"><span>New list name</span>
                  <input className="input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                         placeholder="Weekly groceries" />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn primary" disabled={busy}>Create</button>
                  <button type="button" className="btn" onClick={() => setShowNew(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <button className="btn primary block" style={{ marginTop: 6 }} onClick={() => setShowNew(true)}>
                <Ico.plus /> New list
              </button>
            )}

            <button className="btn block" style={{ marginTop: 8 }} onClick={() => navigate('/import')}>
              Import lists &amp; items
            </button>

            <form className="card" style={{ marginTop: 18 }} onSubmit={join}>
              <label className="field"><span>Join a shared list</span>
                <input className="input" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                       placeholder="6-character code" maxLength={6}
                       style={{ letterSpacing: '.15em', fontFamily: 'ui-monospace, Menlo, monospace' }} />
              </label>
              <button className="btn block" disabled={busy || joinCode.length < 4}>Join list</button>
            </form>

            <YourName session={session} />

            <p className="center small muted" style={{ marginTop: 14 }}>
              Signed in as {session.user.email}
            </p>
          </>
        )}
      </div>
    </>
  )
}

/* Without a password screen to re-type your name on, this is the only place
   to fix it — and it's the name everyone else sees on the items you add. */
function YourName({ session }) {
  const [name, setName] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    supabase.from('profiles').select('display_name').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setName(data?.display_name || ''))
  }, [session.user.id])

  async function save() {
    const clean = name.trim()
    if (!clean) return
    await supabase.from('profiles').update({ display_name: clean }).eq('id', session.user.id)
    setSaved('Saved'); setTimeout(() => setSaved(''), 1600)
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Your name {saved && <span className="ok-note" style={{ fontSize: 12 }}>· {saved}</span>}</span>
        <input className="input" value={name} placeholder="Gary"
               onChange={(e) => setName(e.target.value)} onBlur={save} />
      </label>
      <p className="meta" style={{ margin: '8px 0 0' }}>
        Shown next to every item you add to a shared list.
      </p>
    </div>
  )
}

/* ============================================================
   List screen — the main event
   ============================================================ */

function ListScreen({ listId, session }) {
  const [list, setList] = useState(null)
  const [cats, setCats] = useState([])
  const [items, setItems] = useState([])
  const [master, setMaster] = useState([])
  const [people, setPeople] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const [nearby, setNearby] = useState(null)   // pending "did you mean …?" offer
  const [keepAwake, setKeepAwake] = useState(readWakePref)
  const [present, setPresent] = useState([])
  const [shopping, setShopping] = useState(false)
  const [showRegulars, setShowRegulars] = useState(false)
  const inputRef = useRef(null)
  const chanRef = useRef(null)
  const subscribedRef = useRef(false)
  const trackRef = useRef({ name: '', shopping: false })
  const shoppingTimer = useRef(null)

  useWakeLock(keepAwake)
  useEffect(() => { writeWakePref(keepAwake) }, [keepAwake])
  const knownPeopleRef = useRef([])
  useEffect(() => { knownPeopleRef.current = people.map((p) => p.user_id) }, [people])

  // Show the last-known copy instantly (and it's all we get when offline),
  // then refresh from the network behind it.
  useEffect(() => {
    const cached = cacheGet(`list:${listId}`)
    if (cached) {
      setList(cached.list); setCats(cached.cats || []); setItems(cached.items || [])
      setMaster(cached.master || []); setPeople(cached.people || [])
      setLoading(false)
    }
  }, [listId])

  const load = useCallback(async () => {
    try {
      const [l, c, i, m, p] = await Promise.all([
        supabase.from('lists').select('*').eq('id', listId).maybeSingle(),
        supabase.from('categories').select('*').eq('list_id', listId).order('position'),
        supabase.from('items').select('*').eq('list_id', listId),
        supabase.from('master_items').select('*').eq('list_id', listId).order('use_count', { ascending: false }).limit(500),
        supabase.rpc('list_people', { p_list_id: listId }),
      ])
      const e = l.error || c.error || i.error || m.error || p.error
      if (e) {
        // Offline just means "keep showing the cache"; anything else is real.
        if (!isOfflineError(e)) setErr(e.message)
        setLoading(false)
        return
      }
      setList(l.data); setCats(c.data || []); setItems(i.data || []); setMaster(m.data || [])
      setPeople(p.data || [])
    } catch (e) {
      if (!isOfflineError(e)) setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [listId])

  useEffect(() => { load() }, [load])

  // Re-read once queued changes have been accepted by the server.
  useEffect(() => {
    const on = () => load()
    window.addEventListener('nosh:synced', on)
    return () => window.removeEventListener('nosh:synced', on)
  }, [load])

  // Live sync + presence share one channel: two would mean two websockets per
  // open list, and Supabase's free tier counts connections.
  useEffect(() => {
    const me = session.user.id
    subscribedRef.current = false

    const ch = supabase
      .channel(`list-${listId}`, { config: { presence: { key: me } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `list_id=eq.${listId}` },
        async () => {
          const { data } = await supabase.from('items').select('*').eq('list_id', listId)
          if (!data) return
          setItems(data)
          // Someone new may have joined and added something — refresh names if we
          // see an author we don't have a name for yet.
          const known = new Set(knownPeopleRef.current)
          if (data.some((i) => i.added_by && !known.has(i.added_by))) {
            const { data: p } = await supabase.rpc('list_people', { p_list_id: listId })
            if (p) setPeople(p)
          }
        })
      // 'sync' already fires for joins and leaves, so it's the only one needed.
      .on('presence', { event: 'sync' }, () => setPresent(readPresence(ch, me)))
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        subscribedRef.current = true
        Promise.resolve(ch.track(trackRef.current)).catch(() => {})
      })

    chanRef.current = ch
    return () => {
      subscribedRef.current = false
      chanRef.current = null
      setPresent([])
      supabase.removeChannel(ch)
    }
  }, [listId, session.user.id])

  // Keep the offline copy current after every change. master_items is trimmed
  // because it's the only unbounded piece and localStorage is not.
  useEffect(() => {
    if (loading || !list) return
    cacheSet(`list:${listId}`, {
      list, cats, items, people, master: master.slice(0, 200), savedAt: Date.now(),
    })
  }, [listId, loading, list, cats, items, master, people])

  const catById = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats])

  // user_id -> display label. Only worth showing when more than one person is on the list.
  const nameById = useMemo(
    () => Object.fromEntries(people.map((p) => [p.user_id, personLabel(p)])),
    [people],
  )
  /* Broadcast who we are and whether we're mid-shop. Re-sent whenever either
     changes — the name arrives a moment after the channel does, and the
     shopping flag flips the first time something gets crossed off. */
  const myPresence = useMemo(() => ({
    name: nameById[session.user.id] || (session.user.email || '').split('@')[0] || 'Someone',
    shopping,
  }), [nameById, session.user.id, session.user.email, shopping])

  useEffect(() => {
    trackRef.current = myPresence
    if (subscribedRef.current && chanRef.current) {
      Promise.resolve(chanRef.current.track(myPresence)).catch(() => {})
    }
  }, [myPresence])

  // Crossing something off is the tell that you're actually at the store.
  // It lapses on its own so a morning's shop doesn't still say "shopping" at night.
  const markShopping = useCallback(() => {
    setShopping(true)
    clearTimeout(shoppingTimer.current)
    shoppingTimer.current = setTimeout(() => setShopping(false), SHOPPING_WINDOW_MS)
  }, [])
  useEffect(() => () => clearTimeout(shoppingTimer.current), [])

  const showWho = people.length > 1
  const whoLabel = (userId) => {
    if (!userId) return null
    const nm = nameById[userId] || 'Someone else'
    return userId === session.user.id ? `${nm} (you)` : nm
  }

  const active = items.filter((i) => !i.crossed_off)
  const done = items.filter((i) => i.crossed_off)
    .sort((a, b) => (b.crossed_at || '').localeCompare(a.crossed_at || ''))

  const grouped = useMemo(() => {
    const groups = new Map()
    for (const c of cats) groups.set(c.id, [])
    groups.set('_none', [])
    for (const it of active) {
      const key = it.category_id && groups.has(it.category_id) ? it.category_id : '_none'
      groups.get(key).push(it)
    }
    const out = []
    for (const c of cats) {
      const arr = groups.get(c.id)
      if (arr && arr.length) out.push({ id: c.id, name: c.name, items: arr.sort((a, b) => a.name.localeCompare(b.name)) })
    }
    const none = groups.get('_none')
    if (none.length) out.push({ id: '_none', name: 'Uncategorized', items: none.sort((a, b) => a.name.localeCompare(b.name)) })
    return out
  }, [active, cats])

  /* ---- suggestions ---- */
  const suggestions = useMemo(() => {
    const q = draft.trim()

    // One entry per distinct item, keeping whichever spelling you've used most.
    // Without this, "Banana" and "Bananas" both sit in the list forever.
    const byKey = new Map()
    for (const m of master) {
      const k = itemKey(m.name)
      const cur = byKey.get(k)
      if (!cur || (m.use_count || 0) > (cur.use_count || 0)) byKey.set(k, m)
    }
    const uniq = [...byKey.values()]

    if (!q) {
      const onList = new Set(active.map((a) => itemKey(a.name)))
      return uniq.filter((m) => !onList.has(itemKey(m.name))).slice(0, 12)
    }

    const qk = itemKey(q)
    const hits = uniq.filter((m) => matchesQuery(m.name, q) && itemKey(m.name) !== qk)

    // Nothing matched by prefix? You may have mistyped it — offer the closest
    // thing you've bought before, so the typo never reaches the list.
    if (hits.length < 5 && q.length >= 4) {
      for (const m of uniq) {
        if (hits.length >= 8) break
        if (hits.includes(m)) continue
        if (isNearMatch(q, m.name)) hits.push(m)
      }
    }
    return hits.slice(0, 12)
  }, [draft, master, active])

  /* ---- actions ---- */

  async function addItem(name, opts = {}) {
    const { categoryId = null, note = null, unit = null, quantity = 1 } = opts
    const clean = name.trim()
    if (!clean) return
    setDraft('')
    setNearby(null)

    // Same item by any spelling — case, punctuation or plural. Bump, don't duplicate.
    const key = itemKey(clean)
    const existing = active.find((a) => itemKey(a.name) === key)
    if (existing) return setQuantity(existing, qtyNum(existing.quantity) + qtyNum(quantity), unit || existing.unit)

    // Crossed off already? Un-cross it instead of duplicating.
    const crossed = done.find((a) => itemKey(a.name) === key)
    if (crossed) return toggle(crossed)

    const remembered = master.find((m) => itemKey(m.name) === key)
    const catId = categoryId || remembered?.category_id || guessCategoryId(clean, cats)
    const useUnit = unit || remembered?.unit || null
    const useNote = note || remembered?.note || null
    const qty = qtyNum(quantity)

    const optimistic = {
      id: nextTempId(), list_id: listId, name: titleCase(clean), quantity: qty,
      unit: useUnit, note: useNote, category_id: catId, crossed_off: false,
      created_by: session.user.id, created_at: new Date().toISOString(),
      added_by: session.user.id, added_at: new Date().toISOString(),
    }
    setItems((prev) => [...prev, optimistic])

    const args = {
      p_list_id: listId, p_name: titleCase(clean), p_quantity: qty,
      p_category_id: catId, p_note: useNote, p_unit: useUnit,
    }
    const res = await sendOrQueue(
      {
        k: 'add', tempId: optimistic.id, listId,
        name: args.p_name, quantity: qty, categoryId: catId, note: useNote, unit: useUnit,
      },
      () => supabase.rpc('add_item', args),
    )
    if (res.error) {
      setItems((prev) => prev.filter((p) => p.id !== optimistic.id))
      return setErr(res.error.message)
    }
    // Queued? Keep the optimistic row and its temporary id — the outbox swaps
    // in the real one when it lands.
    if (res.data) setItems((prev) => prev.map((p) => (p.id === optimistic.id ? res.data : p)))
    setMaster((prev) => {
      const hit = prev.find((m) => itemKey(m.name) === key)
      if (hit) return prev.map((m) => (m === hit ? { ...m, use_count: m.use_count + 1 } : m))
      return [{ id: nextTempId('m'), list_id: listId, name: titleCase(clean), category_id: catId, note: null, unit: useUnit, use_count: 1 }, ...prev]
    })

    // Not the same key, but one typo away from something? Offer to fold them
    // together. Only ever an offer — see the note above isNearMatch.
    const addedId = res.data?.id || optimistic.id
    const twinOnList = active.find((a) => isNearMatch(clean, a.name)) ||
                       done.find((a) => isNearMatch(clean, a.name))
    if (twinOnList) {
      setNearby({ kind: 'merge', addedId, addedName: titleCase(clean), target: twinOnList })
      return
    }
    const twinRemembered = master.find((m) => isNearMatch(clean, m.name))
    if (twinRemembered) {
      setNearby({ kind: 'rename', addedId, addedName: titleCase(clean), target: twinRemembered })
    }
  }

  /* Accept the "did you mean" offer.
     merge  — the twin is already on the list: add the quantities together and
              drop the row we just made.
     rename — the twin is only in your history: correct the spelling on the new
              row and clear out the stray entry the typo created. */
  async function acceptNearby() {
    const n = nearby
    setNearby(null)
    if (!n) return

    const added = items.find((i) => i.id === n.addedId)
    if (!added) return

    if (n.kind === 'merge') {
      const target = items.find((i) => i.id === n.target.id)
      if (!target) return
      await setQuantity(target, (target.quantity || 1) + (added.quantity || 1))
      if (target.crossed_off) await toggle(target)

      setItems((prev) => prev.filter((p) => p.id !== added.id))
      if (isTempId(added.id) && cancelQueuedAdd(added.id)) return
      const res = await sendOrQueue(
        { k: 'delete', ids: [added.id] },
        () => supabase.from('items').delete().eq('id', added.id),
      )
      if (res.error) setErr(res.error.message)
      return
    }

    const patch = { name: n.target.name, category_id: added.category_id || n.target.category_id || null }
    setItems((prev) => prev.map((p) => (p.id === added.id ? { ...p, ...patch } : p)))
    const res = await sendOrQueue(
      { k: 'update', id: added.id, patch },
      () => supabase.from('items').update(patch).eq('id', added.id),
    )
    if (res.error) return setErr(res.error.message)

    // Best-effort tidy-up of the master-list entry the typo created. Skipped
    // when offline — a stray autocomplete row is not worth queueing.
    setMaster((prev) => prev.filter((m) => m.name !== n.addedName))
    if (navigator.onLine !== false) {
      try {
        await supabase.from('master_items').delete().eq('list_id', listId).eq('name', n.addedName)
      } catch { /* harmless if it fails */ }
    }
  }

  /* Bulk add from the regulars sheet. Sequential on purpose: the outbox
     replays in order, so the list ends up in the order you ticked. */
  async function addMany(picks) {
    setShowRegulars(false)
    for (const m of picks) {
      await addItem(m.name, { categoryId: m.category_id, note: m.note, unit: m.unit })
    }
  }

  async function toggle(item) {
    const next = !item.crossed_off
    const now = new Date().toISOString()
    if (next) markShopping()
    // Un-crossing puts the item back on the to-buy list, so you become its
    // adder. A DB trigger does the real work; this just keeps the UI honest
    // until the write lands.
    const reAdd = !next ? { added_by: session.user.id, added_at: now } : {}
    setItems((prev) => prev.map((p) => (
      p.id === item.id ? { ...p, crossed_off: next, crossed_at: next ? now : null, ...reAdd } : p
    )))
    const patch = { crossed_off: next, crossed_at: next ? now : null }
    const res = await sendOrQueue(
      { k: 'update', id: item.id, patch },
      () => supabase.from('items').update(patch).eq('id', item.id),
    )
    if (res.error) { setErr(res.error.message); load() }
  }

  async function setQuantity(item, q, unit) {
    const n = Math.round(Math.max(0.01, Number(q) || 1) * 100) / 100
    const patch = { quantity: n }
    if (unit !== undefined && unit !== item.unit) patch.unit = unit || null
    setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, ...patch } : p)))
    const res = await sendOrQueue(
      { k: 'update', id: item.id, patch },
      () => supabase.from('items').update(patch).eq('id', item.id),
    )
    if (res.error) { setErr(res.error.message); load() }
  }

  async function clearCrossed() {
    if (!done.length) return
    if (!confirm(`Remove ${done.length} crossed-off item${done.length === 1 ? '' : 's'} from this list?`)) return
    const ids = done.map((d) => d.id)
    setItems((prev) => prev.filter((p) => !ids.includes(p.id)))

    // Anything still waiting to be created is cancelled outright rather than
    // created-then-deleted.
    const realIds = ids.filter((id) => !(isTempId(id) && cancelQueuedAdd(id)))
    if (!realIds.length) return

    const res = await sendOrQueue(
      { k: 'delete', ids: realIds },
      () => supabase.from('items').delete().in('id', realIds),
    )
    if (res.error) { setErr(res.error.message); load() }
  }

  if (loading) return <div className="empty">Loading…</div>
  if (!list) return (
    <div className="empty">
      <div className="big">List not found</div>
      You may have left it, or the link is wrong.
      <div style={{ marginTop: 14 }}><button className="btn" onClick={() => navigate('/')}>Back to my lists</button></div>
    </div>
  )

  return (
    <>
      <div className="topbar">
        <button className="btn icon" onClick={() => navigate('/')} aria-label="Back"><Ico.back /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{list.name}</h1>
          <div className="sub">{active.length} to buy{done.length ? ` · ${done.length} crossed off` : ''}</div>
        </div>
        {wakeLockSupported && (
          <button
            className={'btn icon' + (keepAwake ? ' awake' : '')}
            onClick={() => setKeepAwake((v) => !v)}
            aria-pressed={keepAwake}
            title={keepAwake
              ? 'Screen stays on while you use this list. Tap to let it sleep normally.'
              : 'Screen sleeps normally. Tap to keep it on while you shop.'}
            aria-label={keepAwake ? 'Let the screen sleep' : 'Keep the screen on'}
          >
            {keepAwake ? <Ico.sun /> : <Ico.moon />}
          </button>
        )}
        <button className="btn icon" onClick={() => navigate(`/l/${listId}/settings`)} aria-label="List settings"><Ico.gear /></button>
      </div>

      <div className="wrap">
        {err && <div className="err">{err}</div>}

        <PresenceBar present={present} nameById={nameById} />

        {active.length === 0 && done.length === 0 && (
          <div className="empty">
            <div className="big">Nothing on the list</div>
            Start typing at the bottom — Nosh files each item into its aisle automatically.
            {master.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => setShowRegulars(true)}>
                  <Ico.star /> Add from your regulars
                </button>
              </div>
            )}
          </div>
        )}

        {grouped.map((g) => (
          <div key={g.id}>
            <div className="section-head">{g.name}<div className="rule" /></div>
            <div className="rows">
              {g.items.map((it) => (
                <ItemRow key={it.id} item={it} onToggle={() => toggle(it)}
                         who={showWho ? whoLabel(it.added_by) : null}
                         onQty={(n) => setQuantity(it, n)} onOpen={() => navigate(`/i/${it.id}`)} />
              ))}
            </div>
          </div>
        ))}

        {done.length > 0 && (
          <>
            <div className="section-head">
              Crossed off ({done.length})
              <div className="rule" />
              <button className="btn ghost small" onClick={clearCrossed}>Clear</button>
            </div>
            <div className="rows">
              {done.map((it) => (
                <ItemRow key={it.id} item={it} done onToggle={() => toggle(it)}
                         who={showWho ? whoLabel(it.added_by) : null}
                         onQty={(n) => setQuantity(it, n)} onOpen={() => navigate(`/i/${it.id}`)} />
              ))}
            </div>
          </>
        )}
      </div>

      {nearby && (
        <div className="nearbar">
          <div className="inner">
            <div className="txt">
              Added <strong>{nearby.addedName}</strong>.{' '}
              {nearby.kind === 'merge'
                ? <>Did you mean the <strong>{nearby.target.name}</strong> already on the list?</>
                : <>Did you mean <strong>{nearby.target.name}</strong>?</>}
            </div>
            <div className="acts">
              <button className="btn ghost small" onClick={() => setNearby(null)}>Keep both</button>
              <button className="btn primary small" onClick={acceptNearby}>
                {nearby.kind === 'merge' ? 'Merge' : 'Fix it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {focused && suggestions.length > 0 && !nearby && (
        <div className="suggest">
          <div className="inner">
            {suggestions.map((s) => (
              <button key={s.id} onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        addItem(s.name, { categoryId: s.category_id, note: s.note, unit: s.unit })
                        inputRef.current?.focus()
                      }}>
                <span className="s-nm">{s.name}{s.unit ? <span className="muted"> · {s.unit}</span> : null}</span>
                <span className="s-cat">{catById[s.category_id]?.name || ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="addbar">
        <form className="inner" onSubmit={(e) => {
          e.preventDefault()
          const p = parseQuantityUnit(draft)
          addItem(p.name, { quantity: p.quantity, unit: p.unit })
        }}>
          <button type="button" className="btn icon" onClick={() => setShowRegulars(true)}
                  aria-label="Add from your regulars" title="Add from your regulars">
            <Ico.star />
          </button>
          <input ref={inputRef} className="input" placeholder="Add an item…  (try “2 lbs chicken”)" value={draft}
                 onChange={(e) => setDraft(e.target.value)}
                 onFocus={() => setFocused(true)}
                 onBlur={() => setTimeout(() => setFocused(false), 120)}
                 enterKeyHint="done" autoComplete="off" autoCorrect="off" />
          <button className="btn primary" disabled={!draft.trim()} aria-label="Add"><Ico.plus /></button>
        </form>
      </div>

      {showRegulars && (
        <RegularsSheet master={master} items={items}
                       onAdd={addMany} onClose={() => setShowRegulars(false)} />
      )}
    </>
  )
}

/* ============================================================
   Regulars — tick your usual shop back onto the list

   master_items has counted every add since day one and nothing ever
   showed you that. Rebuilding the weekly list should be ticking twelve
   boxes, not typing twelve names.

   Flat and frequency-ranked rather than grouped by aisle: the question
   here is "what do we normally get?", not "where is it in the store",
   and items get filed into their aisle automatically once added.
   ============================================================ */

/* One row per distinct item, keeping whichever spelling has been used most,
   ordered by how often it's been added. Search is typo-tolerant for the same
   reason the add bar is. */
export function rankRegulars(master, q = '') {
  const byKey = new Map()
  for (const m of master || []) {
    const k = itemKey(m.name)
    if (!k) continue
    const cur = byKey.get(k)
    if (!cur || (m.use_count || 0) > (cur.use_count || 0)) byKey.set(k, m)
  }
  let out = [...byKey.values()]
  if (String(q).trim()) out = out.filter((m) => matchesQuery(m.name, q) || isNearMatch(q, m.name))
  return out.sort((a, b) =>
    (b.use_count || 0) - (a.use_count || 0) || a.name.localeCompare(b.name))
}

// Keys of everything currently to-buy, so regulars already on the list can be
// shown as done rather than offered again.
export const activeItemKeys = (items) => {
  const s = new Set()
  for (const i of items || []) if (!i.crossed_off) s.add(itemKey(i.name))
  return s
}

function RegularsSheet({ master, items, onAdd, onClose }) {
  const [picked, setPicked] = useState(() => new Set())
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const onList = useMemo(() => activeItemKeys(items), [items])
  const rows = useMemo(() => rankRegulars(master, q), [master, q])

  const toggle = (key) => setPicked((prev) => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  async function submit() {
    const chosen = rows.filter((m) => picked.has(itemKey(m.name)))
    if (!chosen.length) return
    setBusy(true)
    await onAdd(chosen)
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Your regulars">
      <div className="sheet-head">
        <button className="btn icon" onClick={onClose} aria-label="Close"><Ico.back /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>Your regulars</h1>
          <div className="sub">Most-added first · tap to pick</div>
        </div>
      </div>

      <div className="sheet-body">
        <input className="input" placeholder="Search your regulars…" value={q}
               onChange={(e) => setQ(e.target.value)} autoComplete="off" />

        {rows.length === 0 ? (
          <div className="empty">
            {master.length === 0
              ? <>Nothing remembered yet. Add a few items and they'll show up here.</>
              : <>Nothing matches “{q}”.</>}
          </div>
        ) : (
          <div className="rows" style={{ marginTop: 12 }}>
            {rows.map((m) => {
              const key = itemKey(m.name)
              const already = onList.has(key)
              const on = picked.has(key)
              return (
                <div className={'row' + (already ? ' done' : '')} key={m.id || key}>
                  <button className={'check' + (on || already ? ' on' : '')}
                          disabled={already}
                          onClick={() => toggle(key)}
                          aria-pressed={on}
                          aria-label={already ? `${m.name} is already on the list` : `Add ${m.name}`}>
                    {(on || already) && <Ico.check />}
                  </button>
                  <div className="body" onClick={() => !already && toggle(key)}>
                    <div className="nm">
                      {m.name}
                      {m.unit ? <span className="muted small"> · {m.unit}</span> : null}
                    </div>
                    {already && <div className="nt">Already on the list</div>}
                  </div>
                  {(m.use_count || 0) > 1 && !already && (
                    <span className="muted small" title={`Added ${m.use_count} times`}>{m.use_count}×</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="sheet-foot">
        <button className="btn primary block" disabled={busy || picked.size === 0} onClick={submit}>
          {busy ? 'Adding…'
            : picked.size === 0 ? 'Pick a few items'
            : `Add ${picked.size} item${picked.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}

function ItemRow({ item, done, who, onToggle, onQty, onOpen }) {
  return (
    <div className={'row' + (done ? ' done' : '')}>
      <button className={'check' + (done ? ' on' : '')} onClick={onToggle} aria-label={done ? 'Un-cross' : 'Cross off'}>
        {done && <Ico.check />}
      </button>
      <div className="body" onClick={onOpen}>
        <div className="nm">{item.name}</div>
        {item.note && <div className="nt">{item.note}</div>}
      </div>
      {who && <Avatar id={item.added_by} label={who} />}
      {!done && (
        <div className="qty">
          <button onClick={() => onQty(qtyNum(item.quantity) - 1)} disabled={qtyNum(item.quantity) <= 1} aria-label="Fewer">−</button>
          <span className="n">
            {formatQty(item.quantity)}
            {item.unit && <span className="u">{item.unit}</span>}
          </span>
          <button onClick={() => onQty(qtyNum(item.quantity) + 1)} aria-label="More">+</button>
        </div>
      )}
      {done && <span className="muted small">×{formatQty(item.quantity)}{item.unit ? ` ${item.unit}` : ''}</span>}
    </div>
  )
}

/* ============================================================
   Item detail
   ============================================================ */

function ItemScreen({ itemId, session }) {
  const [item, setItem] = useState(null)
  const [cats, setCats] = useState([])
  const [people, setPeople] = useState([])
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      // An item added while offline exists only on this device, so don't even
      // ask the server for it.
      const cached = findCachedItem(itemId)
      if (cached) { setItem(cached); setCats(cached._cats || []); setLoading(false) }
      if (isTempId(itemId)) { setLoading(false); return }

      try {
        const { data, error } = await supabase.from('items')
          .select('*, lists(id,name)').eq('id', itemId).maybeSingle()
        if (error) {
          if (!isOfflineError(error) && !cached) setErr(error.message)
        } else if (data) {
          setItem(data)
          const [c, p] = await Promise.all([
            supabase.from('categories').select('*').eq('list_id', data.list_id).order('position'),
            supabase.rpc('list_people', { p_list_id: data.list_id }),
          ])
          setCats(c.data || [])
          setPeople(p.data || [])
        }
      } catch (e) {
        if (!isOfflineError(e) && !cached) setErr(e.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [itemId])

  async function save() {
    setSaving(true); setErr('')
    const patch = {
      name: item.name.trim(),
      quantity: Math.round(Math.max(0.01, qtyNum(item.quantity)) * 100) / 100,
      unit: item.unit || null,
      note: item.note?.trim() || null,
      category_id: item.category_id || null,
    }
    const res = await sendOrQueue(
      { k: 'update', id: item.id, patch },
      () => supabase.from('items').update(patch).eq('id', item.id),
    )
    if (!res.error && !res.queued) {
      // Only worth remembering once the edit itself is on the server; if it's
      // queued, the master list catches up on the next add of the same name.
      try {
        await supabase.rpc('remember_item', {
          p_list_id: item.list_id, p_name: patch.name,
          p_category_id: patch.category_id, p_note: patch.note, p_unit: patch.unit,
        })
      } catch { /* the item itself saved; the autocomplete hint can wait */ }
    }
    setSaving(false)
    if (res.error) return setErr(res.error.message)
    navigate(`/l/${item.list_id}`)
  }

  async function remove() {
    if (!confirm(`Delete "${item.name}"?`)) return
    if (isTempId(item.id) && cancelQueuedAdd(item.id)) return navigate(`/l/${item.list_id}`)
    const res = await sendOrQueue(
      { k: 'delete', ids: [item.id] },
      () => supabase.from('items').delete().eq('id', item.id),
    )
    if (res.error) return setErr(res.error.message)
    navigate(`/l/${item.list_id}`)
  }

  if (loading) return <div className="empty">Loading…</div>
  if (!item) return <div className="empty">Item not found.</div>

  const adder = people.find((p) => p.user_id === item.added_by)
  const adderName = item.added_by
    ? personLabel(adder) + (item.added_by === session?.user?.id ? ' (you)' : '')
    : null

  return (
    <>
      <div className="topbar">
        <button className="btn icon" onClick={back} aria-label="Back"><Ico.back /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>Edit item</h1>
          <div className="sub">{item.lists?.name}</div>
        </div>
      </div>

      <div className="wrap">
        {err && <div className="err">{err}</div>}

        {adderName && (
          <div className="byline">
            <Avatar id={item.added_by} label={adderName} size={28} />
            <span>
              Added to the list by <strong>{adderName}</strong>
              {item.added_at ? ` · ${whenText(item.added_at)}` : ''}
            </span>
          </div>
        )}

        <label className="field"><span>Name</span>
          <input className="input" value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} />
        </label>

        <label className="field"><span>How many</span></label>
        <div className="qty-row">
          <div className="qty">
            <button onClick={() => setItem({ ...item, quantity: Math.max(0.01, Math.round((qtyNum(item.quantity) - 1) * 100) / 100) })}>−</button>
            <input className="input qty-input" type="number" inputMode="decimal" min="0.01" step="0.25"
                   value={formatQty(item.quantity)}
                   onChange={(e) => setItem({ ...item, quantity: e.target.value })} />
            <button onClick={() => setItem({ ...item, quantity: Math.round((qtyNum(item.quantity) + 1) * 100) / 100 })}>+</button>
          </div>
          <select className="input unit-select" value={item.unit || ''}
                  onChange={(e) => setItem({ ...item, unit: e.target.value || null })}
                  aria-label="Unit">
            <option value="">(just a count)</option>
            {UNIT_NAMES.map((u) => <option key={u} value={u}>{u}</option>)}
            {item.unit && !UNIT_NAMES.includes(item.unit) && <option value={item.unit}>{item.unit}</option>}
          </select>
        </div>

        <label className="field"><span>Aisle / category</span>
          <select className="input" value={item.category_id || ''}
                  onChange={(e) => setItem({ ...item, category_id: e.target.value || null })}>
            <option value="">Uncategorized</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <label className="field"><span>Note (remembered next time)</span>
          <textarea className="input" value={item.note || ''} placeholder="Brand, size, which one…"
                    onChange={(e) => setItem({ ...item, note: e.target.value })} />
        </label>

        <div className="stack">
          <button className="btn primary block" onClick={save} disabled={saving || !item.name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn danger block" onClick={remove}><Ico.trash /> Delete item</button>
        </div>
      </div>
    </>
  )
}

/* ============================================================
   List settings — sharing, aisles, danger zone
   ============================================================ */

function ListSettings({ listId, session }) {
  const [list, setList] = useState(null)
  const [cats, setCats] = useState([])
  const [people, setPeople] = useState([])
  const [name, setName] = useState('')
  const [newCat, setNewCat] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, copy] = useCopy()

  const load = useCallback(async () => {
    const [l, c, p] = await Promise.all([
      supabase.from('lists').select('*').eq('id', listId).maybeSingle(),
      supabase.from('categories').select('*').eq('list_id', listId).order('position'),
      supabase.rpc('list_people', { p_list_id: listId }),
    ])
    if (l.error || c.error || p.error) setErr((l.error || c.error || p.error).message)
    setList(l.data); setName(l.data?.name || ''); setCats(c.data || []); setPeople(p.data || [])
    setLoading(false)
  }, [listId])

  useEffect(() => { load() }, [load])

  async function rename() {
    if (!name.trim() || name.trim() === list.name) return
    const { error } = await supabase.from('lists').update({ name: name.trim() }).eq('id', listId)
    if (error) return setErr(error.message)
    setList({ ...list, name: name.trim() })
  }

  async function addCat(e) {
    e.preventDefault()
    if (!newCat.trim()) return
    const pos = (cats.length ? cats[cats.length - 1].position : 0) + 10
    const { data, error } = await supabase.from('categories')
      .insert({ list_id: listId, name: newCat.trim(), position: pos }).select().single()
    if (error) return setErr(error.message)
    setCats([...cats, data]); setNewCat('')
  }

  async function renameCat(cat) {
    const next = prompt('Rename this aisle:', cat.name)
    if (!next || !next.trim() || next.trim() === cat.name) return
    const { error } = await supabase.from('categories').update({ name: next.trim() }).eq('id', cat.id)
    if (error) return setErr(error.message)
    setCats(cats.map((c) => (c.id === cat.id ? { ...c, name: next.trim() } : c)))
  }

  async function deleteCat(cat) {
    if (!confirm(`Delete the "${cat.name}" aisle? Items in it become uncategorized.`)) return
    const { error } = await supabase.from('categories').delete().eq('id', cat.id)
    if (error) return setErr(error.message)
    setCats(cats.filter((c) => c.id !== cat.id))
  }

  async function move(idx, dir) {
    const j = idx + dir
    if (j < 0 || j >= cats.length) return
    const a = cats[idx], b = cats[j]
    const next = [...cats]; next[idx] = b; next[j] = a
    setCats(next)
    await Promise.all([
      supabase.from('categories').update({ position: b.position }).eq('id', a.id),
      supabase.from('categories').update({ position: a.position }).eq('id', b.id),
    ])
    // keep local positions consistent
    setCats((cur) => cur.map((c) => (c.id === a.id ? { ...c, position: b.position } : c.id === b.id ? { ...c, position: a.position } : c)))
  }

  async function leave() {
    const last = people.length <= 1
    const msg = last
      ? `You're the only person on "${list.name}". Leaving will delete the list and everything on it. Continue?`
      : `Leave "${list.name}"? You can rejoin later with the code ${list.invite_code}.`
    if (!confirm(msg)) return
    const { error } = await supabase.rpc('leave_list', { p_list_id: listId })
    if (error) return setErr(error.message)
    navigate('/')
  }

  if (loading) return <div className="empty">Loading…</div>
  if (!list) return <div className="empty">List not found.</div>

  const link = shareUrl(list.invite_code)

  return (
    <>
      <div className="topbar">
        <button className="btn icon" onClick={() => navigate(`/l/${listId}`)} aria-label="Back"><Ico.back /></button>
        <h1>List settings</h1>
      </div>

      <div className="wrap">
        {err && <div className="err">{err}</div>}

        <div className="card">
          <label className="field"><span>List name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} />
          </label>
        </div>

        <div className="card">
          <h3>Share this list</h3>
          <p className="meta" style={{ marginBottom: 12 }}>
            Anyone with the code or link can add to and edit this list.
          </p>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <span className="code-chip" style={{ fontSize: 18, padding: '8px 14px' }}>{list.invite_code}</span>
            <button className="btn" onClick={() => copy(list.invite_code, 'code')}>
              {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
          </div>
          <button className="btn primary block" onClick={() => copy(link, 'link')}>
            {copied === 'link' ? 'Link copied' : 'Copy invite link'}
          </button>
          {navigator.share && (
            <button className="btn block" style={{ marginTop: 8 }}
                    onClick={() => navigator.share({ title: `Nosh — ${list.name}`, text: `Join my grocery list "${list.name}" on Nosh`, url: link })}>
              Share…
            </button>
          )}
        </div>

        <div className="card">
          <h3>People ({people.length})</h3>
          <div className="stack" style={{ marginTop: 8 }}>
            {people.map((p) => (
              <div className="row-between small" key={p.user_id}>
                <span>{p.display_name || p.email || 'Someone'}{p.user_id === session.user.id ? ' (you)' : ''}</span>
                <span className="muted">{p.role}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Aisles</h3>
          <p className="meta" style={{ marginBottom: 10 }}>
            Put these in the order you walk the store — the list follows this order.
          </p>
          <div className="rows" style={{ marginBottom: 10 }}>
            {cats.map((c, i) => (
              <div className="row" key={c.id}>
                <div className="body" onClick={() => renameCat(c)}><div className="nm">{c.name}</div></div>
                <button className="btn icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><Ico.up /></button>
                <button className="btn icon" onClick={() => move(i, 1)} disabled={i === cats.length - 1} aria-label="Move down"><Ico.down /></button>
                <button className="btn icon" onClick={() => deleteCat(c)} aria-label="Delete"><Ico.trash /></button>
              </div>
            ))}
          </div>
          <form onSubmit={addCat} style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New aisle name" />
            <button className="btn">Add</button>
          </form>
        </div>

        <div className="card">
          <h3>Danger zone</h3>
          <button className="btn danger block" style={{ marginTop: 8 }} onClick={leave}>
            {people.length <= 1 ? 'Delete this list' : 'Leave this list'}
          </button>
        </div>
      </div>
    </>
  )
}

/* ============================================================
   Join via invite link
   ============================================================ */

function JoinScreen({ code }) {
  const [state, setState] = useState('working')
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('join_list_by_code', { p_code: code })
      if (error) { setErr(error.message); setState('error'); return }
      navigate(`/l/${data}`)
    })()
  }, [code])

  if (state === 'error') return (
    <div className="empty">
      <div className="big">Couldn't join</div>
      {err}
      <div style={{ marginTop: 14 }}><button className="btn" onClick={() => navigate('/')}>My lists</button></div>
    </div>
  )
  return <div className="empty">Joining the list…</div>
}

/* ============================================================
   Import — paste lists & items from elsewhere (e.g. OurGroceries)
   ============================================================

   Accepts either:

   1) Plain text, one list per "# " heading, optional "## " category
      sub-headings, one item per line. Quantity as "Milk x2" or
      "Milk (2)"; a note after " -- " or " — ".

        # Costco
        ## Produce
        Bananas x2
        Spinach -- organic if they have it
        ## Household
        Paper towels

        # Weekly groceries
        Milk
        Eggs (2 dozen)

   2) JSON in the shape [{ "name": "Costco", "items": [
        "Bananas", { "name": "Milk", "quantity": 2, "category":
        "Dairy", "note": "2%", "crossed": false } ] }, ...]  — handy
      if you (or I, when you paste me an export from another app)
      convert the source data into this simple structure first.
      "crossed": true marks an item as history only — it's remembered
      for autocomplete in that list but not added as a to-buy item,
      which is the right call for old crossed-off items imported in
      bulk (you don't want last year's shopping cluttering today's
      list). Any category name not already on the list gets created
      automatically, so the original aisle/store layout carries over.
   ------------------------------------------------------------ */

function parseImportJson(text) {
  let data
  try { data = JSON.parse(text) } catch { return null }
  const arr = Array.isArray(data) ? data : Array.isArray(data?.lists) ? data.lists : null
  if (!arr) return null
  return arr.map((l) => ({
    name: String(l.name || l.title || 'Imported list').trim(),
    items: (l.items || []).map((it) => {
      if (typeof it === 'string') return { name: it.trim(), quantity: 1, category: null, note: null, crossed: false }
      return {
        name: String(it.name || it.value || '').trim(),
        quantity: Math.max(0.01, Number(it.quantity) || 1),
        unit: it.unit ? String(it.unit).trim() : null,
        category: it.category ? String(it.category).trim() : null,
        note: it.note ? String(it.note).trim() : null,
        crossed: !!it.crossed,
      }
    }).filter((it) => it.name),
  })).filter((l) => l.name && l.items.length)
}

function parseImportText(text) {
  const lines = text.split(/\r?\n/)
  const lists = []
  let currentList = null
  let currentCategory = null

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (line.startsWith('## ')) { currentCategory = line.slice(3).trim(); continue }
    if (line.startsWith('# ')) {
      currentList = { name: line.slice(2).trim(), items: [] }
      lists.push(currentList)
      currentCategory = null
      continue
    }
    if (!currentList) { currentList = { name: 'Imported list', items: [] }; lists.push(currentList) }

    let item = line.replace(/^[-*•]\s*/, '')
    let note = null
    const noteSplit = item.split(/\s+(?:--|—)\s+/)
    if (noteSplit.length > 1) { item = noteSplit[0]; note = noteSplit.slice(1).join(' - ').trim() }

    // Same shorthand the add bar understands: "x2", "(2)", "2 lbs of chicken".
    const parsed = parseQuantityUnit(item)
    if (!parsed.name) continue
    currentList.items.push({
      name: parsed.name, quantity: parsed.quantity, unit: parsed.unit,
      category: currentCategory, note, crossed: false,
    })
  }
  return lists.filter((l) => l.items.length)
}

function parseImport(text) {
  return parseImportJson(text) || parseImportText(text)
}

// Run a list of async jobs with at most `limit` in flight at once,
// so a big import (hundreds of items) doesn't fire everything at
// the same instant, but still goes faster than one-at-a-time.
async function runPooled(jobs, limit, onEach) {
  let i = 0
  async function worker() {
    while (i < jobs.length) {
      const idx = i++
      await jobs[idx]()
      onEach?.(idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker))
}

function ImportScreen() {
  const [raw, setRaw] = useState('')
  const [fileName, setFileName] = useState('')
  const [stage, setStage] = useState('paste') // 'paste' | 'done'
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)

  const parsed = useMemo(() => (raw.trim() ? parseImport(raw) : []), [raw])
  const totalItems = parsed.reduce((n, l) => n + l.items.length, 0)
  const activeCount = parsed.reduce((n, l) => n + l.items.filter((it) => !it.crossed).length, 0)
  const historyCount = totalItems - activeCount

  function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => setRaw(String(reader.result || ''))
    reader.readAsText(file)
  }

  async function ensureCategory(listId, cats, name) {
    const hit = cats.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (hit) return hit.id
    const nextPos = (cats.length ? Math.max(...cats.map((c) => c.position)) : 0) + 10
    const { data, error } = await supabase.from('categories')
      .insert({ list_id: listId, name, position: nextPos }).select().single()
    if (error) throw error
    cats.push(data)
    return data.id
  }

  async function runImport() {
    setBusy(true); setErr('')
    setProgress({ done: 0, total: totalItems })
    try {
      const { data: existing, error: e0 } = await supabase.from('lists').select('*')
      if (e0) throw e0

      const created = []
      let doneSoFar = 0

      for (const l of parsed) {
        let list = existing.find((x) => x.name.trim().toLowerCase() === l.name.toLowerCase())
        if (!list) {
          const { data: nl, error } = await supabase.rpc('create_list', { p_name: l.name })
          if (error) throw error
          list = nl
          existing.push(list)
        }

        const { data: catRows, error: ec } = await supabase.from('categories').select('*').eq('list_id', list.id)
        if (ec) throw ec
        const cats = catRows || []

        // Create any missing categories one at a time, up front — avoids two
        // items racing to create the same new category once we parallelize below.
        const neededCatNames = [...new Set(l.items.map((it) => it.category).filter(Boolean))]
        for (const name of neededCatNames) await ensureCategory(list.id, cats, name)

        let added = 0, remembered = 0
        const jobs = l.items.map((it) => async () => {
          let categoryId = null
          if (it.category) {
            const hit = cats.find((c) => c.name.toLowerCase() === it.category.toLowerCase())
            categoryId = hit ? hit.id : null
          }
          if (!categoryId) categoryId = guessCategoryId(it.name, cats)

          if (it.crossed) {
            const { error } = await supabase.rpc('remember_item', {
              p_list_id: list.id, p_name: titleCase(it.name), p_category_id: categoryId,
              p_note: it.note || null, p_unit: it.unit || null,
            })
            if (error) throw error
            remembered++
          } else {
            const { error } = await supabase.rpc('add_item', {
              p_list_id: list.id, p_name: titleCase(it.name), p_quantity: it.quantity,
              p_category_id: categoryId, p_note: it.note || null, p_unit: it.unit || null,
            })
            if (error) throw error
            added++
          }
        })

        await runPooled(jobs, 6, () => { doneSoFar++; setProgress({ done: doneSoFar, total: totalItems }) })
        created.push({ id: list.id, name: list.name, added, remembered })
      }
      setResult(created)
      setStage('done')
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  if (stage === 'done') {
    return (
      <>
        <div className="topbar">
          <button className="btn icon" onClick={() => navigate('/')} aria-label="Back"><Ico.back /></button>
          <h1>Import complete</h1>
        </div>
        <div className="wrap">
          <div className="card">
            <h3>Done</h3>
            <p className="meta">Imported into {result.length} list{result.length === 1 ? '' : 's'}.</p>
          </div>
          <div className="rows" style={{ marginBottom: 16 }}>
            {result.map((r) => (
              <div className="row" key={r.id}>
                <div className="body" onClick={() => navigate(`/l/${r.id}`)}>
                  <div className="nm">{r.name}</div>
                  <div className="nt">
                    {r.added} to buy
                    {r.remembered ? ` · ${r.remembered} remembered for autocomplete` : ''}
                  </div>
                </div>
                <Ico.chev className="muted" />
              </div>
            ))}
          </div>
          <button className="btn primary block" onClick={() => navigate('/')}>Back to my lists</button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="topbar">
        <button className="btn icon" onClick={() => navigate('/')} aria-label="Back"><Ico.back /></button>
        <h1>Import lists &amp; items</h1>
      </div>

      <div className="wrap">
        {err && <div className="err">{err}</div>}

        <div className="card small">
          <p style={{ marginTop: 0 }}>
            Paste plain text below. Start a list with a line like <code># Costco</code>{' '}
            (just <code>#</code> then the name), optionally group items under{' '}
            <code>## Category</code>, then one item per line. Add a quantity with{' '}
            <code>x2</code> or <code>(2)</code>, and a note after <code>--</code>.
          </p>
          <p style={{ marginBottom: 0 }}>
            Coming from OurGroceries: open a list on their website and use Print to get a
            clean copy-pasteable version, or just retype the item names under a{' '}
            <code># List name</code> heading — quickest for a handful of lists. For a full
            export, hand me the file in chat and I'll convert it to a JSON file you can
            upload below instead of pasting.
          </p>
        </div>

        <label className="field">
          <span>Upload a file (.json or .txt)</span>
          <input className="input" type="file" accept=".json,.txt,application/json,text/plain" onChange={onFile} />
        </label>
        {fileName && <p className="small muted" style={{ marginTop: -6, marginBottom: 12 }}>Loaded {fileName}</p>}

        <label className="field">
          <span>…or paste here</span>
          <textarea className="input" style={{ minHeight: 220, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 14 }}
                    value={raw} onChange={(e) => { setRaw(e.target.value); setFileName('') }}
                    placeholder={'# Costco\n## Produce\nBananas x2\nSpinach -- organic if they have it\n\n# Weekly groceries\nMilk\nEggs (2 dozen)'} />
        </label>

        {raw.trim() && (
          <div className="card">
            <h3>Preview</h3>
            {parsed.length === 0 ? (
              <p className="meta">Couldn't find any items in that text yet.</p>
            ) : (
              <>
                <p className="meta" style={{ marginBottom: 10 }}>
                  {parsed.length} list{parsed.length === 1 ? '' : 's'}, {activeCount} item{activeCount === 1 ? '' : 's'} to buy
                  {historyCount ? `, ${historyCount} more remembered for autocomplete only` : ''}.
                  Lists matching one you already have will be added to, not duplicated.
                </p>
                <div className="stack">
                  {parsed.map((l, i) => {
                    const active = l.items.filter((it) => !it.crossed).length
                    const history = l.items.length - active
                    return (
                      <div key={i} className="small">
                        <strong>{l.name}</strong> — {active} to buy{history ? `, ${history} remembered` : ''}
                        <div className="muted">{l.items.slice(0, 6).map((it) => it.name).join(', ')}{l.items.length > 6 ? ', …' : ''}</div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {busy && progress.total > 0 && (
          <p className="small muted center" style={{ marginBottom: 10 }}>
            Importing… {progress.done} / {progress.total}
          </p>
        )}

        <button className="btn primary block" disabled={busy || totalItems === 0} onClick={runImport}>
          {busy ? 'Importing…' : `Import ${totalItems || ''} item${totalItems === 1 ? '' : 's'}`}
        </button>
      </div>
    </>
  )
}
