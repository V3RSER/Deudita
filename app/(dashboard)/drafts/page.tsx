'use client';

import React, { useState } from 'react';
import { DraftsView } from '@/components/DraftsView';
import { ConfirmDraftModal } from '@/components/ConfirmDraftModal';
import { ScanReceiptModal } from '@/components/ScanReceiptModal';
import { ExpenseDraft } from '@/lib/types';

export default function DraftsPage() {
  const [isConfirmDraftOpen, setIsConfirmDraftOpen] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<ExpenseDraft | null>(null);
  const [isScanReceiptOpen, setIsScanReceiptOpen] = useState(false);

  const handleOpenConfirmDraft = (draft: ExpenseDraft) => {
    setSelectedDraft(draft);
    setIsConfirmDraftOpen(true);
  };

  return (
    <>
      <DraftsView
        onOpenConfirmDraft={handleOpenConfirmDraft}
        onOpenScanReceiptModal={() => setIsScanReceiptOpen(true)}
      />

      <ConfirmDraftModal
        key={`confirm-draft-${isConfirmDraftOpen}-${selectedDraft?.id}`}
        isOpen={isConfirmDraftOpen}
        onClose={() => setIsConfirmDraftOpen(false)}
        draft={selectedDraft}
      />

      <ScanReceiptModal
        isOpen={isScanReceiptOpen}
        onClose={() => setIsScanReceiptOpen(false)}
      />
    </>
  );
}
