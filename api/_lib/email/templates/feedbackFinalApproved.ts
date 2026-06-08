/**
 * Template: feedbackFinalApproved — ADR-018 + ADR-019
 *
 * Notificação formal ao usuário autor do feedback quando o admin confirma
 * que a feature foi deployada (status = 'final_approved').
 *
 * LGPD: parâmetros incluem apenas nome do usuário, título do feedback e
 * percentual de desconto. Nenhum dado clínico é incluído.
 *
 * Restrição clínica: nenhum termo fértil/infértil/seguro/inseguro pode aparecer aqui.
 */

export interface FeedbackFinalApprovedParams {
  userName: string;
  feedbackTitle: string;
  discountPercent: number;
}

export function feedbackFinalApprovedHtml(
  params: FeedbackFinalApprovedParams,
): string {
  const { userName, feedbackTitle, discountPercent } = params;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sua sugestão foi implementada — Billings Grafico</title>
</head>
<body style="font-family:system-ui,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:#16a34a;margin-bottom:4px;">Sua sugestão foi implementada!</h2>
  <p style="color:#6b7280;margin-top:0;font-size:14px;">Billings Grafico — Comunidade</p>

  <p>Olá, ${escapeHtml(userName)}!</p>

  <p>Temos o prazer de informar que a sua contribuição foi implementada no Billings Grafico:</p>

  <blockquote style="border-left:4px solid #16a34a;padding:12px 16px;margin:16px 0;background:#f0fdf4;border-radius:0 8px 8px 0;color:#166534;">
    <em>"${escapeHtml(feedbackTitle)}"</em>
  </blockquote>

  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:24px 0;">
    <p style="margin:0;font-size:16px;text-align:center;">
      Como agradecimento, você receberá
      <strong style="font-size:24px;color:#16a34a;display:block;margin-top:8px;">${discountPercent}% de desconto</strong>
      na sua próxima mensalidade.
    </p>
  </div>

  <p>Obrigado por ajudar a melhorar o app e por fazer parte da nossa comunidade!</p>

  <p>Com carinho,<br>
  <strong>Equipe Billings Grafico</strong></p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <p style="font-size:12px;color:#9ca3af;margin:0;">
    O desconto será aplicado automaticamente na próxima cobrança da sua assinatura.<br>
    Billings Grafico — noreply@billings.app
  </p>
</body>
</html>`;
}

export function feedbackFinalApprovedText(
  params: FeedbackFinalApprovedParams,
): string {
  return `Olá, ${params.userName}!

Sua sugestão foi implementada no Billings Grafico:

"${params.feedbackTitle}"

Como agradecimento, você receberá ${params.discountPercent}% de desconto na sua próxima mensalidade.

Obrigado por fazer parte da nossa comunidade!

Equipe Billings Grafico`;
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
