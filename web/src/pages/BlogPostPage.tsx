import { Link, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Markdown } from "@/components/blog/Markdown";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/http";
import { stripLeadingTitle } from "@/lib/blog";
import { fmtDate } from "@/lib/format";
import { useBlogPost } from "@/lib/queries";

export function BlogPostPage() {
  const { slug = "" } = useParams();
  const post = useBlogPost(slug);

  const back = (
    <Link to="/blog" className="press inline-flex items-center gap-1 self-start rounded-full text-subhead font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <ChevronLeft className="size-4" /> Blog
    </Link>
  );

  if (post.isError) {
    const missing = post.error instanceof ApiError && post.error.status === 404;
    return (
      <div className="flex flex-col gap-6">
        {back}
        {missing
          ? <EmptyState title="Esta entrada no existe" description="Puede que la hayan retirado." action={<Link to="/blog" className={buttonVariants({ variant: "secondary" })}>Ver todas</Link>} />
          : <ErrorState error={post.error} onRetry={() => post.refetch()} />}
      </div>
    );
  }

  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      {back}
      {post.isPending ? (
        <div className="flex flex-col gap-4"><Skeleton className="h-12 w-3/4 rounded-xl" /><Skeleton className="h-64 rounded-2xl" /></div>
      ) : (
        <>
          <PageHeader eyebrow={`${fmtDate(post.data.published_at)}${post.data.author ? ` · ${post.data.author}` : ""}`} title={post.data.title} />
          <Markdown>{stripLeadingTitle(post.data.content_md, post.data.title)}</Markdown>
        </>
      )}
    </article>
  );
}
