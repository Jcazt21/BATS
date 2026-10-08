/** Límites del .md: los mismos que valida la API (bats_core/blog.py). */
export const BLOG_MAX_CHARS = 200_000;
export const BLOG_TITLE_MAX = 160;

/** Bloque YAML inicial `---` … `---`. Un `---` que no abre el documento (regla horizontal) no coincide. */
const FRONT_MATTER = /^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/;

const H1 =/^ {0,3}#[ \t]+(.+?)[ \t#]*$/m;

/** Título de una entrada: el primer `# Título` del Markdown o, si no hay, el nombre del archivo. */
export function titleFromMarkdown(markdown: string, filename: string): string {
  const h1 = H1.exec(markdown);
  if (h1) return h1[1].trim();
  return filename.replace(/\.(md|markdown)$/i, "").replace(/[-_]+/g, " ").trim();
}

/** El título ya va en la cabecera de la página: si el .md empieza repitiéndolo, se omite. */
export function stripLeadingTitle(markdown: string, title: string): string {
  const m = /^\s*#[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/.exec(markdown);
  if (!m || m[1].trim().toLowerCase() !== title.trim().toLowerCase()) return markdown;
  return markdown.slice(m[0].length).replace(/^\s+/, "");
}

/** Error presentable al admin tal cual. */
export class MarkdownFileError extends Error {}

/** Lee el .md elegido; rechaza otros formatos, vacíos o demasiado grandes. */
export async function readMarkdownFile(file: File): Promise<{ title: string; content: string }> {
  if (!/\.(md|markdown)$/i.test(file.name)) throw new MarkdownFileError("Elige un archivo .md.");
  // Los editores de Windows a veces guardan con BOM y CRLF.
  const content = (await file.text())
    .replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
    .replace(FRONT_MATTER, "");   // metadatos YAML de Obsidian: no son parte de la entrada
  if (!content.trim()) throw new MarkdownFileError("El archivo está vacío.");
  if (content.length > BLOG_MAX_CHARS) throw new MarkdownFileError("El archivo es demasiado grande (máx. 200000 caracteres).");
  return { title: titleFromMarkdown(content, file.name).slice(0, BLOG_TITLE_MAX), content };
}
