/**
 * Template: feedbackPendingAdmin — ADR-018 + ADR-019
 *
 * Notificação ao admin quando um feedback foi triado por IA e aguarda
 * revisão/aprovação manual (status = 'pending_admin').
 *
 * LGPD: parâmetros incluem apenas metadados de feedback (título, ID, resumo de IA).
 * NUNCA incluir dados clínicos: stamps, relações, notas, ciclo.
 *
 * Restrição clínica: nenhum termo fértil/infértil/seguro/inseguro pode aparecer aqui.
 */

export interface FeedbackPendingAdminParams {
  feedbackId: string;
  feedbackTitle: string;
  category: string;
  authorRole: string;
  triageType: string;
  triageImpact: string;
  triageSummary: string;
  triageRoadmap: string;
  triageAgents: string;
  triageSkills: string;
  triageCosts: string;
  adminPanelUrl: string;
}

export function feedbackPendingAdminHtml(
  params: FeedbackPendingAdminParams,
): string {
  const {
    feedbackId,
    feedbackTitle,
    category,
    authorRole,
    triageType,
    triageImpact,
    triageSummary,
    triageRoadmap,
    triageAgents,
    triageSkills,
    triageCosts,
    adminPanelUrl,
  } = params;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Novo Feedback Aguarda Revisão — Billings Grafico</title>
</head>
<body style="font-family:system-ui,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:#16a34a;margin-bottom:4px;">Billings Grafico — Feedback para Revisão</h2>
  <p style="color:#6b7280;margin-top:0;font-size:14px;">Um novo feedback foi triado pela IA e aguarda sua aprovação.</p>

  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px;">
    <p style="margin:0 0 8px;"><strong>Título:</strong> ${escapeHtml(feedbackTitle)}</p>
    <p style="margin:0 0 8px;"><strong>Categoria:</strong> ${escapeHtml(category)}</p>
    <p style="margin:0 0 8px;"><strong>Tipo (IA):</strong> ${escapeHtml(triageType)}</p>
    <p style="margin:0;"><strong>Enviado por:</strong> ${escapeHtml(authorRole)}</p>
  </div>

  <h3 style="color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">Análise de IA</h3>

  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;width:40%;">Impacto</td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${escapeHtml(triageImpact)}</td>
    </tr>
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;">Resumo</td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${escapeHtml(triageSummary)}</td>
    </tr>
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;">Roadmap</td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${escapeHtml(triageRoadmap)}</td>
    </tr>
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;">Agentes</td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${escapeHtml(triageAgents)}</td>
    </tr>
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;">Skills</td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${escapeHtml(triageSkills)}</td>
    </tr>
    <tr>
      <td style="padding:8px 0;font-weight:600;">Custo Estimado</td>
      <td style="padding:8px 0;">${escapeHtml(triageCosts)}</td>
    </tr>
  </table>

  <div style="text-align:center;margin:32px 0;">
    <a href="${escapeHtml(adminPanelUrl)}"
       style="background:#16a34a;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block;">
      Revisar Feedback no Painel Admin
    </a>
  </div>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <p style="font-size:12px;color:#9ca3af;margin:0;">
    ID do Feedback: ${escapeHtml(feedbackId)}<br>
    Billings Grafico — Sistema de Feedback Comunitário
  </p>
</body>
</html>`;
}

export function feedbackPendingAdminText(
  params: FeedbackPendingAdminParams,
): string {
  return `Billings Grafico — Novo Feedback para Revisão

Título: ${params.feedbackTitle}
Categoria: ${params.category} | Tipo (IA): ${params.triageType}
Enviado por: ${params.authorRole}

ANÁLISE DE IA
Impacto: ${params.triageImpact}
Resumo: ${params.triageSummary}
Roadmap: ${params.triageRoadmap}
Agentes: ${params.triageAgents}
Skills: ${params.triageSkills}
Custo Estimado: ${params.triageCosts}

Revisar em: ${params.adminPanelUrl}

ID: ${params.feedbackId}`;
}

/** Escapes HTML special characters to prevent XSS in email templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
