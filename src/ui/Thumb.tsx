import { useState } from 'preact/hooks';
import { Package } from 'lucide-preact';

/** Product thumbnail with a neutral placeholder when there is no image or it fails to load. */
export function Thumb({ src, size = 20, class: cls = '' }: { src: string | null; size?: number; class?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div class={`thumb ${cls}`} aria-hidden="true">
      {src && !failed ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <Package size={size} strokeWidth={1.6} />}
    </div>
  );
}
