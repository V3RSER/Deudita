'use client';

import React, { useState } from 'react';
import { GroupList } from '@/components/GroupList';
import { CreateGroupModal } from '@/components/CreateGroupModal';
import { useRouter } from 'next/navigation';

export default function GroupsPage() {
  const router = useRouter();
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);

  return (
    <>
      <GroupList
        onSelectGroup={(group) => router.push(`/groups/${group.id}`)}
        onOpenNewGroup={() => setIsNewGroupOpen(true)}
      />
      <CreateGroupModal
        isOpen={isNewGroupOpen}
        onClose={() => setIsNewGroupOpen(false)}
      />
    </>
  );
}
