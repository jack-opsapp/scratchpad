/**
 * Trash API Endpoint
 * Handles listing, restoring, and emptying soft-deleted items.
 * Uses service role key to bypass RLS policies.
 */

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = getSupabase();

  try {
    // GET = list deleted items
    if (req.method === 'GET') {
      const userId = req.query.userId;
      if (!userId) return res.status(400).json({ error: 'Missing userId' });

      // Deleted pages
      const { data: deletedPages } = await supabase
        .from('pages')
        .select('id, name, deleted_at')
        .eq('user_id', userId)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      // All user pages for lookups
      const { data: allUserPages } = await supabase
        .from('pages')
        .select('id, name')
        .eq('user_id', userId);
      const pageMap = new Map((allUserPages || []).map(p => [p.id, p.name]));
      const pageIds = [...pageMap.keys()];

      const deletedPageIds = new Set((deletedPages || []).map(p => p.id));

      // All sections for user's pages
      let allSections = [];
      if (pageIds.length) {
        const { data } = await supabase
          .from('sections')
          .select('id, name, page_id, deleted_at')
          .in('page_id', pageIds);
        allSections = data || [];
      }

      // Deleted sections whose parent page is NOT deleted
      const deletedSections = allSections.filter(s =>
        s.deleted_at && !deletedPageIds.has(s.page_id)
      );

      const deletedSectionIds = new Set(allSections.filter(s => s.deleted_at).map(s => s.id));
      const sectionMap = new Map(allSections.map(s => [s.id, s]));
      const allSectionIds = allSections.map(s => s.id);

      // Deleted notes whose parent section/page are NOT deleted
      let deletedNotes = [];
      if (allSectionIds.length) {
        const { data } = await supabase
          .from('notes')
          .select('id, content, section_id, deleted_at')
          .in('section_id', allSectionIds)
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false });

        deletedNotes = (data || []).filter(n => {
          const sec = sectionMap.get(n.section_id);
          return !deletedSectionIds.has(n.section_id) && !deletedPageIds.has(sec?.page_id);
        }).map(n => {
          const sec = sectionMap.get(n.section_id);
          return {
            id: n.id,
            content: (n.content || '').substring(0, 100),
            sectionName: sec?.name || 'Unknown',
            pageName: pageMap.get(sec?.page_id) || 'Unknown',
            deleted_at: n.deleted_at,
            type: 'note'
          };
        });
      }

      return res.status(200).json({
        pages: (deletedPages || []).map(p => ({
          id: p.id, name: p.name, deleted_at: p.deleted_at, type: 'page'
        })),
        sections: deletedSections.map(s => ({
          id: s.id, name: s.name, pageName: pageMap.get(s.page_id) || 'Unknown',
          deleted_at: s.deleted_at, type: 'section'
        })),
        notes: deletedNotes
      });
    }

    // POST = restore items
    if (req.method === 'POST') {
      const { userId, type, id } = req.body;
      if (!userId || !type || !id) {
        return res.status(400).json({ error: 'Missing userId, type, or id' });
      }

      if (type === 'page') {
        const { error } = await supabase
          .from('pages')
          .update({ deleted_at: null })
          .eq('id', id)
          .eq('user_id', userId);
        if (error) throw error;

        // Restore child sections and notes
        const { data: sections } = await supabase
          .from('sections')
          .select('id')
          .eq('page_id', id)
          .not('deleted_at', 'is', null);

        if (sections?.length) {
          const sids = sections.map(s => s.id);
          await supabase.from('sections').update({ deleted_at: null }).in('id', sids);
          await supabase.from('notes').update({ deleted_at: null }).in('section_id', sids).not('deleted_at', 'is', null);
        }
      } else if (type === 'section') {
        const { error } = await supabase
          .from('sections')
          .update({ deleted_at: null })
          .eq('id', id);
        if (error) throw error;

        await supabase.from('notes').update({ deleted_at: null }).eq('section_id', id).not('deleted_at', 'is', null);
      } else if (type === 'note') {
        const { error } = await supabase
          .from('notes')
          .update({ deleted_at: null })
          .eq('id', id);
        if (error) throw error;
      } else {
        return res.status(400).json({ error: 'Invalid type' });
      }

      return res.status(200).json({ success: true });
    }

    // DELETE = empty trash
    if (req.method === 'DELETE') {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: 'Missing userId' });

      const { data: userPages } = await supabase
        .from('pages')
        .select('id')
        .eq('user_id', userId);
      const pageIds = (userPages || []).map(p => p.id);

      if (pageIds.length) {
        const { data: sections } = await supabase
          .from('sections')
          .select('id')
          .in('page_id', pageIds);
        const sectionIds = (sections || []).map(s => s.id);

        if (sectionIds.length) {
          await supabase.from('notes').delete().in('section_id', sectionIds).not('deleted_at', 'is', null);
        }
        await supabase.from('sections').delete().in('page_id', pageIds).not('deleted_at', 'is', null);
      }
      await supabase.from('pages').delete().eq('user_id', userId).not('deleted_at', 'is', null);

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Trash API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
