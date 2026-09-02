'use client';

import React, { useState } from 'react';
import { DraftsView } from '@/components/DraftsView';
import { ConfirmDraftModal } from '@/components/ConfirmDraftModal';
import { ScanReceiptModal } from '@/components/ScanReceiptModal';
import { GmailIntegrationModal } from '@/components/GmailIntegrationModal';
import { ExpenseDraft } from '@/lib/types';

export default function DraftsPage() {
  const [isConfirmDraftOpen, setIsConfirmDraftOpen] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<ExpenseDraft | null>(null);
  const [isScanReceiptOpen, setIsScanReceiptOpen] = useState(false);
  const [isGmailIntegrationOpen, setIsGmailIntegrationOpen] = useState(false);
  const [gmailInitialTab, setGmailInitialTab] = useState<'connection' | 'templates' | 'create_template'>('connection');

  const handleOpenConfirmDraft = (draft: ExpenseDraft) => {
    setSelectedDraft(draft);
    setIsConfirmDraftOpen(true);
  };

  const handleOpenGmailIntegration = (tab: 'connection' | 'templates' | 'create_template' = 'connection') => {
    setGmailInitialTab(tab);
    setIsGmailIntegrationOpen(true);
  };

  return (
    <>
      <DraftsView
        onOpenConfirmDraft={handleOpenConfirmDraft}
        onOpenScanReceiptModal={() => setIsScanReceiptOpen(true)}
        onOpenGmailIntegration={handleOpenGmailIntegration}
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

      <GmailIntegrationModal
        key={`gmail-modal-${isGmailIntegrationOpen}-${gmailInitialTab}`}
        isOpen={isGmailIntegrationOpen}
        onClose={() => setIsGmailIntegrationOpen(false)}
        initialTab={gmailInitialTab}
      />
    </>
  );
}
