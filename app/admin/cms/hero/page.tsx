import Link from 'next/link';

export default function AdminCmsHeroPage() {
  return (
    <div>
      <h1 className="font-serif text-3xl mb-4 text-ink dark:text-dark-ink">Hero section</h1>
      <p className="text-sm text-muted dark:text-dark-muted mb-6">
        The hero section is managed through the Homepage builder. Click below to edit your hero banner.
      </p>
      <Link href="/admin/homepage" className="btn btn-primary">Go to Homepage builder</Link>
      <div className="mt-8 border border-line dark:border-dark-line p-4 max-w-xl">
        <p className="text-sm font-medium text-ink dark:text-dark-ink mb-2">Hero image dimensions</p>
        <div className="grid grid-cols-2 gap-4 text-sm text-muted dark:text-dark-muted">
          <div>
            <p className="font-medium text-ink dark:text-dark-ink">Desktop</p>
            <p>1920 x 650 px</p>
            <p>Wide landscape banner</p>
          </div>
          <div>
            <p className="font-medium text-ink dark:text-dark-ink">Mobile</p>
            <p>900 x 1125 px</p>
            <p>Portrait banner</p>
          </div>
        </div>
        <p className="text-xs text-muted dark:text-dark-muted mt-4">
          In the Homepage builder, edit the Hero section and set both
          <code className="mx-1 text-xs theme-tint px-1">desktop_image_path</code> and
          <code className="mx-1 text-xs theme-tint px-1">mobile_image_path</code> in the config JSON.
        </p>
      </div>
    </div>
  );
}
