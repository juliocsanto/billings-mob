/**
 * FeedbackPage — página container do sistema de feedback comunitário (billings-mob).
 *
 * Gerencia estado de navegação entre lista e detalhe de feedback.
 * Requer sessão autenticada para exibir conteúdo.
 *
 * Restrição clínica: NUNCA exibe termos de classificação de ciclo.
 * LGPD: o campo `relations` nunca aparece aqui.
 * Usa inline styles (billings-mob não tem Tailwind).
 */

import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { FeedbackList } from './FeedbackList';
import { FeedbackDetail } from './FeedbackDetail';
import { DS } from '../../constants.js';

interface Props {
  session: Session | null;
}

type FeedbackView = 'list' | 'detail';

export function FeedbackPage({ session }: Props) {
  const [view, setView] = useState<FeedbackView>('list');
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);

  const token = session?.access_token ?? null;

  // Require authentication
  if (!token) {
    return (
      <div
        style={{
          padding: '40px 22px',
          textAlign: 'center',
          color: DS.textSec,
          fontStyle: 'italic',
          fontSize: 13,
        }}
      >
        Faça login para acessar as sugestões da comunidade.
      </div>
    );
  }

  const handleSelectFeedback = (id: string) => {
    setSelectedFeedbackId(id);
    setView('detail');
  };

  const handleBack = () => {
    setView('list');
    setSelectedFeedbackId(null);
  };

  if (view === 'detail' && selectedFeedbackId) {
    return (
      <FeedbackDetail
        feedbackId={selectedFeedbackId}
        token={token}
        onBack={handleBack}
      />
    );
  }

  return (
    <FeedbackList
      token={token}
      onSelectFeedback={handleSelectFeedback}
    />
  );
}
