import React from 'react';
import { colors } from '../styles/theme.js';

/**
 * Simple markdown renderer for chat messages
 * Supports: headers, bold, bullets, numbered lists, code
 */
export default function MarkdownText({ content, baseColor = colors.textSecondary }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let listItems = [];
  let listType = null; // 'bullet' or 'number'

  const flushList = () => {
    if (listItems.length > 0) {
      const ListTag = listType === 'number' ? 'ol' : 'ul';
      elements.push(
        <ListTag key={`list-${elements.length}`} style={{
          margin: '8px 0',
          paddingLeft: 20,
          color: baseColor
        }}>
          {listItems.map((item, i) => (
            <li key={i} style={{ marginBottom: 4 }}>{renderInline(item)}</li>
          ))}
        </ListTag>
      );
      listItems = [];
      listType = null;
    }
  };

  // Render inline formatting (bold, code)
  const renderInline = (text) => {
    const parts = [];
    let remaining = text;
    let key = 0;

    while (remaining) {
      // Bold: **text**
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // Code: `text`
      const codeMatch = remaining.match(/`(.+?)`/);

      // Find earliest match
      let earliestMatch = null;
      let matchType = null;

      if (boldMatch && (!earliestMatch || boldMatch.index < earliestMatch.index)) {
        earliestMatch = boldMatch;
        matchType = 'bold';
      }
      if (codeMatch && (!earliestMatch || codeMatch.index < earliestMatch.index)) {
        earliestMatch = codeMatch;
        matchType = 'code';
      }

      if (earliestMatch) {
        // Add text before match
        if (earliestMatch.index > 0) {
          parts.push(remaining.slice(0, earliestMatch.index));
        }

        // Add formatted text
        if (matchType === 'bold') {
          parts.push(
            <strong key={key++} style={{ color: colors.textPrimary }}>
              {earliestMatch[1]}
            </strong>
          );
        } else if (matchType === 'code') {
          parts.push(
            <code key={key++} style={{
              background: colors.surface,
              padding: '2px 6px',
              borderRadius: 4,
              fontFamily: 'monospace',
              fontSize: '0.9em'
            }}>
              {earliestMatch[1]}
            </code>
          );
        }

        remaining = remaining.slice(earliestMatch.index + earliestMatch[0].length);
      } else {
        parts.push(remaining);
        break;
      }
    }

    return parts.length === 1 ? parts[0] : parts;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h4 key={i} style={{
          color: colors.textPrimary,
          fontSize: 13,
          fontWeight: 600,
          margin: '12px 0 6px 0'
        }}>
          {renderInline(line.slice(4))}
        </h4>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={i} style={{
          color: colors.textPrimary,
          fontSize: 14,
          fontWeight: 600,
          margin: '12px 0 6px 0'
        }}>
          {renderInline(line.slice(3))}
        </h3>
      );
      continue;
    }
    if (line.startsWith('# ')) {
      flushList();
      elements.push(
        <h2 key={i} style={{
          color: colors.textPrimary,
          fontSize: 15,
          fontWeight: 600,
          margin: '12px 0 6px 0'
        }}>
          {renderInline(line.slice(2))}
        </h2>
      );
      continue;
    }

    // Bullet lists (- or *)
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)/);
    if (bulletMatch) {
      if (listType !== 'bullet') {
        flushList();
        listType = 'bullet';
      }
      listItems.push(bulletMatch[1]);
      continue;
    }

    // Numbered lists
    const numberMatch = line.match(/^[\s]*(\d+)\.\s+(.+)/);
    if (numberMatch) {
      if (listType !== 'number') {
        flushList();
        listType = 'number';
      }
      listItems.push(numberMatch[2]);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      flushList();
      elements.push(<div key={i} style={{ height: 8 }} />);
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={i} style={{
        color: baseColor,
        margin: '4px 0',
        lineHeight: 1.5
      }}>
        {renderInline(line)}
      </p>
    );
  }

  flushList();

  return <div style={{ fontSize: 13 }}>{elements}</div>;
}
