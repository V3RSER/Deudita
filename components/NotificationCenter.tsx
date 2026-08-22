'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useExpense } from '@/lib/expense-context';
import { Bell, Users, Check, X, CheckCheck, Sparkles, Inbox } from 'lucide-react';

export function NotificationCenter() {
  const router = useRouter();
  const { pendingInvites, notifications, acceptGroupInvite, rejectGroupInvite, markNotificationAsRead } = useExpense();
  const [isOpen, setIsOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadNotifications = notifications.filter((n) => !n.is_read);
  const totalBadges = pendingInvites.length + unreadNotifications.length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAccept = async (inviteId: string) => {
    try {
      setProcessingId(inviteId);
      const groupId = await acceptGroupInvite(inviteId);
      setIsOpen(false);
      if (groupId) {
        router.push(`/groups/${groupId}`);
      }
    } catch (err) {
      console.error('Error al aceptar invitación:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (inviteId: string) => {
    try {
      setProcessingId(inviteId);
      await rejectGroupInvite(inviteId);
    } catch (err) {
      console.error('Error al rechazar invitación:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    await markNotificationAsRead();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-all active:scale-95 flex items-center justify-center min-w-[40px] min-h-[40px] cursor-pointer"
        title="Notificaciones e invitaciones"
        aria-label="Notificaciones e invitaciones"
      >
        <Bell className="w-5 h-5" />
        {totalBadges > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white">
            {totalBadges > 9 ? '9+' : totalBadges}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-2xs sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          {/* Notification popover / sheet */}
          <div className="fixed left-3 right-3 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-96 max-w-sm sm:max-w-none mx-auto sm:mx-0 bg-white border border-zinc-200 rounded-3xl shadow-2xl z-50 overflow-hidden ring-1 ring-black/5 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-3.5 sm:p-4 bg-zinc-900 text-white flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2 min-w-0">
                <Bell className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold text-xs sm:text-sm truncate">Notificaciones</span>
                {totalBadges > 0 && (
                  <span className="bg-emerald-500/20 text-emerald-300 text-[11px] px-2 py-0.5 rounded-full font-bold shrink-0">
                    {totalBadges}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-1.5 shrink-0">
                {unreadNotifications.length > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-zinc-300 hover:text-white flex items-center space-x-1 transition-colors active:scale-95 px-2 py-1 rounded-lg hover:bg-zinc-800 cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Marcar leídas</span>
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="sm:hidden p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                  aria-label="Cerrar notificaciones"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[calc(75vh-70px)] sm:max-h-[380px] overflow-y-auto divide-y divide-zinc-100 p-2 sm:p-2.5">
              {/* PENDING GROUP INVITES SECTION */}
              {pendingInvites.length > 0 && (
                <div className="p-1 sm:p-1.5 space-y-2">
                  <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider px-1">
                    Invitaciones a Grupos
                  </div>

                  {pendingInvites.map((invite) => {
                    const groupName = invite.group ? invite.group.name : 'Un grupo';
                    const inviterName = invite.inviter ? invite.inviter.full_name : 'Un integrante';

                    return (
                      <div
                        key={invite.id}
                        className="bg-emerald-50/60 border border-emerald-100 p-3 sm:p-3.5 rounded-2xl space-y-2.5 shadow-2xs"
                      >
                        <div className="flex items-start space-x-2.5 sm:space-x-3 min-w-0">
                          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-2xs">
                            <Users className="w-4 h-4" />
                          </div>
                          <div className="text-xs space-y-0.5 min-w-0 flex-1">
                            <p className="font-bold text-zinc-900 leading-snug break-words">
                              Te invitaron a {groupName}
                            </p>
                            <p className="text-zinc-600 text-[11px] sm:text-xs break-words">
                              Enviado por <span className="font-semibold text-zinc-800">{inviterName}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 pt-0.5">
                          <button
                            onClick={() => handleReject(invite.id)}
                            disabled={processingId === invite.id}
                            className="flex-1 bg-white hover:bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200 py-1.5 sm:py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-2xs"
                          >
                            Rechazar
                          </button>
                          <button
                            onClick={() => handleAccept(invite.id)}
                            disabled={processingId === invite.id}
                            className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white py-1.5 sm:py-2 rounded-xl text-xs font-semibold shadow-2xs transition-all active:scale-95 cursor-pointer"
                          >
                            Aceptar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* UNREAD / GENERAL NOTIFICATIONS SECTION */}
              {notifications.length > 0 && (
                <div className="p-1 sm:p-1.5 space-y-2">
                  <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider px-1">
                    Avisos
                  </div>

                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-3 rounded-2xl text-xs space-y-1.5 transition-colors ${
                        n.is_read ? 'bg-zinc-50/60 text-zinc-500' : 'bg-zinc-100/90 text-zinc-900 font-medium shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="font-bold text-zinc-900 flex items-center space-x-1.5 min-w-0">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="truncate">{n.title}</span>
                        </span>
                        {!n.is_read && (
                          <button
                            onClick={() => markNotificationAsRead(n.id)}
                            className="text-zinc-400 hover:text-zinc-700 transition-colors active:scale-95 shrink-0 p-1 cursor-pointer"
                            title="Marcar como leída"
                            aria-label="Marcar como leída"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-zinc-600 leading-relaxed text-[11px] sm:text-xs break-words">{n.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* EMPTY STATE */}
              {pendingInvites.length === 0 && notifications.length === 0 && (
                <div className="py-8 sm:py-10 text-center space-y-2">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto text-zinc-400">
                    <Inbox className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <p className="text-xs font-medium text-zinc-500 px-4">
                    No tienes notificaciones ni invitaciones pendientes
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
