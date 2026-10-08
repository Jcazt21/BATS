import { Link } from "react-router-dom";
import { Newspaper } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Skeleton } from "@/components/ui/skeleton";
import { useBlogPosts } from "@/lib/queries";
import { fmtDate } from "@/lib/format";

export function BlogPage() {
  const posts = useBlogPosts();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Blog" subtitle="Novedades de la liga: temporadas, reglas, bans y anuncios." />
      {posts.isError ? <ErrorState error={posts.error} onRetry={() => posts.refetch()} /> :
        posts.isPending ? (
          <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        ) :
        posts.data.length === 0 ? <EmptyState icon={<Newspaper strokeWidth={1.25} />} title="Aún no hay novedades" description="Cuando los admins publiquen algo, aparecerá aquí." /> : (
          <ul className="flex flex-col gap-3">
            {posts.data.map((p) => (
              <li key={p.post_id}>
                <Link to={`/blog/${p.slug}`}
                  className="press flex flex-col gap-1.5 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="text-footnote text-muted-foreground">
                    {fmtDate(p.published_at)}{p.author && ` · ${p.author}`}
                  </span>
                  <span className="text-title3 text-foreground">{p.title}</span>
                  {p.excerpt && <span className="line-clamp-2 text-subhead text-muted-foreground">{p.excerpt}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
