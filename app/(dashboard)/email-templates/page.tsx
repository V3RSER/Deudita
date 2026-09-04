'use client';

import React, { useState } from 'react';
import { UnifiedDraftsAndTemplatesView } from '@/components/UnifiedDraftsAndTemplatesView';
import { ConfirmDraftModal } from '@/components/ConfirmDraftModal';
import { ExpenseDraft } from '@/lib/types';

export default function EmailTemplatesPage() {
  const [isConfirmDraftOpen, setIsConfirmDraftOpen] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<ExpenseDraft | null>(null);

  const handleOpenConfirmDraft = (draft: ExpenseDraft) => {
    setSelectedDraft(draft);
    setIsConfirmDraftOpen(true);
  };

  return (
    <>
      <UnifiedDraftsAndTemplatesView
        initialTab="catalog"
        onOpenConfirmDraft={handleOpenConfirmDraft}
      />

      <ConfirmDraftModal
        key={`confirm-draft-${isConfirmDraftOpen}-${selectedDraft?.id}`}
        isOpen={isConfirmDraftOpen}
        onClose={() => setIsConfirmDraftOpen(false)}
        draft={selectedDraft}
      />
    </>
  );
}
