'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Highlighter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  Code,
  Keyboard,
} from 'lucide-react';

interface NoteEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  showStatus?: React.ReactNode;
}

function ToolbarButton({
  icon: Icon,
  onClick,
  isActive,
  title,
  disabled = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  isActive: boolean;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded transition-colors ${
        isActive
          ? 'bg-yellow-100 text-amber-700'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export default function NoteEditor({
  value,
  onChange,
  disabled = false,
  placeholder = 'Start writing your note...',
  showStatus,
}: NoteEditorProps) {
  const [mounted, setMounted] = useState(false);
  const [, forceToolbarRefresh] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
    ],
    content: mounted ? value || '<p></p>' : '<p></p>',
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      // Trigger re-render to update button states
      forceToolbarRefresh((prev) => prev + 1);
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none text-sm leading-relaxed select-text text-slate-800 ${
          disabled
            ? 'text-slate-500 opacity-60'
            : 'text-slate-800'
        }`,
      },
    },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!editor || !mounted) return;

    const currentContent = editor.getHTML();
    if (currentContent !== value) {
      editor.commands.setContent(value);
    }
  }, [editor, mounted, value]);

  const handleToolbarClick = useCallback((command: () => boolean) => {
    command();
    // Force immediate update of button states
    forceToolbarRefresh((prev) => prev + 1);
  }, []);

  if (!editor || !mounted) {
    return (
      <div className="flex-1 min-h-0 overflow-auto bg-white rounded-b-lg p-4">
        <div className="text-sm text-slate-400">{placeholder}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative z-50">
      {/* Toolbar */}
      <div className="border-b border-slate-200 bg-white p-2 flex flex-wrap gap-1 rounded-t-lg pointer-events-auto">
        {/* Text Formatting */}
        <div className="flex gap-1 border-r border-slate-200 pr-1">
          <ToolbarButton
            icon={Bold}
            onClick={() => handleToolbarClick(() => editor.chain().focus().toggleBold().run())}
            isActive={editor.isActive('bold')}
            title="Bold (Ctrl+B)"
            disabled={disabled}
          />
          <ToolbarButton
            icon={Italic}
            onClick={() => handleToolbarClick(() => editor.chain().focus().toggleItalic().run())}
            isActive={editor.isActive('italic')}
            title="Italic (Ctrl+I)"
            disabled={disabled}
          />
          <ToolbarButton
            icon={UnderlineIcon}
            onClick={() => handleToolbarClick(() => editor.chain().focus().toggleUnderline().run())}
            isActive={editor.isActive('underline')}
            title="Underline (Ctrl+U)"
            disabled={disabled}
          />
          <ToolbarButton
            icon={Code}
            onClick={() => handleToolbarClick(() => editor.chain().focus().toggleCode().run())}
            isActive={editor.isActive('code')}
            title="Code"
            disabled={disabled}
          />
        </div>

        {/* Highlight */}
        <div className="flex gap-1 border-r border-slate-200 pr-1">
          <ToolbarButton
            icon={Highlighter}
            onClick={() => handleToolbarClick(() => editor.chain().focus().toggleHighlight({ color: '#fde047' }).run())}
            isActive={editor.isActive('highlight')}
            title="Highlight"
            disabled={disabled}
          />
        </div>

        {/* Lists */}
        <div className="flex gap-1 border-r border-slate-200 pr-1">
          <ToolbarButton
            icon={List}
            onClick={() => handleToolbarClick(() => editor.chain().focus().toggleBulletList().run())}
            isActive={editor.isActive('bulletList')}
            title="Bullet List"
            disabled={disabled}
          />
          <ToolbarButton
            icon={ListOrdered}
            onClick={() => handleToolbarClick(() => editor.chain().focus().toggleOrderedList().run())}
            isActive={editor.isActive('orderedList')}
            title="Ordered List"
            disabled={disabled}
          />
        </div>

        {/* Alignment */}
        <div className="flex gap-1 border-r border-slate-200 pr-1">
          <ToolbarButton
            icon={AlignLeft}
            onClick={() => handleToolbarClick(() => editor.chain().focus().setTextAlign('left').run())}
            isActive={editor.isActive({ textAlign: 'left' })}
            title="Align Left"
            disabled={disabled}
          />
          <ToolbarButton
            icon={AlignCenter}
            onClick={() => handleToolbarClick(() => editor.chain().focus().setTextAlign('center').run())}
            isActive={editor.isActive({ textAlign: 'center' })}
            title="Align Center"
            disabled={disabled}
          />
          <ToolbarButton
            icon={AlignRight}
            onClick={() => handleToolbarClick(() => editor.chain().focus().setTextAlign('right').run())}
            isActive={editor.isActive({ textAlign: 'right' })}
            title="Align Right"
            disabled={disabled}
          />
        </div>

        {/* Undo/Redo */}
        <div className="flex gap-1">
          <ToolbarButton
            icon={Undo2}
            onClick={() => handleToolbarClick(() => editor.chain().focus().undo().run())}
            isActive={false}
            title="Undo (Ctrl+Z)"
            disabled={disabled || !editor.can().undo()}
          />
          <ToolbarButton
            icon={Redo2}
            onClick={() => handleToolbarClick(() => editor.chain().focus().redo().run())}
            isActive={false}
            title="Redo (Ctrl+Y)"
            disabled={disabled || !editor.can().redo()}
          />
        </div>

        {/* Spacer and Status */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowShortcuts((prev) => !prev)}
            className="h-8 px-2 rounded border border-slate-200 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 inline-flex items-center gap-1"
            aria-expanded={showShortcuts}
            aria-label="Toggle keyboard shortcut hints"
          >
            <Keyboard className="h-3.5 w-3.5" />
            Shortcuts
          </button>
          {showStatus && (
            <div className="text-[11px] text-slate-500">
              {showStatus}
            </div>
          )}
        </div>
      </div>

      {showShortcuts && (
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
          <span>Bold: Ctrl+B</span>
          <span>Italic: Ctrl+I</span>
          <span>Underline: Ctrl+U</span>
          <span>Undo: Ctrl+Z</span>
          <span>Redo: Ctrl+Y</span>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0 overflow-auto bg-white rounded-b-lg pointer-events-auto select-text">
        <EditorContent
          editor={editor}
          className="p-4 h-full"
        />
      </div>
    </div>
  );
}
