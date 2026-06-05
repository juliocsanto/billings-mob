/**
 * PrivacyPolicyPage — Public page, no authentication required.
 *
 * Renders the Billings Gráfico Privacy Policy in PT-BR or English based on
 * the current i18n language setting (react-i18next).
 *
 * Routes: /privacy (public, outside auth guard)
 * Sprint 6.10 — LGPD compliance + Google Play Store requirement.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { DS } from '../constants.js';

// ── PT-BR policy content ──────────────────────────────────────────────────────

function PrivacyPolicyPTBR() {
  return (
    <article lang="pt-BR">
      <h1 style={{ fontSize: 22, fontWeight: 700, color: DS.textMain, marginBottom: 4 }}>
        Política de Privacidade — Billings Gráfico
      </h1>
      <p style={{ fontSize: 12, color: DS.textSec, marginBottom: 28 }}>
        Versão 1.0 | Última atualização: 5 de junho de 2026
      </p>

      <Section title="1. QUEM SOMOS">
        <p>
          Billings Gráfico é um aplicativo de registro de ciclo para praticantes e instrutoras do
          Método Billings de Ovulação (MOB), desenvolvido por Júlio C. Santo. Contato:{' '}
          <a href="mailto:juliocsanto3@gmail.com" style={{ color: DS.primary }}>
            juliocsanto3@gmail.com
          </a>
        </p>
      </Section>

      <Section title="2. DADOS QUE COLETAMOS">
        <p>
          a) Dados de conta: endereço de e-mail, função (aluna ou instrutora)
          <br />
          b) Dados de ciclo: registros diários (data, carimbo de muco, tipo de muco, sensação
          corporal, sangramento, descrição livre), histórico de versões, dados de ciclo
          <br />
          c) Dados de vínculo: relação aluna–instrutora (IDs de usuário vinculados)
          <br />
          d) Dados técnicos: token de dispositivo para notificações push (se autorizado), logs de
          auditoria internos (sem dados clínicos), dados de erros anônimos (Sentry)
        </p>
        <p
          style={{
            background: DS.warningLight,
            border: `1px solid #FCD34D`,
            borderRadius: 8,
            padding: '10px 14px',
            marginTop: 12,
            fontSize: 13,
            color: DS.textMain,
            lineHeight: 1.7,
          }}
        >
          <strong>AVISO CLÍNICO:</strong> O aplicativo NÃO classifica automaticamente nenhum dia
          como fértil, infértil, seguro ou inseguro. Toda interpretação clínica é
          responsabilidade exclusiva da instrutora certificada.
        </p>
      </Section>

      <Section title="3. FINALIDADE DO TRATAMENTO">
        <p>
          Autenticar e manter sua sessão; registrar e exibir suas observações de ciclo; permitir
          que sua instrutora acesse e interprete seus dados; detectar e resolver conflitos de
          versão; enviar notificações configuradas por você; melhorar a segurança e estabilidade
          do serviço.
        </p>
      </Section>

      <Section title="4. BASE LEGAL (LGPD — Lei 13.709/2018)">
        <p>
          Dados de conta e técnicos: Art. 7°, inciso I — consentimento.
          <br />
          Dados de saúde (observações de ciclo): Art. 11°, inciso I — consentimento explícito para
          cuidados com a saúde reprodutiva.
          <br />
          Vínculo aluna–instrutora: Art. 7°, inciso V — execução de contrato.
        </p>
      </Section>

      <Section title="5. COMPARTILHAMENTO COM TERCEIROS">
        <p>
          Supabase Inc. — banco de dados e autenticação (Irlanda/EUA)
          <br />
          Vercel Inc. — hospedagem de aplicação e API (EUA)
          <br />
          Functional Software (Sentry) — monitoramento de erros (EUA)
          <br />
          Google LLC / Firebase — notificações push (EUA)
          <br />
          Não vendemos, alugamos nem compartilhamos seus dados com terceiros para fins de
          publicidade.
        </p>
      </Section>

      <Section title="6. RETENÇÃO DE DADOS">
        <p>
          Dados de ciclo retidos enquanto sua conta estiver ativa. Após solicitação de exclusão:
          excluídos em até 30 dias dos bancos ativos; logs de backup em até 90 dias. Logs de
          auditoria: retidos por até 1 ano para fins de segurança.
        </p>
      </Section>

      <Section title="7. SEUS DIREITOS (LGPD Art. 18°)">
        <p>
          Você pode: confirmar existência de tratamento; acessar seus dados; corrigir dados
          inexatos; solicitar anonimização, bloqueio ou eliminação; solicitar portabilidade;
          revogar consentimento; peticionar à ANPD.
          <br />
          Envie solicitações para:{' '}
          <a href="mailto:juliocsanto3@gmail.com" style={{ color: DS.primary }}>
            juliocsanto3@gmail.com
          </a>{' '}
          — resposta em até 15 dias úteis.
        </p>
      </Section>

      <Section title="8. DADOS DE SAÚDE">
        <p>
          Seus registros de ciclo são dados sensíveis (LGPD Art. 11°). Protegemos com: Row Level
          Security no banco de dados; acesso da instrutora limitado às alunas vinculadas; campos
          sensíveis nunca aparecem em logs; autenticação obrigatória em toda a API.
        </p>
      </Section>

      <Section title="9. ARMAZENAMENTO LOCAL">
        <p>
          Usamos localStorage para: manter sua sessão (token Supabase); preferência de idioma
          (billings_locale); cache offline (Service Worker). Não usamos cookies de rastreamento.
        </p>
      </Section>

      <Section title="10. SEGURANÇA">
        <p>
          HTTPS/TLS em todas as chamadas de API; autenticação JWT com expiração por inatividade
          (60 min); Row Level Security ativo; análise estática de código (CodeQL SAST) em
          produção.
        </p>
      </Section>

      <Section title="11. ALTERAÇÕES">
        <p>
          Notificaremos sobre mudanças materiais por e-mail ou notificação no app.
        </p>
      </Section>

      <Section title="12. CONTATO">
        <p>
          <a href="mailto:juliocsanto3@gmail.com" style={{ color: DS.primary }}>
            juliocsanto3@gmail.com
          </a>{' '}
          — resposta em até 15 dias úteis.
        </p>
      </Section>
    </article>
  );
}

// ── EN policy content ─────────────────────────────────────────────────────────

function PrivacyPolicyEN() {
  return (
    <article lang="en">
      <h1 style={{ fontSize: 22, fontWeight: 700, color: DS.textMain, marginBottom: 4 }}>
        Privacy Policy — Billings Gráfico
      </h1>
      <p style={{ fontSize: 12, color: DS.textSec, marginBottom: 28 }}>
        Version 1.0 | Last updated: June 5, 2026
      </p>

      <Section title="1. WHO WE ARE">
        <p>
          Billings Gráfico is a cycle-tracking application for students and instructors of the
          Billings Ovulation Method (BOM), developed by Júlio C. Santo. Contact:{' '}
          <a href="mailto:juliocsanto3@gmail.com" style={{ color: DS.primary }}>
            juliocsanto3@gmail.com
          </a>
        </p>
      </Section>

      <Section title="2. DATA WE COLLECT">
        <p>
          a) Account data: email address, role (student or instructor)
          <br />
          b) Cycle data: daily records (date, mucus stamp, mucus type, bodily sensation, bleeding,
          free-text description), version history, cycle data
          <br />
          c) Relationship data: student–instructor link (linked user IDs)
          <br />
          d) Technical data: device token for push notifications (if authorized), internal audit
          logs (no clinical data), anonymous error data (Sentry)
        </p>
        <p
          style={{
            background: DS.warningLight,
            border: `1px solid #FCD34D`,
            borderRadius: 8,
            padding: '10px 14px',
            marginTop: 12,
            fontSize: 13,
            color: DS.textMain,
            lineHeight: 1.7,
          }}
        >
          <strong>CLINICAL NOTICE:</strong> The application does NOT automatically classify any
          day as fertile, infertile, safe or unsafe. All clinical interpretation is the exclusive
          responsibility of the certified instructor.
        </p>
      </Section>

      <Section title="3. PURPOSE OF PROCESSING">
        <p>
          Authenticate and maintain your session; record and display your cycle observations;
          allow your instructor to access and interpret your data; detect and resolve version
          conflicts; send notifications you configured; improve service security and stability.
        </p>
      </Section>

      <Section title="4. LEGAL BASIS">
        <p>
          Account and technical data: Consent (LGPD Art. 7, I; GDPR Art. 6(1)(a)).
          <br />
          Health data (cycle observations): Explicit consent for reproductive health care (LGPD
          Art. 11, I; GDPR Art. 9(2)(a)).
          <br />
          Student–instructor link: Contract performance (LGPD Art. 7, V; GDPR Art. 6(1)(b)).
        </p>
      </Section>

      <Section title="5. THIRD-PARTY PROCESSORS">
        <p>
          Supabase Inc. — database and authentication (Ireland/US)
          <br />
          Vercel Inc. — application and API hosting (US)
          <br />
          Functional Software (Sentry) — error monitoring (US)
          <br />
          Google LLC / Firebase — push notifications (US)
          <br />
          We do not sell, rent, or share your data with third parties for advertising.
        </p>
      </Section>

      <Section title="6. DATA RETENTION">
        <p>
          Cycle data retained while your account is active. After deletion request: deleted within
          30 days from active databases; backup logs within 90 days. Audit logs: retained up to
          1 year for security.
        </p>
      </Section>

      <Section title="7. YOUR RIGHTS">
        <p>
          You may: confirm data processing exists; access your data; correct inaccurate data;
          request anonymization, blocking, or deletion; request portability; withdraw consent;
          lodge a complaint with the ANPD.
          <br />
          Send requests to:{' '}
          <a href="mailto:juliocsanto3@gmail.com" style={{ color: DS.primary }}>
            juliocsanto3@gmail.com
          </a>{' '}
          — response within 15 business days.
        </p>
      </Section>

      <Section title="8. HEALTH DATA">
        <p>
          Your cycle records are sensitive data (LGPD Art. 11). We protect them with: Row Level
          Security in the database; instructor access limited to linked students; sensitive fields
          never appear in logs; authentication required for all API access.
        </p>
      </Section>

      <Section title="9. LOCAL STORAGE">
        <p>
          We use localStorage for: maintaining your session (Supabase token); language preference
          (billings_locale); offline cache (Service Worker). We do not use tracking cookies.
        </p>
      </Section>

      <Section title="10. SECURITY">
        <p>
          HTTPS/TLS on all API calls; JWT authentication with inactivity expiration (60 min); Row
          Level Security active; static code analysis (CodeQL SAST) in production.
        </p>
      </Section>

      <Section title="11. CHANGES">
        <p>
          We will notify users of material changes by email or in-app notification.
        </p>
      </Section>

      <Section title="12. CONTACT">
        <p>
          <a href="mailto:juliocsanto3@gmail.com" style={{ color: DS.primary }}>
            juliocsanto3@gmail.com
          </a>{' '}
          — response within 15 business days.
        </p>
      </Section>
    </article>
  );
}

// ── Section helper ────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: DS.textMain,
          marginBottom: 8,
          letterSpacing: '0.02em',
        }}
      >
        {title}
      </h2>
      <div
        style={{
          fontSize: 13,
          color: DS.textSec,
          lineHeight: 1.8,
        }}
      >
        {children}
      </div>
    </section>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export function PrivacyPolicyPage() {
  const { i18n } = useTranslation();
  const isPTBR = i18n.language.startsWith('pt');

  const backLabel = isPTBR ? '← Voltar' : '← Back';

  return (
    <div
      style={{
        background: DS.bg,
        minHeight: '100vh',
        fontFamily: 'Lato, sans-serif',
        color: DS.textMain,
      }}
    >
      {/* Back navigation */}
      <div
        style={{
          background: DS.surface,
          borderBottom: `1px solid ${DS.border}`,
          padding: '14px 22px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <a
          href="/"
          style={{
            fontSize: 14,
            color: DS.primary,
            textDecoration: 'none',
            fontWeight: 600,
            display: 'inline-block',
          }}
          onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
        >
          {backLabel}
        </a>
      </div>

      {/* Policy content */}
      <div
        style={{
          maxWidth: 680,
          margin: '0 auto',
          padding: '32px 22px 80px',
        }}
      >
        {isPTBR ? <PrivacyPolicyPTBR /> : <PrivacyPolicyEN />}
      </div>
    </div>
  );
}

export default PrivacyPolicyPage;
