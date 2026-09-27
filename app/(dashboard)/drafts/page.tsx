'use client';

import React, { useState } from 'react';
import { UnifiedDraftsAndTemplatesView } from '@/components/draft/UnifiedDraftsAndTemplatesView';
import { NewExpenseModal } from '@/components/my-expenses/NewExpenseModal';
import { ExpenseDraft } from '@/lib/types';

export default function DraftsPage() {
    const [isConfirmDraftOpen, setIsConfirmDraftOpen] = useState(false);
    const [selectedDraft, setSelectedDraft] = useState<ExpenseDraft | null>(null);

    const handleOpenConfirmDraft = (draft: ExpenseDraft) => {
        setSelectedDraft(draft);
        setIsConfirmDraftOpen(true);
    };

    const handleCloseModal = () => {
        setIsConfirmDraftOpen(false);
        setSelectedDraft(null);
    };

    return (
        <>
            <UnifiedDraftsAndTemplatesView
                initialTab="drafts"
                onOpenConfirmDraft={handleOpenConfirmDraft}
            />

            <NewExpenseModal
                key={`confirm-draft-${isConfirmDraftOpen}-${selectedDraft?.id}`}
                isOpen={isConfirmDraftOpen}
                onClose={handleCloseModal}
                draftToConfirm={selectedDraft}
            />
        </>
    );
}
