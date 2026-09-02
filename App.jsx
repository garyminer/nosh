import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient.js'

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

  if (booting) return <div className="empty">Loading…</div>
  if (!session) return <AuthScreen pendingJoin={route.name === 'join' ? route.code : null} />

  return (
    <div className="app">
      {route.name === 'home' && <HomeScreen session={session} />}
      {route.name === 'list' && <ListScreen key={route.listId} listId={route.listId} session={session} />}
      {route.name === 'settings' && <ListSettings key={route.listId} listId={route.listId} session={session} />}
      {route.name === 'item' && <ItemScreen key={route.itemId} itemId={route.itemId} />}
      {route.name === 'join' && <JoinScreen code={route.code} />}
      {route.name === 'import' && <ImportScreen />}
    </div>
  )
}

/* ============================================================
   Auth
   ============================================================ */

function AuthScreen({ pendingJoin }) {
  const [mode, setMode] = useState('in')       // 'in' | 'up'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(''); setNote(''); setBusy(true)
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() || email.split('@')[0] } },
        })
        if (error) throw error
        if (!data.session) setNote('Account created. Check your email to confirm, then sign in.')
      }
    } catch (e2) {
      setErr(e2.message || String(e2))
    } finally { setBusy(false) }
  }

  async function magicLink() {
    setErr(''); setNote('')
    if (!email.trim()) return setErr('Enter your email first.')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + (pendingJoin ? `/#/join/${pendingJoin}` : '/') },
    })
    if (error) setErr(error.message)
    else setNote('Check your email for a sign-in link.')
  }

  return (
    <div className="auth">
      <div className="logo"><Logo size={64} /></div>
      <h1 className="center" style={{ margin: '14px 0 4px', fontSize: 30, fontWeight: 800, letterSpacing: '-.03em' }}>Nosh</h1>
      <p className="tag">One grocery list. Everyone in sync.</p>

      {pendingJoin && (
        <div className="card small">
          You've been invited to a list (code <span className="code-chip">{pendingJoin}</span>).
          Sign in or create an account to join it.
        </div>
      )}

      <div className="tabs">
        <button className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Sign in</button>
        <button className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Create account</button>
      </div>

      {err && <div className="err">{err}</div>}
      {note && <p className="ok-note">{note}</p>}

      <form onSubmit={submit}>
        {mode === 'up' && (
          <label className="field"><span>Your name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gary" autoComplete="name" />
          </label>
        )}
        <label className="field"><span>Email</span>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="field"><span>Password</span>
          <input className="input" type="password" required minLength={6} value={password}
                 onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
        </label>
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="center small" style={{ marginTop: 18 }}>
        <button className="btn ghost" onClick={magicLink}>Email me a sign-in link instead</button>
      </p>
    </div>
  )
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

  const load = useCallback(async () => {
    setErr('')
    const [{ data: ls, error: e1 }, { data: its, error: e2 }] = await Promise.all([
      supabase.from('lists').select('*').order('created_at', { ascending: true }),
      supabase.from('items').select('id,name,list_id,crossed_off,quantity'),
    ])
    if (e1 || e2) setErr((e1 || e2).message)
    setLists(ls || [])
    setAllItems(its || [])
    const c = {}
    for (const i of its || []) if (!i.crossed_off) c[i.list_id] = (c[i.list_id] || 0) + 1
    setCounts(c)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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

            <p className="center small muted" style={{ marginTop: 22 }}>
              Signed in as {session.user.email}
            </p>
          </>
        )}
      </div>
    </>
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
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)

  const load = useCallback(async () => {
    const [l, c, i, m] = await Promise.all([
      supabase.from('lists').select('*').eq('id', listId).maybeSingle(),
      supabase.from('categories').select('*').eq('list_id', listId).order('position'),
      supabase.from('items').select('*').eq('list_id', listId),
      supabase.from('master_items').select('*').eq('list_id', listId).order('use_count', { ascending: false }).limit(500),
    ])
    const e = l.error || c.error || i.error || m.error
    if (e) setErr(e.message)
    setList(l.data); setCats(c.data || []); setItems(i.data || []); setMaster(m.data || [])
    setLoading(false)
  }, [listId])

  useEffect(() => { load() }, [load])

  // live sync: anyone else's changes show up here
  useEffect(() => {
    const ch = supabase
      .channel(`list-${listId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `list_id=eq.${listId}` },
        async () => {
          const { data } = await supabase.from('items').select('*').eq('list_id', listId)
          if (data) setItems(data)
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [listId])

  const catById = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats])

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
    if (!q) {
      return master.slice(0, 12).filter((m) => !active.some((a) => a.name.toLowerCase() === m.name.toLowerCase()))
    }
    return master
      .filter((m) => matchesQuery(m.name, q))
      .filter((m) => m.name.toLowerCase() !== q.toLowerCase())
      .slice(0, 12)
  }, [draft, master, active])

  /* ---- actions ---- */

  async function addItem(name, categoryId = null, note = null) {
    const clean = name.trim()
    if (!clean) return
    setDraft('')

    // Already on the list and not crossed off? Just bump the quantity.
    const existing = active.find((a) => a.name.toLowerCase() === clean.toLowerCase())
    if (existing) return setQuantity(existing, existing.quantity + 1)

    // Crossed off already? Un-cross it instead of duplicating.
    const crossed = done.find((a) => a.name.toLowerCase() === clean.toLowerCase())
    if (crossed) return toggle(crossed)

    const remembered = master.find((m) => m.name.toLowerCase() === clean.toLowerCase())
    const catId = categoryId || remembered?.category_id || guessCategoryId(clean, cats)

    const optimistic = {
      id: `tmp-${Date.now()}`, list_id: listId, name: titleCase(clean), quantity: 1,
      note: note || remembered?.note || null, category_id: catId, crossed_off: false,
    }
    setItems((prev) => [...prev, optimistic])

    const { data, error } = await supabase.rpc('add_item', {
      p_list_id: listId, p_name: titleCase(clean), p_quantity: 1,
      p_category_id: catId, p_note: note || remembered?.note || null,
    })
    if (error) {
      setItems((prev) => prev.filter((p) => p.id !== optimistic.id))
      return setErr(error.message)
    }
    setItems((prev) => prev.map((p) => (p.id === optimistic.id ? data : p)))
    setMaster((prev) => {
      const hit = prev.find((m) => m.name.toLowerCase() === clean.toLowerCase())
      if (hit) return prev.map((m) => (m === hit ? { ...m, use_count: m.use_count + 1 } : m))
      return [{ id: `m-${Date.now()}`, list_id: listId, name: titleCase(clean), category_id: catId, note: null, use_count: 1 }, ...prev]
    })
  }

  async function toggle(item) {
    const next = !item.crossed_off
    setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, crossed_off: next, crossed_at: next ? new Date().toISOString() : null } : p)))
    const { error } = await supabase.from('items')
      .update({ crossed_off: next, crossed_at: next ? new Date().toISOString() : null })
      .eq('id', item.id)
    if (error) { setErr(error.message); load() }
  }

  async function setQuantity(item, q) {
    const n = Math.max(1, q)
    setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, quantity: n } : p)))
    const { error } = await supabase.from('items').update({ quantity: n }).eq('id', item.id)
    if (error) { setErr(error.message); load() }
  }

  async function clearCrossed() {
    if (!done.length) return
    if (!confirm(`Remove ${done.length} crossed-off item${done.length === 1 ? '' : 's'} from this list?`)) return
    const ids = done.map((d) => d.id)
    setItems((prev) => prev.filter((p) => !ids.includes(p.id)))
    const { error } = await supabase.from('items').delete().in('id', ids)
    if (error) { setErr(error.message); load() }
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
        <button className="btn icon" onClick={() => navigate(`/l/${listId}/settings`)} aria-label="List settings"><Ico.gear /></button>
      </div>

      <div className="wrap">
        {err && <div className="err">{err}</div>}

        {active.length === 0 && done.length === 0 && (
          <div className="empty">
            <div className="big">Nothing on the list</div>
            Start typing at the bottom — Nosh files each item into its aisle automatically.
          </div>
        )}

        {grouped.map((g) => (
          <div key={g.id}>
            <div className="section-head">{g.name}<div className="rule" /></div>
            <div className="rows">
              {g.items.map((it) => (
                <ItemRow key={it.id} item={it} onToggle={() => toggle(it)}
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
                         onQty={(n) => setQuantity(it, n)} onOpen={() => navigate(`/i/${it.id}`)} />
              ))}
            </div>
          </>
        )}
      </div>

      {focused && suggestions.length > 0 && (
        <div className="suggest">
          <div className="inner">
            {suggestions.map((s) => (
              <button key={s.id} onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { addItem(s.name, s.category_id, s.note); inputRef.current?.focus() }}>
                <span className="s-nm">{s.name}</span>
                <span className="s-cat">{catById[s.category_id]?.name || ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="addbar">
        <form className="inner" onSubmit={(e) => { e.preventDefault(); addItem(draft) }}>
          <input ref={inputRef} className="input" placeholder="Add an item…" value={draft}
                 onChange={(e) => setDraft(e.target.value)}
                 onFocus={() => setFocused(true)}
                 onBlur={() => setTimeout(() => setFocused(false), 120)}
                 enterKeyHint="done" autoComplete="off" autoCorrect="off" />
          <button className="btn primary" disabled={!draft.trim()} aria-label="Add"><Ico.plus /></button>
        </form>
      </div>
    </>
  )
}

function ItemRow({ item, done, onToggle, onQty, onOpen }) {
  return (
    <div className={'row' + (done ? ' done' : '')}>
      <button className={'check' + (done ? ' on' : '')} onClick={onToggle} aria-label={done ? 'Un-cross' : 'Cross off'}>
        {done && <Ico.check />}
      </button>
      <div className="body" onClick={onOpen}>
        <div className="nm">{item.name}</div>
        {item.note && <div className="nt">{item.note}</div>}
      </div>
      {!done && (
        <div className="qty">
          <button onClick={() => onQty(item.quantity - 1)} disabled={item.quantity <= 1} aria-label="Fewer">−</button>
          <span className="n">{item.quantity}</span>
          <button onClick={() => onQty(item.quantity + 1)} aria-label="More">+</button>
        </div>
      )}
      {done && <span className="muted small">×{item.quantity}</span>}
    </div>
  )
}

/* ============================================================
   Item detail
   ============================================================ */

function ItemScreen({ itemId }) {
  const [item, setItem] = useState(null)
  const [cats, setCats] = useState([])
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('items')
        .select('*, lists(id,name)').eq('id', itemId).maybeSingle()
      if (error) setErr(error.message)
      setItem(data)
      if (data) {
        const { data: c } = await supabase.from('categories').select('*').eq('list_id', data.list_id).order('position')
        setCats(c || [])
      }
      setLoading(false)
    })()
  }, [itemId])

  async function save() {
    setSaving(true); setErr('')
    const { error } = await supabase.from('items').update({
      name: item.name.trim(),
      quantity: Math.max(1, item.quantity),
      note: item.note?.trim() || null,
      category_id: item.category_id || null,
    }).eq('id', item.id)
    if (!error) {
      await supabase.rpc('remember_item', {
        p_list_id: item.list_id, p_name: item.name.trim(),
        p_category_id: item.category_id || null, p_note: item.note?.trim() || null,
      })
    }
    setSaving(false)
    if (error) return setErr(error.message)
    navigate(`/l/${item.list_id}`)
  }

  async function remove() {
    if (!confirm(`Delete "${item.name}"?`)) return
    const { error } = await supabase.from('items').delete().eq('id', item.id)
    if (error) return setErr(error.message)
    navigate(`/l/${item.list_id}`)
  }

  if (loading) return <div className="empty">Loading…</div>
  if (!item) return <div className="empty">Item not found.</div>

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

        <label className="field"><span>Name</span>
          <input className="input" value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} />
        </label>

        <label className="field"><span>How many</span></label>
        <div className="qty" style={{ marginBottom: 14 }}>
          <button onClick={() => setItem({ ...item, quantity: Math.max(1, item.quantity - 1) })}>−</button>
          <span className="n" style={{ fontSize: 18, minWidth: 40 }}>{item.quantity}</span>
          <button onClick={() => setItem({ ...item, quantity: item.quantity + 1 })}>+</button>
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
        quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
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

    let quantity = 1
    let m = item.match(/^(.*?)\s*[x×]\s*(\d+)$/i)
    if (m) { item = m[1]; quantity = parseInt(m[2], 10) }
    else if ((m = item.match(/^(.*?)\s*\((\d+)\)$/))) { item = m[1]; quantity = parseInt(m[2], 10) }

    item = item.trim()
    if (!item) continue
    currentList.items.push({ name: item, quantity: Math.max(1, quantity), category: currentCategory, note, crossed: false })
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
              p_list_id: list.id, p_name: titleCase(it.name), p_category_id: categoryId, p_note: it.note || null,
            })
            if (error) throw error
            remembered++
          } else {
            const { error } = await supabase.rpc('add_item', {
              p_list_id: list.id, p_name: titleCase(it.name), p_quantity: it.quantity,
              p_category_id: categoryId, p_note: it.note || null,
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
