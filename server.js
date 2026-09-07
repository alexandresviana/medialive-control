import express from "express";
import basicAuth from "express-basic-auth";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

import {
  MediaLiveClient,
  ListChannelsCommand,
  DescribeChannelCommand,
  StartChannelCommand,
  StopChannelCommand,
} from "@aws-sdk/client-medialive";
import { formatDurationMs } from "./lib/alertCatalog.js";
import { listEvents } from "./lib/eventStore.js";
import { syncChannelAlerts } from "./lib/syncAlerts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const REGION = process.env.AWS_REGION || "eu-central-1"; // Frankfurt como padrao

// O SDK resolve as credenciais automaticamente nesta ordem:
// 1) variaveis de ambiente (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
// 2) ~/.aws/credentials (perfil)
// 3) IAM Role da instancia/container (RECOMENDADO em producao)
const mediaLive = new MediaLiveClient({ region: REGION });

const app = express();
app.use(express.json());

// --- Protecao do painel -----------------------------------------------------
// Iniciar/parar um canal mexe em transmissao ao vivo e gera custo.
// O painel NUNCA deve ficar aberto. Aqui usamos Basic Auth simples;
// em producao prefira colocar atras de um proxy com SSO/OAuth ou VPN.
const PANEL_USER = process.env.PANEL_USER || "admin";
const PANEL_PASS = process.env.PANEL_PASS;

if (PANEL_PASS) {
  app.use(
    basicAuth({
      users: { [PANEL_USER]: PANEL_PASS },
      challenge: true,
      realm: "MediaLive Control",
    })
  );
} else {
  console.warn(
    "\x1b[33m[AVISO] PANEL_PASS nao definido — o painel esta SEM autenticacao. " +
      "Defina PANEL_USER/PANEL_PASS no .env antes de expor publicamente.\x1b[0m"
  );
}

// --- API --------------------------------------------------------------------

// Lista os canais com o estado atual
app.get("/api/channels", async (_req, res) => {
  try {
    const out = await mediaLive.send(new ListChannelsCommand({}));
    const channels = (out.Channels || []).map((c) => ({
      id: c.Id,
      name: c.Name,
      state: c.State, // IDLE | STARTING | RUNNING | STOPPING | RECOVERING | ...
      pipelinesRunning: c.PipelinesRunningCount,
      class: c.ChannelClass, // STANDARD | SINGLE_PIPELINE
    }));
    res.json({ region: REGION, channels });
  } catch (err) {
    console.error("ListChannels:", err);
    res.status(500).json({ error: err.name, message: err.message });
  }
});

// Detalhe de um canal (usado pelo polling apos start/stop)
app.get("/api/channels/:id", async (req, res) => {
  try {
    const out = await mediaLive.send(
      new DescribeChannelCommand({ ChannelId: req.params.id })
    );
    res.json({ id: out.Id, name: out.Name, state: out.State });
  } catch (err) {
    res.status(500).json({ error: err.name, message: err.message });
  }
});

// Inicia um canal — so faz sentido se estiver IDLE
app.post("/api/channels/:id/start", async (req, res) => {
  try {
    const out = await mediaLive.send(
      new StartChannelCommand({ ChannelId: req.params.id })
    );
    res.json({ id: out.Id, state: out.State });
  } catch (err) {
    console.error("StartChannel:", err);
    res.status(409).json({ error: err.name, message: err.message });
  }
});

// Para um canal — so faz sentido se estiver RUNNING
app.post("/api/channels/:id/stop", async (req, res) => {
  try {
    const out = await mediaLive.send(
      new StopChannelCommand({ ChannelId: req.params.id })
    );
    res.json({ id: out.Id, state: out.State });
  } catch (err) {
    console.error("StopChannel:", err);
    res.status(409).json({ error: err.name, message: err.message });
  }
});

// Registro de ocorrencias (black/freeze/desconexao/silencio) com inicio e fim
app.get("/api/channels/:id/events", async (req, res) => {
  try {
    const channelId = req.params.id;
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    await syncChannelAlerts(mediaLive, channelId);
    const events = await listEvents(channelId, { limit });

    res.json({
      channelId,
      events: events.map((ev) => ({
        ...ev,
        duration:
          ev.endedAt && ev.startedAt
            ? formatDurationMs(Date.parse(ev.endedAt) - Date.parse(ev.startedAt))
            : null,
      })),
    });
  } catch (err) {
    console.error("ListEvents:", err);
    res.status(500).json({ error: err.name, message: err.message });
  }
});

// --- Frontend estatico ------------------------------------------------------
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`MediaLive Control rodando em http://localhost:${PORT}`);
  console.log(`Regiao AWS: ${REGION}`);
});
