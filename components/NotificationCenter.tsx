'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useExpense } from '@/lib/expense-context';
import { Bell, Users, Check, X, CheckCheck, Sparkles, Inbox } from 'lucide-react';

export function NotificationCenter() {
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
      await acceptGroupInvite(inviteId);
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
        className="relative p-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors flex items-center justify-center min-w-[40px] min-h-[40px]"
        title="Notificaciones e invitaciones"
      >
        <Bell className="w-5 h-5" />
        {totalBadges > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white">
            {totalBadges > 9 ? '9+' : totalBadges}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-zinc-200 rounded-3xl shadow-2xl z-50 overflow-hidden ring-1 ring-black/5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-4 bg-zinc-900 text-white flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bell className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-sm">Notificaciones</span>
              {totalBadges > 0 && (
                <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2 py-0.5 rounded-full font-bold">
                  {totalBadges}
                </span>
              )}
            </div>

            {unreadNotifications.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-zinc-300 hover:text-white flex items-center space-x-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Marcar leídas</span>
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto divide-y divide-zinc-100 p-2">
            {/* PENDING GROUP INVITES SECTION */}
            {pendingInvites.length > 0 && (
              <div className="p-2 space-y-2">
                <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider px-2">
                  Invitaciones a Grupos
                </div>

                {pendingInvites.map((invite) => {
                  const groupName = invite.group ? invite.group.name : 'Un grupo';
                  const inviterName = invite.inviter ? invite.inviter.full_name : 'Un integrante';

                  return (
                    <div
                      key={invite.id}
                      className="bg-emerald-50/50 border border-emerald-100 p-3.5 rounded-2xl space-y-3"
                    >
                      <div className="flex items-start space-x-3">
                        <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center shrink-0 font-bold text-xs">
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="text-xs space-y-0.5">
                          <p className="font-bold text-zinc-900 leading-snug">
                            Te invitaron a {groupName}
                          </p>
                          <p className="text-zinc-600">
                            Enviado por <span className="font-semibold">{inviterName}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 pt-1">
                        <button
                          onClick={() => handleReject(invite.id)}
                          disabled={processingId === invite.id}
                          className="flex-1 bg-white hover:bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200 py-2 rounded-xl text-xs font-medium transition-all"
                        >
                          Rechazar
                        </button>
                        <button
                          onClick={() => handleAccept(invite.id)}
                          disabled={processingId === invite.id}
                          className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white py-2 rounded-xl text-xs font-semibold shadow-sm transition-all"
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
              <div className="p-2 space-y-2">
                <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider px-2">
                  Avisos
                </div>

                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 rounded-2xl text-xs space-y-1 transition-colors ${
                      n.is_read ? 'bg-zinc-50/60 text-zinc-500' : 'bg-zinc-100 text-zinc-900 font-medium'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-zinc-900 flex items-center space-x-1">
                        <Sparkles className="w-3 h-3 text-emerald-500" />
                        <span>{n.title}</span>
                      </span>
                      {!n.is_read && (
                        <button
                          onClick={() => markNotificationAsRead(n.id)}
                          className="text-zinc-400 hover:text-zinc-700"
                          title="Marcar como leída"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-zinc-600 leading-relaxed">{n.message}</p>
                  </div>
                ))}
              </div>
            )}

            {/* EMPTY STATE */}
            {pendingInvites.length === 0 && notifications.length === 0 && (
              <div className="py-10 text-center space-y-2">
                <div className="w-12 h-12 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto text-zinc-400">
                  <Inbox className="w-6 h-6" />
                </div>
                <p className="text-xs font-medium text-zinc-500">No tienes notificaciones ni invitaciones pendientes</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
