# Billings Gráfico — MOB PWA

App de registro do Método de Ovulação Billings (MOB).

🌐 **Site público:** https://juliocsanto.github.io/billings-mob/

---

## Deploy em 5 passos

### Pré-requisitos
- Node.js 18+ instalado
- Conta GitHub: `juliocsanto`
- Git configurado localmente

### 1. Clone ou crie o repositório

```bash
# Opção A: criar do zero
git init billings-mob && cd billings-mob
# copie todos estes arquivos para dentro

# Opção B: se já criou o repo no GitHub
git clone https://github.com/juliocsanto/billings-mob.git
cd billings-mob
# copie todos estes arquivos para dentro
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Teste localmente

```bash
npm run dev
# Acesse http://localhost:5173/billings-mob/
```

### 4. Publique no GitHub Pages (método automático — GitHub Actions)

```bash
git add .
git commit -m "feat: billings mob mvp"
git push origin main
```

Depois, no GitHub:
- Vá em **Settings → Pages**
- Em **Source**, selecione **GitHub Actions**
- O deploy acontece automaticamente a cada push para `main`

### 5. (Alternativa) Deploy manual com gh-pages

```bash
npm run deploy
```

---

## Funcionalidades

| Feature | Status |
|---|---|
| Registro diário (selos Billings) | ✅ |
| Gráfico horizontal CENPLAFAM | ✅ |
| Histórico de ciclos | ✅ |
| Relações íntimas (♥) | ✅ |
| Export PDF formato CENPLAFAM | ✅ |
| Lembrete diário (.ics) | ✅ |
| Análise de padrões (clínica) | ✅ |
| Guia IA (requer API key) | ✅ |
| Associação instrutora por e-mail | ✅ |
| Compartilhamento via WhatsApp | ✅ |

---

## Configuração do Guia IA

1. Obtenha uma API key em https://console.anthropic.com
2. No app, vá em **Perfil → Guia IA**
3. Insira sua chave `sk-ant-...` e salve
4. A chave fica salva apenas no seu dispositivo (localStorage)

---

## Stack

- **React 18** + **Vite 5**
- **@react-pdf/renderer 4.5.1** — PDF CENPLAFAM
- **vite-plugin-node-polyfills** — compatibilidade browser
- **gh-pages** — deploy alternativo
- **ICS manual** — RFC 5545, sem dependência

---

## Aviso legal

Este app é uma ferramenta de registro. A interpretação clínica do ciclo é responsabilidade exclusiva da instrutora credenciada CENPLAFAM/WOOMB. O app não deverá ser usado por pessoas que não tenham conhecimento do Método de Ovulação Billings — para isso, procure uma instrutora oficial ou a CENPLAFAM – WOOMB BRASIL.
