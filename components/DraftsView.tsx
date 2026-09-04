'use client';

import React from 'react';
import { UnifiedDraftsAndTemplatesView } from '@/components/UnifiedDraftsAndTemplatesView';
import { ExpenseDraft } from '@/lib/types';

interface DraftsViewProps {
  onOpenConfirmDraft: (draft: ExpenseDraft) => void;
}

export function DraftsView({
  onOpenConfirmDraft,
}: DraftsViewProps) {
  return (
    <UnifiedDraftsAndTemplatesView
      initialTab="drafts"
      onOpenConfirmDraft={onOpenConfirmDraft}
    />
  );
}
