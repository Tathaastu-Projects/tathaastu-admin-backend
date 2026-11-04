const VIDEO_SPEED_SLUG = "site-video-speed";

const PRESETS = {
  slow: { id: "slow", label: "Slow", rate: 0.75 },
  normal: { id: "normal", label: "Normal", rate: 1 },
  fast: { id: "fast", label: "Fast", rate: 1.5 },
  "very-fast": { id: "very-fast", label: "Very fast", rate: 2 },
};

const DEFAULT = {
  preset: "normal",
  rate: 1,
};

function clampRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT.rate;
  return Math.min(2.5, Math.max(0.25, Math.round(n * 100) / 100));
}

function parseVideoSpeed(raw) {
  if (!raw) return { ...DEFAULT };
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || typeof data !== "object") return { ...DEFAULT };

    const presetKey = String(data.preset || "").trim().toLowerCase();
    if (PRESETS[presetKey]) {
      return {
        preset: PRESETS[presetKey].id,
        rate: PRESETS[presetKey].rate,
      };
    }

    const rate = clampRate(data.rate);
    const matched = Object.values(PRESETS).find((p) => p.rate === rate);
    return {
      preset: matched?.id || "custom",
      rate,
    };
  } catch (_error) {
    return { ...DEFAULT };
  }
}

function serializeVideoSpeed(body) {
  const presetKey = String(body?.preset || "").trim().toLowerCase();
  if (presetKey === "custom") {
    return JSON.stringify({
      preset: "custom",
      rate: clampRate(body?.rate),
    });
  }
  if (PRESETS[presetKey]) {
    return JSON.stringify({
      preset: PRESETS[presetKey].id,
      rate: PRESETS[presetKey].rate,
    });
  }
  const rate = clampRate(body?.rate);
  const matched = Object.values(PRESETS).find((p) => p.rate === rate);
  return JSON.stringify({
    preset: matched?.id || "custom",
    rate,
  });
}

module.exports = {
  VIDEO_SPEED_SLUG,
  PRESETS,
  DEFAULT,
  parseVideoSpeed,
  serializeVideoSpeed,
  clampRate,
};
