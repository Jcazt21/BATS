import { Link } from "react-router-dom";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** react-markdown pasa el nodo del AST como prop: no debe llegar al DOM. */
function dom<P extends ExtraProps>({ node, ...rest }: P) {
  void node;
  return rest;
}

const isInternal = (href: string) => href.startsWith("/") && !href.startsWith("//");

const components: Components = {
  // La página ya tiene su h1 (el título de la entrada): los del .md bajan un nivel.
  h1: (p) => <h2 {...dom(p)} className="mt-10 text-title2 text-foreground first:mt-0" />,
  h2: (p) => <h3 {...dom(p)} className="mt-8 text-title3 text-foreground first:mt-0" />,
  h3: (p) => <h4 {...dom(p)} className="mt-6 text-headline text-foreground first:mt-0" />,
  h4: (p) => <h5 {...dom(p)} className="mt-6 text-subhead font-semibold text-foreground first:mt-0" />,
  p: (p) => <p {...dom(p)} lang="es" className="mt-5 text-body text-pretty hyphens-auto text-foreground/90 first:mt-0" />,
  a: ({ href = "", children, ...p }) =>
    isInternal(href)
      ? <Link to={href} className="font-medium text-primary underline-offset-4 hover:underline">{children}</Link>
      : <a {...dom(p)} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">{children}</a>,
  ul: (p) => <ul {...dom(p)} className="mt-5 list-disc space-y-2 pl-6 text-body marker:text-muted-foreground" />,
  ol: (p) => <ol {...dom(p)} className="mt-5 list-decimal space-y-2 pl-6 text-body marker:text-muted-foreground" />,
  blockquote: (p) => <blockquote {...dom(p)} className="mt-4 border-l-2 border-primary/40 pl-4 text-muted-foreground" />,
  hr: (p) => <hr {...dom(p)} className="my-8 border-separator" />,
  img: ({ alt = "", ...p }) => <img {...dom(p)} alt={alt} loading="lazy" decoding="async" className="mt-4 max-w-full rounded-2xl" />,
  pre: (p) => <pre {...dom(p)} className="mt-4 overflow-x-auto rounded-2xl bg-muted p-4 text-footnote" />,
  code: ({ className, ...p }) => <code {...dom(p)} className={cn("rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.9em] [pre_&]:bg-transparent [pre_&]:p-0", className)} />,
  table: (p) => (
    <div className="mt-4 overflow-x-auto rounded-2xl ring-1 ring-border">
      <table {...dom(p)} className="w-full text-subhead" />
    </div>
  ),
  th: (p) => <th {...dom(p)} className="bg-muted px-3 py-2 text-left font-semibold" />,
  td: (p) => <td {...dom(p)} className="border-t border-separator px-3 py-2" />,
};

/**
 * Markdown del blog. `skipHtml` descarta el HTML crudo y react-markdown neutraliza
 * las URLs peligrosas (javascript:, data:...): el .md nunca ejecuta código.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("min-w-0 max-w-prose break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
