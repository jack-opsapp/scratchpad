/**
 * ShareModal Component
 *
 * Modal for managing page sharing: inviting collaborators, managing roles,
 * and creating public links.
 */

import React, { useState, useEffect } from 'react';
import { X, Send, Trash2, Link2, Eye, EyeOff, Copy, RefreshCw } from 'lucide-react';
import {
  getPageCollaborators,
  getPendingInvitations,
  inviteUserByEmail,
  removeCollaborator,
  updateCollaboratorRole,
  cancelInvitation,
  resendInvitation,
  getPublicLink,
  createPublicLink,
  togglePublicVisibility,
  updatePublicLinkPassword,
  regeneratePublicLink,
} from '../lib/permissions';

const colors = {
  bg: '#000000',
  surface: '#0a0a0a',
  border: '#1a1a1a',
  primary: 'var(--color-primary, #d1b18f)',
  textPrimary: '#ffffff',
  textMuted: '#888888',
};

export default function ShareModal({
  pageId,
  pageName,
  currentUserId,
  myRole,
  onClose,
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('team');
  const [collaborators, setCollaborators] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [publicLink, setPublicLink] = useState(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const canManage = ['owner', 'team-admin'].includes(myRole);

  useEffect(() => {
    loadData();
  }, [pageId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [collabs, pending, link] = await Promise.all([
        getPageCollaborators(pageId),
        getPendingInvitations(pageId),
        getPublicLink(pageId),
      ]);
      setCollaborators(collabs);
      setPendingInvites(pending);
      setPublicLink(link);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!email.trim()) return;

    setSending(true);
    setError(null);
    try {
      const result = await inviteUserByEmail(
        pageId,
        email.trim(),
        role,
        currentUserId
      );

      // Send email notification
      await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: email.trim(),
          inviterName: 'Team member',
          pageName: pageName,
        }),
      });

      setEmail('');
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleRemove = async (userId) => {
    if (!confirm('Remove this collaborator?')) return;

    try {
      await removeCollaborator(pageId, userId, currentUserId);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await updateCollaboratorRole(pageId, userId, newRole, currentUserId);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancelInvite = async (inviteEmail) => {
    try {
      await cancelInvitation(pageId, inviteEmail, currentUserId);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResendInvite = async (inviteEmail) => {
    try {
      await resendInvitation(pageId, inviteEmail);
      // Resend email
      await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: inviteEmail,
          inviterName: 'Team member',
          pageName: pageName,
        }),
      });
      alert('Invitation resent!');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreatePublicLink = async () => {
    try {
      const link = await createPublicLink(
        pageId,
        currentUserId,
        password || null
      );
      setPublicLink(link);
      setPassword('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTogglePublic = async () => {
    try {
      await togglePublicVisibility(pageId, !publicLink.is_active);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdatePassword = async () => {
    try {
      await updatePublicLinkPassword(pageId, password);
      loadData();
      setPassword('');
      alert('Password updated!');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRegenerateLink = async () => {
    if (!confirm('Regenerate link? Old link will stop working.')) return;

    try {
      const link = await regeneratePublicLink(pageId, currentUserId);
      setPublicLink(link);
    } catch (err) {
      setError(err.message);
    }
  };

  const copyPublicLink = () => {
    const url = `https://slate.opsapp.co/public/${publicLink.token}`;
    navigator.clipboard.writeText(url);
    alert('Link copied!');
  };

  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
        }}
      >
        <div style={{ color: colors.textPrimary }}>Loading...</div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          width: 'min(500px, 90%)',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 20,
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <h2
            style={{
              color: colors.textPrimary,
              fontSize: 18,
              fontWeight: 600,
              margin: 0,
            }}
          >
            Share "{pageName}"
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.textMuted,
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: 16,
              background: '#ff4444',
              color: '#fff',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Invite Section */}
        {canManage && (
          <div
            style={{ padding: 20, borderBottom: `1px solid ${colors.border}` }}
          >
            <p
              style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}
            >
              Invite by email
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                style={{
                  flex: 1,
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  color: colors.textPrimary,
                  padding: '8px 12px',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  color: colors.textPrimary,
                  padding: '8px 12px',
                  fontSize: 13,
                  outline: 'none',
                }}
              >
                <option value="team-admin">Team-Admin</option>
                <option value="team">Team</option>
                <option value="team-limited">Team-Limited</option>
              </select>
            </div>
            <button
              onClick={handleInvite}
              disabled={sending || !email.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                background: colors.primary,
                border: 'none',
                color: colors.bg,
                fontSize: 13,
                fontWeight: 600,
                cursor: sending ? 'not-allowed' : 'pointer',
                opacity: sending ? 0.5 : 1,
              }}
            >
              <Send size={14} /> {sending ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        )}

        {/* Collaborators */}
        <div
          style={{ padding: 20, borderBottom: `1px solid ${colors.border}` }}
        >
          <p
            style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}
          >
            Collaborators ({collaborators.length})
          </p>
          {collaborators.map((collab) => (
            <div
              key={collab.userId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    color: colors.textPrimary,
                    fontSize: 13,
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {collab.email.split('@')[0]}{' '}
                  {collab.userId === currentUserId && '(You)'}
                  {collab.status === 'pending' && (
                    <span style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: colors.textMuted,
                      border: `1px solid ${colors.border}`,
                      padding: '1px 5px',
                      letterSpacing: 0.5,
                    }}>PENDING</span>
                  )}
                </p>
                <p
                  style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    margin: '2px 0 0 0',
                  }}
                >
                  {collab.email}
                </p>
              </div>

              {canManage &&
                collab.userId !== currentUserId &&
                collab.role !== 'owner' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      value={collab.role}
                      onChange={(e) =>
                        handleRoleChange(collab.userId, e.target.value)
                      }
                      disabled={
                        myRole === 'team-admin' && collab.role === 'owner'
                      }
                      style={{
                        background: colors.bg,
                        border: `1px solid ${colors.border}`,
                        color: colors.textPrimary,
                        padding: '4px 8px',
                        fontSize: 11,
                      }}
                    >
                      <option value="team-admin">Team-Admin</option>
                      <option value="team">Team</option>
                      <option value="team-limited">Team-Limited</option>
                    </select>
                    <button
                      onClick={() => handleRemove(collab.userId)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: colors.textMuted,
                        cursor: 'pointer',
                        padding: 4,
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}

              {collab.role === 'owner' && (
                <span
                  style={{
                    color: colors.primary,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  Owner
                </span>
              )}

              {!canManage && collab.role !== 'owner' && (
                <span
                  style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    textTransform: 'uppercase',
                  }}
                >
                  {collab.role}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Pending Invitations */}
        {canManage && pendingInvites.length > 0 && (
          <div
            style={{ padding: 20, borderBottom: `1px solid ${colors.border}` }}
          >
            <p
              style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}
            >
              Pending Invitations ({pendingInvites.length})
            </p>
            {pendingInvites.map((invite) => (
              <div
                key={invite.email}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <div>
                  <p
                    style={{
                      color: colors.textPrimary,
                      fontSize: 13,
                      margin: 0,
                    }}
                  >
                    {invite.email}
                  </p>
                  <p
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      margin: '2px 0 0 0',
                    }}
                  >
                    Role: {invite.role}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleResendInvite(invite.email)}
                    style={{
                      padding: '4px 8px',
                      background: 'transparent',
                      border: `1px solid ${colors.border}`,
                      color: colors.textMuted,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Resend
                  </button>
                  <button
                    onClick={() => handleCancelInvite(invite.email)}
                    style={{
                      padding: '4px 8px',
                      background: 'transparent',
                      border: `1px solid ${colors.border}`,
                      color: colors.textMuted,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Public Link */}
        {canManage && (
          <div style={{ padding: 20 }}>
            <p
              style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}
            >
              Public Link
            </p>

            {!publicLink ? (
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Optional password"
                  style={{
                    width: '100%',
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    color: colors.textPrimary,
                    padding: '8px 12px',
                    fontSize: 13,
                    marginBottom: 8,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleCreatePublicLink}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px',
                    background: colors.primary,
                    border: 'none',
                    color: colors.bg,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Link2 size={14} /> Generate Public Link
                </button>
              </div>
            ) : (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <button
                    onClick={handleTogglePublic}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      background: publicLink.is_active
                        ? colors.primary
                        : colors.bg,
                      border: `1px solid ${colors.border}`,
                      color: publicLink.is_active
                        ? colors.bg
                        : colors.textMuted,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {publicLink.is_active ? (
                      <Eye size={14} />
                    ) : (
                      <EyeOff size={14} />
                    )}
                    {publicLink.is_active ? 'Public' : 'Private'}
                  </button>
                  <span style={{ color: colors.textMuted, fontSize: 11 }}>
                    Views: {publicLink.view_count}
                  </span>
                </div>

                {publicLink.is_active && (
                  <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input
                        readOnly
                        value={`https://slate.opsapp.co/public/${publicLink.token}`}
                        style={{
                          flex: 1,
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          color: colors.textPrimary,
                          padding: '8px 12px',
                          fontSize: 11,
                          outline: 'none',
                        }}
                      />
                      <button
                        onClick={copyPublicLink}
                        style={{
                          padding: '8px 12px',
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          color: colors.textMuted,
                          cursor: 'pointer',
                        }}
                      >
                        <Copy size={14} />
                      </button>
                    </div>

                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        publicLink.password_hash
                          ? 'Update password'
                          : 'Add password'
                      }
                      style={{
                        width: '100%',
                        background: colors.bg,
                        border: `1px solid ${colors.border}`,
                        color: colors.textPrimary,
                        padding: '8px 12px',
                        fontSize: 13,
                        marginBottom: 8,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={handleUpdatePassword}
                        style={{
                          padding: '6px 12px',
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          color: colors.textMuted,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {publicLink.password_hash ? 'Update' : 'Add'} Password
                      </button>
                      <button
                        onClick={handleRegenerateLink}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          color: colors.textMuted,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        <RefreshCw size={12} /> Regenerate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
