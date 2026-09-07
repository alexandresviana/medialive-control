/** Tipos MediaLive mapeados para categorias legíveis no painel. */

export const CATEGORY_META = {
  black: { label: "Vídeo preto", icon: "⬛" },
  freeze: { label: "Imagem congelada", icon: "🧊" },
  disconnect: { label: "Desconexão", icon: "📡" },
  silence: { label: "Silêncio no áudio", icon: "🔇" },
};

const SILENCE = new Set(["Audio Not Detected"]);

const BLACK = new Set(["Black Video Detected"]);

const FREEZE = new Set(["The MQCS score is low for this pipeline"]);

const DISCONNECT = new Set([
  "Video Not Detected",
  "Stopped Receiving UDP Input",
  "RTMP Server Disconnected",
  "RTMP Stream Not Found",
  "RTMP Has No Audio/Video",
  "RTMP Input Connect Failed",
  "Output Group is Paused",
  "Input Failed Over",
]);

export function categorizeAlertType(alertType) {
  if (!alertType) return null;
  if (BLACK.has(alertType)) return "black";
  if (SILENCE.has(alertType)) return "silence";
  if (FREEZE.has(alertType)) return "freeze";
  if (DISCONNECT.has(alertType)) return "disconnect";
  return null;
}

export function normalizeAlert(channelId, alert) {
  const category = categorizeAlertType(alert.AlertType);
  if (!category) return null;

  const meta = CATEGORY_META[category];
  const startedAt = alert.SetTimestamp?.toISOString?.() ?? null;
  if (!startedAt) return null;

  return {
    id: `${channelId}:${alert.Id}`,
    channelId,
    category,
    label: meta.label,
    icon: meta.icon,
    alertType: alert.AlertType,
    pipeline: alert.PipelineId ?? null,
    startedAt,
    endedAt: alert.ClearedTimestamp?.toISOString?.() ?? null,
    active: alert.State === "SET",
    message: alert.Message ?? null,
  };
}

export function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec} s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec ? `${min} min ${sec} s` : `${min} min`;
  const h = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin ? `${h} h ${remMin} min` : `${h} h`;
}
