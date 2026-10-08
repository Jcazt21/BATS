import { Link } from "react-router-dom";
import { ArrowRight, Newspaper } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Skeleton } from "@/components/ui/skeleton";
import { useBlogPosts } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import type { BlogPostSummary } from "@/lib/api";

function Byline({ post }: { post: BlogPostSummary }) {
  return (
    <span className="text-footnote text-muted-foreground">
      {post.author && <span className="font-medium text-foreground">{post.author}</span>}
      {post.author && " · "}
      {fmtDate(post.published_at)}
    </span>
  );
}

/** La entrada más reciente, en grande, estilo changelog. */
function Spotlight({ post }: { post: BlogPostSummary }) {
  return (
    <Link to={`/blog/${post.slug}`}
      className="press group relative flex min-h-64 flex-col justify-between gap-8 overflow-hidden rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring sm:p-10">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative flex flex-col gap-3">
        <span className="text-caption font-semibold uppercase tracking-wide text-primary">Lo último</span>
        <span className="text-display text-foreground text-balance">{post.title}</span>
        {post.excerpt && <span className="max-w-2xl text-body text-muted-foreground line-clamp-3">{post.excerpt}</span>}
      </div>
      <div className="relative flex items-center justify-between gap-4">
        <Byline post={post} />
        <span className="flex items-center gap-1 text-subhead font-medium text-primary">
          Leer <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

export function BlogPage() {
  const posts = useBlogPosts();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Blog" subtitle="Novedades de la liga: temporadas, reglas, bans y anuncios." />
      {posts.isError ? <ErrorState error={posts.error} onRetry={() => posts.refetch()} /> :
        posts.isPending ? (
          <div className="flex flex-col gap-6">
            <Skeleton className="h-64 rounded-3xl" />
            {[0, 1].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
        ) :
        posts.data.length === 0 ? <EmptyState icon={<Newspaper strokeWidth={1.25} />} title="Aún no hay novedades" description="Cuando los admins publiquen algo, aparecerá aquí." /> : (
          <>
            <Spotlight post={posts.data[0]} />
            {posts.data.length > 1 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-title2 text-foreground">Más entradas</h2>
                <ul className="flex flex-col divide-y divide-border">
                  {posts.data.slice(1).map((p) => (
                    <li key={p.post_id}>
                      <Link to={`/blog/${p.slug}`}
                        className="press -mx-3 flex flex-col gap-1 rounded-xl px-3 py-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="text-headline text-foreground">{p.title}</span>
                        {p.excerpt && <span className="line-clamp-1 text-subhead text-muted-foreground">{p.excerpt}</span>}
                        <Byline post={p} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
    </div>
  );
}
