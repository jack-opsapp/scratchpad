/**
 * Permissions Library
 *
 * Comprehensive permissions helper for multi-user collaboration.
 * Handles role checking, collaborator management, and public links.
 */

import { supabase } from '../config/supabase.js';

// ============================================================================
// ROLE CHECKING
// ============================================================================

export async function getPageRole(userId, pageId) {
  const { data, error } = await supabase
    .from('page_permissions')
    .select('role')
    .eq('page_id', pageId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data.role;
}

export async function canEditPage(userId, pageId) {
  const role = await getPageRole(userId, pageId);
  return ['owner', 'team-admin', 'team'].includes(role);
}

export async function canDeletePage(userId, pageId) {
  const role = await getPageRole(userId, pageId);
  return role === 'owner';
}

export async function canRenamePage(userId, pageId) {
  const role = await getPageRole(userId, pageId);
  return role === 'owner';
}

export async function canManageCollaborators(userId, pageId) {
  const role = await getPageRole(userId, pageId);
  return ['owner', 'team-admin'].includes(role);
}

export async function isPageOwner(userId, pageId) {
  const role = await getPageRole(userId, pageId);
  return role === 'owner';
}

export async function canDeleteSection(userId, pageId) {
  const role = await getPageRole(userId, pageId);
  return ['owner', 'team-admin'].includes(role);
}

export async function canEditAnyNote(userId, pageId) {
  const role = await getPageRole(userId, pageId);
  return ['owner', 'team-admin'].includes(role);
}

export async function canDeleteNote(userId, noteId, noteCreatorId) {
  // Get note's page via section
  const { data: note } = await supabase
    .from('notes')
    .select('section_id, sections(page_id)')
    .eq('id', noteId)
    .single();

  if (!note) return false;

  const pageId = note.sections.page_id;
  const role = await getPageRole(userId, pageId);

  // Owner/Team-Admin can delete any note
  if (['owner', 'team-admin'].includes(role)) return true;

  // Team can delete own notes
  if (role === 'team' && noteCreatorId === userId) return true;

  return false;
}

export async function canManagePublicLink(userId, pageId) {
  const role = await getPageRole(userId, pageId);
  return ['owner', 'team-admin'].includes(role);
}

export async function isPageShared(pageId) {
  const { data } = await supabase
    .from('page_permissions')
    .select('id')
    .eq('page_id', pageId)
    .limit(2); // More than 1 = shared

  return (data?.length || 0) > 1;
}

// ============================================================================
// COLLABORATOR MANAGEMENT
// ============================================================================

export async function getPageCollaborators(pageId) {
  const { data, error } = await supabase
    .from('page_permissions')
    .select(`
      id,
      role,
      user_id,
      users:user_id (
        id,
        email,
        created_at
      )
    `)
    .eq('page_id', pageId)
    .order('role'); // Owner first

  if (error) throw error;

  return data.map((p) => ({
    permissionId: p.id,
    userId: p.user_id,
    role: p.role,
    email: p.users.email,
    name: p.users.email.split('@')[0], // Use email prefix as name for now
  }));
}

export async function getPendingInvitations(pageId) {
  const { data, error } = await supabase
    .from('pending_invitations')
    .select('*')
    .eq('page_id', pageId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function inviteUserByEmail(pageId, email, role, inviterId) {
  // Check if user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingUser) {
    // User exists - add permission directly
    const { error } = await supabase.from('page_permissions').insert({
      page_id: pageId,
      user_id: existingUser.id,
      role: role,
    });

    if (error) throw error;
    return { status: 'added', userId: existingUser.id };
  } else {
    // User doesn't exist - create pending invitation
    const { error } = await supabase.from('pending_invitations').insert({
      page_id: pageId,
      email: email,
      role: role,
      invited_by_user_id: inviterId,
    });

    if (error) throw error;
    return { status: 'pending', email };
  }
}

export async function removeCollaborator(pageId, targetUserId, currentUserId) {
  // Check if current user can manage collaborators
  const myRole = await getPageRole(currentUserId, pageId);
  if (!['owner', 'team-admin'].includes(myRole)) {
    throw new Error('Insufficient permissions');
  }

  // Check if target is owner (team-admin cannot remove owner)
  const targetRole = await getPageRole(targetUserId, pageId);
  if (targetRole === 'owner' && myRole === 'team-admin') {
    throw new Error('Team-Admin cannot remove Owner');
  }

  const { error } = await supabase
    .from('page_permissions')
    .delete()
    .eq('page_id', pageId)
    .eq('user_id', targetUserId);

  if (error) throw error;
}

export async function updateCollaboratorRole(
  pageId,
  targetUserId,
  newRole,
  currentUserId
) {
  // Check if current user can manage collaborators
  const myRole = await getPageRole(currentUserId, pageId);
  if (!['owner', 'team-admin'].includes(myRole)) {
    throw new Error('Insufficient permissions');
  }

  // Check if target is owner (team-admin cannot modify owner)
  const targetRole = await getPageRole(targetUserId, pageId);
  if (targetRole === 'owner' && myRole === 'team-admin') {
    throw new Error('Team-Admin cannot modify Owner permissions');
  }

  const { error } = await supabase
    .from('page_permissions')
    .update({ role: newRole })
    .eq('page_id', pageId)
    .eq('user_id', targetUserId);

  if (error) throw error;
}

export async function cancelInvitation(pageId, email, currentUserId) {
  // Verify permissions
  const myRole = await getPageRole(currentUserId, pageId);
  if (!['owner', 'team-admin'].includes(myRole)) {
    throw new Error('Insufficient permissions');
  }

  const { error } = await supabase
    .from('pending_invitations')
    .delete()
    .eq('page_id', pageId)
    .eq('email', email);

  if (error) throw error;
}

export async function resendInvitation(pageId, email) {
  // Extend expiry by 7 days
  const newExpiry = new Date();
  newExpiry.setDate(newExpiry.getDate() + 7);

  const { error } = await supabase
    .from('pending_invitations')
    .update({ expires_at: newExpiry.toISOString() })
    .eq('page_id', pageId)
    .eq('email', email);

  if (error) throw error;
}

export async function leaveSharedPage(pageId, userId) {
  // Cannot leave if owner
  const role = await getPageRole(userId, pageId);
  if (role === 'owner') {
    throw new Error('Owner cannot leave page. Delete page instead.');
  }

  const { error } = await supabase
    .from('page_permissions')
    .delete()
    .eq('page_id', pageId)
    .eq('user_id', userId);

  if (error) throw error;
}

// ============================================================================
// PUBLIC LINKS
// ============================================================================

export async function getPublicLink(pageId) {
  const { data, error } = await supabase
    .from('public_links')
    .select('*')
    .eq('page_id', pageId)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // Ignore "not found"
  return data || null;
}

export async function createPublicLink(pageId, userId, password = null) {
  let passwordHash = null;
  if (password) {
    // Simple hash for demo - use bcrypt in production
    passwordHash = btoa(password); // Base64 encode for demo
  }

  const { data, error } = await supabase
    .from('public_links')
    .insert({
      page_id: pageId,
      created_by_user_id: userId,
      password_hash: passwordHash,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function togglePublicVisibility(pageId, isActive) {
  const { error } = await supabase
    .from('public_links')
    .update({ is_active: isActive })
    .eq('page_id', pageId);

  if (error) throw error;
}

export async function updatePublicLinkPassword(pageId, password) {
  const passwordHash = password ? btoa(password) : null;

  const { error } = await supabase
    .from('public_links')
    .update({ password_hash: passwordHash })
    .eq('page_id', pageId);

  if (error) throw error;
}

export async function regeneratePublicLink(pageId, userId) {
  // Delete old link
  await supabase.from('public_links').delete().eq('page_id', pageId);

  // Create new one
  return await createPublicLink(pageId, userId);
}

export async function getPublicPageData(token, password = null) {
  // Get public link
  const { data: link, error: linkError } = await supabase
    .from('public_links')
    .select('*')
    .eq('token', token)
    .eq('is_active', true)
    .single();

  if (linkError || !link) {
    throw new Error('Link not found or inactive');
  }

  // Check password if required
  if (link.password_hash && link.password_hash !== btoa(password || '')) {
    throw new Error('Invalid password');
  }

  // Increment view count
  await supabase
    .from('public_links')
    .update({
      view_count: link.view_count + 1,
      last_viewed_at: new Date().toISOString(),
    })
    .eq('id', link.id);

  // Fetch page data
  const { data: page, error: pageError } = await supabase
    .from('pages')
    .select(
      `
      id,
      name,
      sections (
        id,
        name,
        notes (
          id,
          content,
          completed,
          date,
          tags,
          created_at
        )
      )
    `
    )
    .eq('id', link.page_id)
    .single();

  if (pageError) throw pageError;
  return page;
}

// ============================================================================
// USER LOOKUP
// ============================================================================

export async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function getUserById(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, created_at')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}
