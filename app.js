/* Minimal frontend: functionality over looks. All dynamic text is set via textContent (no XSS). */
let token = sessionStorage.getItem('token');
let me = null;

const $ = (id) => document.getElementById(id);
const csv = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else node[k] = v;
  }
  for (const c of children.flat()) node.append(c instanceof Node ? c : document.createTextNode(c ?? ''));
  return node;
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) logout();
    throw new Error(data.message || res.statusText);
  }
  return data;
}

function showError(e) { $('msg').textContent = e ? e.message || String(e) : ''; }
async function guard(fn) { try { showError(); await fn(); } catch (e) { showError(e); } }

function pager(p, go) {
  return el('div', { class: 'pager' },
    el('button', { disabled: p.page <= 1, onclick: () => go(p.page - 1) }, 'Prev'),
    ` Page ${p.page} of ${Math.max(p.pages, 1)} (${p.total} total) `,
    el('button', { disabled: p.page >= p.pages, onclick: () => go(p.page + 1) }, 'Next'));
}

/* ------------------------------- auth ----------------------------------- */
function setSession(data) {
  token = data.token;
  sessionStorage.setItem('token', token);
  start();
}

function logout() {
  token = null; me = null;
  sessionStorage.removeItem('token');
  $('app').hidden = true;
  $('auth').hidden = false;
}

$('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  guard(async () => setSession(await api('/auth/login', { method: 'POST', body: Object.fromEntries(f) })));
});

$('registerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  f.interests = csv(f.interests);
  guard(async () => setSession(await api('/auth/register', { method: 'POST', body: f })));
});

$('logout').addEventListener('click', logout);

/* ------------------------------- views ---------------------------------- */
const views = {
  notes: { label: 'Notes', render: notesView },
  posts: { label: 'Posts', render: (p) => postsView(p) },
  profile: { label: 'Profile', render: profileView },
  users: { label: 'Users (admin)', render: usersView, admin: true },
  groups: { label: 'Interest groups (admin)', render: groupsView, admin: true },
};

function show(name) {
  [...$('nav').children].forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $('view').replaceChildren();
  guard(() => views[name].render());
}

async function start() {
  await guard(async () => {
    me = await api('/users/me');
    $('auth').hidden = true;
    $('app').hidden = false;
    $('who').textContent = `${me.name} (${me.email}) - ${me.role}`;
    $('nav').replaceChildren(...Object.entries(views)
      .filter(([, v]) => !v.admin || me.role === 'admin')
      .map(([k, v]) => el('button', { 'data-view': k, onclick: () => show(k) }, v.label)));
    show('notes');
  });
}

/* ------------------------------- notes ---------------------------------- */
async function notesView(page = 1) {
  const admin = me.role === 'admin';
  const res = await api(`/notes?page=${page}&limit=5`);
  const form = el('form', { onsubmit: (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      guard(async () => { await api('/notes', { method: 'POST', body: f }); notesView(1); });
    } },
    el('input', { name: 'title', placeholder: 'Title', required: true }),
    el('textarea', { name: 'content', placeholder: 'Content', rows: 3 }),
    el('button', {}, 'Add note'));

  const items = res.data.map((n) => {
    const mine = !n.owner || (n.owner._id || n.owner) === me._id;
    return el('div', { class: 'item' },
      el('strong', {}, n.title),
      admin && n.owner && n.owner.name ? el('span', { class: 'muted' }, `  by ${n.owner.name} (${n.owner.email})`) : '',
      el('p', {}, n.content),
      mine ? el('div', { class: 'row' },
        el('button', { onclick: () => {
          const title = prompt('Title', n.title);
          if (title === null) return;
          const content = prompt('Content', n.content);
          if (content === null) return;
          guard(async () => { await api('/notes/' + n._id, { method: 'PUT', body: { title, content } }); notesView(page); });
        } }, 'Edit'),
        el('button', { onclick: () => guard(async () => { await api('/notes/' + n._id, { method: 'DELETE' }); notesView(page); }) }, 'Delete'))
        : el('span', { class: 'muted' }, 'read-only'));
  });

  $('view').replaceChildren(
    el('h2', {}, admin ? 'All notes' : 'My notes'), form,
    ...(items.length ? items : [el('p', { class: 'muted' }, 'No notes yet.')]),
    pager(res.pagination, (p) => guard(() => notesView(p))));
}

/* ------------------------------- posts ---------------------------------- */
async function postsView(authorId, page = 1) {
  const res = authorId
    ? await api(`/posts/user/${authorId}?page=${page}&limit=5`)
    : await api(`/posts?page=${page}&limit=5`);

  const form = el('form', { onsubmit: (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      guard(async () => { await api('/posts', { method: 'POST', body: f }); postsView(); });
    } },
    el('input', { name: 'title', placeholder: 'Post title', required: true }),
    el('textarea', { name: 'content', placeholder: 'Content', rows: 3 }),
    el('button', {}, 'Publish post'));

  const items = res.data.map((p) => {
    const author = p.author && p.author.name ? p.author : res.user;
    const aid = (p.author && p.author._id) || (res.user && res.user._id) || p.author;
    return el('div', { class: 'item' },
      el('strong', {}, p.title),
      el('span', { class: 'muted' }, '  by '),
      el('a', { href: '#', onclick: (e) => { e.preventDefault(); guard(() => postsView(aid)); } }, author ? author.name : 'unknown'),
      el('p', {}, p.content),
      (aid === me._id || me.role === 'admin')
        ? el('button', { onclick: () => guard(async () => { await api('/posts/' + p._id, { method: 'DELETE' }); postsView(authorId); }) }, 'Delete')
        : '');
  });

  $('view').replaceChildren(
    el('h2', {}, authorId ? `Posts by ${res.user.name}` : 'All posts'),
    authorId ? el('button', { onclick: () => guard(() => postsView()) }, 'Back to all posts') : form,
    ...(items.length ? items : [el('p', { class: 'muted' }, 'No posts.')]),
    pager(res.pagination, (p) => guard(() => postsView(authorId, p))));
}

/* ------------------------------ profile --------------------------------- */
async function profileView() {
  me = await api('/users/me');
  $('view').replaceChildren(
    el('h2', {}, 'My profile'),
    el('form', { onsubmit: (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        const body = { name: f.name, interests: csv(f.interests) };
        if (f.password) body.password = f.password;
        guard(async () => { await api('/users/me', { method: 'PUT', body }); await start(); show('profile'); });
      } },
      el('input', { name: 'name', value: me.name, required: true }),
      el('input', { name: 'interests', value: me.interests.join(', '), placeholder: 'Interests' }),
      el('input', { name: 'password', type: 'password', placeholder: 'New password (optional)' }),
      el('button', {}, 'Save')));
}

/* ------------------------- admin: users --------------------------------- */
async function usersView(page = 1) {
  const res = await api(`/users?page=${page}&limit=5`);
  const form = el('form', { onsubmit: (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      f.interests = csv(f.interests);
      guard(async () => { await api('/users', { method: 'POST', body: f }); usersView(1); });
    } },
    el('input', { name: 'name', placeholder: 'Name', required: true }),
    el('input', { name: 'email', type: 'email', placeholder: 'Email', required: true }),
    el('input', { name: 'password', type: 'password', placeholder: 'Password', required: true, minLength: 8 }),
    el('select', { name: 'role' }, el('option', { value: 'user' }, 'user'), el('option', { value: 'admin' }, 'admin')),
    el('input', { name: 'interests', placeholder: 'Interests (csv)' }),
    el('button', {}, 'Add user'));

  const items = res.data.map((u) => el('div', { class: 'item' },
    el('strong', {}, u.name), `  ${u.email}  `, el('span', { class: 'muted' }, `[${u.role}] ${u.interests.join(', ')}`),
    el('div', { class: 'row' },
      el('button', { onclick: () => {
        const name = prompt('Name', u.name); if (name === null) return;
        const role = prompt('Role (user/admin)', u.role); if (role === null) return;
        const interests = prompt('Interests (comma separated)', u.interests.join(', ')); if (interests === null) return;
        guard(async () => { await api('/users/' + u._id, { method: 'PUT', body: { name, role, interests: csv(interests) } }); usersView(page); });
      } }, 'Edit'),
      el('button', { onclick: () => {
        if (confirm(`Delete ${u.email} and all of their notes and posts?`)) {
          guard(async () => { await api('/users/' + u._id, { method: 'DELETE' }); usersView(page); });
        }
      } }, 'Delete'),
      el('button', { onclick: () => guard(async () => {
        const notes = await api(`/notes?owner=${u._id}&limit=100`);
        alert(notes.data.length ? notes.data.map((n) => '- ' + n.title).join('\n') : 'This user has no notes.');
      }) }, 'View notes'))));

  $('view').replaceChildren(el('h2', {}, 'Users'), form, ...items, pager(res.pagination, (p) => guard(() => usersView(p))));
}

/* ------------------- admin: users grouped by interest ------------------- */
async function groupsView(page = 1, interest = '') {
  const q = interest ? `&interest=${encodeURIComponent(interest)}` : '';
  const res = await api(`/users/interests/groups?page=${page}&limit=5${q}`);
  const filter = el('form', { onsubmit: (e) => {
      e.preventDefault();
      guard(() => groupsView(1, new FormData(e.target).get('interest').trim()));
    } },
    el('input', { name: 'interest', placeholder: 'Filter by interest', value: interest }),
    el('button', {}, 'Filter'));

  const items = res.data.map((g) => el('div', { class: 'item' },
    el('strong', {}, g.interest), el('span', { class: 'muted' }, `  (${g.count})`),
    el('ul', {}, g.users.map((u) => el('li', {}, `${u.name} - ${u.email}`)))));

  $('view').replaceChildren(el('h2', {}, 'Users grouped by interest'), filter,
    ...(items.length ? items : [el('p', { class: 'muted' }, 'No groups.')]),
    pager(res.pagination, (p) => guard(() => groupsView(p, interest))));
}

if (token) start();
