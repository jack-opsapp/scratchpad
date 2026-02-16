/**
 * OpenAI Function Definitions for Slate Agent
 * These define the tools the agent can use
 */

export const functionDefinitions = [
  // ============ DATA QUERIES ============
  {
    type: 'function',
    function: {
      name: 'get_pages',
      description: 'Fetch all pages the user has access to',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_sections',
      description: 'Fetch sections, optionally filtered by page',
      parameters: {
        type: 'object',
        properties: {
          page_id: { type: 'string', description: 'Filter to specific page by ID' },
          page_name: { type: 'string', description: 'Filter by page name' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_notes',
      description: 'Fetch notes with optional filters. Use this to see actual note contents.',
      parameters: {
        type: 'object',
        properties: {
          section_id: { type: 'string', description: 'Filter to section by ID' },
          section_name: { type: 'string', description: 'Filter by section name' },
          page_name: { type: 'string', description: 'Filter by page name' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (matches any)' },
          has_no_tags: { type: 'boolean', description: 'Filter to notes without tags' },
          completed: { type: 'boolean', description: 'Filter by completion status' },
          search: { type: 'string', description: 'Text search in content' },
          created_after: { type: 'string', description: 'Filter notes created after this ISO date (e.g., "2024-02-04" for yesterday)' },
          created_before: { type: 'string', description: 'Filter notes created before this ISO date' },
          limit: { type: 'number', description: 'Max results (default 50)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'count_notes',
      description: 'Count notes matching criteria. Useful before bulk operations.',
      parameters: {
        type: 'object',
        properties: {
          section_id: { type: 'string' },
          section_name: { type: 'string' },
          page_name: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          has_no_tags: { type: 'boolean' },
          completed: { type: 'boolean' },
          search: { type: 'string' }
        },
        required: []
      }
    }
  },

  // ============ PAGE OPERATIONS ============
  {
    type: 'function',
    function: {
      name: 'create_page',
      description: 'Create a new page',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Page name' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rename_page',
      description: 'Rename an existing page',
      parameters: {
        type: 'object',
        properties: {
          page_id: { type: 'string', description: 'Page ID' },
          page_name: { type: 'string', description: 'Current page name (if ID not known)' },
          new_name: { type: 'string', description: 'New name for the page' }
        },
        required: ['new_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_page',
      description: 'Delete a page and all its contents',
      parameters: {
        type: 'object',
        properties: {
          page_id: { type: 'string' },
          page_name: { type: 'string' }
        },
        required: []
      }
    }
  },

  // ============ SECTION OPERATIONS ============
  {
    type: 'function',
    function: {
      name: 'create_section',
      description: 'Create a new section in a page',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Section name' },
          page_id: { type: 'string', description: 'Page ID to create in' },
          page_name: { type: 'string', description: 'Page name (if ID not known)' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rename_section',
      description: 'Rename an existing section',
      parameters: {
        type: 'object',
        properties: {
          section_id: { type: 'string' },
          section_name: { type: 'string', description: 'Current section name' },
          page_name: { type: 'string', description: 'Page name to disambiguate' },
          new_name: { type: 'string', description: 'New name for the section' }
        },
        required: ['new_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_section',
      description: 'Delete a section and all its notes',
      parameters: {
        type: 'object',
        properties: {
          section_id: { type: 'string' },
          section_name: { type: 'string' },
          page_name: { type: 'string' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_section',
      description: 'Move a section to a different page',
      parameters: {
        type: 'object',
        properties: {
          section_id: { type: 'string' },
          section_name: { type: 'string' },
          to_page_id: { type: 'string' },
          to_page_name: { type: 'string' }
        },
        required: []
      }
    }
  },

  // ============ NOTE OPERATIONS ============
  {
    type: 'function',
    function: {
      name: 'create_note',
      description: 'Create a new note in a section',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Note content' },
          section_id: { type: 'string' },
          section_name: { type: 'string' },
          page_name: { type: 'string', description: 'Page name to disambiguate section' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags to apply' },
          date: { type: 'string', description: 'Date string like "Feb 15"' }
        },
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_note',
      description: 'Update an existing note',
      parameters: {
        type: 'object',
        properties: {
          note_id: { type: 'string', description: 'Note ID to update' },
          content: { type: 'string', description: 'New content' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Replace all tags' },
          add_tags: { type: 'array', items: { type: 'string' }, description: 'Tags to add' },
          remove_tags: { type: 'array', items: { type: 'string' }, description: 'Tags to remove' },
          date: { type: 'string', description: 'New date or null to clear' },
          completed: { type: 'boolean', description: 'Completion status' }
        },
        required: ['note_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_note',
      description: 'Delete a note',
      parameters: {
        type: 'object',
        properties: {
          note_id: { type: 'string', description: 'Note ID to delete' }
        },
        required: ['note_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_note',
      description: 'Move a note to a different section',
      parameters: {
        type: 'object',
        properties: {
          note_id: { type: 'string', description: 'Note ID to move' },
          to_section_id: { type: 'string' },
          to_section_name: { type: 'string' },
          to_page_name: { type: 'string', description: 'Page name to disambiguate section' }
        },
        required: ['note_id']
      }
    }
  },

  // ============ BULK OPERATIONS ============
  {
    type: 'function',
    function: {
      name: 'bulk_update_notes',
      description: 'Update multiple notes matching criteria. Use for tagging multiple notes, marking complete, etc.',
      parameters: {
        type: 'object',
        properties: {
          filter: {
            type: 'object',
            description: 'Filter criteria (same as get_notes)',
            properties: {
              section_id: { type: 'string' },
              section_name: { type: 'string' },
              page_name: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              has_no_tags: { type: 'boolean' },
              completed: { type: 'boolean' },
              search: { type: 'string' },
              note_ids: { type: 'array', items: { type: 'string' }, description: 'Specific note IDs to update' }
            }
          },
          updates: {
            type: 'object',
            description: 'What to update',
            properties: {
              add_tags: { type: 'array', items: { type: 'string' } },
              remove_tags: { type: 'array', items: { type: 'string' } },
              set_tags: { type: 'array', items: { type: 'string' } },
              completed: { type: 'boolean' },
              move_to_section_id: { type: 'string' },
              move_to_section_name: { type: 'string' }
            }
          }
        },
        required: ['filter', 'updates']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bulk_delete_notes',
      description: 'Delete multiple notes matching criteria',
      parameters: {
        type: 'object',
        properties: {
          filter: {
            type: 'object',
            properties: {
              section_id: { type: 'string' },
              section_name: { type: 'string' },
              page_name: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              has_no_tags: { type: 'boolean' },
              completed: { type: 'boolean' },
              search: { type: 'string' },
              note_ids: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        required: ['filter']
      }
    }
  },

  // ============ NAVIGATION (Frontend Actions) ============
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: 'Navigate the user to a specific page or section',
      parameters: {
        type: 'object',
        properties: {
          page_name: { type: 'string', description: 'Page to navigate to' },
          section_name: { type: 'string', description: 'Section to navigate to' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'apply_filter',
      description: 'Apply a filter to the current view',
      parameters: {
        type: 'object',
        properties: {
          tags: { type: 'array', items: { type: 'string' } },
          completed: { type: 'boolean' },
          search: { type: 'string' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clear_filters',
      description: 'Clear all active filters',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_custom_view',
      description: 'Create a custom filtered view of notes in the main window. Use this when user asks to "show me" notes matching certain criteria. The view is parameterized and updates automatically as notes change.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Title for the view, e.g., "ALL NOTES", "RELATED TO TECH", "TAGGED BUG"'
          },
          view_type: {
            type: 'string',
            enum: ['list', 'boxes', 'calendar'],
            description: 'How to display the notes'
          },
          filter: {
            type: 'object',
            description: 'Filter criteria - notes matching ANY of these will be shown',
            properties: {
              tags: { type: 'array', items: { type: 'string' }, description: 'Notes with any of these tags' },
              search: { type: 'string', description: 'Notes containing this text in content' },
              page_name: { type: 'string', description: 'Notes from this page' },
              section_name: { type: 'string', description: 'Notes from this section' },
              completed: { type: 'boolean', description: 'Filter by completion status' },
              has_no_tags: { type: 'boolean', description: 'Only untagged notes' }
            }
          },
          group_by: {
            type: 'string',
            enum: ['section', 'page', 'tag', 'month', 'week', 'day', 'completed'],
            description: 'For boxes view, how to group notes'
          }
        },
        required: ['title', 'view_type']
      }
    }
  },

  // ============ TRASH / RECOVERY ============
  {
    type: 'function',
    function: {
      name: 'get_deleted_items',
      description: 'List all soft-deleted (trashed) pages, sections, and notes for the user',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'restore_items',
      description: 'Restore one or more deleted items from trash. Restoring a page also restores its child sections and notes.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Items to restore',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['page', 'section', 'note'], description: 'Item type' },
                id: { type: 'string', description: 'Item ID' }
              },
              required: ['type', 'id']
            }
          }
        },
        required: ['items']
      }
    }
  },

  // ============ COMMUNICATION ============
  {
    type: 'function',
    function: {
      name: 'respond_to_user',
      description: 'Send a message to the user. Call this to end the interaction.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message to send to user' }
        },
        required: ['message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_clarification',
      description: 'Ask the user to clarify something ambiguous',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Question to ask' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                value: { type: 'string' }
              }
            },
            description: 'Quick selection options'
          }
        },
        required: ['question']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'confirm_action',
      description: 'Ask user to confirm before proceeding with a destructive action',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'What will happen if confirmed' },
          confirm_value: { type: 'string', description: 'Value to send back if user confirms' }
        },
        required: ['message', 'confirm_value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_plan',
      description: `Propose a multi-step plan for complex operations. Each group is confirmed separately.

PARAM FORMATS:
- create_page: { name: "Page Name" }
- create_section: { name: "Section Name", pageName: "Page Name" }
- create_note: { content: "Note text", sectionName: "Section", tags: ["tag1"] }
- delete_page: { name: "Page Name" }
- delete_section: { name: "Section Name", pageName: "Page Name" }

EXAMPLE:
{
  summary: "Creating Q2 Planning with sections",
  groups: [
    { title: "Create Page", description: "Create Q2 Planning page", operations: [{ type: "create_page", params: { name: "Q2 Planning" }}]},
    { title: "Add Sections", description: "Add Goals and Tasks sections", operations: [
      { type: "create_section", params: { name: "Goals", pageName: "Q2 Planning" }},
      { type: "create_section", params: { name: "Tasks", pageName: "Q2 Planning" }}
    ]}
  ]
}`,
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Brief summary of the overall plan' },
          groups: {
            type: 'array',
            description: 'Array of operation groups to execute in sequence',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Short title for this group' },
                description: { type: 'string', description: 'What this group will do' },
                operations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['create_page', 'create_section', 'create_note', 'delete_note', 'delete_section', 'delete_page', 'bulk_add_tag', 'bulk_remove_tag', 'bulk_move_to_section', 'bulk_mark_complete']
                      },
                      params: { type: 'object', description: 'Operation parameters (name, content, tags, pageName, sectionName, filter, etc.)' }
                    },
                    required: ['type', 'params']
                  }
                }
              },
              required: ['title', 'description', 'operations']
            }
          }
        },
        required: ['summary', 'groups']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sort_notes',
      description: 'Sort/reorder notes based on custom criteria (e.g., urgency, priority, due date proximity). Analyzes note content and returns an ordered list of note IDs. The frontend will apply this ordering.',
      parameters: {
        type: 'object',
        properties: {
          criteria: { type: 'string', description: 'Sort criteria description, e.g., "urgency", "priority", "due date proximity", "alphabetical by topic"' },
          section_id: { type: 'string', description: 'Section ID to sort notes within' },
          section_name: { type: 'string', description: 'Section name to sort notes within' },
          page_name: { type: 'string', description: 'Page name (to disambiguate section or sort entire page)' },
          note_ids: { type: 'array', items: { type: 'string' }, description: 'Specific note IDs to sort (if not provided, sorts all notes in the section/page)' }
        },
        required: ['criteria']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'revise_plan_step',
      description: `Revise a single step in an existing plan. Use this when the user requests changes to a specific step.
DO NOT use propose_plan for revisions - use this instead to update just the step being revised.

PARAM FORMATS (same as propose_plan):
- create_page: { name: "Page Name" }
- create_section: { name: "Section Name", pageName: "Page Name" }
- create_note: { content: "Note text", sectionName: "Section", tags: ["tag1"] }`,
      parameters: {
        type: 'object',
        properties: {
          step_index: { type: 'number', description: 'The 0-based index of the step to revise' },
          revised_group: {
            type: 'object',
            description: 'The revised group definition',
            properties: {
              title: { type: 'string', description: 'Short title for this group' },
              description: { type: 'string', description: 'What this group will do' },
              operations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['create_page', 'create_section', 'create_note', 'delete_note', 'delete_section', 'delete_page', 'bulk_add_tag', 'bulk_remove_tag', 'bulk_move_to_section', 'bulk_mark_complete']
                    },
                    params: { type: 'object', description: 'Operation parameters' }
                  },
                  required: ['type', 'params']
                }
              }
            },
            required: ['title', 'description', 'operations']
          },
          message: { type: 'string', description: 'Brief message about the revision' }
        },
        required: ['step_index', 'revised_group']
      }
    }
  }
];
