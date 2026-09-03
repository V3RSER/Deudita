'use client';

import React from 'react';
import { GmailIntegrationModal } from '@/components/GmailIntegrationModal';

interface EmailTemplatesManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * EmailTemplatesManager
 * Wrapper around GmailIntegrationModal providing backward compatibility with
 * the unified and human-friendly email synchronization center.
 */
export function EmailTemplatesManager({ isOpen, onClose }: EmailTemplatesManagerProps) {
  return (
    <GmailIntegrationModal
      isOpen={isOpen}
      onClose={onClose}
      initialTab="templates"
    />
  );
}
