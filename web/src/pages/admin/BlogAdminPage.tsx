import { useState } from "react";
import { Eye, EyeOff, Loader2, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Group, GroupRow } from "@/components/app/Group";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { EmptyState, ErrorState } from "@/components/app/States";
import { BlogEditor, type BlogDraft } from "@/components/blog/BlogEditor";
import { Markdown } from "@/components/blog/Markdown";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createBlogPost, deleteBlogPost, updateBlogPost, type AdminBlogPost } from "@/lib/api";
import { markdownError, normalizeMarkdown } from "@/lib/blog";
import { fmtDate } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useAdminBlogPost, useAdminBlogPosts, useBlogMutation } from "@/lib/queries";
import { useToast } from "@/lib/toast";

const EMPTY: BlogDraft = { title: "", content: "" };

export function BlogAdminPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader title="Blog" subtitle="Escribe o pega el Markdown (o importa un .md) para publicar novedades en la pestaña Blog. Puedes dejarlo como borrador y publicarlo después." />
      <NewPostForm />
      <PostList />
    </div>
  );
}

function NewPostForm() {
  const { toast } = useToast();
  const [draft, setDraft] = useState<BlogDraft>(EMPTY);
  // Remontar el editor al publicar lo devuelve a su estado inicial (título siguiendo al primer #).
  const [editorKey, setEditorKey] = useState(0);
  const create = useBlogMutation(createBlogPost);
  const content = normalizeMarkdown(draft.content);
  const invalid = !draft.title.trim() || markdownError(content) !== null;
  const dirty = !!(draft.title.trim() || draft.content.trim());

  function reset() { setDraft(EMPTY); setEditorKey((k) => k + 1); }

  async function save(publish: boolean) {
    try {
      await create.mutateAsync({ title: draft.title.trim(), content_md: content, publish });
      toast({ title: publish ? "Entrada publicada" : "Borrador guardado", tone: "success" });
      reset();
    } catch (err) { toast({ title: "No se pudo guardar", description: errorMessage(err), tone: "error" }); }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
      <h2 className="text-headline">Nueva entrada</h2>
      <BlogEditor key={editorKey} value={draft} onChange={setDraft} followH1 />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void save(true)} disabled={create.isPending || invalid}>
          {create.isPending ? <Loader2 className="animate-spin" /> : null} Publicar
        </Button>
        <Button variant="secondary" onClick={() => void save(false)} disabled={create.isPending || invalid}>Guardar borrador</Button>
        {dirty && <Button variant="ghost" onClick={reset} disabled={create.isPending}>Descartar</Button>}
      </div>
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
  const [editing, setEditing] = useState<{ id: number; n: number } | null>(null);

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
        {posts.data.length === 0 ? <EmptyState title="Sin entradas" description="Escribe tu primera entrada arriba." /> :
          posts.data.map((p) => (
            <GroupRow key={p.post_id}
              title={p.title}
              subtitle={p.is_published ? `Publicada el ${fmtDate(p.published_at)}` : `Borrador · ${fmtDate(p.created_at)}`}
              leading={<Badge variant={p.is_published ? "success" : "secondary"}>{p.is_published ? "Publicada" : "Borrador"}</Badge>}
              trailing={
                <span className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setPreviewId(p.post_id)}>Ver</Button>
                  <Button variant="ghost" size="sm" aria-label={`Editar ${p.title}`}
                    onClick={() => setEditing((e) => ({ id: p.post_id, n: (e?.n ?? 0) + 1 }))}>
                    <Pencil /> Editar
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={p.is_published ? `Retirar ${p.title}` : `Publicar ${p.title}`}
                    disabled={update.isPending} onClick={() => void togglePublished(p)}>
                    {p.is_published ? <EyeOff /> : <Eye />}
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Eliminar ${p.title}`} onClick={() => setPendingDelete(p)}><Trash2 /></Button>
                </span>
              } />
          ))}
      </Group>

      {/* Montado mientras se edita; el key nuevo en cada «Editar» empieza limpio. */}
      {editing && <EditPostSheet key={editing.n} postId={editing.id} />}

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

/**
 * Edita una entrada en una hoja. Si se cierra con cambios sin guardar, se pregunta:
 * «Seguir editando» la reabre con el borrador intacto.
 */
function EditPostSheet({ postId }: { postId: number }) {
  const { toast } = useToast();
  const post = useAdminBlogPost(postId);
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<BlogDraft | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);
  const save = useBlogMutation((patch: { title?: string; content_md?: string }) => updateBlogPost(postId, patch));

  const base = post.data ? { title: post.data.title, content: post.data.content_md ?? "" } : null;
  const current = draft ?? base;
  const patch: { title?: string; content_md?: string } = {};
  if (base && current) {
    const content = normalizeMarkdown(current.content);
    if (current.title.trim() !== base.title) patch.title = current.title.trim();
    if (content !== base.content) patch.content_md = content;
  }
  const dirty = Object.keys(patch).length > 0;
  const invalid = !current || !current.title.trim() || markdownError(normalizeMarkdown(current.content)) !== null;

  function onOpenChange(next: boolean) {
    if (next) return;
    setOpen(false);
    if (dirty) setAskDiscard(true);
  }

  async function submit() {
    try {
      await save.mutateAsync(patch);
      toast({ title: "Cambios guardados", description: patch.title ?? base?.title, tone: "success" });
      setDraft(null);
      setOpen(false);
    } catch (err) { toast({ title: "No se pudo guardar", description: errorMessage(err), tone: "error" }); }
  }

  return (
    <>
      <ResponsiveSheet open={open} onOpenChange={onOpenChange} className="sm:max-w-3xl"
        title="Editar entrada" description={post.data ? (post.data.is_published ? "Publicada · los cambios se ven al guardar" : "Borrador") : undefined}>
        {post.isPending ? <Skeleton className="h-64 rounded-2xl" /> :
          post.isError ? <ErrorState error={post.error} onRetry={() => post.refetch()} /> :
          <div className="flex flex-col gap-4">
            <BlogEditor value={current!} onChange={setDraft} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void submit()} disabled={save.isPending || invalid || !dirty}>
                {save.isPending ? <Loader2 className="animate-spin" /> : null} Guardar cambios
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancelar</Button>
            </div>
          </div>}
      </ResponsiveSheet>

      <AlertDialog open={askDiscard} onOpenChange={(o) => { if (!o) { setAskDiscard(false); setOpen(true); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>Lo que cambiaste en «{base?.title}» no se ha guardado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={(e) => { e.preventDefault(); setDraft(null); setAskDiscard(false); }}>
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
