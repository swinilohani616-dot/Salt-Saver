/**
 * Front page (index.html): a scroll-driven 3D capsule that opens to reveal the search box.
 *
 * The search box asks SaltSaver's own API for suggestions and hands the chosen text to the
 * search page (search.html?q=…), where matches and savings are shown. Without JavaScript the
 * form still submits there.
 *
 * Three.js and GSAP load from jsDelivr. If they or WebGL are missing, the page still works:
 * <html class="no3d"> shows the copy and search box without the capsule.
 */
import { suggestNames, isAbort } from './services/catalogService.js';
import { normalizeText } from './core/normalize.js';
import { el, renderInto, $ } from './ui/dom.js';
import { SEARCH, SUGGEST, MESSAGES, EXAMPLE_QUERIES } from './config.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- search ---------- */

const SEARCH_PAGE = 'search.html';
const TYPE_LABEL = Object.freeze({ brand: 'Branded', generic: 'Jan Aushadhi generic', ingredient: 'Active salt' });
const searchUrl = (text) => `${SEARCH_PAGE}?q=${encodeURIComponent(text.trim())}`;

function mountSearch() {
  const input = $('#q');
  const list = $('#res');
  const status = $('#res-status');
  let timer;
  let seq = 0;

  const close = () => {
    list.hidden = true;
  };
  const show = (...items) => {
    renderInto(list, items);
    list.hidden = false;
  };
  const info = (text) => el('li', {}, el('span', { class: 'info' }, text));
  const allResults = (q) => el('li', {}, el('a', { href: searchUrl(q), class: 'all' }, `See all results for “${q}”`));

  async function suggestFor(raw) {
    const q = raw.trim();
    const mine = ++seq;
    if (normalizeText(q).length < SEARCH.minChars) {
      close();
      status.textContent = '';
      return;
    }
    try {
      const suggestions = await suggestNames(q);
      if (mine !== seq) return;
      if (suggestions.length === 0) {
        show(info(`No suggestions for “${q}”. Press Search to look it up anyway.`));
        status.textContent = 'No suggestions.';
        return;
      }
      show(
        suggestions.map((s) => {
          const value = s.value ?? s.label;
          return el('li', {}, el('a', { href: searchUrl(value) }, el('b', {}, s.label), el('em', {}, TYPE_LABEL[s.type] ?? '')));
        }),
        allResults(q),
      );
      status.textContent = `${suggestions.length} ${suggestions.length === 1 ? 'suggestion' : 'suggestions'}.`;
    } catch (error) {
      if (isAbort(error) || mine !== seq) return;
      show(info(error.message));
      status.textContent = error.message;
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => suggestFor(input.value), SUGGEST.debounceMs);
  });
  $('#sf').addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(timer);
    const q = input.value.trim();
    if (normalizeText(q).length < SEARCH.minChars) {
      show(info(MESSAGES.TOO_SHORT));
      status.textContent = MESSAGES.TOO_SHORT;
      input.focus();
      return;
    }
    window.location.assign(searchUrl(q));
  });

  renderInto(
    $('#try'),
    'Try',
    EXAMPLE_QUERIES.slice(0, 3).map((q) =>
      el('button', {
        type: 'button',
        onClick: () => {
          input.value = q;
          input.focus();
          suggestFor(q);
        },
      }, q),
    ),
  );

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.search')) close();
  });
  // The search box fades in at the end of the scroll. Tabbing into it early jumps there,
  // so keyboard users never type into a box they cannot see.
  const box = $('.search');
  // The jump waits a frame: the browser's own scroll-to-focused-element runs after focusin.
  box.addEventListener('focusin', () => {
    if (Number(getComputedStyle(box).opacity) < 0.5) requestAnimationFrame(() => scrollTo(0, document.documentElement.scrollHeight));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !list.hidden) {
      close();
      input.focus();
    }
  });
}

mountSearch();

/* ---------- 3D capsule ---------- */

const { THREE, gsap, ScrollTrigger } = window;
let renderer = null;
try {
  if (!THREE || !gsap || !ScrollTrigger) throw new Error('3D libraries not loaded');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch {
  document.documentElement.classList.add('no3d');
}

if (renderer) mountCapsule(renderer);

function mountCapsule(renderer) {
  gsap.registerPlugin(ScrollTrigger);
  const host = document.getElementById('stage');
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  // Studio environment for glossy reflections (no external HDR).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envS = new THREE.Scene();
  envS.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x10141a, side: THREE.BackSide })));
  const softbox = (w, h, x, y, z, i, col = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(i), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    envS.add(m);
  };
  softbox(10, 3, 0, 8, 4, 5);
  softbox(3, 8, -9, 1, 3, 2.5);
  softbox(2, 8, 9, 0, -3, 2.2, 0xffd2c8);
  softbox(8, 2, 0, -7, 5, 0.5);
  scene.environment = pmrem.fromScene(envS, 0.04).texture;

  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc6bc, 1.5);
  rim.position.set(-4, -1, -3);
  scene.add(rim);

  // One capsule half: open end at y=0, dome at the far end.
  function halfGeo(r, len) {
    const p = [new THREE.Vector2(r * 0.9, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, len)];
    for (let i = 1; i <= 18; i++) {
      const a = (i / 18) * Math.PI / 2;
      p.push(new THREE.Vector2(Math.max(Math.cos(a) * r, 0.0001), len + Math.sin(a) * r));
    }
    return new THREE.LatheGeometry(p, 72);
  }
  const capMat = new THREE.MeshPhysicalMaterial({ color: 0xff4b3a, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, side: THREE.DoubleSide });
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xf2ede4, roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.18, side: THREE.DoubleSide });
  const capG = halfGeo(0.52, 1.0);
  capG.translate(0, -0.2, 0);
  const bodyG = halfGeo(0.5, 1.05);
  bodyG.rotateX(Math.PI);
  bodyG.translate(0, 0.2, 0);
  const cap = new THREE.Mesh(capG, capMat);
  const body = new THREE.Mesh(bodyG, bodyMat);
  const capsule = new THREE.Group();
  capsule.add(cap, body);
  scene.add(capsule);
  const core = new THREE.PointLight(0xffd8c4, 0, 6, 1.6);
  capsule.add(core);

  // Soft contact shadow.
  const tex = (stops) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach((s) => gr.addColorStop(s[0], s[1]));
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  };
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex([[0, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }),
  );
  scene.add(shadow);

  // Particle burst from inside the capsule.
  const N = 220;
  const pPos = new Float32Array(N * 3);
  const dirs = [];
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    dirs.push([s * Math.cos(a) * (0.6 + Math.random()), u * (0.35 + Math.random() * 0.5), s * Math.sin(a) * (0.6 + Math.random())]);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    size: 0.085,
    map: tex([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,220,205,.55)'], [1, 'rgba(255,200,180,0)']]),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  });
  const sparks = new THREE.Points(pGeo, pMat);
  scene.add(sparks);

  // ---------- the single scroll-driven state ----------
  const F = reduce ? 0.2 : Math.PI; // one flip
  const rx0 = 0.35;
  // Starts a little right of centre so it clears the big opening headline on narrower screens.
  const S = { x: 0.12, y: 0, my: 0, rx: rx0, ry: -0.45, rz: -0.75, scale: 1, open: 0, burst: 0, float: 1, fin: 0 };
  let halfW = 4;
  let halfH = 2.4;
  let narrow = false;

  const tl = gsap.timeline({
    defaults: { ease: 'sine.inOut' },
    scrollTrigger: { trigger: document.documentElement, start: 0, end: () => ScrollTrigger.maxScroll(window), scrub: reduce ? true : 0.8, invalidateOnRefresh: true },
  });
  // Positions are in vh of scroll: hero 0–100, scenes 140vh each, finale 300vh → 720 total.
  // Each scene's copy is centred on screen at scroll 120 / 260 / 400. The capsule waits on the
  // side opposite the copy and changes sides at 190 and 330: the moment one panel has left
  // and the next has not arrived, so it never passes over the words.
  // Position and flip share one ease, so the turn and the travel read as one motion.
  const travel = (t0, dur, x, yArc, rxTo, ry, rz) => {
    tl.to(S, { x, rx: rxTo, ry, rz, duration: dur, ease: 'power2.inOut' }, t0)
      .to(S, { y: yArc, duration: dur / 2, ease: 'sine.out' }, t0)
      .to(S, { y: 0, duration: dur / 2, ease: 'sine.in' }, t0 + dur / 2);
  };
  tl.to('.hero-copy', { opacity: 0, y: -30, duration: 60, ease: 'none' }, 0).to(S, { my: 1, duration: 100 }, 0);
  travel(0, 110, 0.55, 0.2, rx0 + F, 0.3, -0.35); // centre → right (copy on the left), flip
  tl.to(S, { ry: 0.45, rz: -0.25, duration: 30 }, 110); // gentle drift while the copy is read
  travel(140, 100, -0.55, -0.15, rx0 + 2 * F, -0.35, 0.5); // right → left (copy on the right), flip
  tl.to(S, { ry: -0.5, rz: 0.6, duration: 40 }, 240);
  travel(280, 100, 0.55, 0.15, rx0 + 3 * F, 0.35, -0.45); // left → right (copy on the left), flip
  tl.to(S, { ry: 0.5, rz: -0.35, duration: 50 }, 380);
  // Settle into the finale: center, horizontal, slower float.
  tl.to(S, { x: 0, duration: 110, ease: 'power3.inOut' }, 430)
    .to(S, { y: 0, my: 0, scale: 1.12, float: 0.2, fin: 1, duration: 110, ease: 'power2.inOut' }, 430)
    .to(S, { rx: reduce ? 0.15 : 4 * Math.PI + 0.15, ry: -0.2, rz: Math.PI / 2, duration: 110, ease: 'power3.out' }, 430)
    // The pop.
    .to(S, { open: 1, duration: 80, ease: 'power3.inOut' }, 560)
    .to(S, { burst: 1, duration: 130, ease: 'power2.out' }, 572)
    .fromTo('.msg', { opacity: 0, scale: 0.45, filter: 'blur(10px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 70, ease: 'power3.out' }, 596)
    .fromTo('.search', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 50, ease: 'power2.out' }, 640)
    .fromTo('.disc', { opacity: 0 }, { opacity: 1, duration: 40 }, 660)
    .to({}, { duration: 1 }, 719);

  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    halfW = halfH * camera.aspect;
    narrow = w < 760;
  }
  addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function frame() {
    const t = clock.getElapsedTime();
    const fl = reduce ? 0 : S.float;
    // Smaller than the type, and far enough to the side opposite the copy that they never meet.
    const base = narrow ? Math.min(0.5, halfW / 2.2) : Math.min(0.82, halfW / 4.4);
    const sc = base * S.scale;
    const xAmp = narrow ? 0.2 : 0.8;

    capsule.scale.setScalar(sc);
    capsule.position.set(S.x * halfW * xAmp, S.y + Math.sin(t * 1.1) * 0.07 * fl + (narrow ? S.my * halfH * 0.3 : 0), 0);
    // On phones the capsule ends vertical so the halves split up/down.
    capsule.rotation.set(S.rx + Math.sin(t * 0.7) * 0.05 * fl, S.ry + Math.sin(t * 0.5) * 0.06 * fl, S.rz - (narrow ? S.fin * Math.PI / 2 : 0));

    // Open: halves slide a short way apart, staying behind the closing line and search box.
    const sep = S.open * (narrow ? 1.15 : 0.95);
    cap.position.y = sep;
    body.position.y = -sep;
    cap.rotation.x = S.open * 0.18;
    body.rotation.x = -S.open * 0.18;
    core.intensity = Math.sin(Math.min(S.open, 1) * Math.PI) * 14 + S.open * 3;

    // Particles.
    const k = easeOut(S.burst);
    const spread = (narrow ? 1.3 : 2.4) * sc;
    for (let i = 0; i < N; i++) {
      const d = dirs[i];
      pPos[i * 3] = d[0] * k * spread;
      pPos[i * 3 + 1] = d[1] * k * spread + Math.sin(t + i) * 0.03 * k;
      pPos[i * 3 + 2] = d[2] * k * spread * 0.6;
    }
    pGeo.attributes.position.needsUpdate = true;
    sparks.position.copy(capsule.position);
    pMat.opacity = S.burst < 0.35 ? S.burst / 0.35 : Math.max(0.22, 1 - (S.burst - 0.35) * 1.2);

    // Shadow follows the capsule, fades when it lifts or opens.
    const widthNow = (1.1 + Math.abs(Math.sin(capsule.rotation.z)) * 1.7) * sc;
    shadow.position.set(capsule.position.x, capsule.position.y - 1.45 * sc - 0.15, -0.6);
    shadow.scale.set(widthNow * 1.2, 0.32 * sc, 1);
    shadow.material.opacity = (1 - S.open * 0.8) * (0.85 - Math.sin(t * 1.1) * 0.1 * fl);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
}
