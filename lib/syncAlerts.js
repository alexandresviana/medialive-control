import { ListAlertsCommand } from "@aws-sdk/client-medialive";
import { normalizeAlert } from "./alertCatalog.js";
import { upsertAlerts } from "./eventStore.js";

async function fetchChannelAlerts(client, channelId) {
  const alerts = [];
  let nextToken;

  do {
    const out = await client.send(
      new ListAlertsCommand({
        ChannelId: channelId,
        StateFilter: "ALL",
        MaxResults: 100,
        NextToken: nextToken,
      })
    );
    alerts.push(...(out.Alerts || []));
    nextToken = out.NextToken;
  } while (nextToken);

  return alerts;
}

export async function syncChannelAlerts(client, channelId) {
  const raw = await fetchChannelAlerts(client, channelId);
  const normalized = raw
    .map((alert) => normalizeAlert(channelId, alert))
    .filter(Boolean);

  await upsertAlerts(channelId, normalized);
  return normalized.length;
}
