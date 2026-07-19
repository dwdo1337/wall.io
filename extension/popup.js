// extension/popup.js — Wall.io Badge popup (period + badge style editor)
document.addEventListener('DOMContentLoaded', () => {
  // Auto-hide splash after 2.5s, or on click
  var splashTimer;
  function hideSplash() {
    clearTimeout(splashTimer);
    var s = document.getElementById('splash');
    if (s) { s.style.opacity = '0'; setTimeout(function() { s.style.display = 'none'; }, 400); }
  }
  splashTimer = setTimeout(hideSplash, 2500);
  var splashEl = document.getElementById('splash');
  if (splashEl) splashEl.addEventListener('click', hideSplash);

  const periodLinks = Array.from(document.querySelectorAll('.period-link'));
  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');
  const offlineHint = document.getElementById('offlineHint');
  const mainPanel = document.getElementById('mainPanel');
  const stylePanel = document.getElementById('stylePanel');
  const openTerminalBtn = document.getElementById('openTerminalBtn');
  const openStyleBtn = document.getElementById('openStyleBtn');
  const backBtn = document.getElementById('backBtn');
  const presetRow = document.getElementById('presetRow');
  const customPresetName = document.getElementById('customPresetName');
  const savePresetBtn = document.getElementById('savePresetBtn');
  const styleControls = document.getElementById('styleControls');
  const stylePreview = document.getElementById('stylePreview');
  const resetStyleBtn = document.getElementById('resetStyleBtn');
  const applyStyleBtn = document.getElementById('applyStyleBtn');
  const backendUrlInput = document.getElementById('backendUrlInput');
  const saveBackendBtn = document.getElementById('saveBackendBtn');
  const contactEmailInput = document.getElementById('contactEmailInput');
  const saveEmailBtn = document.getElementById('saveEmailBtn');

  // Helius API key
  const heliusKeyInput = document.getElementById('heliusKeyInput');
  const saveHeliusBtn = document.getElementById('saveHeliusBtn');

  // Etherscan API key (covers Etherscan/BscScan/BaseScan via V2 API)
  const etherscanKeyInput = document.getElementById('etherscanKeyInput');
  const saveEtherscanBtn = document.getElementById('saveEtherscanBtn');

  // Setup wizard
  const setupPanel = document.getElementById('setupPanel');
  const openSetupBtn = document.getElementById('openSetupBtn');
  const setupBackBtn = document.getElementById('setupBackBtn');
  const checkNodeBtn = document.getElementById('checkNodeBtn');
  const checkBackendBtn = document.getElementById('checkBackendBtn');
  const finishSetupBtn = document.getElementById('finishSetupBtn');
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const step3 = document.getElementById('step3');
  const prog1 = document.getElementById('prog1');
  const prog2 = document.getElementById('prog2');
  const prog3 = document.getElementById('prog3');

  let setupStep = 1; // 1 = node, 2 = backend, 3 = done

  let liveConfig = wallioStyle.mergeWithDefaults({});
  let savedConfig = null;
  let customPresets = {};
  let activePresetName = 'Default';
  let currentPeriod = '7d';

  // ── Period handling ──
  chrome.storage.sync.get({ holdPeriod: '7d' }, ({ holdPeriod }) => {
    currentPeriod = holdPeriod;
    periodLinks.forEach((l) => l.classList.toggle('active', l.dataset.period === holdPeriod));
  });

  periodLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      periodLinks.forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      currentPeriod = link.dataset.period;
      chrome.storage.sync.set({ holdPeriod: link.dataset.period });
      if (!stylePanel.classList.contains('hidden')) updatePreview();
    });
  });

  // ── Backend status ──
  const DEFAULT_BACKEND = 'http://localhost:3001';
  const checkHealth = async () => {
    try {
      const { backend } = await chrome.storage.sync.get({ backend: DEFAULT_BACKEND });
      const r = await fetch(`${backend}/health`, { method: 'GET' });
      if (r.ok) {
        statusText.textContent = 'ACTIVE';
        statusText.style.color = '#00ff88';
        statusDot.style.background = '#00ff88';
        statusDot.style.animation = 'blink 2s ease-in-out infinite';
        offlineHint.style.display = 'none';
      } else {
        statusText.textContent = 'OFFLINE';
        statusText.style.color = '#666';
        statusDot.style.background = '#555';
        statusDot.style.animation = 'none';
        offlineHint.style.display = 'block';
      }
    } catch {
      statusText.textContent = 'OFFLINE';
      statusText.style.color = '#666';
      statusDot.style.background = '#555';
      statusDot.style.animation = 'none';
      offlineHint.style.display = 'block';
    }
  };
  checkHealth();
  let healthInterval = setInterval(checkHealth, 30000);
  window.addEventListener('beforeunload', () => clearInterval(healthInterval));

  // Faster polling when setup wizard is open
  setInterval(() => {
    if (!setupPanel.classList.contains('hidden') && setupStep < 3) {
      quickHealthCheck().then((healthy) => {
        if (healthy && setupStep < 3) {
          setupStep = 3;
          updateSetupProgress();
          checkHealth();
        }
      });
    }
  }, 5000);

  // ── Backend URL settings ──
  chrome.storage.sync.get({ backend: DEFAULT_BACKEND }, ({ backend }) => {
    backendUrlInput.value = backend;
  });

  saveBackendBtn.addEventListener('click', () => {
    let val = backendUrlInput.value.trim();
    if (!val) val = DEFAULT_BACKEND;
    val = val.replace(/\/+$/, ''); // strip trailing slash so `${backend}/health` etc. stay clean
    chrome.storage.sync.set({ backend: val }, () => {
      backendUrlInput.value = val;
      saveBackendBtn.textContent = 'SAVED';
      setTimeout(() => (saveBackendBtn.textContent = 'Save'), 800);
      checkHealth();
    });
  });

  // ── Optional contact email ──
  // Stored locally only (chrome.storage.local) — never synced, never sent
  // to the backend automatically. Purely so a user can opt in to being
  // reachable; leaving this blank changes nothing about how the extension
  // functions.
  chrome.storage.local.get({ contactEmail: '' }, ({ contactEmail }) => {
    contactEmailInput.value = contactEmail;
  });

  saveEmailBtn.addEventListener('click', () => {
    const val = contactEmailInput.value.trim();
    chrome.storage.local.set({ contactEmail: val }, () => {
      saveEmailBtn.textContent = 'SAVED';
      setTimeout(() => (saveEmailBtn.textContent = 'Save'), 800);
    });
  });

  // ── Helius API key ──
  chrome.storage.local.get({ heliusApiKey: '' }, ({ heliusApiKey }) => {
    heliusKeyInput.value = heliusApiKey;
  });

  saveHeliusBtn.addEventListener('click', () => {
    const val = heliusKeyInput.value.trim();
    chrome.storage.local.set({ heliusApiKey: val }, () => {
      saveHeliusBtn.textContent = 'SAVED';
      setTimeout(() => (saveHeliusBtn.textContent = 'Save'), 800);
    });
  });

  // ── Etherscan API key ──
  chrome.storage.local.get({ etherscanApiKey: '' }, ({ etherscanApiKey }) => {
    etherscanKeyInput.value = etherscanApiKey;
  });

  saveEtherscanBtn.addEventListener('click', () => {
    const val = etherscanKeyInput.value.trim();
    chrome.storage.local.set({ etherscanApiKey: val }, () => {
      saveEtherscanBtn.textContent = 'SAVED';
      setTimeout(() => (saveEtherscanBtn.textContent = 'Save'), 800);
    });
  });

  // ── View flipping ──
  openTerminalBtn?.addEventListener('click', () => {
    // TODO: build terminal feature
  });

  openStyleBtn.addEventListener('click', () => {
    mainPanel.classList.add('hidden');
    stylePanel.classList.remove('hidden');
    loadStyleState();
  });

  backBtn.addEventListener('click', () => {
    stylePanel.classList.add('hidden');
    mainPanel.classList.remove('hidden');
  });

  // ── Setup wizard ──
  openSetupBtn.addEventListener('click', () => {
    mainPanel.classList.add('hidden');
    setupPanel.classList.remove('hidden');
  });

  setupBackBtn.addEventListener('click', () => {
    setupPanel.classList.add('hidden');
    mainPanel.classList.remove('hidden');
  });

  function updateSetupProgress() {
    prog1.classList.toggle('done', setupStep >= 1);
    prog2.classList.toggle('done', setupStep >= 2);
    prog3.classList.toggle('done', setupStep >= 3);
    step1.classList.toggle('active', setupStep === 1);
    step1.classList.toggle('done', setupStep > 1);
    step2.classList.toggle('active', setupStep === 2);
    step2.classList.toggle('done', setupStep > 2);
    step3.classList.toggle('active', setupStep === 3);
    step3.classList.toggle('done', setupStep > 3);
  }

  // Quick health check used by wizard (shorter timeout, returns boolean)
  async function quickHealthCheck() {
    try {
      const { backend } = await chrome.storage.sync.get({ backend: DEFAULT_BACKEND });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const r = await fetch(`${backend}/health`, { method: 'GET', signal: ctrl.signal });
      clearTimeout(timer);
      return r.ok;
    } catch {
      return false;
    }
  }

  checkNodeBtn.addEventListener('click', async () => {
    checkNodeBtn.textContent = 'Checking...';
    checkNodeBtn.disabled = true;
    // We can't directly check if Node is installed from the extension,
    // but if backend is already running, Node is obviously there.
    const healthy = await quickHealthCheck();
    checkNodeBtn.disabled = false;
    checkNodeBtn.textContent = 'I have Node.js, check again';
    if (healthy) {
      setupStep = 3;
      updateSetupProgress();
    } else {
      // Can't verify Node directly, so just advance to step 2 on trust
      setupStep = 2;
      updateSetupProgress();
    }
  });

  checkBackendBtn.addEventListener('click', async () => {
    checkBackendBtn.textContent = 'Checking...';
    checkBackendBtn.disabled = true;
    const healthy = await quickHealthCheck();
    checkBackendBtn.disabled = false;
    checkBackendBtn.textContent = 'Backend is running, check';
    if (healthy) {
      setupStep = 3;
      updateSetupProgress();
      // Also update main view status
      checkHealth();
    } else {
      checkBackendBtn.textContent = 'Not detected, try again';
      setTimeout(() => (checkBackendBtn.textContent = 'Backend is running, check'), 2000);
    }
  });

  finishSetupBtn.addEventListener('click', () => {
    setupPanel.classList.add('hidden');
    mainPanel.classList.remove('hidden');
    chrome.storage.local.set({ setupCompleted: true });
  });

  updateSetupProgress();

  // ── Style editor ──
  const COLOR_FIELDS = [
    { key: 'background', label: 'Background' },
    { key: 'borderColor', label: 'Border' },
    { key: 'labelColor', label: 'Label text' },
    { key: 'valuePositive', label: 'Hold (good)' },
    { key: 'valueWarning', label: 'Hold (warn)' },
    { key: 'valueNegative', label: 'Hold (bad)' },
    { key: 'valueTextColor', label: 'Med value text' },
    { key: 'periodColor', label: 'Period text' },
    { key: 'mutedColor', label: 'Muted text' },
    { key: 'closeColor', label: 'Close button' },
    { key: 'closeHoverColor', label: 'Close hover' },
    { key: 'xButtonColor', label: 'X-search button' },
  ];

  const LAYOUT_FIELDS = [
    { key: 'paddingX', label: 'Padding X', unit: 'px' },
    { key: 'paddingY', label: 'Padding Y', unit: 'px' },
    { key: 'borderWidth', label: 'Border width', unit: 'px' },
    { key: 'borderLeftWidth', label: 'Left accent width', unit: 'px' },
    { key: 'borderRadiusTopLeft', label: 'Radius top-left', unit: 'px' },
    { key: 'borderRadiusTopRight', label: 'Radius top-right', unit: 'px' },
    { key: 'borderRadiusBottomRight', label: 'Radius bottom-right', unit: 'px' },
    { key: 'borderRadiusBottomLeft', label: 'Radius bottom-left', unit: 'px' },
    { key: 'offsetX', label: 'Offset X', unit: 'px' },
  ];

  const TYPO_FIELDS = [
    { key: 'fontFamily', label: 'Font family', type: 'text' },
    { key: 'labelSize', label: 'Label size', unit: 'px' },
    { key: 'valueSize', label: 'Value size', unit: 'px' },
    { key: 'periodSize', label: 'Period size', unit: 'px' },
    { key: 'mutedSize', label: 'Muted size', unit: 'px' },
    { key: 'lineHeight', label: 'Line height' },
    { key: 'labelLetterSpacing', label: 'Label spacing', unit: 'px' },
    { key: 'periodLetterSpacing', label: 'Period spacing', unit: 'px' },
  ];

  const EFFECT_FIELDS = [
    { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.05 },
    { key: 'shadowX', label: 'Shadow X', unit: 'px' },
    { key: 'shadowY', label: 'Shadow Y', unit: 'px' },
    { key: 'shadowBlur', label: 'Shadow blur', unit: 'px' },
    { key: 'shadowSpread', label: 'Shadow spread', unit: 'px' },
    { key: 'shadowOpacity', label: 'Shadow opacity', min: 0, max: 1, step: 0.05 },
    { key: 'glowColor', label: 'Glow color' },
    { key: 'glowOpacity', label: 'Glow opacity', min: 0, max: 1, step: 0.05 },
    { key: 'borderOpacity', label: 'Border opacity', min: 0, max: 1, step: 0.05 },
    { key: 'valueGlow', label: 'Value text glow', min: 0, max: 1, step: 0.05 },
  ];

  function createControlRow(field) {
    const row = document.createElement('div');
    row.className = 'control-row';
    const label = document.createElement('span');
    label.className = 'control-label';
    label.textContent = field.label;
    row.appendChild(label);

    let input;
    if (field.type === 'text' || field.key === 'fontFamily') {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'control-input';
      input.value = liveConfig[field.key] || '';
      input.addEventListener('input', () => {
        liveConfig[field.key] = input.value;
        updatePreview();
      });
    } else if (
      field.key.toLowerCase().includes('color') ||
      field.key === 'background' ||
      field.key === 'borderColor' ||
      field.key === 'glowColor'
    ) {
      input = document.createElement('input');
      input.type = 'color';
      input.className = 'control-input';
      input.value = wallioStyle.normalizeHex(liveConfig[field.key]);
      input.addEventListener('input', () => {
        liveConfig[field.key] = input.value;
        updatePreview();
      });
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'control-input';
      input.value = liveConfig[field.key];
      input.addEventListener('input', () => {
        const v = input.value.trim();
        if (v === '') return;
        const num = parseFloat(v);
        if (!Number.isNaN(num)) liveConfig[field.key] = num;
        updatePreview();
      });
    }

    row.appendChild(input);
    return { row, input };
  }

  function renderControls() {
    styleControls.innerHTML = '';

    const colors = document.createElement('div');
    colors.className = 'control-group';
    COLOR_FIELDS.forEach((f) => colors.appendChild(createControlRow(f).row));
    styleControls.appendChild(colors);

    const layoutLabel = document.createElement('div');
    layoutLabel.className = 'section-label';
    layoutLabel.style.marginTop = '12px';
    layoutLabel.textContent = 'Layout';
    styleControls.appendChild(layoutLabel);
    const layout = document.createElement('div');
    layout.className = 'control-group';
    LAYOUT_FIELDS.forEach((f) => layout.appendChild(createControlRow(f).row));
    styleControls.appendChild(layout);

    const typoLabel = document.createElement('div');
    typoLabel.className = 'section-label';
    typoLabel.style.marginTop = '12px';
    typoLabel.textContent = 'Typography';
    styleControls.appendChild(typoLabel);
    const typo = document.createElement('div');
    typo.className = 'control-group';
    TYPO_FIELDS.forEach((f) => typo.appendChild(createControlRow(f).row));
    styleControls.appendChild(typo);

    const effectsLabel = document.createElement('div');
    effectsLabel.className = 'section-label';
    effectsLabel.style.marginTop = '12px';
    effectsLabel.textContent = 'Effects';
    styleControls.appendChild(effectsLabel);
    const effects = document.createElement('div');
    effects.className = 'control-group';
    EFFECT_FIELDS.forEach((f) => effects.appendChild(createControlRow(f).row));
    styleControls.appendChild(effects);
  }

  function renderPreviewBadge() {
    const css = wallioStyle.generateStyleCSS(liveConfig);
    let styleEl = document.getElementById('wallio-popup-preview-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'wallio-popup-preview-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css + '\n#stylePreview .wallio-tooltip { position: relative !important; display: inline-block !important; }';

    stylePreview.innerHTML = `
      <div class="wallio-tooltip">
        <span class="wallio-close">\u00d7</span>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="tt-label">\u23F1 HOLDING PERIOD</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <span style="font-size:9px;color:#555;font-weight:600;letter-spacing:0.5px;">\u25C9 SOL</span>
            <span class="tt-period">${currentPeriod.toUpperCase()}</span>
          </div>
        </div>
        <span class="tt-val tt-green">2d 4h</span>
        <div class="tt-vdivider"></div>
        <div class="tt-med">med <b>1d 8h</b></div>
        <a class="tt-xbtn" href="#" title="Search this wallet on X">SEARCH ON X ↗</a>
      </div>
    `;
  }

  function updatePreview() {
    renderPreviewBadge();
  }

  function renderPresetRow() {
    Array.from(presetRow.querySelectorAll('.preset-chip')).forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.preset === activePresetName);
    });
  }

  function loadStyleState() {
    chrome.storage.sync.get({ badgeStyle: null, customBadgePresets: {}, activeBadgePreset: 'Default' }, (data) => {
      savedConfig = data.badgeStyle ? wallioStyle.mergeWithDefaults(data.badgeStyle) : wallioStyle.mergeWithDefaults({});
      customPresets = data.customBadgePresets || {};
      liveConfig = wallioStyle.mergeWithDefaults(savedConfig);
      activePresetName = data.activeBadgePreset || 'Default';

      // Rebuild preset chips with custom presets
      presetRow.innerHTML = '';
      Object.keys(wallioStyle.BUILT_IN_PRESETS).forEach((name) => {
        const chip = document.createElement('span');
        chip.className = 'preset-chip';
        chip.dataset.preset = name;
        chip.textContent = name;
        chip.addEventListener('click', () => selectPreset(name));
        presetRow.appendChild(chip);
      });
      Object.keys(customPresets).forEach((name) => {
        const chip = document.createElement('span');
        chip.className = 'preset-chip custom';
        chip.dataset.preset = name;
        chip.dataset.custom = 'true';
        chip.textContent = name;
        chip.addEventListener('click', () => selectPreset(name, true));
        presetRow.appendChild(chip);
      });
      renderPresetRow();
      renderControls();
      renderPreviewBadge();
    });
  }

  function selectPreset(name, isCustom = false) {
    activePresetName = name;
    if (isCustom) {
      liveConfig = wallioStyle.mergeWithDefaults(customPresets[name]);
    } else {
      liveConfig = wallioStyle.getPreset(name, customPresets);
    }
    renderControls();
    renderPresetRow();
    updatePreview();
    // Picking a preset is a discrete, infrequent action (unlike dragging a
    // color/slider control) — apply it immediately so it's live on the real
    // page right away, and remember it so reopening the popup shows this
    // preset selected instead of always falling back to Default.
    chrome.storage.sync.set({ badgeStyle: liveConfig, activeBadgePreset: name });
  }

  savePresetBtn.addEventListener('click', () => {
    const name = customPresetName.value.trim();
    if (!name) return;
    customPresets[name] = wallioStyle.mergeWithDefaults(liveConfig);
    activePresetName = name;
    chrome.storage.sync.set({
      customBadgePresets: customPresets,
      badgeStyle: liveConfig,
      activeBadgePreset: name,
    }, () => {
      customPresetName.value = '';
      loadStyleState();
    });
  });

  resetStyleBtn.addEventListener('click', () => {
    liveConfig = wallioStyle.mergeWithDefaults({});
    activePresetName = 'Default';
    renderControls();
    renderPresetRow();
    updatePreview();
    chrome.storage.sync.set({ badgeStyle: liveConfig, activeBadgePreset: 'Default' });
  });

  applyStyleBtn.addEventListener('click', () => {
    chrome.storage.sync.set({ badgeStyle: liveConfig, activeBadgePreset: activePresetName }, () => {
      applyStyleBtn.textContent = 'SAVED';
      setTimeout(() => (applyStyleBtn.textContent = 'Apply'), 800);
    });
  });
});