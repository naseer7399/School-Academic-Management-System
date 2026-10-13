'use strict';
/* School Academic Manager: static app, Firebase Auth + Firestore. Real security is in firestore.rules. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const idOf = (s) => String(s).trim().replace(/[\/\s]+/g, '-');
const ts = (d) => (d && d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0);
const GRADES = [[90, 'A+'], [80, 'A'], [70, 'B+'], [60, 'B'], [50, 'C'], [40, 'D'], [0, 'E']];
const grade = (p) => (p == null ? '—' : (GRADES.find((g) => p >= g[0]) || [0, 'E'])[1]);
const STATUS = { P: 'Present', A: 'Absent', L: 'Late', E: 'Excused' };
let db, auth, me = null;
let S = { schoolName: 'School Academic Manager', minAttendance: 75, lateCounts: true, excusedOut: true };

function toast(t, bad) { const e = $('#toast'); e.textContent = t; e.className = bad ? 'bad' : ''; e.style.display = 'block'; setTimeout(() => (e.style.display = 'none'), 3500); }
function show(id) { ['msg', 'login', 'app'].forEach((x) => $('#' + x).classList.toggle('hidden', x !== id)); }
function view(html) { $('#view').innerHTML = html; return $('#view'); }
function opts(list, sel, blank) { return (blank ? `<option value="">${esc(blank)}</option>` : '') + list.map(([v, l]) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`).join(''); }
async function commitAll(ops) { for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); } }
const stamp = () => firebase.firestore.FieldValue.serverTimestamp();

async function getClasses(force) {
  if (!getClasses.c || force) {
    const s = await db.collection('classes').get();
    getClasses.c = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }
  return getClasses.c;
}
async function myClasses() { const all = await getClasses(); return me.role === 'admin' ? all : all.filter((c) => (me.classIds || []).includes(c.id)); }
async function studentsOf(classId) {
  const s = await db.collection('students').where('classId', '==', classId).get();
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name));
}
function attSummary(list) {
  const c = { P: 0, A: 0, L: 0, E: 0 };
  list.forEach((a) => c[a.status]++);
  const attended = c.P + (S.lateCounts ? c.L : 0);
  const eligible = list.length - (S.excusedOut ? c.E : 0);
  return { ...c, total: list.length, eligible, pct: eligible ? (attended / eligible) * 100 : null };
}
const pctTag = (p) => (p == null ? '—' : `<span class="tag ${p >= S.minAttendance ? 'g' : 'r'}">${p.toFixed(1)}%</span>`);

/* ------------------------------ auth + routing ------------------------------ */
const NAV = {
  admin: [['dashboard', 'Dashboard'], ['students', 'Students'], ['classes', 'Classes'], ['users', 'Users'], ['attendance', 'Attendance'], ['exams', 'Exams'], ['marks', 'Marks'], ['syllabus', 'Syllabus'], ['notices', 'Notices'], ['settings', 'Settings']],
  teacher: [['attendance', 'Attendance'], ['marks', 'Marks'], ['syllabus', 'Syllabus'], ['notices', 'Notices']],
  parent: [['home', 'My child']],
  student: [['home', 'My records']],
};
const ROUTES = {};

function go() {
  const items = NAV[me.role];
  const want = location.hash.slice(2);
  const key = items.some((n) => n[0] === want) ? want : items[0][0];   // the menu is a convenience; firestore.rules is the real lock
  $('#nav').innerHTML = items.map(([k, l]) => `<a href="#/${k}" class="${k === key ? 'on' : ''}">${l}</a>`).join('');
  $('#title').textContent = items.find((n) => n[0] === key)[1];
  view('<p class="muted">Loading…</p>');
  ROUTES[key]().catch((e) => view(`<p class="err">Could not load: ${esc(e.message)}</p>`));
}

function start() {
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault(); $('#loginErr').textContent = '';
    try { await auth.signInWithEmailAndPassword($('#email').value.trim(), $('#password').value); }
    catch (err) { $('#loginErr').textContent = 'Sign-in failed. Check your email and password.'; }
  };
  $('#forgot').onclick = async () => {
    const em = $('#email').value.trim();
    if (!em) { $('#loginErr').textContent = 'Type your email first.'; return; }
    try { await auth.sendPasswordResetEmail(em); } catch (e) { /* same message either way */ }
    $('#loginErr').textContent = 'If that email has an account, a reset link has been sent.';
  };
  $('#logout').onclick = () => auth.signOut();
  window.addEventListener('hashchange', () => me && go());
  auth.onAuthStateChanged(async (u) => {
    if (!u) { me = null; show('login'); return; }
    try {
      const d = await db.collection('users').doc(u.uid).get();
      if (!d.exists || d.data().active === false) {
        $('#msg').innerHTML = '<div class="card"><h2>No access</h2><p>This account has not been set up, or is switched off. Please contact the school office.</p><button class="btn" id="out">Sign out</button></div>';
        show('msg'); $('#out').onclick = () => auth.signOut(); return;
      }
      me = { uid: u.uid, ...d.data() };
      const st = await db.doc('settings/school').get();
      if (st.exists) S = { ...S, ...st.data() };
      $('#brand').textContent = S.schoolName; $('#loginName').textContent = S.schoolName;
      $('#who').textContent = `${me.name} · ${me.role}`;
      show('app'); go();
    } catch (e) { $('#msg').innerHTML = `<p class="err">Could not load your account: ${esc(e.message)}</p>`; show('msg'); }
  });
}

if (typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('PASTE')) {
  $('#msg').innerHTML = '<div class="card"><h2>Setup needed</h2><p>Open <b>firebase-config.js</b> and paste your Firebase settings. See README.md.</p></div>';
  show('msg');
} else {
  firebase.initializeApp(FIREBASE_CONFIG); auth = firebase.auth(); db = firebase.firestore(); start();
}

/* ------------------------------ admin: dashboard, classes, students, users, settings ------------------------------ */
ROUTES.dashboard = async () => {
  const [st, cl, att, ex] = await Promise.all([
    db.collection('students').get(), getClasses(true),
    db.collection('attendance').where('date', '==', today()).get(),
    db.collection('exams').where('status', '==', 'submitted').get(),
  ]);
  const c = { P: 0, A: 0, L: 0, E: 0 }; att.docs.forEach((d) => c[d.data().status]++);
  const active = st.docs.filter((d) => d.data().status !== 'inactive').length;
  view(`<div class="grid">
    <div class="card stat"><b>${active}</b>Active students</div><div class="card stat"><b>${cl.length}</b>Classes</div>
    <div class="card stat"><b>${att.size ? c.P + c.L : '—'}</b>Present today${att.size ? ` (${c.A} absent)` : ' (not marked yet)'}</div>
    <div class="card stat"><b>${ex.size}</b>Exams waiting for approval</div></div>
    ${ex.size ? `<div class="card"><b>Waiting for approval:</b> ${ex.docs.map((d) => esc(d.data().name) + ' (' + esc(d.data().classId) + ')').join(', ')} — open <a href="#/exams">Exams</a>.</div>` : ''}`);
};

ROUTES.classes = async () => {
  async function paint() {
    const cl = await getClasses(true);
    view(`<form id="f" class="card row"><label>Class name (e.g. 2 or 2-A)<input name="name" required></label>
      <label>Subjects (comma separated)<input name="subjects" placeholder="English, Maths, Science" required></label><button class="btn">Add / update</button></form>
      <div class="card tw"><table><tr><th>Class</th><th>Subjects</th><th></th></tr>${cl.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc((c.subjects || []).join(', '))}</td><td><button class="link" data-del="${esc(c.id)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">No classes yet.</td></tr>'}</table></div>`);
    $('#f').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target), name = f.get('name').trim();
      const subjects = f.get('subjects').split(',').map((s) => s.trim()).filter(Boolean);
      await db.collection('classes').doc(idOf(name)).set({ name, subjects }); toast('Saved.'); paint();
    };
    $$('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Delete this class? Students keep their class name but it will no longer be listed.')) return;
      await db.collection('classes').doc(b.dataset.del).delete(); paint();
    }));
  }
  await paint();
};

ROUTES.students = async () => {
  let page = 0, q = '', cf = '';
  const cl = await getClasses(true);
  const snap = await db.collection('students').get();
  let all = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
  function paint() {
    const list = all.filter((s) => (!cf || s.classId === cf) && (!q || (s.name + ' ' + s.admissionNo).toLowerCase().includes(q)));
    const rows = list.slice(page * 25, page * 25 + 25);
    view(`<form id="f" class="card row"><label>Admission no.<input name="adm" required></label><label>Full name<input name="name" required></label>
      <label>Date of birth<input name="dob" type="date"></label><label>Class<select name="cls" required>${opts(cl.map((c) => [c.id, c.name]), '', 'Choose…')}</select></label>
      <label>Parent phone<input name="phone" inputmode="numeric" maxlength="10" placeholder="10 digits"></label><button class="btn">Save student</button></form>
      <div class="row"><label>Search<input id="q" value="${esc(q)}"></label><label>Class<select id="cf">${opts(cl.map((c) => [c.id, c.name]), cf, 'All')}</select></label></div>
      <div class="card tw"><table><tr><th>Adm.</th><th>Name</th><th>Class</th><th>DOB</th><th>Phone</th><th>Status</th><th></th></tr>
      ${rows.map((s) => `<tr><td>${esc(s.admissionNo)}</td><td>${esc(s.name)}</td><td>${esc(s.classId)}</td><td>${esc(s.dob || '—')}</td><td>${esc(s.phone || '—')}</td><td>${esc(s.status || 'active')}</td>
      <td><button class="link" data-t="${esc(s.id)}">${s.status === 'inactive' ? 'Reactivate' : 'Deactivate'}</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No students found.</td></tr>'}</table></div>
      <div class="row noprint"><button class="btn alt" id="pv" ${page ? '' : 'disabled'}>Previous</button><span>Page ${page + 1} of ${Math.max(1, Math.ceil(list.length / 25))} · ${list.length} students</span><button class="btn alt" id="nx" ${(page + 1) * 25 >= list.length ? 'disabled' : ''}>Next</button></div>`);
    $('#f').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const phone = f.get('phone').trim();
      if (phone && !/^\d{10}$/.test(phone)) { toast('Phone must be 10 digits.', true); return; }
      const id = idOf(f.get('adm')), old = all.find((s) => s.id === id);
      const rec = { admissionNo: f.get('adm').trim(), name: f.get('name').trim(), dob: f.get('dob') || '', classId: f.get('cls'), phone, status: old ? old.status || 'active' : 'active' };
      if (old && !confirm(`Admission no. ${rec.admissionNo} already exists (${old.name}). Update it?`)) return;
      await db.collection('students').doc(id).set(rec, { merge: true });
      all = all.filter((s) => s.id !== id).concat({ id, ...rec }).sort((a, b) => a.name.localeCompare(b.name)); toast('Saved.'); paint();
    };
    $('#q').oninput = (e) => { q = e.target.value.toLowerCase(); page = 0; paint(); $('#q').focus(); };
    $('#cf').onchange = (e) => { cf = e.target.value; page = 0; paint(); };
    $('#pv').onclick = () => { page--; paint(); }; $('#nx').onclick = () => { page++; paint(); };
    $$('[data-t]').forEach((b) => (b.onclick = async () => {
      const s = all.find((x) => x.id === b.dataset.t), next = s.status === 'inactive' ? 'active' : 'inactive';
      if (!confirm(`Mark ${s.name} as ${next}?`)) return;
      await db.collection('students').doc(s.id).update({ status: next }); s.status = next; paint();
    }));
  }
  paint();
};

ROUTES.users = async () => {
  const cl = await getClasses();
  async function paint() {
    const us = (await db.collection('users').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    view(`<form id="f" class="card"><div class="row"><label>Full name<input name="name" required></label><label>Email<input name="email" type="email" required></label>
      <label>Temporary password (8+ characters)<input name="pw" type="password" minlength="8" required></label>
      <label>Role<select name="role" id="role">${opts([['teacher', 'Teacher'], ['parent', 'Parent'], ['student', 'Student'], ['admin', 'Administrator']], 'teacher')}</select></label></div>
      <div id="extra"></div><button class="btn">Create account</button><p class="muted">The person can change the password with "Forgot password?" on the sign-in page.</p></form>
      <div class="card tw"><table><tr><th>Name</th><th>Email</th><th>Role</th><th>Links</th><th>Status</th><th></th></tr>
      ${us.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${esc((u.classIds || []).join(', ') || (u.childIds || []).join(', ') || u.studentId || '')}</td>
      <td>${u.active === false ? '<span class="tag r">off</span>' : '<span class="tag g">active</span>'}</td>
      <td>${u.id === me.uid ? '' : `<button class="link" data-u="${u.id}" data-a="${u.active === false}">${u.active === false ? 'Switch on' : 'Switch off'}</button>`}</td></tr>`).join('')}</table></div>`);
    const extra = () => {
      const r = $('#role').value;
      $('#extra').innerHTML = r === 'teacher' ? `<label>Classes this teacher teaches (hold Ctrl/Cmd for several)<select name="classes" multiple size="5">${opts(cl.map((c) => [c.id, c.name]))}</select></label>`
        : r === 'parent' ? '<label>Children\'s admission numbers (comma separated, e.g. 101, 102)<input name="adms" required></label>'
        : r === 'student' ? '<label>Student admission number<input name="adm" required></label>' : '';
    };
    $('#role').onchange = extra; extra();
    $('#f').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target), role = f.get('role'), btn = e.submitter; btn.disabled = true;
      try {
        const rec = { name: f.get('name').trim(), email: f.get('email').trim().toLowerCase(), role, active: true, classIds: [], childIds: [], studentId: '', createdAt: stamp() };
        if (role === 'teacher') rec.classIds = f.getAll('classes');
        const adms = role === 'parent' ? f.get('adms').split(',') : role === 'student' ? [f.get('adm')] : [];
        for (const a of adms.map(idOf).filter(Boolean)) {
          if (!(await db.collection('students').doc(a).get()).exists) throw new Error(`No student with admission no. ${a}.`);
          if (role === 'parent') rec.childIds.push(a); else rec.studentId = a;
        }
        let sec; try { sec = firebase.app('sec'); } catch (x) { sec = firebase.initializeApp(FIREBASE_CONFIG, 'sec'); }
        const cred = await sec.auth().createUserWithEmailAndPassword(rec.email, f.get('pw'));   // second app instance: the admin stays signed in
        await sec.auth().signOut();
        await db.collection('users').doc(cred.user.uid).set(rec);
        toast('Account created.'); paint();
      } catch (err) { toast(err.message, true); btn.disabled = false; }
    };
    $$('[data-u]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Change this account\'s access?')) return;
      await db.collection('users').doc(b.dataset.u).update({ active: b.dataset.a === 'true' }); paint();
    }));
  }
  await paint();
};

ROUTES.settings = async () => {
  view(`<form id="f" class="card"><label>School name<input name="schoolName" value="${esc(S.schoolName)}" required></label>
    <label>Minimum attendance % (below this is flagged)<input name="min" type="number" min="1" max="100" value="${S.minAttendance}" required></label>
    <label><input type="checkbox" name="late" ${S.lateCounts ? 'checked' : ''}> Late arrival counts as attended</label>
    <label><input type="checkbox" name="exc" ${S.excusedOut ? 'checked' : ''}> Excused days are left out of the attendance calculation</label>
    <p class="muted">Attendance % = attended days ÷ eligible days. Days with no attendance recorded (holidays, closures) are never counted.</p>
    <button class="btn">Save</button></form>`);
  $('#f').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    S = { schoolName: f.get('schoolName').trim(), minAttendance: Number(f.get('min')), lateCounts: f.get('late') === 'on', excusedOut: f.get('exc') === 'on' };
    await db.doc('settings/school').set(S); $('#brand').textContent = S.schoolName; toast('Saved.');
  };
};

/* ------------------------------ staff: attendance ------------------------------ */
const DELIVERY = { inApp: 'available', email: 'not_configured', sms: 'not_configured', whatsapp: 'not_configured' };

ROUTES.attendance = async () => {
  const cl = await myClasses();
  if (!cl.length) return view('<p class="muted">No classes are assigned to you yet. Please ask the administrator.</p>');
  let cid = cl[0].id, date = today();
  async function paint() {
    const [studs, snap] = await Promise.all([studentsOf(cid), db.collection('attendance').where('classId', '==', cid).where('date', '==', date).get()]);
    const cur = {}; snap.docs.forEach((d) => (cur[d.data().studentId] = d.data().status));
    const sum = attSummary(snap.docs.map((d) => d.data()));
    view(`<div class="row noprint"><label>Class<select id="c">${opts(cl.map((c) => [c.id, c.name]), cid)}</select></label><label>Date<input id="d" type="date" value="${date}" max="${today()}"></label></div>
      <div class="card"><p>${snap.size ? `<span class="tag y">Already marked</span> Present ${sum.P}, Absent ${sum.A}, Late ${sum.L}, Excused ${sum.E}. You can correct it below.` : '<span class="tag">Not marked yet</span>'}</p>
      <p class="noprint"><button class="link" id="allp">Mark everyone present</button></p>
      <div class="tw"><table><tr><th>#</th><th>Adm.</th><th>Name</th><th>Status</th></tr>${studs.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.admissionNo)}</td><td>${esc(s.name)}</td>
      <td class="seg">${Object.entries(STATUS).map(([k, l]) => `<label><input type="radio" name="s_${esc(s.id)}" value="${k}" ${(cur[s.id] || 'P') === k ? 'checked' : ''}>${l}</label>`).join('')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No students in this class.</td></tr>'}</table></div>
      <p class="muted">Absent students' parents get an in-app alert. Saving again never sends a duplicate; if a status is corrected, a correction notice replaces it.</p>
      <button class="btn noprint" id="save" ${studs.length ? '' : 'disabled'}>Save attendance</button> <button class="btn alt noprint" onclick="window.print()">Print</button></div>`);
    $('#c').onchange = (e) => { cid = e.target.value; paint(); };
    $('#d').onchange = (e) => { if (e.target.value && e.target.value <= today()) { date = e.target.value; paint(); } else toast('Choose today or an earlier date.', true); };
    $('#allp').onclick = () => $$('input[value="P"]').forEach((r) => (r.checked = true));
    $('#save').onclick = async () => {
      const ops = []; let alerts = 0;
      studs.forEach((s) => {
        const st = (document.querySelector(`input[name="s_${CSS.escape(s.id)}"]:checked`) || {}).value || 'P', was = cur[s.id];
        ops.push((b) => b.set(db.collection('attendance').doc(`${date}_${s.id}`), { date, classId: cid, studentId: s.id, status: st, by: me.uid, updatedAt: stamp() }));
        let body = null;
        if (st === 'A' && was !== 'A') body = `Dear Parent/Guardian, your child ${s.name} was marked absent on ${date}. Please contact the school if you believe this record is incorrect.`;
        else if (was === 'A' && st !== 'A') body = `Correction: ${s.name}'s attendance on ${date} has been corrected to ${STATUS[st]}.`;
        if (body) { alerts++; ops.push((b) => b.set(db.collection('notices').doc(`att_${date}_${s.id}`), { studentId: s.id, classId: cid, category: 'attendance', title: 'Attendance update', body, createdAt: stamp(), by: me.uid, batchId: `att_${date}_${cid}`, delivery: DELIVERY })); }
      });
      $('#save').disabled = true;
      try { await commitAll(ops); toast(`Attendance saved. ${alerts} parent notice(s) created.`); paint(); } catch (e) { toast(e.message, true); $('#save').disabled = false; }
    };
  }
  await paint();
};

/* ------------------------------ exams and marks ------------------------------ */
const examLabel = (x) => ({ draft: '<span class="tag">draft</span>', submitted: '<span class="tag y">waiting for approval</span>', published: '<span class="tag g">published</span>' }[x] || esc(x));

ROUTES.exams = async () => {
  const cl = await getClasses();
  async function paint() {
    const ex = (await db.collection('exams').get()).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    view(`<form id="f" class="card"><div class="row"><label>Exam name<input name="name" placeholder="Unit Test 1" required></label><label>Class<select name="cls" required>${opts(cl.map((c) => [c.id, c.name]), '', 'Choose…')}</select></label>
      <label>Date<input name="date" type="date" required></label></div>
      <label>Subjects and maximum marks (e.g. English:50, Maths:100)<input name="subs" required></label><button class="btn">Create exam</button></form>
      <div class="card tw"><table><tr><th>Exam</th><th>Class</th><th>Date</th><th>Subjects</th><th>Status</th><th></th></tr>
      ${ex.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.classId)}</td><td>${esc(x.date)}</td><td>${esc((x.subjects || []).map((s) => s.name + ' /' + s.max).join(', '))}</td><td>${examLabel(x.status)}</td>
      <td>${x.status === 'published' ? `<button class="link" data-r="${x.id}">Unpublish</button>` : `<button class="link" data-p="${x.id}">Publish</button>${x.status === 'submitted' ? ` <button class="link" data-r="${x.id}">Return to teacher</button>` : ''}`}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No exams yet.</td></tr>'}</table></div>`);
    $('#f').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const subjects = f.get('subs').split(',').map((p) => p.split(':')).map(([n, m]) => ({ name: (n || '').trim(), max: Number((m || '').trim()) }));
      if (!subjects.length || subjects.some((s) => !s.name || !(s.max > 0))) { toast('Write subjects like English:50, Maths:100.', true); return; }
      await db.collection('exams').add({ name: f.get('name').trim(), classId: f.get('cls'), date: f.get('date'), subjects, status: 'draft', createdAt: stamp() });
      toast('Exam created.'); paint();
    };
    const find = (id) => ex.find((x) => x.id === id);
    $$('[data-p]').forEach((b) => (b.onclick = async () => {
      const x = find(b.dataset.p), [ms, studs] = await Promise.all([db.collection('marks').where('examId', '==', x.id).get(), studentsOf(x.classId)]);
      const missing = studs.filter((s) => !ms.docs.some((d) => d.data().studentId === s.id)).length;
      if (!confirm(`Publish "${x.name}"? ${missing ? missing + ' student(s) have no marks yet. ' : ''}Parents and students will be able to see these results.`)) return;
      const ops = ms.docs.map((d) => (bt) => bt.update(d.ref, { published: true, status: 'approved' }));
      ops.push((bt) => bt.update(db.collection('exams').doc(x.id), { status: 'published', publishedAt: stamp() }));
      studs.forEach((s) => ops.push((bt) => bt.set(db.collection('notices').doc(`res_${x.id}_${s.id}`), { studentId: s.id, classId: x.classId, category: 'grades', title: 'Results published',
        body: `Dear Parent/Guardian, the ${x.name} results for ${s.name} have been published. Please sign in to the Parent Portal to view the subject-wise results.`, createdAt: stamp(), by: me.uid, batchId: `res_${x.id}`, delivery: DELIVERY })));
      await commitAll(ops); toast('Published.'); paint();
    }));
    $$('[data-r]').forEach((b) => (b.onclick = async () => {
      const x = find(b.dataset.r); if (!confirm(`Return "${x.name}" to draft? Parents will stop seeing these results.`)) return;
      const ms = await db.collection('marks').where('examId', '==', x.id).get();
      const ops = ms.docs.map((d) => (bt) => bt.update(d.ref, { published: false, status: 'draft' }));
      ops.push((bt) => bt.update(db.collection('exams').doc(x.id), { status: 'draft' })); await commitAll(ops); paint();
    }));
  }
  await paint();
};

ROUTES.marks = async () => {
  const cl = await myClasses(); const exams = [];
  for (const c of cl) (await db.collection('exams').where('classId', '==', c.id).get()).docs.forEach((d) => exams.push({ id: d.id, ...d.data() }));
  if (!exams.length) return view('<p class="muted">No exams for your classes yet.</p>');
  let eid = exams[0].id;
  async function paint() {
    const x = exams.find((e) => e.id === eid);
    const [studs, ms] = await Promise.all([studentsOf(x.classId), db.collection('marks').where('examId', '==', x.id).where('classId', '==', x.classId).get()]);
    const cur = {}; ms.docs.forEach((d) => (cur[d.data().studentId] = d.data()));
    const locked = x.status === 'published' || (x.status === 'submitted' && me.role !== 'admin');
    const missing = studs.filter((s) => !cur[s.id] || x.subjects.some((sb) => cur[s.id].scores[sb.name] == null)).length;
    view(`<div class="row noprint"><label>Exam<select id="e">${opts(exams.map((e) => [e.id, `${e.name} (${e.classId})`]), eid)}</select></label></div>
      <div class="card"><p>${examLabel(x.status)} ${missing ? `<span class="tag y">${missing} student(s) with missing marks</span>` : '<span class="tag g">all marks entered</span>'} ${locked ? '<span class="muted">Locked: ask the administrator to return it to draft to edit.</span>' : ''}</p>
      <p class="muted">Type a number, or AB (absent) / EX (exempt). Leave blank if not yet entered.</p>
      <div class="tw"><table><tr><th>Adm.</th><th>Name</th>${x.subjects.map((s) => `<th>${esc(s.name)} /${s.max}</th>`).join('')}<th>Remark</th></tr>
      ${studs.map((s) => `<tr><td>${esc(s.admissionNo)}</td><td>${esc(s.name)}</td>${x.subjects.map((sb) => `<td class="n"><input data-s="${esc(s.id)}" data-sub="${esc(sb.name)}" value="${esc(cur[s.id] && cur[s.id].scores[sb.name] != null ? cur[s.id].scores[sb.name] : '')}" ${locked ? 'disabled' : ''}></td>`).join('')}
      <td><input data-rm="${esc(s.id)}" value="${esc((cur[s.id] || {}).remarks || '')}" ${locked ? 'disabled' : ''}></td></tr>`).join('')}</table></div>
      ${locked ? '' : '<button class="btn" id="sv">Save draft</button> <button class="btn alt" id="sb">Save and submit for approval</button>'}</div>`);
    $('#e').onchange = (ev) => { eid = ev.target.value; paint(); };
    if (locked) return;
    async function save(submit) {
      const ops = [];
      for (const s of studs) {
        const scores = {};
        for (const sb of x.subjects) {
          const raw = ($(`[data-s="${CSS.escape(s.id)}"][data-sub="${CSS.escape(sb.name)}"]`).value || '').trim().toUpperCase();
          if (raw === '') scores[sb.name] = null;
          else if (raw === 'AB' || raw === 'EX') scores[sb.name] = raw;
          else { const n = Number(raw); if (!isFinite(n) || n < 0 || n > sb.max) { toast(`${s.name}, ${sb.name}: marks must be between 0 and ${sb.max}.`, true); return; } scores[sb.name] = n; }
        }
        ops.push((b) => b.set(db.collection('marks').doc(`${x.id}_${s.id}`), { examId: x.id, studentId: s.id, classId: x.classId, scores, remarks: ($(`[data-rm="${CSS.escape(s.id)}"]`).value || '').trim(), published: false, status: submit ? 'submitted' : 'draft', by: me.uid, updatedAt: stamp() }));
      }
      if (submit && !confirm(`Submit for approval? ${missing ? 'Some marks are still missing. ' : ''}You will not be able to edit afterwards.`)) return;
      try {
        await commitAll(ops);
        if (submit) { await db.collection('exams').doc(x.id).update({ status: 'submitted' }); x.status = 'submitted'; }
        toast(submit ? 'Submitted for approval.' : 'Draft saved.'); paint();
      } catch (e) { toast(e.message, true); }
    }
    $('#sv').onclick = () => save(false); $('#sb').onclick = () => save(true);
  }
  await paint();
};

/* ------------------------------ syllabus ------------------------------ */
const SYL = ['Not Started', 'In Progress', 'Completed', 'Delayed'];
const sylPct = (list) => (list.length ? Math.round((list.filter((t) => t.status === 'Completed').length / list.length) * 100) : 0);

ROUTES.syllabus = async () => {
  const cl = await myClasses();
  if (!cl.length) return view('<p class="muted">No classes available yet.</p>');
  let cid = cl[0].id, sub = '';
  async function paint() {
    const c = cl.find((x) => x.id === cid), subs = c.subjects || []; if (!subs.includes(sub)) sub = subs[0] || '';
    if (!subs.length) { view(`<div class="row"><label>Class<select id="c">${opts(cl.map((x) => [x.id, x.name]), cid)}</select></label></div><p class="muted">This class has no subjects yet. The administrator can add them under Classes.</p>`); $('#c').onchange = (e) => { cid = e.target.value; paint(); }; return; }
    const all = (await db.collection('syllabus').where('classId', '==', cid).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    const list = all.filter((t) => t.subject === sub).sort((a, b) => (a.order || 0) - (b.order || 0));
    const now = today();
    view(`<div class="row noprint"><label>Class<select id="c">${opts(cl.map((x) => [x.id, x.name]), cid)}</select></label><label>Subject<select id="s">${opts(subs.map((s) => [s, s]), sub)}</select></label></div>
      <div class="card"><p><b>${sylPct(list)}% complete</b> (${list.filter((t) => t.status === 'Completed').length} of ${list.length} topics). Progress is reported by the teacher; it is not an exam result.</p><div class="bar"><i style="width:${sylPct(list)}%"></i></div></div>
      <form id="f" class="card row noprint"><label>Unit / chapter<input name="unit" required></label><label>Topic<input name="topic" required></label><label>Planned finish<input name="plan" type="date"></label><button class="btn">Add topic</button></form>
      <div class="card tw"><table><tr><th>Unit</th><th>Topic</th><th>Planned</th><th>Status</th><th>Done on</th><th>Notes</th><th></th></tr>
      ${list.map((t) => `<tr><td>${esc(t.unit)}</td><td>${esc(t.topic)}</td><td>${esc(t.planned || '—')}${t.planned && t.planned < now && t.status !== 'Completed' ? ' <span class="tag r">overdue</span>' : ''}</td>
      <td><select data-st="${t.id}">${opts(SYL.map((s) => [s, s]), t.status)}</select></td><td>${esc(t.doneDate || '—')}</td><td><input data-nt="${t.id}" value="${esc(t.notes || '')}"></td><td><button class="link" data-x="${t.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No topics yet.</td></tr>'}</table></div>`);
    $('#c').onchange = (e) => { cid = e.target.value; paint(); }; $('#s').onchange = (e) => { sub = e.target.value; paint(); };
    $('#f').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      await db.collection('syllabus').add({ classId: cid, subject: sub, unit: f.get('unit').trim(), topic: f.get('topic').trim(), planned: f.get('plan') || '', status: 'Not Started', doneDate: '', notes: '', order: Date.now(), updatedBy: me.uid, updatedAt: stamp() }); paint();
    };
    $$('[data-st]').forEach((s) => (s.onchange = async () => {
      await db.collection('syllabus').doc(s.dataset.st).update({ status: s.value, doneDate: s.value === 'Completed' ? today() : '', updatedBy: me.uid, updatedAt: stamp() }); paint();
    }));
    $$('[data-nt]').forEach((i) => (i.onchange = async () => { await db.collection('syllabus').doc(i.dataset.nt).update({ notes: i.value.trim(), updatedBy: me.uid, updatedAt: stamp() }); toast('Saved.'); }));
    $$('[data-x]').forEach((b) => (b.onclick = async () => { if (confirm('Delete this topic?')) { await db.collection('syllabus').doc(b.dataset.x).delete(); paint(); } }));
  }
  await paint();
};

/* ------------------------------ notices ------------------------------ */
ROUTES.notices = async () => {
  const cl = await myClasses(), admin = me.role === 'admin';
  async function history() {
    let docs = [];
    if (admin) docs = (await db.collection('notices').orderBy('createdAt', 'desc').limit(300).get()).docs;
    else for (const c of cl) docs = docs.concat((await db.collection('notices').where('classId', '==', c.id).get()).docs);
    const groups = {};
    docs.forEach((d) => { const n = d.data(), g = (groups[n.batchId || d.id] = groups[n.batchId || d.id] || { n, count: 0 }); g.count++; });
    const rows = Object.values(groups).sort((a, b) => ts(b.n) - ts(a.n)).slice(0, 40);
    return `<div class="card tw"><h3>Sent</h3><table><tr><th>When</th><th>Category</th><th>Title</th><th>Recipients</th><th>Delivery</th></tr>
      ${rows.map((g) => `<tr><td>${ts(g.n) ? new Date(ts(g.n)).toLocaleString() : '…'}</td><td>${esc(g.n.category)}</td><td>${esc(g.n.title)}</td><td>${g.n.studentId === 'all' ? 'Everyone' : g.count + ' student(s)'}</td>
      <td><span class="tag g">In-app: available</span> <span class="tag">Email, SMS, WhatsApp: not configured</span></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nothing sent yet.</td></tr>'}</table></div>`;
  }
  view(`<form id="f" class="card"><div class="row"><label>Send to<select name="aud" id="aud">${opts([...(admin ? [['all', 'All parents and students']] : []), ['class', 'A whole class'], ...(admin ? [['student', 'One student']] : [])], admin ? 'all' : 'class')}</select></label>
    <label id="lc">Class<select name="cls">${opts(cl.map((c) => [c.id, c.name]))}</select></label><label id="ls" class="hidden">Admission no.<input name="adm"></label>
    <label>Category<select name="cat">${opts(admin ? [['announcement', 'Announcement'], ['exam', 'Examination'], ['syllabus', 'Syllabus'], ['grades', 'Grades']] : [['announcement', 'Announcement']])}</select></label></div>
    <label>Title<input name="title" required></label><label>Message<textarea name="body" required></textarea></label>
    <p class="muted">For marks and other sensitive details, write a message that points to the portal rather than including the figures.</p><button class="btn">Preview</button></form><div id="pv"></div><div id="hist"></div>`);
  const sync = () => { const a = $('#aud').value; $('#lc').classList.toggle('hidden', a !== 'class'); $('#ls').classList.toggle('hidden', a !== 'student'); };
  $('#aud').onchange = sync; sync();
  $('#hist').innerHTML = await history();
  $('#f').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target), aud = f.get('aud'); let targets = [], cid = '', label = '';
    try {
      if (aud === 'all') { targets = [{ id: 'all' }]; label = 'everyone'; }
      else if (aud === 'class') { cid = f.get('cls'); targets = await studentsOf(cid); label = `class ${cid} (${targets.length} students)`; }
      else { const s = await db.collection('students').doc(idOf(f.get('adm'))).get(); if (!s.exists) throw new Error('No student with that admission number.'); targets = [{ id: s.id, ...s.data() }]; cid = s.data().classId; label = s.data().name; }
      if (!targets.length) throw new Error('There are no students to send to.');
    } catch (err) { toast(err.message, true); return; }
    $('#pv').innerHTML = `<div class="card"><h3>Preview</h3><p>To: <b>${esc(label)}</b> · ${esc(f.get('cat'))}</p><p><b>${esc(f.get('title'))}</b></p><p>${esc(f.get('body')).replace(/\n/g, '<br>')}</p>
      <button class="btn" id="go">Send now</button> <button class="btn alt" id="no">Cancel</button></div>`;
    $('#no').onclick = () => ($('#pv').innerHTML = '');
    $('#go').onclick = async () => {
      $('#go').disabled = true; const batchId = 'n_' + Date.now();
      const ops = targets.map((t) => (b) => b.set(db.collection('notices').doc(), { studentId: t.id, classId: cid, category: f.get('cat'), title: f.get('title').trim(), body: f.get('body').trim(), createdAt: stamp(), by: me.uid, batchId, delivery: DELIVERY }));
      try { await commitAll(ops); toast('Sent (in-app).'); $('#pv').innerHTML = ''; e.target.reset(); sync(); $('#hist').innerHTML = await history(); } catch (err) { toast(err.message, true); $('#go').disabled = false; }
    };
  };
};

/* ------------------------------ parent / student home ------------------------------ */
ROUTES.home = async () => {
  const ids = me.role === 'parent' ? me.childIds || [] : [me.studentId];
  const kids = (await Promise.all(ids.filter(Boolean).map((id) => db.collection('students').doc(id).get()))).filter((d) => d.exists).map((d) => ({ id: d.id, ...d.data() }));
  if (!kids.length) return view('<p class="card">No student is linked to your account yet. Please contact the school office.</p>');
  let kid = kids[0].id; const examCache = {};
  async function paint() {
    const k = kids.find((x) => x.id === kid);
    const [attS, mkS, sylS, ...nots] = await Promise.all([
      db.collection('attendance').where('studentId', '==', k.id).get(),
      db.collection('marks').where('studentId', '==', k.id).where('published', '==', true).get(),
      db.collection('syllabus').where('classId', '==', k.classId).get(),
      db.collection('notices').where('studentId', '==', 'all').get(), db.collection('notices').where('studentId', '==', k.id).get(),
    ]);
    const att = attS.docs.map((d) => d.data()).sort((a, b) => b.date.localeCompare(a.date)), sum = attSummary(att);
    const month = attSummary(att.filter((a) => a.date.slice(0, 7) === today().slice(0, 7)));
    const results = [];
    for (const d of mkS.docs) {
      const m = d.data(); if (!examCache[m.examId]) examCache[m.examId] = (await db.collection('exams').doc(m.examId).get()).data();
      results.push({ m, x: examCache[m.examId] });
    }
    results.sort((a, b) => (b.x.date || '').localeCompare(a.x.date || ''));
    const syl = sylS.docs.map((d) => d.data()), bySub = {}; syl.forEach((t) => (bySub[t.subject] = (bySub[t.subject] || []).concat(t)));
    const notes = nots.flatMap((s) => s.docs.map((d) => d.data())).sort((a, b) => ts(b) - ts(a)).slice(0, 20);
    view(`<div class="row noprint">${kids.length > 1 ? `<label>Child<select id="k">${opts(kids.map((x) => [x.id, x.name]), kid)}</select></label>` : ''}<button class="btn alt" onclick="window.print()">Print</button></div>
      <div class="card"><h3>${esc(k.name)}</h3><p class="muted">Admission no. ${esc(k.admissionNo)} · Class ${esc(k.classId)}</p></div>
      <div class="card"><h3>Attendance</h3><div class="grid"><div class="stat"><b>${pctTag(sum.pct)}</b>Overall</div><div class="stat"><b>${pctTag(month.pct)}</b>This month</div><div class="stat"><b>${sum.A}</b>Absent days</div><div class="stat"><b>${sum.L}</b>Late</div></div>
      <p class="muted">Attended days ÷ eligible days${S.lateCounts ? '; late counts as attended' : ''}${S.excusedOut ? '; excused days excluded' : ''}. Days with no record (holidays) are not counted. Minimum expected: ${S.minAttendance}%.</p>
      <div class="tw"><table><tr><th>Date</th><th>Status</th></tr>${att.filter((a) => a.status !== 'P').slice(0, 10).map((a) => `<tr><td>${esc(a.date)}</td><td>${STATUS[a.status]}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No absences or late arrivals recorded.</td></tr>'}</table></div></div>
      <div class="card"><h3>Published results</h3>${results.map(({ m, x }) => {
        const nums = x.subjects.filter((s) => typeof m.scores[s.name] === 'number'), tot = nums.reduce((a, s) => a + m.scores[s.name], 0), mx = nums.reduce((a, s) => a + s.max, 0), p = mx ? (tot / mx) * 100 : null;
        return `<p><b>${esc(x.name)}</b> <span class="muted">${esc(x.date || '')}</span></p><div class="tw"><table><tr><th>Subject</th><th>Marks</th><th>Out of</th><th>Grade</th></tr>
        ${x.subjects.map((s) => { const v = m.scores[s.name]; return `<tr><td>${esc(s.name)}</td><td>${v == null ? '—' : esc(v)}</td><td>${s.max}</td><td>${typeof v === 'number' ? grade((v / s.max) * 100) : '—'}</td></tr>`; }).join('')}
        <tr><th>Total</th><th>${mx ? tot : '—'}</th><th>${mx || '—'}</th><th>${p == null ? '—' : p.toFixed(1) + '% · ' + grade(p)}</th></tr></table></div>${m.remarks ? `<p class="muted">Teacher remark: ${esc(m.remarks)}</p>` : ''}`;
      }).join('') || '<p class="muted">No results published yet.</p>'}</div>
      <div class="card"><h3>Syllabus</h3><p class="muted">Reported by teachers. It shows what has been taught, not how well it was learned.</p>
      ${Object.entries(bySub).map(([s, l]) => `<details><summary><b>${esc(s)}</b> — ${sylPct(l)}% complete</summary><div class="bar"><i style="width:${sylPct(l)}%"></i></div><div class="tw"><table><tr><th>Unit</th><th>Topic</th><th>Planned</th><th>Status</th></tr>
      ${l.sort((a, b) => (a.order || 0) - (b.order || 0)).map((t) => `<tr><td>${esc(t.unit)}</td><td>${esc(t.topic)}</td><td>${esc(t.planned || '—')}</td><td>${esc(t.status)}${t.planned && t.planned < today() && t.status !== 'Completed' ? ' <span class="tag r">delayed</span>' : ''}</td></tr>`).join('')}</table></div></details>`).join('') || '<p class="muted">No syllabus added yet.</p>'}</div>
      <div class="card"><h3>Notices</h3>${notes.map((n) => `<p><b>${esc(n.title)}</b> <span class="muted">${ts(n) ? new Date(ts(n)).toLocaleDateString() : ''}</span><br>${esc(n.body)}</p>`).join('') || '<p class="muted">No notices.</p>'}</div>`);
    if ($('#k')) $('#k').onchange = (e) => { kid = e.target.value; paint(); };
  }
  await paint();
};
