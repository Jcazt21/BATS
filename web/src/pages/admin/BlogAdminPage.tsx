import { useRef, useState } from "react";
import { Eye, EyeOff, FileUp, Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Group, GroupRow } from "@/components/app/Group";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Markdown } from "@/components/blog/Markdown";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createBlogPost, deleteBlogPost, updateBlogPost, type AdminBlogPost } from "@/lib/api";
import { BLOG_TITLE_MAX, MarkdownFileError, readMarkdownFile } from "@/lib/blog";
import { fmtDate } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useAdminBlogPost, useAdminBlogPosts, useBlogMutation } from "@/lib/queries";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function BlogAdminPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader title="Blog" subtitle="Sube un .md para publicar novedades en la pestaña Blog. Puedes dejarlo como borrador y publicarlo después." />
      <UploadForm />
      <PostList />
    </div>
  );
}

function UploadForm() {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<{ title: string; content: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [view, setView] = useState<"preview" | "source">("preview");
  const create = useBlogMutation(createBlogPost);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    try { setDraft(await readMarkdownFile(file)); setView("preview"); }
    catch (err) { setDraft(null); setFileError(err instanceof MarkdownFileError ? err.message : "No se pudo leer el archivo."); }
    finally { if (input.current) input.current.value = ""; }   // elegir el mismo archivo otra vez vuelve a disparar onChange
  }

  async function save(publish: boolean) {
    if (!draft) return;
    try {
      await create.mutateAsync({ title: draft.title.trim(), content_md: draft.content, publish });
      toast({ title: publish ? "Entrada publicada" : "Borrador guardado", tone: "success" });
      setDraft(null);
    } catch (err) { toast({ title: "No se pudo guardar", description: errorMessage(err), tone: "error" }); }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
      <h2 className="text-headline">Nueva entrada</h2>
      <label className="press flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-input px-4 py-8 text-center text-subhead text-muted-foreground transition-colors hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring">
        <FileUp className="size-6" />
        <span>Elige un archivo <strong className="text-foreground">.md</strong></span>
        <input ref={input} type="file" accept=".md,.markdown,text/markdown" aria-label="Archivo .md" className="sr-only"
          onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {fileError && <p role="alert" className="text-footnote text-destructive">{fileError}</p>}

      {draft && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="blog-title" className="text-footnote font-medium">Título</label>
            <Input id="blog-title" value={draft.title} maxLength={BLOG_TITLE_MAX}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <SegmentedControl label="Vista" value={view} onChange={setView} className="self-start"
            options={[{ value: "preview", label: "Vista previa" }, { value: "source", label: "Markdown" }]} />
          <div className="max-h-[28rem] overflow-y-auto rounded-2xl bg-background p-5 ring-1 ring-border">
            {view === "preview"
              ? <Markdown>{draft.content}</Markdown>
              : <pre className="whitespace-pre-wrap font-mono text-footnote">{draft.content}</pre>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save(true)} disabled={create.isPending || !draft.title.trim()}>
              {create.isPending ? <Loader2 className="animate-spin" /> : null} Publicar
            </Button>
            <Button variant="secondary" onClick={() => void save(false)} disabled={create.isPending || !draft.title.trim()}>Guardar borrador</Button>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={create.isPending}>Descartar</Button>
          </div>
        </>
      )}
    </section>
  );
}

function PostList() {
  const { toast } = useToast();
  const posts = useAdminBlogPosts();
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminBlogPost | null>(null);
  const preview = useAdminBlogPost(previewId);
  const update = useBlogMutation((v: { id: number; is_published: boolean }) => updateBlogPost(v.id, { is_published: v.is_published }));
  const del = useBlogMutation(deleteBlogPost);
  const replace = useBlogMutation((v: { id: number; content_md: string }) => updateBlogPost(v.id, { content_md: v.content_md }));

  /** Cambia solo el contenido: el título, el slug y la fecha de publicación se conservan. */
  async function replaceContent(p: AdminBlogPost, file: File | undefined, input: HTMLInputElement) {
    if (!file) return;
    try {
      const { content } = await readMarkdownFile(file);
      await replace.mutateAsync({ id: p.post_id, content_md: content });
      toast({ title: "Contenido actualizado", description: p.title, tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo reemplazar", description: err instanceof MarkdownFileError ? err.message : errorMessage(err), tone: "error" });
    } finally { input.value = ""; }
  }

  async function togglePublished(p: AdminBlogPost) {
    try {
      await update.mutateAsync({ id: p.post_id, is_published: !p.is_published });
      toast({ title: p.is_published ? "Entrada retirada" : "Entrada publicada", tone: "success" });
    } catch (err) { toast({ title: "No se pudo cambiar", description: errorMessage(err), tone: "error" }); }
  }

  if (posts.isError) return <ErrorState error={posts.error} onRetry={() => posts.refetch()} />;
  if (posts.isPending) return <Skeleton className="h-40 rounded-2xl" />;

  return (
    <>
      <Group title="Entradas" footer="Las publicadas se ven en la pestaña Blog; los borradores solo aquí.">
        {posts.data.length === 0 ? <EmptyState title="Sin entradas" description="Sube tu primer .md arriba." /> :
          posts.data.map((p) => (
            <GroupRow key={p.post_id}
              title={p.title}
              subtitle={p.is_published ? `Publicada el ${fmtDate(p.published_at)}` : `Borrador · ${fmtDate(p.created_at)}`}
              leading={<Badge variant={p.is_published ? "success" : "secondary"}>{p.is_published ? "Publicada" : "Borrador"}</Badge>}
              trailing={
                <span className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setPreviewId(p.post_id)}>Ver</Button>
                  <label className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer focus-within:ring-3 focus-within:ring-ring", replace.isPending && "pointer-events-none opacity-50")}>
                    Reemplazar
                    <input type="file" accept=".md,.markdown,text/markdown" aria-label={`Reemplazar el .md de ${p.title}`} className="sr-only"
                      onChange={(e) => void replaceContent(p, e.target.files?.[0], e.currentTarget)} />
                  </label>
                  <Button variant="ghost" size="icon" aria-label={p.is_published ? `Retirar ${p.title}` : `Publicar ${p.title}`}
                    disabled={update.isPending} onClick={() => void togglePublished(p)}>
                    {p.is_published ? <EyeOff /> : <Eye />}
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Eliminar ${p.title}`} onClick={() => setPendingDelete(p)}><Trash2 /></Button>
                </span>
              } />
          ))}
      </Group>

      <ResponsiveSheet open={previewId !== null} onOpenChange={(o) => !o && setPreviewId(null)} className="sm:max-w-3xl"
        title={preview.data?.title ?? ""} description={preview.data?.is_published ? "Publicada" : "Borrador"}>
        {preview.isPending ? <Skeleton className="h-64 rounded-2xl" /> :
          preview.isError ? <ErrorState error={preview.error} /> :
          <Markdown>{preview.data.content_md ?? ""}</Markdown>}
      </ResponsiveSheet>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar «{pendingDelete?.title}»?</AlertDialogTitle>
            <AlertDialogDescription>Desaparece del blog y no se puede recuperar.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={async (e) => {
              e.preventDefault();
              try { await del.mutateAsync(pendingDelete!.post_id); toast({ title: "Entrada eliminada", tone: "success" }); setPendingDelete(null); }
              catch (err) { toast({ title: "No se pudo eliminar", description: errorMessage(err), tone: "error" }); }
            }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
