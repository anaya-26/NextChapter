/**
 * Runs synchronously during HTML parsing (before first paint) on hard navigations.
 * On the client it renders as inert text/plain so React doesn't warn about scripts.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Applies saved theme and Lite mode before paint to avoid a flash. */
export const PREPAINT_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem("nextchapter-theme");if(t==="dark"||t==="light")d.dataset.theme=t;var l=localStorage.getItem("nextchapter-lite");if(l==="true"||(l===null&&navigator.connection&&navigator.connection.saveData))d.dataset.lite="true"}catch(e){}`;
