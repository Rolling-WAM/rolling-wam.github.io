'use strict';

// Release links stay visibly pending until their real URLs are supplied.
document.querySelectorAll('[data-resource]').forEach(link => {
  const url = window.ROLLING_WAM_LINKS?.[link.dataset.resource];
  if (!url || !/^https?:\/\//.test(url)) return;
  link.href = url;
  link.removeAttribute('aria-disabled');
  link.querySelector('small')?.remove();
});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let motionPaused = reducedMotion.matches;
let titleVisible = true;
let cycleVisible = false;
const title = document.querySelector('.rolling-title');
const cyclePanel = document.querySelector('.rolling-explainer');
const cycleToggle = document.querySelector('#cycle-toggle');
const cycleStep = document.querySelector('#cycle-step');
const chunkWindow = document.querySelector('#chunk-window');
const cycleModel = window.RollingCycle;
const videoColors = ['#fcfaff', '#f0ebf7', '#e4dbee', '#d7c9e5', '#c7b5db', '#b7a2ce'];
const actionColors = ['#fffaf3', '#fff0dc', '#f9dfbd', '#efcb9f', '#e6b783', '#dba16b'];
const executionOutline = '<svg class="execution-outline" aria-hidden="true"><rect class="execution-guide" width="100%" height="100%" rx="5" pathLength="100"/><rect class="execution-trace" width="100%" height="100%" rx="5" pathLength="100"/></svg>';
chunkWindow.innerHTML = `<div class="chunk-slot-labels">${Array.from({length:5}, (_,i) => `<div class="chunk-title"><span>${i === 0 ? 'Next' : '+'+i}</span>${i === 0 ? '<span class="chunk-ready" aria-label="Ready" hidden>✓</span>' : ''}</div>`).join('')}</div><div class="chunk-viewport"><div class="chunk-track">${Array.from({length:6}, (_,i) => `<div class="prediction-chunk" data-chunk-id="${i}"><div class="chunk-tile"><span>Video</span></div><div class="action-frame"><div class="chunk-tile action-tile"><span>Actions</span></div>${executionOutline}</div></div>`).join('')}</div></div><div class="window-refinement" aria-hidden="true"></div>`;
const track = chunkWindow.querySelector('.chunk-track');
let chunks = [...track.children];
const readyMark = chunkWindow.querySelector('.chunk-ready');
const countLabel = document.querySelector('#cycle-count');
const descriptionLabel = document.querySelector('#cycle-description');
const steps = [...document.querySelectorAll('[data-cycle-step]')];
let elapsed = 0, turn = 0, raf = null, last = null, lastPhase = -1, lastDescription = '';

function mixColor(colors, level) {
  const low = Math.floor(level), high = Math.min(5, Math.ceil(level)), mix = level-low;
  const a = colors[low].slice(1), b = colors[high].slice(1);
  const channels = [0,2,4].map(i => Math.round(parseInt(a.slice(i,i+2),16)*(1-mix) + parseInt(b.slice(i,i+2),16)*mix));
  return `rgb(${channels.join(', ')})`;
}
function renderCycle() {
  const state = cycleModel.stateAt(elapsed);
  chunkWindow.style.setProperty('--refine-progress', String(state.refine));
  chunkWindow.style.setProperty('--refine-opacity', String(state.refineOpacity));
  track.style.transform = `translate3d(calc(${-20*state.slide}% - var(--chunk-gap) * ${state.slide/5}), 0, 0)`;
  chunks.forEach((chunk,i) => {
    const level = state.levels[i];
    chunk.style.setProperty('--video-fill', mixColor(videoColors,level));
    chunk.style.setProperty('--action-fill', mixColor(actionColors,level));
    chunk.style.setProperty('--noise', String(level/5));
    chunk.style.setProperty('--execution-offset', i === 0 ? String(100 * (1-state.execution)) : '100');
    chunk.style.setProperty('--emphasis', i === 0 ? String(state.emphasis) : '0');
    chunk.classList.toggle('executing', i === 0 && state.executing);
    // The extra pair stays out of the accessibility tree until it enters the window.
    chunk.setAttribute('aria-hidden', String((i === 5 && state.slide === 0) || (i === 0 && state.slide === 1)));
  });
  readyMark.hidden = !state.ready;
  if(state.phase !== lastPhase) {
    countLabel.textContent = state.label;
    steps.forEach(step => step.classList.toggle('active', Number(step.dataset.cycleStep) === state.phase));
    lastPhase = state.phase;
  }
  if(state.description !== lastDescription) { descriptionLabel.textContent = state.description; lastDescription = state.description; }
}
function advance(amount) {
  elapsed += amount;
  while(elapsed >= cycleModel.DURATION) {
    elapsed -= cycleModel.DURATION;
    turn = (turn+1)%100000;
    // Rebase only when both positions and levels exactly match the next cycle.
    // The four retained pairs and the newly appended pair are never recreated.
    const outgoing = chunks.shift();
    outgoing.dataset.chunkId = String((turn+5)%100000);
    track.appendChild(outgoing);
    chunks.push(outgoing);
  }
}
function canPlay() { return !motionPaused && cycleVisible && !document.hidden; }
function tick(now) {
  raf = null;
  if(!canPlay()) { last = null; return; }
  if(last !== null) advance(Math.max(0, Math.min(now-last, 80)));
  last = now;
  renderCycle();
  raf = requestAnimationFrame(tick);
}
function updateMotion() {
  title.classList.toggle('motion-enabled', !motionPaused);
  title.classList.toggle('is-paused', motionPaused || !titleVisible || document.hidden);
  cyclePanel.classList.toggle('is-paused', !canPlay());
  cycleToggle.textContent = motionPaused ? 'Play' : 'Pause';
  cycleToggle.setAttribute('aria-label', `${motionPaused ? 'Play' : 'Pause'} the rolling animation`);
  cycleStep.hidden = !motionPaused;
  if(canPlay()) { if(raf === null) { last = null; raf = requestAnimationFrame(tick); } }
  else { if(raf !== null) cancelAnimationFrame(raf); raf = null; last = null; }
}
cycleToggle.addEventListener('click', () => { motionPaused = !motionPaused; updateMotion(); });
document.querySelector('#cycle-restart').addEventListener('click', () => {
  elapsed = 0; turn = 0; last = null;
  chunks.forEach((chunk,i) => { chunk.dataset.chunkId = String(i); });
  renderCycle(); updateMotion();
});
cycleStep.addEventListener('click', () => {
  motionPaused = true;
  const next = cycleModel.stops.find(time => time > elapsed+1);
  if(next === undefined) advance(cycleModel.DURATION-elapsed);
  else elapsed = next;
  renderCycle(); updateMotion();
});
const motionObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if(entry.target === title) titleVisible = entry.isIntersecting;
    if(entry.target === cyclePanel) cycleVisible = entry.isIntersecting;
  });
  updateMotion();
}, {threshold:.15});
motionObserver.observe(title); motionObserver.observe(cyclePanel);
reducedMotion.addEventListener('change', event => { motionPaused = event.matches; updateMotion(); });
document.addEventListener('visibilitychange', () => {
  if(document.hidden) document.querySelectorAll('video').forEach(video => video.pause());
  updateMotion();
});
renderCycle(); updateMotion();

function wireTabs(selector, onSelect) {
  const tabs = [...document.querySelectorAll(selector)];
  function select(tab) {
    if (tab.getAttribute('aria-selected') === 'true') return;
    tabs.forEach(item => { item.setAttribute('aria-selected', String(item === tab)); item.tabIndex = item === tab ? 0 : -1; });
    onSelect(tab);
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault(); tabs[next].focus(); select(tabs[next]);
    });
  });
}

const tasks = {
  doll: { title: 'Doll placement', clips: ['rolling-wam-doll', 'joint-wam-doll', 'fast-wam-doll'] },
  plates: { title: 'Plate stacking', clips: ['rolling-wam-plates', 'joint-wam-plates', 'fast-wam-plates'] },
  pouring: { title: 'Bead pouring', clips: ['rolling-wam-pouring', 'joint-wam-pouring', 'fast-wam-pouring'] }
};
let currentTask = 'doll';
const comparisonVideos = ['ours', 'joint', 'fast'].map(name => document.querySelector(`#${name}-video`));
const methodNames = ['Rolling-WAM', 'Joint-WAM', 'Fast-WAM'];
function activeVideos() { return comparisonVideos.filter(video => !video.hidden); }
function updatePlaybackLabel() {
  const videos = activeVideos();
  const playing = videos.some(video => !video.paused && !video.ended);
  document.querySelector('#compare-play').textContent = `${playing ? 'Pause' : 'Play'} ${videos.length > 1 ? 'all' : 'video'}`;
}
function updateComparison() {
  const task = tasks[currentTask];
  document.querySelector('#task-panel').setAttribute('aria-labelledby', `task-${currentTask}`);
  comparisonVideos.forEach((video, i) => {
    video.pause();
    const stem = task.clips[i];
    video.hidden = !stem;
    const missing = video.parentElement.querySelector('.missing-video');
    if (missing) missing.hidden = Boolean(stem);
    if (stem) {
      video.src = `assets/${stem}.mp4`;
      video.poster = `assets/${stem}.jpg`;
      video.setAttribute('aria-label', `${methodNames[i]} ${task.title.toLowerCase()}`);
      video.playbackRate = 1;
      video.load();
    }
  });
  updatePlaybackLabel();
}
wireTabs('[data-task]', tab => { currentTask = tab.dataset.task; updateComparison(); });
comparisonVideos.forEach(video => ['play', 'pause', 'ended'].forEach(event => video.addEventListener(event, updatePlaybackLabel)));
document.querySelector('#compare-play').addEventListener('click', async () => {
  const videos = activeVideos();
  if (videos.some(video => !video.paused && !video.ended)) videos.forEach(video => video.pause());
  else {
    const restart = videos.every(video => video.ended);
    if (restart) videos.forEach(video => { video.currentTime = 0; });
    await Promise.allSettled(videos.filter(video => restart || !video.ended).map(video => video.play()));
  }
  updatePlaybackLabel();
});
document.querySelector('#compare-restart').addEventListener('click', () => {
  activeVideos().forEach(video => { video.pause(); video.currentTime = 0; });
  updatePlaybackLabel();
});
const benchmarks = {
  robotwin: {
    caption: "RoboTwin 2.0 · 50 bimanual manipulation tasks", headers: ["Method", "Embodied pretraining", "Clean", "Randomized", "Average"],
    rows: [["π₀", true,65.9,58.4,62.2],["π₀.₅",true,82.7,76.8,79.8],["Motus",true,88.7,87.0,87.9],["LingBot-VA",true,92.9,91.5,92.2],["Fast-WAM",false,91.9,91.8,91.9],["Joint-WAM",false,90.8,90.3,90.6],["Rolling-WAM",false,93.5,93.0,93.3]],
    note: "100 rollouts per task and setting. Embodied pretraining denotes additional robot-data pretraining."
  },
  libero: {
    caption: "LIBERO · 40 tasks across four suites", headers: ["Method", "Embodied pretraining", "Spatial", "Object", "Goal", "Long", "Average"],
    rows: [["π₀",true,96.8,98.8,95.8,85.2,94.1],["π₀.₅",true,98.8,98.2,98.0,92.4,96.9],["Motus",true,96.8,99.8,96.6,97.6,97.7],["LingBot-VA",true,98.5,99.6,97.2,98.5,98.5],["Fast-WAM",false,98.2,100.0,97.0,95.2,97.6],["Joint-WAM",false,99.6,99.4,98.2,96.8,98.5],["Rolling-WAM",false,98.2,98.0,98.2,97.8,98.1]],
    note: "50 rollouts per task. Embodied pretraining denotes additional robot-data pretraining."
  },
  g1: {
    caption: "Unitree G1 · three real-world tasks", headers: ["Method", "Doll placement", "Plate stacking", "Bead pouring", "Average"],
    rows: [["π₀.₅",55,70,60,61.7],["GR00T N1.7",75,65,60,66.7],["Fast-WAM",85,80,60,75.0],["Joint-WAM",70,100,65,78.3],["Rolling-WAM",85,100,70,85.0]],
    note: "20 trials per task and method. Success requires completion without human intervention."
  }
};
function renderBenchmark(key) {
  const data = benchmarks[key];
  document.querySelector('#results-table').innerHTML = `<caption>${data.caption}</caption><thead><tr>${data.headers.map((header, i) => `<th scope="col"${i === 1 && key !== 'g1' ? ' class="pretraining"' : ''}>${header}</th>`).join('')}</tr></thead><tbody>${data.rows.map(row => `<tr${row[0] === 'Rolling-WAM' ? ' class="ours"' : ''}>${row.map((cell, i) => i === 0 ? `<th scope="row">${cell}${cell === 'Rolling-WAM' ? ' (Ours)' : ''}</th>` : typeof cell === 'boolean' ? `<td class="pretraining">${cell ? 'Yes' : 'No'}</td>` : `<td>${cell.toFixed(1)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  document.querySelector('#benchmark-note').textContent = data.note;
  document.querySelector('#benchmark-panel').setAttribute('aria-labelledby', `benchmark-${key}`);
}
wireTabs('[data-benchmark]', tab => renderBenchmark(tab.dataset.benchmark));
renderBenchmark('robotwin');

const copyButton = document.querySelector('#copy-citation');
copyButton.addEventListener('click', async () => {
  const code = document.querySelector('#citation-code');
  const status = document.querySelector('#copy-status');
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(code.textContent);
    status.textContent = 'Citation copied.';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(code);
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    status.textContent = 'Citation selected. Use your keyboard to copy.';
  }
});

const navLinks = [...document.querySelectorAll('.site-header nav a')];
const sectionObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    navLinks.forEach(link => {
      if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  });
}, { rootMargin: '-10% 0px -60% 0px' });
navLinks.forEach(link => { const section = document.querySelector(link.hash); if (section) sectionObserver.observe(section); });
