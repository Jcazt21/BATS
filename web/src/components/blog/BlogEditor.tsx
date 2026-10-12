import { useId, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { Markdown } from "@/components/blog/Markdown";
import { Input } from "@/components/ui/input";
import {
  BLOG_MAX_CHARS, BLOG_TITLE_MAX, MarkdownFileError, normalizeMarkdown, readMarkdownFile, titleFromMarkdown,
} from "@/lib/blog";
import { cn } from "@/lib/utils";

export interface BlogDraft {
  title: string;
  content: string;
}

const fmtCount = (n: number) => n.toLocaleString("es");

/**
 * Editor de una entrada: título + Markdown escrito o pegado, con vista previa.
 * Importar un .md solo rellena el editor; se guarda igual que lo escrito a mano.
 *
 * Con `followH1`, el título sigue al primer `# ...` del texto hasta que el admin lo
 * escribe a mano (al crear). Al editar una entrada existente el título no se toca solo.
 */
export function BlogEditor({ value, onChange, followH1 = false }: {
  value: BlogDraft;
  onChange: (draft: BlogDraft) => void;
  followH1?: boolean;
}) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [autoTitle, setAutoTitle] = useState(followH1);
  const [view, setView] = useState<"write" | "preview">("write");
  const [fileError, setFileError] = useState<string | null>(null);
  const tooLong = value.content.length > BLOG_MAX_CHARS;

  function setContent(content: string) {
    onChange({ content, title: autoTitle ? titleFromMarkdown(content, "").slice(0, BLOG_TITLE_MAX) : value.title });
  }

  /** Pegar al principio suele ser pegar la nota entera: se limpia (front matter de Obsidian, CRLF). */
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    if (el.selectionStart !== 0) return;
    e.preventDefault();
    setContent(normalizeMarkdown(e.clipboardData.getData("text/plain") + value.content.slice(el.selectionEnd)));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    try {
      const read = await readMarkdownFile(file);
      onChange({ content: read.content, title: autoTitle || !value.title.trim() ? read.title : value.title });
      setView("write");
    } catch (err) {
      setFileError(err instanceof MarkdownFileError ? err.message : "No se pudo leer el archivo.");
    } finally { if (fileInput.current) fileInput.current.value = ""; }   // elegir el mismo archivo otra vez vuelve a disparar onChange
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-title`} className="text-footnote font-medium">Título</label>
        <Input id={`${id}-title`} value={value.title} maxLength={BLOG_TITLE_MAX}
          placeholder={followH1 ? "Se toma del primer # del texto" : undefined}
          onChange={(e) => { setAutoTitle(followH1 && !e.target.value); onChange({ ...value, title: e.target.value }); }} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl label="Vista" value={view} onChange={setView}
          options={[{ value: "write", label: "Escribir" }, { value: "preview", label: "Vista previa" }]} />
        <label className="press inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-subhead font-medium text-primary transition-colors hover:bg-muted/60 focus-within:ring-2 focus-within:ring-ring">
          <FileUp className="size-4" /> Importar .md
          <input ref={fileInput} type="file" accept=".md,.markdown,text/markdown" aria-label="Importar archivo .md" className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
      </div>
      {fileError && <p role="alert" className="text-footnote text-destructive">{fileError}</p>}

      {view === "write" ? (
        <textarea aria-label="Contenido en Markdown" value={value.content} spellCheck
          placeholder={"# Título\n\nEscribe o pega aquí el Markdown de la entrada…"}
          onChange={(e) => setContent(e.target.value)} onPaste={onPaste}
          aria-invalid={tooLong || undefined}
          className="field-sizing-content min-h-64 max-h-[60svh] w-full resize-y rounded-2xl border border-input bg-background p-4 font-mono text-footnote leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive" />
      ) : (
        <div className="min-h-64 max-h-[60svh] overflow-y-auto rounded-2xl bg-background p-5 ring-1 ring-border">
          {value.content.trim()
            ? <Markdown>{value.content}</Markdown>
            : <p className="text-subhead text-muted-foreground">Nada que previsualizar todavía.</p>}
        </div>
      )}
      <p className={cn("-mt-2 self-end text-caption tabular-nums text-muted-foreground", tooLong && "text-destructive")}>
        {fmtCount(value.content.length)} / {fmtCount(BLOG_MAX_CHARS)}
      </p>
    </div>
  );
}
