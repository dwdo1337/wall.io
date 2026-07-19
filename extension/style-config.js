// extension/style-config.js — shared badge style config, presets, and CSS generator
(function (root) {
  const DEFAULT_STYLE = {
    // Layout
    paddingX: 18,
    paddingY: 16,
    borderRadiusTopLeft: 6,
    borderRadiusTopRight: 6,
    borderRadiusBottomRight: 6,
    borderRadiusBottomLeft: 6,
    borderWidth: 1,
    borderLeftWidth: 3,
    offsetX: 8,

    // Colors
    background: '#0a0a0a',
    borderColor: '#00ff88',
    borderOpacity: 0.3,
    labelColor: '#888888',
    valuePositive: '#00ff88',
    valueWarning: '#fbbf24',
    valueNegative: '#ff5555',
    periodColor: '#4a9eff',
    mutedColor: '#b0b0b0',
    valueTextColor: '#c8c8c8',
    closeColor: '#888888',
    closeHoverBg: 'rgba(255, 85, 85, 0.25)',
    closeHoverColor: '#ff8080',
    xButtonColor: '#1d9bf0',
    xButtonBg: 'rgba(29, 155, 240, 0.08)',
    xButtonBorder: 'rgba(29, 155, 240, 0.25)',

    // Typography
    fontFamily: "'Roboto Mono', 'SF Mono', Consolas, Menlo, monospace",
    labelSize: 10,
    valueSize: 26,
    periodSize: 10,
    mutedSize: 12,
    lineHeight: 1.4,
    labelLetterSpacing: 1,
    periodLetterSpacing: 0.5,

    // Effects
    opacity: 1,
    shadowX: 0,
    shadowY: 4,
    shadowBlur: 20,
    shadowSpread: 0,
    shadowColor: '#000000',
    shadowOpacity: 0.85,
    glowColor: '#00ff88',
    glowOpacity: 0.15,
    valueGlow: 0.3,
  };

  const BUILT_IN_PRESETS = {
    Default: structuredClone ? structuredClone(DEFAULT_STYLE) : JSON.parse(JSON.stringify(DEFAULT_STYLE)),
    Neon: {
      ...base(DEFAULT_STYLE),
      background: '#050505',
      borderColor: '#00ff88',
      borderOpacity: 0.5,
      borderLeftWidth: 3,
      glowOpacity: 0.35,
      shadowBlur: 28,
      shadowOpacity: 0.95,
      labelColor: '#4a6b4a',
      valuePositive: '#39ff14',
      valueWarning: '#ffff00',
      valueNegative: '#ff1a1a',
    },
    Stealth: {
      ...base(DEFAULT_STYLE),
      background: 'rgba(10, 12, 11, 0.72)',
      borderColor: '#333333',
      borderOpacity: 0.35,
      borderLeftWidth: 1,
      glowOpacity: 0,
      shadowBlur: 12,
      shadowOpacity: 0.6,
      labelColor: '#555555',
      valuePositive: '#66bb6a',
      valueWarning: '#ffca28',
      valueNegative: '#ef5350',
      periodColor: '#78909c',
      closeColor: '#666666',
    },
    Crimson: {
      ...base(DEFAULT_STYLE),
      background: '#120505',
      borderColor: '#ff3333',
      borderOpacity: 0.35,
      borderLeftWidth: 2,
      glowColor: '#ff3333',
      glowOpacity: 0.18,
      labelColor: '#6b4a4a',
      valuePositive: '#ff5555',
      valueWarning: '#ff9800',
      valueNegative: '#c62828',
      periodColor: '#ff8a80',
      closeHoverBg: 'rgba(255, 50, 50, 0.35)',
      closeHoverColor: '#ffaaaa',
    },
    Ocean: {
      ...base(DEFAULT_STYLE),
      background: '#050a12',
      borderColor: '#00d4ff',
      borderOpacity: 0.3,
      borderLeftWidth: 2,
      glowColor: '#00d4ff',
      glowOpacity: 0.16,
      labelColor: '#4a6a7a',
      valuePositive: '#00e5ff',
      valueWarning: '#ffd54f',
      valueNegative: '#ff5252',
      periodColor: '#82b1ff',
      closeHoverBg: 'rgba(0, 212, 255, 0.25)',
      closeHoverColor: '#aaddff',
    },
  };

  function base(def) {
    return structuredClone ? structuredClone(def) : JSON.parse(JSON.stringify(def));
  }

  function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(0,0,0,${alpha ?? 1})`;
    if (hex.startsWith('rgba(') || hex.startsWith('rgb(')) return hex;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const num = parseInt(c, 16);
    if (Number.isNaN(num)) return `rgba(0,0,0,${alpha ?? 1})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha ?? 1})`;
  }

  function normalizeHex(str) {
    if (!str) return '#000000';
    if (str.startsWith('#')) return str;
    if (str.startsWith('rgba(')) {
      const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) return '#000000';
      return '#' + [m[1], m[2], m[3]].map((x) => {
        const hex = Math.max(0, Math.min(255, parseInt(x, 10))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
    }
    return '#000000';
  }

  function generateStyleCSS(config) {
    const borderColor = hexToRgba(config.borderColor, config.borderOpacity);
    const glow = hexToRgba(config.glowColor, config.glowOpacity);
    const shadow = hexToRgba(config.shadowColor, config.shadowOpacity);

    return `
      .wallio-tooltip {
        position: fixed !important;
        z-index: 2147483647 !important;
        padding: ${config.paddingY}px ${config.paddingX}px !important;
        background: ${config.background} !important;
        border: ${config.borderWidth}px solid ${borderColor} !important;
        border-left: ${config.borderLeftWidth}px solid ${config.borderColor} !important;
        font-family: ${config.fontFamily} !important;
        font-size: ${config.mutedSize}px !important;
        font-weight: 500 !important;
        line-height: ${config.lineHeight} !important;
        min-width: 220px !important;
        pointer-events: auto !important;
        user-select: none !important;
        opacity: ${config.opacity} !important;
        box-shadow: ${config.shadowX}px ${config.shadowY}px ${config.shadowBlur}px ${config.shadowSpread}px ${shadow}, 0 0 12px ${glow} !important;
        border-radius: ${config.borderRadiusTopLeft}px ${config.borderRadiusTopRight}px ${config.borderRadiusBottomRight}px ${config.borderRadiusBottomLeft}px !important;
      }

      .wallio-tooltip .tt-label {
        font-size: ${config.labelSize}px !important;
        color: ${config.labelColor} !important;
        text-transform: uppercase !important;
        letter-spacing: ${config.labelLetterSpacing}px !important;
        font-weight: 600 !important;
      }

      .wallio-tooltip .tt-val {
        display: block !important;
        font-size: ${config.valueSize}px !important;
        font-weight: 700 !important;
        text-align: center !important;
        margin: 8px 0 2px !important;
        text-shadow: 0 0 ${Math.round(config.valueSize * 0.3)}px ${hexToRgba(config.valuePositive, config.valueGlow || 0.3)} !important;
      }

      .wallio-tooltip .tt-vdivider {
        height: 2px !important;
        width: 80% !important;
        margin: 4px auto 6px !important;
        background: ${config.borderColor} !important;
        opacity: 0.5 !important;
      }

      .wallio-tooltip .tt-med {
        font-size: ${config.mutedSize}px !important;
        color: ${config.mutedColor} !important;
        font-weight: 500 !important;
        text-align: center !important;
      }
      .wallio-tooltip .tt-med b {
        color: ${config.valueTextColor} !important;
        font-weight: 600 !important;
      }

      .wallio-tooltip .tt-xbtn {
        display: block !important;
        margin-top: 10px !important;
        padding: 6px 8px !important;
        color: ${config.xButtonColor} !important;
        background: ${config.xButtonBg} !important;
        border: 1px solid ${config.xButtonBorder} !important;
        border-radius: 4px !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        letter-spacing: 0.5px !important;
        text-align: center !important;
        cursor: pointer !important;
        user-select: none !important;
        text-decoration: none !important;
        transition: background 0.15s ease !important;
      }
      .wallio-tooltip .tt-xbtn:hover {
        background: ${hexToRgba(config.xButtonColor, 0.18)} !important;
        border-color: ${hexToRgba(config.xButtonColor, 0.5)} !important;
      }

      .wallio-tooltip .tt-muted {
        color: ${config.mutedColor} !important;
        font-size: ${config.mutedSize}px !important;
      }

      .wallio-tooltip .wallio-close {
        position: absolute !important;
        top: 4px !important;
        right: 6px !important;
        width: 16px !important;
        height: 16px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 50% !important;
        background: rgba(255, 255, 255, 0.05) !important;
        color: ${config.closeColor} !important;
        font-size: 11px !important;
        line-height: 1 !important;
        cursor: pointer !important;
        user-select: none !important;
      }

      .wallio-tooltip .wallio-close:hover {
        background: ${config.closeHoverBg} !important;
        color: ${config.closeHoverColor} !important;
      }

      .wallio-tooltip .tt-green { color: ${config.valuePositive} !important; }
      .wallio-tooltip .tt-red { color: ${config.valueNegative} !important; }
      .wallio-tooltip .tt-yellow { color: ${config.valueWarning} !important; }

      .wallio-tooltip .tt-period {
        font-size: ${config.periodSize}px !important;
        color: ${config.periodColor} !important;
        text-transform: uppercase !important;
        letter-spacing: ${config.periodLetterSpacing}px !important;
        font-weight: 600 !important;
      }
    `;
  }

  function mergeWithDefaults(partial) {
    const out = base(DEFAULT_STYLE);
    if (!partial || typeof partial !== 'object') return out;
    for (const key of Object.keys(out)) {
      if (partial[key] !== undefined) out[key] = partial[key];
    }
    return out;
  }

  function getPreset(name, customPresets = {}) {
    if (BUILT_IN_PRESETS[name]) return base(BUILT_IN_PRESETS[name]);
    if (customPresets[name]) return mergeWithDefaults(customPresets[name]);
    return base(DEFAULT_STYLE);
  }

  root.wallioStyle = {
    DEFAULT_STYLE,
    BUILT_IN_PRESETS,
    generateStyleCSS,
    hexToRgba,
    normalizeHex,
    mergeWithDefaults,
    getPreset,
  };
})(typeof window !== 'undefined' ? window : globalThis);
