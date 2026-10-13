import {clips} from './clips.js';

// Step 1 is blind (drifted video or clean control only). Step 2 opens after step 1 is saved; step 1 is then locked.
const STEP1 = [
  {key: 'visible', title: '能看出有东西在漂移吗？', hint: '漂移：本应静止的物体或表面在慢慢滑动、转动或变形。镜头本身的运动不算。', type: 'radio',
   options: [['obvious', '明显能看出'], ['subtle', '仔细看才看出'], ['none', '看不出'], ['unsure', '说不准']]},
  {key: 'where', title: '漂移在哪里？', hint: '可多选；第一题选"看不出"或"说不准"时不填。', type: 'check', when: a => ['obvious', 'subtle'].includes(a.visible),
   options: [['fg', '前景主体'], ['obj', '其他物体'], ['bg', '背景'], ['ground', '地面']]},
  {key: 'tech', title: '有与漂移无关的技术问题吗？', hint: '可多选。', type: 'check', exclusive: 'none',
   options: [['none', '没有'], ['hole', '空洞或缺块'], ['tear', '边缘撕裂或拉伸'], ['flicker', '闪烁'], ['other', '其他（写在备注里）']]},
];
const STEP2 = [
  {key: 'visible_after', title: '知道位置后，在漂移版里能看出漂移吗？', type: 'radio',
   options: [['yes', '能看出'], ['no', '仍然看不出'], ['unsure', '说不准']]},
  {key: 'match', title: '叠加图标出的区域，和你第一步看到的位置一致吗？', type: 'radio',
   options: [['yes', '一致'], ['partial', '部分一致'], ['no', '不一致'], ['missed', '第一步没看出漂移'], ['unsure', '说不准']]},
  {key: 'coverage', title: '叠加图是否覆盖了差异图里所有在动的部分？', type: 'radio',
   options: [['full', '完整覆盖'], ['missing', '有遗漏'], ['extra', '多标了不动的部分'], ['both', '既有遗漏又多标'], ['unsure', '说不准']]},
  {key: 'artifact', title: '注入本身是否造成不自然的伪影（撕裂、重影、穿插）？', type: 'radio',
   options: [['none', '没有'], ['mild', '轻微'], ['obvious', '明显'], ['unsure', '说不准']]},
];

const $ = id => document.getElementById(id);
let labels = {}, cursor = 0, rate = 1, startedAt = Date.now(), server = true;
// Separate browser storage per site (c = local wally site, g = GS, d = 2D), so the two GitHub pages never mix.
const site = clips[0].id[0], STORE = `calib-v3-labels:${site}`, CURSOR = `calib-v3-cursor:${site}`;
const rater = () => $('rater').value.trim();
const mine = () => labels[rater()] || {};
const isClean = c => !c.comparison;
const done = c => { const l = mine()[c.id]; return !!l && !!l.step1 && (isClean(c) || !!l.step2); };

function needed(q, a) { return !q.when || q.when(a); }
function complete(qs, a) {
  return qs.every(q => !needed(q, a) || (q.type === 'radio' ? !!a[q.key] : Array.isArray(a[q.key]) && a[q.key].length > 0));
}

function fieldset(q, a, locked) {
  const fs = document.createElement('fieldset');
  if (locked) fs.className = 'locked';
  if (!needed(q, a)) fs.style.display = 'none';
  const lg = document.createElement('legend');
  lg.textContent = q.title;
  if (q.hint) { const s = document.createElement('small'); s.textContent = ' ' + q.hint; lg.append(document.createElement('br'), s); }
  fs.append(lg);
  for (const [v, text] of q.options) {
    const l = document.createElement('label'), i = document.createElement('input');
    l.className = 'opt';
    i.type = q.type === 'radio' ? 'radio' : 'checkbox';
    i.name = q.key; i.value = v; i.disabled = locked;
    i.checked = q.type === 'radio' ? a[q.key] === v : (a[q.key] || []).includes(v);
    l.append(i, document.createTextNode(text));
    fs.append(l);
  }
  return fs;
}

function read(qs, form) {
  const a = {};
  for (const q of qs) {
    if (q.type === 'radio') a[q.key] = form.querySelector(`input[name="${q.key}"]:checked`)?.value || null;
    else a[q.key] = [...form.querySelectorAll(`input[name="${q.key}"]:checked`)].map(i => i.value);
  }
  return a;
}

function video(src, caption) {
  const f = document.createElement('figure'), c = document.createElement('figcaption'), v = document.createElement('video');
  c.textContent = caption;
  Object.assign(v, {src, muted: true, loop: true, autoplay: true, controls: true, playsInline: true});
  v.addEventListener('loadedmetadata', () => { v.playbackRate = rate; });
  f.append(c, v);
  return f;
}

function render() {
  const c = clips[cursor], l = mine()[c.id] || {}, form = $('form'), vids = $('videos');
  startedAt = Date.now();
  $('clip-title').textContent = `${c.id}  (${cursor + 1} / ${clips.length})`;
  const revealed = !!l.step1;
  $('step-badge').textContent = !revealed ? '第一步 · 盲看' : isClean(c) ? '干净对照' : '第二步 · 对照';
  vids.className = 'videos' + (revealed && !isClean(c) ? ' reveal' : '');
  vids.replaceChildren();
  if (!revealed) {
    vids.append(video(c.video, '待检查视频'));
    $('hint').textContent = '只看这一段，判断有没有东西在漂移。可以用 0.5× 慢放，也可以拖动进度条来回看。';
  } else if (isClean(c)) {
    vids.append(video(c.video, '待检查视频（本段是干净对照，没有注入任何漂移）'));
    $('hint').textContent = '这是混入的干净对照，用来估计误报率。它没有第二步。';
  } else {
    vids.append(video(c.comparison, '对比：上 漂移版 / 中 干净版 / 下 差异 ×4'), video(c.overlay, '注入区域叠加图'));
    $('hint').textContent = '差异图里亮的地方是漂移版和干净版不同的地方。';
  }

  form.replaceChildren();
  const t1 = document.createElement('div'); t1.className = 'section-title'; t1.textContent = '第一步 · 盲看';
  form.append(t1);
  const a1 = l.step1 || {};
  STEP1.forEach(q => form.append(fieldset(q, a1, revealed)));
  const n1 = document.createElement('textarea'); n1.name = 'note1'; n1.placeholder = '备注（可选）'; n1.value = l.note1 || ''; n1.disabled = revealed;
  form.append(n1);
  if (revealed && !isClean(c)) {
    const t2 = document.createElement('div'); t2.className = 'section-title'; t2.textContent = '第二步 · 对照';
    form.append(t2);
    const a2 = l.step2 || {};
    STEP2.forEach(q => form.append(fieldset(q, a2, false)));
    const n2 = document.createElement('textarea'); n2.name = 'note2'; n2.placeholder = '备注（可选）'; n2.value = l.note2 || '';
    form.append(n2);
  }
  const act = document.createElement('div'); act.className = 'actions';
  const prev = document.createElement('button'); prev.type = 'button'; prev.className = 'secondary'; prev.textContent = '上一段';
  prev.onclick = () => go(cursor - 1);
  const save = document.createElement('button'); save.type = 'submit';
  save.textContent = !revealed ? '保存并查看对照' : isClean(c) ? '下一段' : '保存并下一段';
  act.append(prev, save);
  form.append(act);
  form.onchange = e => {
    if (revealed) return;
    const ex = STEP1.find(q => q.exclusive);
    if (e.target.name === ex.key && e.target.checked) {
      // "none" excludes the other choices: keep whichever was just ticked.
      form.querySelectorAll(`input[name="${ex.key}"]`).forEach(i => {
        if (i !== e.target && (i.value === ex.exclusive || e.target.value === ex.exclusive)) i.checked = false;
      });
    }
    STEP1.forEach((q, i) => { form.querySelectorAll('fieldset')[i].style.display = needed(q, read(STEP1, form)) ? '' : 'none'; });
  };
  form.onsubmit = e => { e.preventDefault(); submit(); };
  $('status').textContent = '';
  renderList();
}

async function post(clip, label) {
  if (server) {
    const r = await fetch('/api/label', {method: 'POST', headers: {'Content-Type': 'application/json'},
                                         body: JSON.stringify({rater: rater(), clip, label})});
    if (!r.ok) throw new Error(await r.text());
  }
  label.saved_at ||= new Date().toISOString();
  (labels[rater()] ||= {})[clip] = label;
  if (!server) localStorage.setItem(STORE, JSON.stringify(labels));
}

async function submit() {
  const c = clips[cursor], l = {...(mine()[c.id] || {})}, form = $('form');
  if (!rater()) { $('status').textContent = '请先在顶部填写标注者名字。'; $('rater').focus(); return; }
  const secs = Math.round((Date.now() - startedAt) / 1000);
  try {
    if (!l.step1) {
      const a = read(STEP1, form);
      if (!needed(STEP1[1], a)) a.where = [];
      if (!complete(STEP1, a)) { $('status').textContent = '第一步还有题没答。'; return; }
      await post(c.id, {step1: a, note1: form.note1.value, step1_seconds: secs});
      return render();
    }
    if (isClean(c)) return go(cursor + 1);
    const a = read(STEP2, form);
    if (!complete(STEP2, a)) { $('status').textContent = '第二步还有题没答。'; return; }
    await post(c.id, {...l, step2: a, note2: form.note2.value, step2_seconds: secs});
    go(cursor + 1);
  } catch (err) {
    $('status').textContent = '保存失败，标签没有写入服务器：' + err.message;
  }
}

function go(i) { cursor = Math.max(0, Math.min(clips.length - 1, i)); localStorage.setItem(CURSOR, cursor); render(); }

function renderList() {
  const n = clips.filter(done).length;
  $('progress-text').textContent = `已完成 ${n} / ${clips.length}`;
  $('bar').style.width = `${(100 * n / clips.length).toFixed(1)}%`;
  $('list').replaceChildren(...clips.map((c, i) => {
    const b = document.createElement('button'), l = mine()[c.id];
    b.className = (i === cursor ? 'current ' : '') + (done(c) ? 'done' : '');
    const s = document.createElement('span'); s.className = 's'; s.textContent = done(c) ? '✓' : l?.step1 ? '½' : '';
    b.append(document.createTextNode(c.id), s);
    b.onclick = () => go(i);
    return b;
  }));
}

document.querySelectorAll('.speed button').forEach(b => b.onclick = () => {
  rate = +b.dataset.rate;
  document.querySelectorAll('.speed button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('video').forEach(v => { v.playbackRate = rate; });
});
$('rater').value = localStorage.getItem('calib-rater') || '';
$('rater').onchange = () => { localStorage.setItem('calib-rater', rater()); go(firstOpen()); };
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify({rater: rater(), exported_at: new Date().toISOString(), labels: mine()}, null, 1)], {type: 'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `calib_v3_labels_${rater() || 'unnamed'}.json`; a.click();
};
const firstOpen = () => { const i = clips.findIndex(c => !done(c)); return i < 0 ? 0 : i; };

try {
  const r = await fetch('/api/labels');
  if (!r.ok || !(r.headers.get('Content-Type') || '').includes('json')) throw new Error();
  labels = await r.json();
} catch {
  // Static hosting (GitHub Pages): no server, keep labels in this browser and export them as JSON.
  server = false;
  try { labels = JSON.parse(localStorage.getItem(STORE)) || {}; } catch { labels = {}; }
  document.querySelector('footer span').textContent =
    '标签保存在这个浏览器里（换浏览器或清除网站数据会丢失）。标完请点"导出全部标签"，把 JSON 文件发给研究者。';
}
const saved = +localStorage.getItem(CURSOR);
go(Number.isFinite(saved) && saved > 0 ? saved : firstOpen());
