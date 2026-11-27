'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

/**
 * Tiptap-based rich text editor used for CMS page content.
 * Outputs HTML string; accepts initial HTML value via `value` prop.
 * Calls `onChange(html)` when content changes.
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      // Renders placeholder text only while empty — it is never part of the
      // saved HTML (injecting it into `content` would persist it on save).
      Placeholder.configure({ placeholder: placeholder ?? 'Start writing...' }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) return null;

  const btn = (action: () => void, label: string, active?: boolean) => (
    <button
      key={label}
      type="button"
      onClick={action}
      className={`px-2 py-1 text-xs border border-line dark:border-dark-line ${active ? 'theme-bg' : 'bg-canvas dark:bg-dark-canvas'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="border border-line dark:border-dark-line">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 p-2 border-b border-line dark:border-dark-line bg-canvas dark:bg-dark-canvas">
        {btn(() => editor.chain().focus().toggleBold().run(), 'Bold', editor.isActive('bold'))}
        {btn(() => editor.chain().focus().toggleItalic().run(), 'Italic', editor.isActive('italic'))}
        {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'H2', editor.isActive('heading', { level: 2 }))}
        {btn(() => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'H3', editor.isActive('heading', { level: 3 }))}
        {btn(() => editor.chain().focus().toggleBulletList().run(), 'Bullet list', editor.isActive('bulletList'))}
        {btn(() => editor.chain().focus().toggleOrderedList().run(), 'Numbered list', editor.isActive('orderedList'))}
        {btn(() => {
          const url = window.prompt('URL:');
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }, 'Link', editor.isActive('link'))}
        {btn(() => editor.chain().focus().unsetLink().run(), 'Unlink')}
        {btn(() => editor.chain().focus().undo().run(), 'Undo')}
        {btn(() => editor.chain().focus().redo().run(), 'Redo')}
      </div>
      {/* Content area */}
      <div className="p-3 min-h-[16rem] text-ink dark:text-dark-ink bg-canvas dark:bg-dark-canvas prose prose-sm max-w-none">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
