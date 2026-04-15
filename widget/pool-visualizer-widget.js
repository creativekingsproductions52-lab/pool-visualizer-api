(function () {
  'use strict';

  // ─── Build the widget HTML ────────────────────────────────────────────────
  function buildHTML(opts) {
    const title = opts.title || 'Pool Visualizer';
    const color = opts.color || '#3b82f6';
    const logo  = opts.logo  ? `<img src="${opts.logo}" style="height:32px;margin-bottom:8px">` : '';

    return `
      <div id="pv-root" style="
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #0f172a;
        color: #f1f5f9;
        border-radius: 16px;
        padding: 28px;
        max-width: 640px;
        margin: 0 auto;
        box-shadow: 0 25px 60px rgba(0,0,0,0.5);
      ">
        ${logo}
        <h2 style="margin:0 0 6px;font-size:1.4rem;font-weight:700;">${title}</h2>
        <p style="margin:0 0 20px;color:#94a3b8;font-size:.9rem;">
          Enter any home address to see a pool added with AI.
        </p>

        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <input
            id="pv-address"
            type="text"
            placeholder="123 Main St, Austin TX"
            style="
              flex:1; padding:12px 16px; border-radius:10px;
              border:1px solid #334155; background:#1e293b;
              color:#f1f5f9; font-size:.95rem; outline:none;
            "
          />
          <button
            onclick="pvRun()"
            style="
              padding:12px 22px; border-radius:10px; border:none;
              background:${color}; color:#fff; font-weight:600;
              font-size:.95rem; cursor:pointer; white-space:nowrap;
            "
          >Visualize →</button>
        </div>

        <p id="pv-status" style="color:#94a3b8;font-size:.85rem;min-height:20px;"></p>

        <!-- Progress bar -->
        <div id="pv-progress-wrap" style="display:none;margin:12px 0;">
          <div style="background:#1e293b;border-radius:999px;height:6px;overflow:hidden;">
            <div id="pv-bar" style="
              height:100%; width:0%; background:${color};
              border-radius:999px; transition:width .6s ease;
            "></div>
          </div>
        </div>

        <!-- Results -->
        <div id="pv-result" style="display:none;margin-top:20px;">
          <div id="pv-tabs" style="display:flex;gap:8px;margin-bottom:12px;">
            <button onclick="pvTab('video')"     class="pv-tab" data-tab="video"    style="flex:1;padding:8px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#f1f5f9;cursor:pointer;font-size:.85rem;">🎬 Video</button>
            <button onclick="pvTab('edited')"    class="pv-tab" data-tab="edited"   style="flex:1;padding:8px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#f1f5f9;cursor:pointer;font-size:.85rem;">🏊 With Pool</button>
            <button onclick="pvTab('satellite')" class="pv-tab" data-tab="satellite" style="flex:1;padding:8px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#f1f5f9;cursor:pointer;font-size:.85rem;">🛰 Satellite</button>
          </div>
          <div id="pv-media" style="
            border-radius:12px; overflow:hidden;
            background:#1e293b; min-height:200px;
          "></div>
          <p id="pv-address-label" style="
            margin-top:10px;font-size:.8rem;color:#64748b;text-align:center;
          "></p>
        </div>
      </div>
    `;
  }

  // ─── Tab switcher ─────────────────────────────────────────────────────────
  window.pvTab = function (tab) {
    const media = document.getElementById('pv-media');
    const d = window._pvData;
    if (!d) return;

    // Highlight active tab
    document.querySelectorAll('.pv-tab').forEach(btn => {
      btn.style.borderColor = btn.dataset.tab === tab ? '#3b82f6' : '#334155';
      btn.style.color       = btn.dataset.tab === tab ? '#60a5fa' : '#f1f5f9';
    });

    if (tab === 'video') {
      media.innerHTML = `<video src="${d.video}" controls autoplay loop
        style="width:100%;display:block;border-radius:12px;"></video>`;
    } else if (tab === 'edited') {
      media.innerHTML = `<img src="${d.edited_image}"
        style="width:100%;display:block;border-radius:12px;">`;
    } else {
      media.innerHTML = `<img src="${d.satellite_image}"
        style="width:100%;display:block;border-radius:12px;">`;
    }
  };

  // ─── Progress bar helper ──────────────────────────────────────────────────
  function setProgress(pct) {
    const bar  = document.getElementById('pv-bar');
    const wrap = document.getElementById('pv-progress-wrap');
    if (!bar || !wrap) return;
    wrap.style.display = 'block';
    bar.style.width = pct + '%';
  }

  function resolveApiUrl(container) {
    return (
      (container && container.dataset && container.dataset.api) ||
      window._pvApiUrl ||
      window._PV_API_URL ||
      '/api/visualize'
    );
  }

  // ─── Main run function ────────────────────────────────────────────────────
  window.pvRun = async function () {
    const addressEl = document.getElementById('pv-address');
    const statusEl  = document.getElementById('pv-status');
    const resultEl  = document.getElementById('pv-result');
    const addrLabel = document.getElementById('pv-address-label');

    const address = addressEl.value.trim();
    if (!address) {
      statusEl.textContent = 'Please enter an address.';
      return;
    }

    resultEl.style.display = 'none';
    window._pvData = {};

    const steps = [
      { msg: 'Locating your property…',        pct: 10 },
      { msg: 'Capturing satellite imagery…',   pct: 20 },
      { msg: 'Rendering 3D views…',            pct: 35 },
      { msg: 'AI analyzing your backyard…',    pct: 50 },
      { msg: 'Selecting best camera angle…',   pct: 60 },
      { msg: 'Placing pool with AI…',          pct: 75 },
      { msg: 'Generating your video (~3 min)…', pct: 90 },
    ];

    let step = 0;
    statusEl.style.color = '#94a3b8';
    statusEl.textContent = steps[0].msg;
    setProgress(steps[0].pct);

    const timer = setInterval(() => {
      step = Math.min(step + 1, steps.length - 1);
      statusEl.textContent = steps[step].msg;
      setProgress(steps[step].pct);
    }, 25000);

    // Determine API URL — prefer explicit override, then relative fallback
    const root = document.getElementById('pv-root');
    const apiBase = resolveApiUrl(root);

    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      clearInterval(timer);

      if (!data.success) throw new Error(data.error || 'Unknown error');

      window._pvData = data;
      setProgress(100);
      statusEl.style.color = '#4ade80';
      statusEl.textContent = '✅ Your pool visualization is ready!';

      if (addrLabel) addrLabel.textContent = data.address;
      resultEl.style.display = 'block';
      pvTab('video');
    } catch (err) {
      clearInterval(timer);
      setProgress(0);
      document.getElementById('pv-progress-wrap').style.display = 'none';
      statusEl.style.color = '#f87171';
      statusEl.textContent = '❌ Error: ' + err.message;
    }
  };

  // Allow Enter key to submit
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && document.activeElement?.id === 'pv-address') {
      window.pvRun();
    }
  });

  // ─── Widget initializer ───────────────────────────────────────────────────
  function createWidget(container) {
    const opts = {
      title : container.dataset.title || 'Pool Visualizer',
      color : container.dataset.color || '#3b82f6',
      logo  : container.dataset.logo  || '',
      api   : resolveApiUrl(container),
    };
    container.innerHTML = buildHTML(opts);
    window._pvApiUrl = opts.api;
  }

  // Auto-init all [data-pool-visualizer] elements
  document.querySelectorAll('[data-pool-visualizer]').forEach(createWidget);

  // Expose manual init
  window.PoolVisualizer = { init: createWidget };

})();
