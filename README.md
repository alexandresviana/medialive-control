# MediaLive Control

Painel web para **iniciar e parar canais do AWS Elemental MediaLive**.

Arquitetura segura: o **backend Node.js** guarda as credenciais AWS e fala com a
API do MediaLive. O **frontend** só conversa com o seu backend — nunca direto
com a AWS. As chaves nunca chegam ao navegador.

```
navegador  ──HTTP──>  backend Node/Express  ──AWS SDK──>  MediaLive
(só botões)           (credenciais aqui)                  (start/stop)
```

## Instalação

```bash
npm install
cp .env.example .env      # edite o .env
npm start                 # abre em http://localhost:3000
```

## Configuração (.env)

| Variável      | Para quê                                              |
|---------------|-------------------------------------------------------|
| `PORT`        | Porta do servidor web (padrão 3000)                   |
| `AWS_REGION`  | Região dos canais (ex.: `eu-central-1` Frankfurt)     |
| `PANEL_USER`  | Usuário do login do painel                            |
| `PANEL_PASS`  | Senha do painel — **defina antes de expor**           |

## Permissões AWS (IAM)

Crie uma policy mínima e anexe à Role/usuário que o servidor vai usar:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "medialive:ListChannels",
        "medialive:DescribeChannel",
        "medialive:StartChannel",
        "medialive:StopChannel"
      ],
      "Resource": "*"
    }
  ]
}
```

Como o SDK resolve as credenciais, em ordem:
1. Variáveis de ambiente (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`)
2. Perfil em `~/.aws/credentials`
3. **IAM Role da instância/container** — recomendado em produção (sem chaves no disco)

## Segurança — leia antes de publicar

- **Iniciar/parar canal afeta transmissão ao vivo e gera custo.** O painel jamais
  deve ficar aberto na internet sem proteção.
- O Basic Auth embutido é o mínimo. Para produção, coloque atrás de:
  - VPN / acesso interno, ou
  - um proxy reverso (Nginx/ALB) com SSO/OAuth, e
  - sempre HTTPS.
- A ação de **parar** exige confirmação na tela porque derruba o sinal ao vivo.

## Deploy sugerido

- **EC2/ECS pequeno** com a IAM Role anexada e Nginx na frente (HTTPS + auth).
- Ou empacotar como container (`node:20-slim`) e rodar no ECS Fargate.

## Estados do canal

`IDLE` (parado) · `STARTING` · `RUNNING` (ao vivo) · `STOPPING` · `RECOVERING`.
O botão **Iniciar** só habilita em `IDLE`; o **Parar** só em `RUNNING`.
